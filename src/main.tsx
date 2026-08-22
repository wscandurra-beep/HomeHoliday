import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { demoConnector } from './connectors/demoConnector';
import type { Listing, Tracker } from './types';
import './styles.css';

const STORAGE_KEY='homeholiday-trackers';
const UI_REFRESH_MS=60_000;
type ProviderState={ok:boolean;checkedAt:string;count?:number;message?:string};
type ListingStore={listings:Listing[];refreshedAt:string|null;providerStatus?:Record<string,ProviderState>};
function money(n:number){return new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(n)}
function formatDate(value?:string){if(!value)return '—';return new Intl.DateTimeFormat('it-IT').format(new Date(`${value.slice(0,10)}T00:00:00Z`));}
function formatRefresh(value:string|null){if(!value)return 'Dati demo';const date=new Date(value);return Number.isNaN(date.getTime())?'Aggiornamento disponibile':new Intl.DateTimeFormat('it-IT',{dateStyle:'short',timeStyle:'short'}).format(date)}
function loadTrackers():Tracker[]{try{return JSON.parse(localStorage.getItem(STORAGE_KEY)||'[]')}catch{return []}}
function providerLabel(value:string){return ({casa:'Casa.it',idealista:'Idealista',subito:'Subito.it',bakeca:'Bakeca.it','immobiliare-public':'Immobiliare.it',immobiliare:'Immobiliare API'} as Record<string,string>)[value]||value}

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
 const duplicateGroups=useMemo(()=>new Set(filtered.filter(x=>x.duplicateGroupId).map(x=>x.duplicateGroupId)).size,[filtered]);
 function createTracker(){if(!place.trim()||max<min)return;const tracker:Tracker={id:crypto.randomUUID(),name:place.trim(),location:place.trim(),minPrice:min,maxPrice:max,sellerType:seller,active:true,refreshHours:2};setTrackers(prev=>[tracker,...prev]);}
 function applyTracker(t:Tracker){setPlace(t.location);setMin(t.minPrice);setMax(t.maxPrice);setSeller(t.sellerType)}
 function removeTracker(id:string){setTrackers(prev=>prev.filter(t=>t.id!==id))}

 return <main><header><div><span className="brand">HomeHoliday</span><h1>Property Tracker</h1><p>Un solo posto per trovare, confrontare e monitorare gli immobili.</p></div><div className="pulse"><i/> {dataSource==='live'?'Dati tracker':'Modalità demo'} · {formatRefresh(refreshedAt)}</div></header>
 <section className="tracker"><h2>Crea il tuo tracker</h2><div className="filters"><label>Luogo<input value={place} onChange={e=>setPlace(e.target.value)} placeholder="Città o zona"/></label><label>Prezzo minimo<input type="number" value={min} onChange={e=>setMin(Math.max(0,+e.target.value||0))}/></label><label>Prezzo massimo<input type="number" value={max} onChange={e=>setMax(Math.max(0,+e.target.value||0))}/></label><label>Inserzionista<select value={seller} onChange={e=>setSeller(e.target.value as typeof seller)}><option>Tutti</option><option>Privato</option><option>Agenzia</option></select></label></div><button type="button" onClick={createTracker} disabled={!place.trim()||max<min}>+ Crea Tracker</button></section>
 {Object.keys(providerStatus).length>0&&<section className="providers"><div className="sectionTitle"><div><h2>Fonti monitorate</h2><p>Stato dell’ultimo controllo automatico</p></div></div><div className="providerGrid">{Object.entries(providerStatus).map(([key,state])=><div className={`providerCard ${state.ok?'ok':'ko'}`} key={key}><span className="providerDot"/><div><b>{providerLabel(key)}</b><small>{state.ok?`${state.count??0} annunci trovati`:state.message||'Non disponibile'}</small></div></div>)}</div></section>}
 {trackers.length>0&&<section className="saved"><div className="sectionTitle"><div><h2>I tuoi Tracker</h2><p>Ricerche persistenti pronte per il monitoraggio automatico</p></div><strong>{trackers.length} attivi</strong></div><div className="trackerList">{trackers.map(t=><div className="trackerCard" key={t.id}><button className="trackerMain" onClick={()=>applyTracker(t)}><b>{t.name}</b><span>{money(t.minPrice)} – {money(t.maxPrice)} · {t.sellerType}</span><small>Ogni {t.refreshHours} ore</small></button><button className="remove" aria-label={`Rimuovi tracker ${t.name}`} onClick={()=>removeTracker(t.id)}>×</button></div>)}</div></section>}
 <section className="stats"><div><b>{filtered.length}</b><span>Annunci</span></div><div><b>{filtered.filter(x=>x.status==='NEW').length}</b><span>Nuovi</span></div><div><b>{duplicateGroups}</b><span>Possibili duplicati</span></div><div><b>{filtered.filter(x=>x.sellerType==='Privato').length}</b><span>Privati</span></div></section>
 <section><div className="sectionTitle"><div><h2>Risultati</h2><p>{dataSource==='live'?'Annunci caricati dallo store del tracker · UI aggiornata automaticamente ogni minuto':'Dati dimostrativi finché il primo tracker reale non produce risultati'}</p></div><strong>{loading?'Aggiornamento…':`${filtered.length} trovati`}</strong></div><div className="grid">{filtered.map(x=><article key={x.id}><div className="photo"><span className={'tag '+x.status.toLowerCase()}>{x.status}</span><span className="source">{x.source}</span></div><div className="body"><small>{x.location} · {x.sellerType}</small><h3>{x.title}</h3><div className="price">{money(x.price)}</div><p>{x.sqm?`${x.sqm} m² · `:''}{x.sqm&&<b>{money(Math.round(x.price/x.sqm))}/m²</b>}</p>{x.duplicateSources&&x.duplicateSources.length>1&&<p className="duplicate">Possibile stesso immobile su {x.duplicateSources.join(' + ')}</p>}{x.priceHistory.length>1&&<p className="history">Prezzo precedente: {money(x.priceHistory[x.priceHistory.length-2].price)}</p>}<footer>Pubblicato {formatDate(x.publishedAt)}<a className="openLink" href={x.sourceUrl==='#'?undefined:x.sourceUrl} aria-disabled={x.sourceUrl==='#'} target={x.sourceUrl==='#'?undefined:'_blank'} rel={x.sourceUrl==='#'?undefined:'noreferrer'}>Apri →</a></footer></div></article>)}</div>{!loading&&!filtered.length&&<div className="empty">Nessun immobile corrisponde ai filtri.</div>}</section>
 </main>}
createRoot(document.getElementById('root')!).render(<App/>);
