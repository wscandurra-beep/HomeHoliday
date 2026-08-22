import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { demoConnector } from './connectors/demoConnector';
import type { Listing, Tracker } from './types';
import './styles.css';

const STORAGE_KEY='homeholiday-trackers';
type ListingStore={listings:Listing[];refreshedAt:string|null};
function money(n:number){return new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(n)}
function formatDate(value?:string){if(!value)return '—';return new Intl.DateTimeFormat('it-IT').format(new Date(`${value.slice(0,10)}T00:00:00Z`));}
function formatRefresh(value:string|null){if(!value)return 'Dati demo';const date=new Date(value);return Number.isNaN(date.getTime())?'Aggiornamento disponibile':new Intl.DateTimeFormat('it-IT',{dateStyle:'short',timeStyle:'short'}).format(date)}
function loadTrackers():Tracker[]{try{return JSON.parse(localStorage.getItem(STORAGE_KEY)||'[]')}catch{return []}}

async function loadListingStore():Promise<ListingStore>{
 const url=`${import.meta.env.BASE_URL}data/listings.json?ts=${Date.now()}`;
 const response=await fetch(url,{cache:'no-store'});
 if(!response.ok)throw new Error(`Listing store unavailable: ${response.status}`);
 const data=await response.json() as Partial<ListingStore>;
 return {listings:Array.isArray(data.listings)?data.listings:[],refreshedAt:typeof data.refreshedAt==='string'?data.refreshedAt:null};
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

 useEffect(()=>{localStorage.setItem(STORAGE_KEY,JSON.stringify(trackers))},[trackers]);
 useEffect(()=>{
   let active=true;
   setLoading(true);
   loadListingStore().then(async store=>{
     if(!active)return;
     if(store.listings.length){setListings(store.listings);setRefreshedAt(store.refreshedAt);setDataSource('live');setLoading(false);return;}
     const demo=await demoConnector.search({location:'',minPrice:0,maxPrice:Number.MAX_SAFE_INTEGER});
     if(active){setListings(demo);setRefreshedAt(null);setDataSource('demo');setLoading(false)}
   }).catch(async()=>{
     const demo=await demoConnector.search({location:'',minPrice:0,maxPrice:Number.MAX_SAFE_INTEGER});
     if(active){setListings(demo);setRefreshedAt(null);setDataSource('demo');setLoading(false)}
   });
   return()=>{active=false};
 },[]);

 const filtered=useMemo(()=>listings.filter(x=>(!place.trim()||x.location.toLowerCase().includes(place.trim().toLowerCase()))&&x.price>=min&&x.price<=max&&(seller==='Tutti'||x.sellerType===seller)),[listings,place,min,max,seller]);
 function createTracker(){if(!place.trim()||max<min)return;const tracker:Tracker={id:crypto.randomUUID(),name:place.trim(),location:place.trim(),minPrice:min,maxPrice:max,sellerType:seller,active:true,refreshHours:2};setTrackers(prev=>[tracker,...prev]);}
 function applyTracker(t:Tracker){setPlace(t.location);setMin(t.minPrice);setMax(t.maxPrice);setSeller(t.sellerType)}
 function removeTracker(id:string){setTrackers(prev=>prev.filter(t=>t.id!==id))}

 return <main><header><div><span className="brand">HomeHoliday</span><h1>Property Tracker</h1><p>Un solo posto per trovare, confrontare e monitorare gli immobili.</p></div><div className="pulse"><i/> {dataSource==='live'?'Dati tracker':'Modalità demo'} · {formatRefresh(refreshedAt)}</div></header>
 <section className="tracker"><h2>Crea il tuo tracker</h2><div className="filters"><label>Luogo<input value={place} onChange={e=>setPlace(e.target.value)} placeholder="Città o zona"/></label><label>Prezzo minimo<input type="number" value={min} onChange={e=>setMin(Math.max(0,+e.target.value||0))}/></label><label>Prezzo massimo<input type="number" value={max} onChange={e=>setMax(Math.max(0,+e.target.value||0))}/></label><label>Inserzionista<select value={seller} onChange={e=>setSeller(e.target.value as typeof seller)}><option>Tutti</option><option>Privato</option><option>Agenzia</option></select></label></div><button type="button" onClick={createTracker} disabled={!place.trim()||max<min}>+ Crea Tracker</button></section>
 {trackers.length>0&&<section className="saved"><div className="sectionTitle"><div><h2>I tuoi Tracker</h2><p>Ricerche persistenti pronte per il monitoraggio automatico</p></div><strong>{trackers.length} attivi</strong></div><div className="trackerList">{trackers.map(t=><div className="trackerCard" key={t.id}><button className="trackerMain" onClick={()=>applyTracker(t)}><b>{t.name}</b><span>{money(t.minPrice)} – {money(t.maxPrice)} · {t.sellerType}</span><small>Ogni {t.refreshHours} ore</small></button><button className="remove" aria-label={`Rimuovi tracker ${t.name}`} onClick={()=>removeTracker(t.id)}>×</button></div>)}</div></section>}
 <section className="stats"><div><b>{filtered.length}</b><span>Immobili</span></div><div><b>{filtered.filter(x=>x.status==='NEW').length}</b><span>Nuovi</span></div><div><b>{filtered.filter(x=>x.status==='UPDATED').length}</b><span>Aggiornati</span></div><div><b>{filtered.filter(x=>x.sellerType==='Privato').length}</b><span>Privati</span></div></section>
 <section><div className="sectionTitle"><div><h2>Risultati</h2><p>{dataSource==='live'?'Annunci caricati dallo store del tracker':'Dati dimostrativi finché il primo tracker reale non produce risultati'}</p></div><strong>{loading?'Aggiornamento…':`${filtered.length} trovati`}</strong></div><div className="grid">{filtered.map(x=><article key={x.id}><div className="photo"><span className={'tag '+x.status.toLowerCase()}>{x.status}</span><span className="source">{x.source}</span></div><div className="body"><small>{x.location} · {x.sellerType}</small><h3>{x.title}</h3><div className="price">{money(x.price)}</div><p>{x.sqm?`${x.sqm} m² · `:''}{x.sqm&&<b>{money(Math.round(x.price/x.sqm))}/m²</b>}</p>{x.priceHistory.length>1&&<p className="history">Prezzo precedente: {money(x.priceHistory[x.priceHistory.length-2].price)}</p>}<footer>Pubblicato {formatDate(x.publishedAt)}<a className="openLink" href={x.sourceUrl==='#'?undefined:x.sourceUrl} aria-disabled={x.sourceUrl==='#'} target={x.sourceUrl==='#'?undefined:'_blank'} rel={x.sourceUrl==='#'?undefined:'noreferrer'}>Apri →</a></footer></div></article>)}</div>{!loading&&!filtered.length&&<div className="empty">Nessun immobile corrisponde ai filtri.</div>}</section>
 </main>}
createRoot(document.getElementById('root')!).render(<App/>);
