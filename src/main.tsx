import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { demoConnector } from './connectors/demoConnector';
import type { Listing, Tracker } from './types';
import './styles.css';

const STORAGE_KEY='homeholiday-trackers';
const UI_REFRESH_MS=60_000;
type ProviderState={ok:boolean;checkedAt:string;count?:number;message?:string};
type ListingStore={listings:Listing[];refreshedAt:string|null;providerStatus?:Record<string,ProviderState>};
type PropertyGroup={id:string;primary:Listing;sources:Listing[]};
type DeviceTestState='idle'|'testing'|'readable'|'opaque'|'failed';
type DeviceTestResult={state:DeviceTestState;detail:string};

const DEVICE_TEST_PROVIDERS=[
 {key:'immobiliare',label:'Immobiliare.it',url:'https://www.immobiliare.it/vendita-appartamenti/bardonecchia/'},
 {key:'casa',label:'Casa.it',url:'https://www.casa.it/vendita/residenziale/bardonecchia/'},
 {key:'idealista',label:'Idealista',url:'https://www.idealista.it/vendita-case/bardonecchia-torino/'},
 {key:'subito',label:'Subito.it',url:'https://www.subito.it/annunci-piemonte/vendita/immobili/?q=Bardonecchia'},
 {key:'bakeca',label:'Bakeca.it',url:'https://torino.bakeca.it/annunci/case/luogo/bardonecchia/'}
] as const;

function money(n:number){return new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(n)}
function formatDate(value?:string){if(!value)return '—';return new Intl.DateTimeFormat('it-IT').format(new Date(`${value.slice(0,10)}T00:00:00Z`));}
function formatRefresh(value:string|null){if(!value)return 'Dati demo';const date=new Date(value);return Number.isNaN(date.getTime())?'Aggiornamento disponibile':new Intl.DateTimeFormat('it-IT',{dateStyle:'short',timeStyle:'short'}).format(date)}
function loadTrackers():Tracker[]{try{return JSON.parse(localStorage.getItem(STORAGE_KEY)||'[]')}catch{return []}}
function providerLabel(value:string){return ({casa:'Casa.it',idealista:'Idealista',subito:'Subito.it',bakeca:'Bakeca.it','immobiliare-public':'Immobiliare.it',immobiliare:'Immobiliare API'} as Record<string,string>)[value]||value}

function choosePrimary(items:Listing[]){
 return [...items].sort((a,b)=>{
   const aRemoved=a.status==='REMOVED'?1:0;
   const bRemoved=b.status==='REMOVED'?1:0;
   if(aRemoved!==bRemoved)return aRemoved-bRemoved;
   const aDetail=(a.sqm?1:0)+(a.rooms?1:0)+(a.publishedAt?1:0);
   const bDetail=(b.sqm?1:0)+(b.rooms?1:0)+(b.publishedAt?1:0);
   return bDetail-aDetail;
 })[0];
}

function groupListings(items:Listing[]):PropertyGroup[]{
 const buckets=new Map<string,Listing[]>();
 for(const item of items){
   const key=item.duplicateGroupId||`single:${item.id}`;
   const bucket=buckets.get(key)||[];
   bucket.push(item);
   buckets.set(key,bucket);
 }
 return [...buckets.entries()].map(([id,sources])=>({id,primary:choosePrimary(sources),sources}))
   .sort((a,b)=>new Date(b.primary.firstSeenAt).getTime()-new Date(a.primary.firstSeenAt).getTime());
}

