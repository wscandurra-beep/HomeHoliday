import React, { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

type Listing = { id:number; title:string; location:string; price:number; date:string; seller:'Agenzia'|'Privato'; source:string; sqm:number; status:'NEW'|'UPDATED'|'ACTIVE' };
const listings: Listing[] = [
 {id:1,title:'Trilocale centro',location:'Bardonecchia',price:235000,date:'22/08/2026',seller:'Agenzia',source:'Immobiliare.it',sqm:82,status:'NEW'},
 {id:2,title:'Bilocale panoramico',location:'Bardonecchia',price:178000,date:'21/08/2026',seller:'Privato',source:'Idealista',sqm:55,status:'NEW'},
 {id:3,title:'Appartamento vicino piste',location:'Oulx',price:265000,date:'19/08/2026',seller:'Agenzia',source:'Casa.it',sqm:91,status:'UPDATED'}
];
function money(n:number){return new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(n)}
function App(){
 const [place,setPlace]=useState('Bardonecchia'); const [min,setMin]=useState(100000); const [max,setMax]=useState(350000); const [seller,setSeller]=useState('Tutti');
 const filtered=useMemo(()=>listings.filter(x=>(!place||x.location.toLowerCase().includes(place.toLowerCase()))&&x.price>=min&&x.price<=max&&(seller==='Tutti'||x.seller===seller)),[place,min,max,seller]);
 return <main><header><div><span className="brand">HomeHoliday</span><h1>Property Tracker</h1><p>Un solo posto per trovare, confrontare e monitorare gli immobili.</p></div><div className="pulse"><i/> Tracker attivo · ogni 2 ore</div></header>
 <section className="tracker"><h2>Crea il tuo tracker</h2><div className="filters"><label>Luogo<input value={place} onChange={e=>setPlace(e.target.value)} placeholder="Città o zona"/></label><label>Prezzo minimo<input type="number" value={min} onChange={e=>setMin(+e.target.value)}/></label><label>Prezzo massimo<input type="number" value={max} onChange={e=>setMax(+e.target.value)}/></label><label>Inserzionista<select value={seller} onChange={e=>setSeller(e.target.value)}><option>Tutti</option><option>Privato</option><option>Agenzia</option></select></label></div><button>+ Crea Tracker</button></section>
 <section className="stats"><div><b>{filtered.length}</b><span>Immobili</span></div><div><b>{filtered.filter(x=>x.status==='NEW').length}</b><span>Nuovi</span></div><div><b>{filtered.filter(x=>x.status==='UPDATED').length}</b><span>Aggiornati</span></div><div><b>{filtered.filter(x=>x.seller==='Privato').length}</b><span>Privati</span></div></section>
 <section><div className="sectionTitle"><div><h2>Risultati</h2><p>Annunci consolidati dalle fonti monitorate</p></div><strong>{filtered.length} trovati</strong></div><div className="grid">{filtered.map(x=><article key={x.id}><div className="photo"><span className={'tag '+x.status.toLowerCase()}>{x.status}</span><span className="source">{x.source}</span></div><div className="body"><small>{x.location} · {x.seller}</small><h3>{x.title}</h3><div className="price">{money(x.price)}</div><p>{x.sqm} m² · <b>{money(Math.round(x.price/x.sqm))}/m²</b></p><footer>Pubblicato {x.date}<button>Apri →</button></footer></div></article>)}</div>{!filtered.length&&<div className="empty">Nessun immobile corrisponde ai filtri.</div>}</section>
 </main>}
createRoot(document.getElementById('root')!).render(<App/>);