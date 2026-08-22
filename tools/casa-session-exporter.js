/*
HomeHoliday – Casa.it session exporter v5
Run once from Chrome/Edge DevTools > Sources > Snippets while the filtered Casa.it SRP page 1 is open.
This version keeps the main page in place and loads subsequent result pages in a hidden same-origin iframe,
so the full extraction can run automatically in one pass without re-running the snippet after each page.
*/
(async () => {
  const MAX_PRICE = 260000;
  const MAX_PAGES = 50;
  const RENDER_WAIT_MS = 2200;
  const BETWEEN_PAGES_MS = 500;
  const clean = (v='') => String(v).replace(/\s+/g,' ').trim();
  const sleep = (ms) => new Promise(r=>setTimeout(r,ms));

  function euroValues(text='') {
    const s=String(text).replace(/\u00a0/g,' ');
    const values=[];
    for(const re of [/(?:Asta\s+da\s+)?€\s*([\d.]+(?:,\d{1,2})?)/gi,/([\d.]+(?:,\d{1,2})?)\s*€/gi]) {
      for(const m of s.matchAll(re)) {
        const n=Number(m[1].replace(/\./g,'').replace(',','.'));
        if(Number.isFinite(n) && n>=10000 && n<=MAX_PRICE) values.push(n);
      }
    }
    return [...new Set(values)].sort((a,b)=>b-a);
  }
  const moneyToNumber=(text='')=>euroValues(text)[0]??null;
  const extractId=(href='')=>String(href).match(/\/immobili\/(\d+)\/?/i)?.[1]||null;

  function findCard(doc, link){
    let node=link, best=null;
    for(let i=0;node&&i<12;i++,node=node.parentElement){
      const t=clean(node.textContent||'');
      const ids=[...(node.querySelectorAll?.('a[href*="/immobili/"]')||[])].map(a=>extractId(a.href)).filter(Boolean);
      const uniqueIds=new Set(ids);
      if(uniqueIds.size===1 && t.length>=50 && /€/.test(t)) best=node;
      if(best && /m²|mq|local[ei]|bagni?|piano/i.test(t)) return best;
    }
    return best || link.closest('article,li,[data-testid],[class*="card"],[class*="listing"],[class*="property"]') || link.parentElement;
  }

  function parseSqm(text='') {
    const matches=[...String(text).matchAll(/(?:^|\D)(\d{1,3})\s*(?:m²|mq|m2)\b/gi)].map(m=>Number(m[1])).filter(n=>n>=10&&n<=1000);
    return matches.length?matches[0]:undefined;
  }
  function parseRooms(text='') {
    const n=Number(String(text).match(/(?:^|\D)(\d{1,2})\s*(?:locali|locale|vani|vano)\b/i)?.[1]);
    return n>=1&&n<=30?n:undefined;
  }

  function buildListing(externalId,href,text,titleHint=''){
    const price=moneyToNumber(text); if(!price) return null;
    let title=clean(titleHint);
    if(!title||title.length<5||title.length>220){
      title=clean(text.match(/(?:Monolocale|Bilocale|Trilocale|Quadrilocale|Pentalocale|Appartamento|Attico|Mansarda|Casa\s+(?:indipendente|bifamiliare)|Villa|Rustico|Baita|Bungalow|Chalet)[^€]{0,180}/i)?.[0]||`Immobile Casa.it ${externalId}`);
    }
    return {id:`casa-${externalId}`,externalId,title,location:'Bardonecchia',price,
      sellerType:/Inserzionista\s+privato|\bPrivato\b/i.test(text)?'Privato':'Agenzia',source:'Casa.it',sourceUrl:href,
      sqm:parseSqm(text),rooms:parseRooms(text),status:'ACTIVE'};
  }

  function extractFromDocument(doc, pageUrl){
    const result=new Map();
    const anchors=[...doc.querySelectorAll('a[href*="/immobili/"]')];
    const cards=new Map();
    for(const link of anchors){
      let href; try{href=new URL(link.getAttribute('href'),pageUrl).href.split('#')[0];}catch{continue;}
      const id=extractId(href); if(!id) continue;
      const card=findCard(doc,link); if(!card) continue;
      if(!cards.has(id)) cards.set(id,{href,card});
    }
    for(const [id,{href,card}] of cards){
      const text=clean(card.textContent||'');
      const heading=card.querySelector('h1,h2,h3,h4,h5,[class*="title"],[data-testid*="title"]');
      const item=buildListing(id,href,text,heading?.textContent||'');
      if(item) result.set(id,item);
    }
    return {items:[...result.values()],anchorCount:anchors.length,candidateIds:cards.size};
  }

  function totalResults(doc){
    const text=clean(doc.body?.innerText||'');
    const m=text.match(/(\d{1,4})\s+(?:Case|case|risultati)/i);
    return m?Number(m[1]):undefined;
  }

  async function loadPageInIframe(url){
    return new Promise((resolve,reject)=>{
      const iframe=document.createElement('iframe');
      iframe.style.position='absolute';
      iframe.style.width='1px';
      iframe.style.height='1px';
      iframe.style.opacity='0';
      iframe.style.pointerEvents='none';
      iframe.setAttribute('aria-hidden','true');
      let settled=false;
      const cleanup=()=>{try{iframe.remove();}catch{}};
      const timer=setTimeout(()=>{if(!settled){settled=true;cleanup();reject(new Error('Timeout caricamento pagina'));}},15000);
      iframe.onload=async()=>{
        if(settled)return;
        try{
          await sleep(RENDER_WAIT_MS);
          const doc=iframe.contentDocument;
          if(!doc) throw new Error('Iframe non accessibile');
          const finalUrl=iframe.contentWindow?.location?.href||url;
          settled=true; clearTimeout(timer);
          const extracted=extractFromDocument(doc,finalUrl);
          const nextLink=[...doc.querySelectorAll('a[href]')].find(a=>{try{return Number(new URL(a.href,finalUrl).searchParams.get('page'))===Number(new URL(finalUrl).searchParams.get('page')||'1')+1;}catch{return false;}});
          const info={doc,finalUrl,extracted,nextHref:nextLink?.href,total:totalResults(doc)};
          cleanup(); resolve(info);
        }catch(err){settled=true;clearTimeout(timer);cleanup();reject(err);}
      };
      iframe.onerror=()=>{if(!settled){settled=true;clearTimeout(timer);cleanup();reject(new Error('Errore caricamento iframe'));}};
      iframe.src=url;
      document.body.appendChild(iframe);
    });
  }

  function download(all,pages,sourcePage,startedAt){
    const capturedAt=new Date().toISOString();
    const listings=[...all.values()].map(item=>({...item,firstSeenAt:startedAt,lastSeenAt:capturedAt,priceHistory:[{price:item.price,capturedAt}]}));
    const payload={provider:'Casa.it',search:'Bardonecchia vendita ≤ €260.000',sourcePage,capturedAt,pages,count:listings.length,listings};
    const blobUrl=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}));
    const a=document.createElement('a');a.href=blobUrl;a.download=`homeholiday-casa-${capturedAt.slice(0,10)}.json`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(blobUrl),5000);
    console.log(`HomeHoliday Casa.it: completato. ${listings.length} annunci.`);
    alert(`HomeHoliday Casa.it: ${listings.length} annunci esportati. Carica il JSON in ChatGPT.`);
  }

  if(document.readyState!=='complete') await new Promise(r=>addEventListener('load',r,{once:true}));
  await sleep(RENDER_WAIT_MS);

  const sourcePage=location.href;
  const startedAt=new Date().toISOString();
  const all=new Map();
  const pages=[];

  const first=extractFromDocument(document,location.href);
  for(const item of first.items) all.set(item.externalId,item);
  pages.push({page:1,found:first.items.length,added:first.items.length,diagnostics:{listingAnchors:first.anchorCount,candidateIds:first.candidateIds,totalResults:totalResults(document)}});
  console.log(`HomeHoliday Casa.it: pagina 1: ${first.items.length} letti, totale ${all.size}.`);
  console.table(first.items.slice(0,8).map(x=>({id:x.externalId,price:x.price,title:x.title,sqm:x.sqm,rooms:x.rooms})));
  if(first.items.length===0){alert('HomeHoliday Casa.it: 0 annunci riconosciuti sulla pagina 1. Non è stato creato alcun JSON.');return;}

  let currentUrl=new URL(location.href);
  currentUrl.searchParams.delete('page');
  let page=2;
  let emptyPages=0;

  while(page<=MAX_PAGES){
    const url=new URL(currentUrl);
    url.searchParams.set('page',String(page));
    console.log(`HomeHoliday Casa.it: caricamento automatico pagina ${page}…`);
    let info;
    try{info=await loadPageInIframe(url.href);}catch(err){console.warn(`HomeHoliday Casa.it: stop pagina ${page}: ${err.message}`);break;}
    const before=all.size;
    for(const item of info.extracted.items) all.set(item.externalId,item);
    const added=all.size-before;
    pages.push({page,found:info.extracted.items.length,added,diagnostics:{listingAnchors:info.extracted.anchorCount,candidateIds:info.extracted.candidateIds,totalResults:info.total}});
    console.log(`HomeHoliday Casa.it: pagina ${page}: ${info.extracted.items.length} letti, ${added} nuovi, totale ${all.size}.`);
    emptyPages=added===0?emptyPages+1:0;
    if(emptyPages>=1) break;
    if(!info.nextHref) break;
    page+=1;
    await sleep(BETWEEN_PAGES_MS);
  }

  download(all,pages,sourcePage,startedAt);
})();