async function testProviderFromDevice(url:string):Promise<DeviceTestResult>{
 const controller=new AbortController();
 const timeout=window.setTimeout(()=>controller.abort(),8000);
 try{
   try{
     const response=await fetch(`${url}${url.includes('?')?'&':'?'}hh_device_test=${Date.now()}`,{method:'GET',mode:'cors',cache:'no-store',signal:controller.signal});
     window.clearTimeout(timeout);
     return response.ok
       ? {state:'readable',detail:`Risposta leggibile dal browser · HTTP ${response.status}`}
       : {state:'readable',detail:`Risposta leggibile · HTTP ${response.status}`};
   }catch{
     try{
       const opaque=await fetch(`${url}${url.includes('?')?'&':'?'}hh_device_test=${Date.now()}`,{method:'GET',mode:'no-cors',cache:'no-store',signal:controller.signal});
       window.clearTimeout(timeout);
       return opaque.type==='opaque'
         ? {state:'opaque',detail:'Il browser riesce a inviare la richiesta, ma la risposta non è leggibile (CORS/risposta opaca).'}
         : {state:'opaque',detail:'Connessione effettuata, risposta non ispezionabile.'};
     }catch{
       window.clearTimeout(timeout);
       return {state:'failed',detail:'Richiesta non completata dal dispositivo.'};
     }
   }
 }finally{window.clearTimeout(timeout)}
}

async function loadListingStore():Promise<ListingStore>{
 const url=`${import.meta.env.BASE_URL}data/listings.json?v=${Date.now()}`;
 const response=await fetch(url,{cache:'no-store',headers:{'Cache-Control':'no-cache'}});
 if(!response.ok)throw new Error(`Listing store unavailable: ${response.status}`);
 const data=await response.json() as Partial<ListingStore>;
 return {listings:Array.isArray(data.listings)?data.listings:[],refreshedAt:typeof data.refreshedAt==='string'?data.refreshedAt:null,providerStatus:data.providerStatus||{}};
}

