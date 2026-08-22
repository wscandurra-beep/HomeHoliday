/* HomeHoliday – Casa.it session exporter v7 diagnostic
Run once from DevTools > Sources > Snippets on Casa.it SRP page 1.
If extraction fails, downloads a diagnostic JSON with real card/link HTML samples.
*/
(async()=>{
const MAX_PRICE=260000,WAIT=2500;
const clean=(v='')=>String(v).replace(/\s+/g,' ').trim();
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const idOf=h=>String(h).match(/\/immobili\/(\d+)\/?/i)?.[1]||null;
function download(name,obj){const u=URL.createObjectURL(new Blob([JSON.stringify(obj,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=u;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),5000);}
function priceFrom(card){
 const candidates=[];
 const selectors=['[data-testid*="price" i]','[class*="price" i]','[aria-label*="prezzo" i]','meta[itemprop="price"]'];
 for(const s of selectors){for(const e of card.querySelectorAll(s)){const raw=e.getAttribute?.('content')||e.getAttribute?.('aria-label')||e.textContent||'';for(const m of String(raw).matchAll(/(?:€\s*)?(\d{2,3}(?:[.\s]\d{3})+|\d{5,6})(?:,\d{1,2})?(?:\s*€)?/g)){const n=Number(m[1].replace(/[.\s]/g,''));if(n>=10000&&n<=MAX_PRICE)candidates.push(n);}}}
 if(candidates.length)return Math.max(...candidates);
 const text=clean(card.textContent||'');
 for(const m of text.matchAll(/€\s*(\d{2,3}(?:[.\s]\d{3})+|\d{5,6})|((?:\d{2,3}(?:[.\s]\d{3})+|\d{5,6}))\s*€/g)){const n=Number((m[1]||m[2]).replace(/[.\s]/g,''));if(n>=10000&&n<=MAX_PRICE)candidates.push(n);}
 return candidates.length?Math.max(...candidates):null;
}
function nearestCard(link){let n=link;for(let i=0;n&&i<12;i++,n=n.parentElement){const ids=new Set([...(n.querySelectorAll?.('a[href*="/immobili/"]')||[])].map(a=>idOf(a.href)).filter(Boolean));if(ids.size===1&&clean(n.textContent).length>80)return n;}return link.parentElement;}
function extract(doc,pageUrl){const links=[...doc.querySelectorAll('a[href*="/immobili/"]')],groups=new Map();for(const a of links){let href;try{href=new URL(a.getAttribute('href'),pageUrl).href}catch{continue}const id=idOf(href);if(!id)continue;const card=nearestCard(a);if(!groups.has(id))groups.set(id,{id,href,card});}
 const items=[];for(const g of groups.values()){const text=clean(g.card?.textContent||'');const price=priceFrom(g.card);if(!price)continue;const h=g.card?.querySelector('h1,h2,h3,h4,[data-testid*="title" i],[class*="title" i]');const title=clean(h?.textContent||g.card?.querySelector('a[href*="/immobili/"]')?.textContent||`Immobile Casa.it ${g.id}`);const sqm=Number(text.match(/(\d{1,3})\s*(?:m²|mq|m2)\b/i)?.[1]);const rooms=Number(text.match(/(\d{1,2})\s*(?:locali|locale|vani|vano)\b/i)?.[1]);items.push({id:`casa-${g.id}`,externalId:g.id,title,location:'Bardonecchia',price,sellerType:/Inserzionista privato|\bPrivato\b/i.test(text)?'Privato':'Agenzia',source:'Casa.it',sourceUrl:g.href,sqm:sqm>=10&&sqm<=1000?sqm:undefined,rooms:rooms>=1&&rooms<=30?rooms:undefined,status:'ACTIVE'});}return{items,groups:[...groups.values()],links};}
function diagnostics(doc,pageUrl,x){return{capturedAt:new Date().toISOString(),url:pageUrl,title:doc.title,bodyTextSample:clean(doc.body?.innerText||'').slice(0,5000),counts:{allAnchors:doc.querySelectorAll('a[href]').length,listingAnchors:x.links.length,candidateIds:x.groups.length,extracted:x.items.length},samples:x.groups.slice(0,12).map(g=>({id:g.id,href:g.href,text:clean(g.card?.textContent||'').slice(0,1500),html:String(g.card?.outerHTML||'').slice(0,8000)})),scripts:[...doc.scripts].filter(s=>/json|next|apollo|redux|state/i.test(`${s.type} ${s.id} ${s.className}`)).slice(0,8).map(s=>({type:s.type,id:s.id,text:String(s.textContent||'').slice(0,5000)}))};}
if(document.readyState!=='complete')await new Promise(r=>addEventListener('load',r,{once:true}));await sleep(WAIT);
const x=extract(document,location.href);console.log(`Casa.it diagnostic: listingAnchors=${x.links.length}, candidateIds=${x.groups.length}, extracted=${x.items.length}`);
const diag=diagnostics(document,location.href,x);
if(x.items.length===0){download(`homeholiday-casa-diagnostic-${new Date().toISOString().slice(0,10)}.json`,diag);alert('Casa.it: 0 annunci estratti. Ho scaricato il file diagnostico: caricalo in ChatGPT.');return;}
const capturedAt=new Date().toISOString();const listings=x.items.map(i=>({...i,firstSeenAt:capturedAt,lastSeenAt:capturedAt,priceHistory:[{price:i.price,capturedAt}]}));download(`homeholiday-casa-${capturedAt.slice(0,10)}.json`,{provider:'Casa.it',search:'Bardonecchia vendita ≤ €260.000',sourcePage:location.href,capturedAt,pages:[{page:1,found:listings.length,added:listings.length,diagnostics:diag.counts}],count:listings.length,listings,diagnostic:diag});alert(`Casa.it: ${listings.length} annunci estratti. Se il numero è troppo basso, carica comunque il JSON: contiene la diagnostica completa.`);
})();