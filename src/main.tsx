import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { demoConnector } from './connectors/demoConnector';
import type { Listing } from './types';
import './styles.css';

function money(n:number){return new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(n)}
function formatDate(value?: string){if(!value)return '—'; return new Intl.DateTimeFormat('it-IT').format(new Date(`${value}T00:00:00Z`));}

function App(){
 const [place,setPlace]=useState('Bardonecchia');
 const [min,setMin]=useState(100000);
 const [max,setMax]=useState(350000);
 const [seller,setSeller]=useState('Tutti');
 const [listings,setListings]=useState<Listing[]>([]);
 const [loading,setLoading]=useState(true);

 useEffect(()=>{
   let active=true;
   setLoading(true);
   demoConnector.search({location:place,minPrice:min,maxPrice:max}).then((data)=>{if(active){setListings(data);setLoading(false)}});
   return()=>{active=false};
 },[place,min,max]);

 const filtered=useMemo(()=>listings.filter(x=>seller==='Tutti'||x.sellerType===seller),[listings,seller]);

 return <main><header><div><span className="brand">HomeHoliday</span><h1>Property Tracker</h1><p>Un solo posto per trovare, confrontare e monitorare gli immobili.</p></div><div className="pulse"><i/> Tracker attivo · ogni 2 ore</div></header>
 <section className="tracker"><h2>Crea il tuo tracker</h2><div className="filters"><label>Luogo<input value={place} onChange={e=>setPlace(e.target.value)} placeholder="Città o zona"/></label><label>Prezzo minimo<input type="number" value={min} onChange={e=>setMin(Math.max(0,+e.target.value||0))}/></label><label>Prezzo massimo<input type="number" value={max} onChange={e=>setMax(Math.max(0,+e.target.value||0))}/></label><label>Inserzionista<select value={seller} onChange={e=>setSeller(e.target.value)}><option>Tutti</option><option>Privato</option><option>Agenzia</option></select></label></div><button type="button">+ Crea Tracker</button></section>
 <section className="stats"><div><b>{filtered.length}</b><span>Immobili</span></div><div><b>{filtered.filter(x=>x.status==='NEW').length}</b><span>Nuovi</span></div><div><b>{filtered.filter(x=>x.status==='UPDATED').length}</b><span>Aggiornati</span></div><div><b>{filtered.filter(x=>x.sellerType==='Privato').length}</b><span>Privati</span></div></section>
 <section><div className="sectionTitle"><div><h2>Risultati</h2><p>Annunci consolidati dalle fonti monitorate</p></div><strong>{loading?'Aggiornamento…':`${filtered.length} trovati`}</strong></div><div className="grid">{filtered.map(x=><article key={x.id}><div className="photo"><span className={'tag '+x.status.toLowerCase()}>{x.status}</span><span className="source">{x.source}</span></div><div className="body"><small>{x.location} · {x.sellerType}</small><h3>{x.title}</h3><div className="price">{money(x.price)}</div><p>{x.sqm?`${x.sqm} m² · `:''}{x.sqm&&<b>{money(Math.round(x.price/x.sqm))}/m²</b>}</p>{x.priceHistory.length>1&&<p className="history">Prezzo precedente: {money(x.priceHistory[x.priceHistory.length-2].price)}</p>}<footer>Pubblicato {formatDate(x.publishedAt)}<a className="openLink" href={x.sourceUrl==='#'?undefined:x.sourceUrl} aria-disabled={x.sourceUrl==='#'}>Apri →</a></footer></div></article>)}</div>{!loading&&!filtered.length&&<div className="empty">Nessun immobile corrisponde ai filtri.</div>}</section>
 </main>}
createRoot(document.getElementById('root')!).render(<App/>);