function App(){
 const [place,setPlace]=useState('Bardonecchia');
 const [min,setMin]=useState(100000);
 const [max,setMax]=useState(350000);
 const [seller,setSeller]=useState<'Tutti'|'Privato'|'Agenzia'>('Tutti');
 const [listings,setListings]=useState<Listing[]>([]);
 const [trackers,setTrackers]=useState<Tracker[]>(loadTrackers);
 const [loading,setLoading]=useState(true);
 const [dataSource,setDataSource]=useState<'live'|'demo'>('demo');
 const [refreshedAt,setRefreshedAt]=useState<string|null>(null);
 const [providerStatus,setProviderStatus]=useState<Record<string,ProviderState>>({});
 const [deviceTests,setDeviceTests]=useState<Record<string,DeviceTestResult>>({});
 const [deviceTesting,setDeviceTesting]=useState(false);

 useEffect(()=>{localStorage.setItem(STORAGE_KEY,JSON.stringify(trackers))},[trackers]);
 useEffect(()=>{
   let active=true;
   let initialLoad=true;
   async function refreshUi(){
     try{
       const store=await loadListingStore();
       if(!active)return;
       setProviderStatus(store.providerStatus||{});
       if(store.listings.length){setListings(store.listings);setRefreshedAt(store.refreshedAt);setDataSource('live');setLoading(false);initialLoad=false;return;}
       if(initialLoad){const demo=await demoConnector.search({location:'',minPrice:0,maxPrice:Number.MAX_SAFE_INTEGER});if(active){setListings(demo);setRefreshedAt(null);setDataSource('demo');setLoading(false)}}
     }catch{
       if(initialLoad){const demo=await demoConnector.search({location:'',minPrice:0,maxPrice:Number.MAX_SAFE_INTEGER});if(active){setListings(demo);setRefreshedAt(null);setDataSource('demo');setLoading(false)}}
     }finally{initialLoad=false}
   }
   setLoading(true);void refreshUi();
   const timer=window.setInterval(()=>{void refreshUi()},UI_REFRESH_MS);
   const onVisibility=()=>{if(document.visibilityState==='visible')void refreshUi()};
   const onFocus=()=>{void refreshUi()};
   document.addEventListener('visibilitychange',onVisibility);window.addEventListener('focus',onFocus);
   return()=>{active=false;window.clearInterval(timer);document.removeEventListener('visibilitychange',onVisibility);window.removeEventListener('focus',onFocus)};
 },[]);

 const filtered=useMemo(()=>listings.filter(x=>(!place.trim()||x.location.toLowerCase().includes(place.trim().toLowerCase()))&&x.price>=min&&x.price<=max&&(seller==='Tutti'||x.sellerType===seller)),[listings,place,min,max,seller]);
 const properties=useMemo(()=>groupListings(filtered),[filtered]);
 const multiSourceCount=useMemo(()=>properties.filter(x=>x.sources.length>1).length,[properties]);
 const newProperties=useMemo(()=>properties.filter(x=>x.sources.some(s=>s.status==='NEW')).length,[properties]);
 const privateProperties=useMemo(()=>properties.filter(x=>x.sources.some(s=>s.sellerType==='Privato')).length,[properties]);
 function createTracker(){if(!place.trim()||max<min)return;const tracker:Tracker={id:crypto.randomUUID(),name:place.trim(),location:place.trim(),minPrice:min,maxPrice:max,sellerType:seller,active:true,refreshHours:2};setTrackers(prev=>[tracker,...prev]);}
 function applyTracker(t:Tracker){setPlace(t.location);setMin(t.minPrice);setMax(t.maxPrice);setSeller(t.sellerType)}
 function removeTracker(id:string){setTrackers(prev=>prev.filter(t=>t.id!==id))}
 async function runDeviceTests(){
   if(deviceTesting)return;
   setDeviceTesting(true);
   setDeviceTests(Object.fromEntries(DEVICE_TEST_PROVIDERS.map(p=>[p.key,{state:'testing',detail:'Test in corso…'}])));
   const results=await Promise.all(DEVICE_TEST_PROVIDERS.map(async p=>[p.key,await testProviderFromDevice(p.url)] as const));
   setDeviceTests(Object.fromEntries(results));
   setDeviceTesting(false);
 }

 return <main><header><div><span className="brand">HomeHoliday</span><h1>Property Tracker</h1><p>Un solo posto per trovare, confrontare e monitorare gli immobili.</p></div><div className="pulse"><i/> {dataSource==='live'?'Dati tracker':'Modalità demo'} · {formatRefresh(refreshedAt)}</div></header>
 <section className="tracker"><h2>Crea il tuo tracker</h2><div className="filters"><label>Luogo<input value={place} onChange={e=>setPlace(e.target.value)} placeholder="Città o zona"/></label><label>Prezzo minimo<input type="number" value={min} onChange={e=>setMin(Math.max(0,+e.target.value||0))}/></label><label>Prezzo massimo<input type="number" value={max} onChange={e=>setMax(Math.max(0,+e.target.value||0))}/></label><label>Inserzionista<select value={seller} onChange={e=>setSeller(e.target.value as typeof seller)}><option>Tutti</option><option>Privato</option><option>Agenzia</option></select></label></div><button type="button" onClick={createTracker} disabled={!place.trim()||max<min}>+ Crea Tracker</button></section>
 <section className="deviceTest"><div className="sectionTitle"><div><h2>Test da questo dispositivo</h2><p>Verifica se i portali sono raggiungibili direttamente dal browser del tuo iPhone.</p></div><button type="button" onClick={()=>void runDeviceTests()} disabled={deviceTesting}>{deviceTesting?'Test in corso…':'Testa ora'}</button></div><div className="deviceTestGrid">{DEVICE_TEST_PROVIDERS.map(p=>{const result=deviceTests[p.key]||{state:'idle' as DeviceTestState,detail:'Non ancora testato'};return <div className={`deviceTestCard ${result.state}`} key={p.key}><span className="deviceTestDot"/><div><b>{p.label}</b><small>{result.detail}</small></div></div>})}</div><p className="deviceTestNote">Una risposta “opaca” significa che Safari riesce a inviare la richiesta ma non può leggere il contenuto per le regole CORS. Non dimostra che il portale abbia restituito HTTP 200.</p></section>
 {Object.keys(providerStatus).length>0&&<section className="providers"><div className="sectionTitle"><div><h2>Fonti monitorate</h2><p>Stato dell’ultimo controllo automatico</p></div></div><div className="providerGrid">{Object.entries(providerStatus).map(([key,state])=><div className={`providerCard ${state.ok?'ok':'ko'}`} key={key}><span className="providerDot"/><div><b>{providerLabel(key)}</b><small>{state.ok?`${state.count??0} annunci trovati`:state.message||'Non disponibile'}</small></div></div>)}</div></section>}
 {trackers.length>0&&<section className="saved"><div className="sectionTitle"><div><h2>I tuoi Tracker</h2><p>Ricerche persistenti pronte per il monitoraggio automatico</p></div><strong>{trackers.length} attivi</strong></div><div className="trackerList">{trackers.map(t=><div className="trackerCard" key={t.id}><button className="trackerMain" onClick={()=>applyTracker(t)}><b>{t.name}</b><span>{money(t.minPrice)} – {money(t.maxPrice)} · {t.sellerType}</span><small>Ogni {t.refreshHours} ore</small></button><button className="remove" aria-label={`Rimuovi tracker ${t.name}`} onClick={()=>removeTracker(t.id)}>×</button></div>)}</div></section>}
 <section className="stats"><div><b>{properties.length}</b><span>Immobili unici</span></div><div><b>{newProperties}</b><span>Nuovi</span></div><div><b>{multiSourceCount}</b><span>Su più fonti</span></div><div><b>{privateProperties}</b><span>Con privato</span></div></section>
 <section><div className="sectionTitle"><div><h2>Risultati</h2><p>{dataSource==='live'?'Immobili consolidati dalle fonti monitorate · UI aggiornata automaticamente ogni minuto':'Dati dimostrativi finché il primo tracker reale non produce risultati'}</p></div><strong>{loading?'Aggiornamento…':`${properties.length} immobili · ${filtered.length} annunci`}</strong></div><div className="grid">{properties.map(group=>{const x=group.primary;const sources=[...group.sources].sort((a,b)=>a.source.localeCompare(b.source));const prices=sources.map(s=>s.price).filter(Boolean);const minGroupPrice=Math.min(...prices);const maxGroupPrice=Math.max(...prices);return <article key={group.id}><div className="photo"><span className={'tag '+x.status.toLowerCase()}>{x.status}</span><span className="source">{sources.length>1?`${sources.length} fonti`:x.source}</span></div><div className="body"><small>{x.location} · {x.sellerType}</small><h3>{x.title}</h3><div className="price">{money(x.price)}</div>{sources.length>1&&minGroupPrice!==maxGroupPrice&&<p className="priceRange">Prezzi rilevati: {money(minGroupPrice)} – {money(maxGroupPrice)}</p>}<p>{x.sqm?`${x.sqm} m² · `:''}{x.sqm&&<b>{money(Math.round(x.price/x.sqm))}/m²</b>}{x.rooms?` · ${x.rooms} locali`:''}</p>{sources.length>1&&<div className="sourceLinks"><span>Disponibile su</span>{sources.map(s=><a key={s.id} href={s.sourceUrl==='#'?undefined:s.sourceUrl} aria-disabled={s.sourceUrl==='#'} target={s.sourceUrl==='#'?undefined:'_blank'} rel={s.sourceUrl==='#'?undefined:'noreferrer'}>{s.source} · {money(s.price)}</a>)}</div>}{x.priceHistory.length>1&&<p className="history">Prezzo precedente: {money(x.priceHistory[x.priceHistory.length-2].price)}</p>}<footer>Pubblicato {formatDate(x.publishedAt)}{sources.length===1&&<a className="openLink" href={x.sourceUrl==='#'?undefined:x.sourceUrl} aria-disabled={x.sourceUrl==='#'} target={x.sourceUrl==='#'?undefined:'_blank'} rel={x.sourceUrl==='#'?undefined:'noreferrer'}>Apri →</a>}</footer></div></article>})}</div>{!loading&&!properties.length&&<div className="empty">Nessun immobile corrisponde ai filtri.</div>}</section>
 </main>}
createRoot(document.getElementById('root')!).render(<App/>);
