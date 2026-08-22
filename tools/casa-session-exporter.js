/* HomeHoliday – Casa.it session exporter v6
Run once from DevTools > Sources > Snippets on Casa.it SRP page 1.
Automatically scans subsequent pages in a hidden same-origin iframe.
*/
(async()=>{
const MAX_PRICE=260000,MAX_PAGES=50,WAIT=2500;
const clean=(v='')=>String(v).replace(/\s+/g,' ').trim();
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const idOf=h=>String(h).match(/\/immobili\/(\d+)\/?/i)?.[1]||null;
const num=s=>Number(String(s).replace(/[^\d,]/g,'').replace(',','.'))||null;
function priceFrom(card){
 const sels=['[data-testid*="price"]','[class*="price"]','[class*="Price"]','[aria-label*="prezzo" i]'];
 for(const s of sels) for(const e of card.querySelectorAll(s)){const t=clean(e.textContent);const m=t.match(/€\s*([\d.]+(?:,\d{1,2})?)|([\d.]+(?:,\d{1,2})?)\s*€/);if(m){const n=Number((m[1]||m[2]).replace(/\./g,'').replace(',','.'));if(n>=10000&&n<=MAX_PRICE)return n;}}
 const vals=[...clean(card.textContent).matchAll(/€\s*([\d.]+(?:,\d{1,2})?)|([\d.]+(?:,\d{1,2})?)\s*€/g)].map(m=>Number((m[1]||m[2]).replace(/\./g,'').replace(',','.'))).filter(n=>n>=10000&&n<=MAX_PRICE);
 return vals.length?Math.max(...vals):null;
}
function cardFor(link){
 let n=link,best=null;
 for(let i=0;n&&i<14;i++,n=n.parentElement){
  const ids=new Set([...n.querySelectorAll?.('a[href*="/immobili/"]')||[]].map(a=>idOf(a.href)).filter(Boolean));
  if(ids.size===1&&clean(n.textContent).length>40)best=n;
  if(best&&(n.matches?.('article,li,[data-testid*="card"],[class*="card" i],[class*="listing" i],[class*="property" i]')))return n;
 }
 return best||link.parentElement;
}
function field(card,selectors){for(const s of selectors){const e=card.querySelector(s);if(e&&clean(e.textContent))return clean(e.textContent);}return'';}
function parseCard(id,href,card){
 const text=clean(card.textContent),price=priceFrom(card);if(!price)return null;
 let title=field(card,['h2','h3','[data-testid*="title"]','[class*="title" i]']);
 if(!title||title.length>220)title=clean(text.match(/(?:Monolocale|Bilocale|Trilocale|Quadrilocale|Pentalocale|Appartamento|Attico(?:\/mansarda)?|Mansarda|Villa|Chalet|Baita|Rustico)[^€]{0,140}/i)?.[0]||`Immobile Casa.it ${id}`);
 const sqm=Number(text.match(/(?:^|\D)(\d{1,3})\s*(?:m²|mq|m2)\b/i)?.[1]);
 const rooms=Number(text.match(/(?:^|\D)(\d{1,2})\s*(?:locali|locale|vani|vano)\b/i)?.[1]);
 return{id:`casa-${id}`,externalId:id,title,location:'Bardonecchia',price,sellerType:/Inserzionista privato|\bPrivato\b/i.test(text)?'Privato':'Agenzia',source:'Casa.it',sourceUrl:href,sqm:sqm>=10&&sqm<=1000?sqm:undefined,rooms:rooms>=1&&rooms<=30?rooms:undefined,status:'ACTIVE'};
}
function extract(doc,pageUrl){
 const links=[...doc.querySelectorAll('a[href*="/immobili/"]')],groups=new Map();
 for(const a of links){let href;try{href=new URL(a.getAttribute('href'),pageUrl).href.split('#')[0]}catch{continue}const id=idOf(href);if(!id)continue;const card=cardFor(a);if(!groups.has(id)||clean(card?.textContent).length<clean(groups.get(id).card?.textContent).length)groups.set(id,{href,card});}
 const items=[];for(const[id,x]of groups){const item=parseCard(id,x.href,x.card);if(item)items.push(item);}
 return{items,candidateIds:groups.size,listingAnchors:links.length};
}
function total(doc){const m=clean(doc.body?.innerText).match(/(\d{1,4})\s+(?:Case|case|risultati)/);return m?Number(m[1]):undefined;}
async function iframePage(url){return new Promise((resolve,reject)=>{const f=document.createElement('iframe');Object.assign(f.style,{position:'fixed',width:'1px',height:'1px',opacity:'0',pointerEvents:'none'});const timer=setTimeout(()=>{f.remove();reject(new Error('timeout'))},20000);f.onload=async()=>{try{await sleep(WAIT);const d=f.contentDocument,u=f.contentWindow.location.href,x=extract(d,u),t=total(d);clearTimeout(timer);f.remove();resolve({x,t});}catch(e){clearTimeout(timer);f.remove();reject(e)}};f.src=url;document.body.appendChild(f);});}
function save(all,pages,source,started){const capturedAt=new Date().toISOString(),listings=[...all.values()].map(x=>({...x,firstSeenAt:started,lastSeenAt:capturedAt,priceHistory:[{price:x.price,capturedAt}]})),payload={provider:'Casa.it',search:'Bardonecchia vendita ≤ €260.000',sourcePage:source,capturedAt,pages,count:listings.length,listings};const u=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=u;a.download=`homeholiday-casa-${capturedAt.slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(u),5000);alert(`HomeHoliday Casa.it: ${listings.length} annunci esportati.`);}
if(document.readyState!=='complete')await new Promise(r=>addEventListener('load',r,{once:true}));await sleep(WAIT);
const source=location.href,started=new Date().toISOString(),all=new Map(),pages=[];let x=extract(document,location.href),expected=total(document);for(const i of x.items)all.set(i.externalId,i);pages.push({page:1,found:x.items.length,added:x.items.length,diagnostics:{listingAnchors:x.listingAnchors,candidateIds:x.candidateIds,totalResults:expected}});console.log(`Casa.it p1: ${x.items.length}/${x.candidateIds}, totale ${all.size}, attesi ${expected||'?'}`);console.table(x.items.slice(0,10).map(i=>({id:i.externalId,price:i.price,title:i.title})));
if(!x.items.length){alert('Casa.it: nessun annuncio riconosciuto.');return}
const base=new URL(location.href);base.searchParams.delete('page');
for(let p=2;p<=MAX_PAGES;p++){if(expected&&all.size>=expected)break;const u=new URL(base);u.searchParams.set('page',p);console.log(`Casa.it: scansione automatica pagina ${p}…`);let r;try{r=await iframePage(u.href)}catch(e){console.warn(`Casa.it stop p${p}:`,e);break}const before=all.size;for(const i of r.x.items)all.set(i.externalId,i);const added=all.size-before;pages.push({page:p,found:r.x.items.length,added,diagnostics:{listingAnchors:r.x.listingAnchors,candidateIds:r.x.candidateIds,totalResults:r.t}});console.log(`Casa.it p${p}: ${r.x.items.length}/${r.x.candidateIds}, +${added}, totale ${all.size}`);if(r.x.candidateIds===0||added===0)break;await sleep(500)}
console.log(`Casa.it completato: ${all.size}${expected?`/${expected}`:''}`);save(all,pages,source,started);
})();