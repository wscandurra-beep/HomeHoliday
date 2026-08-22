/*
HomeHoliday – Casa.it session exporter v3
Run from Chrome/Edge DevTools > Sources > Snippets while the filtered Casa.it SRP is open.
Reads the rendered DOM first, then falls back to the full HTML/embedded data when Casa.it does not expose listing anchors directly.
Progress is persisted in window.name across page navigation.
*/
(async () => {
  const MAX_PRICE = 260000;
  const MAX_PAGES = 50;
  const STATE_PREFIX = '__HOMEHOLIDAY_CASA_V3__';
  const clean = (v='') => String(v).replace(/\s+/g,' ').trim();
  const sleep = (ms) => new Promise(r=>setTimeout(r,ms));

  function moneyToNumber(text='') {
    const s=String(text).replace(/\u00a0/g,' ');
    for (const re of [/(?:Asta\s+da\s+)?€\s*([\d.]+(?:,\d{1,2})?)/gi,/([\d.]+(?:,\d{1,2})?)\s*€/gi]) {
      for (const m of s.matchAll(re)) {
        const n=Number(m[1].replace(/\./g,'').replace(',','.'));
        if (n>0 && n<=MAX_PRICE) return n;
      }
    }
    return null;
  }
  const extractId=(href='')=>String(href).match(/\/immobili\/(\d+)\/?/i)?.[1]||null;

  function findCard(link){
    let node=link;
    for(let i=0;node&&i<10;i++,node=node.parentElement){
      const t=clean(node.textContent||'');
      if(t.length>=50&&/€|Asta\s+da/i.test(t)&&/m²|mq|local[ei]|bagni?|piano/i.test(t)) return node;
    }
    return link.closest('article,li,[data-testid],[class*="card"],[class*="listing"],[class*="property"]')||link.parentElement;
  }

  function buildListing(externalId,href,text,titleHint=''){
    const price=moneyToNumber(text); if(!price) return null;
    const sqm=text.match(/(\d{1,4})\s*(?:m²|mq|m2)\b/i)?.[1];
    const rooms=text.match(/(\d{1,2})\s*(?:locali|locale|vani|vano)\b/i)?.[1];
    let title=clean(titleHint);
    if(!title||title.length<5||title.length>220){
      title=clean(text.match(/(?:Monolocale|Bilocale|Trilocale|Quadrilocale|Pentalocale|Appartamento|Attico|Mansarda|Casa\s+(?:indipendente|bifamiliare)|Villa|Rustico|Baita|Bungalow|Chalet)[^€]{0,180}/i)?.[0]||`Immobile Casa.it ${externalId}`);
    }
    return {id:`casa-${externalId}`,externalId,title,location:'Bardonecchia',price,
      sellerType:/Inserzionista\s+privato|\bPrivato\b/i.test(text)?'Privato':'Agenzia',source:'Casa.it',sourceUrl:href,
      sqm:sqm?Number(sqm):undefined,rooms:rooms?Number(rooms):undefined,status:'ACTIVE'};
  }

  function extractFromDom(){
    const result=new Map();
    const anchors=[...document.querySelectorAll('a[href]')];
    let candidateAnchors=0;
    for(const link of anchors){
      let href; try{href=new URL(link.getAttribute('href'),location.href).href.split('#')[0];}catch{continue;}
      const id=extractId(href); if(!id) continue; candidateAnchors++;
      const card=findCard(link), text=clean(card?.textContent||link.textContent||'');
      const heading=card?.querySelector('h1,h2,h3,h4,h5,[class*="title"],[data-testid*="title"]');
      const item=buildListing(id,href,text,heading?.textContent||link.textContent||'');
      if(item) result.set(id,item);
    }
    return {items:[...result.values()],candidateAnchors};
  }

  function extractFromHtml(){
    const html=document.documentElement.outerHTML;
    const result=new Map();
    const re=/(?:https?:\\?\/\\?\/www\.casa\.it)?\\?\/immobili\\?\/(\d+)\\?\/?/gi;
    let m, matches=0;
    while((m=re.exec(html))){
      matches++;
      const id=m[1]; if(result.has(id)) continue;
      const start=Math.max(0,m.index-3500), end=Math.min(html.length,m.index+3500);
      const chunk=html.slice(start,end).replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ');
      const text=clean(chunk.replace(/&nbsp;|&#160;/gi,' ').replace(/&euro;|&#8364;/gi,'€').replace(/&amp;/gi,'&'));
      const item=buildListing(id,`https://www.casa.it/immobili/${id}/`,text,'');
      if(item) result.set(id,item);
    }
    return {items:[...result.values()],htmlMatches:matches};
  }

  function loadState(){if(!window.name.startsWith(STATE_PREFIX))return null;try{return JSON.parse(window.name.slice(STATE_PREFIX.length));}catch{return null;}}
  const saveState=(s)=>{window.name=STATE_PREFIX+JSON.stringify(s)};
  const clearState=()=>{if(window.name.startsWith(STATE_PREFIX))window.name='';};
  const currentPage=()=>{const n=Number(new URL(location.href).searchParams.get('page')||'1');return Number.isFinite(n)&&n>0?n:1;};

  function download(state){
    const capturedAt=new Date().toISOString();
    const listings=Object.values(state.listings).map(item=>({...item,firstSeenAt:state.startedAt,lastSeenAt:capturedAt,priceHistory:[{price:item.price,capturedAt}]}));
    const payload={provider:'Casa.it',search:'Bardonecchia vendita ≤ €260.000',sourcePage:state.sourcePage,capturedAt,pages:state.pages,count:listings.length,listings};
    const blobUrl=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}));
    const a=document.createElement('a');a.href=blobUrl;a.download=`homeholiday-casa-${capturedAt.slice(0,10)}.json`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(blobUrl),5000);
    clearState(); alert(`HomeHoliday Casa.it: ${listings.length} annunci esportati. Carica il JSON in ChatGPT.`);
  }

  const page=currentPage(); let state=loadState();
  if(!state||(page===1&&state.lastProcessedPage>=page)) state={startedAt:new Date().toISOString(),sourcePage:location.href,pages:[],listings:{},lastProcessedPage:0,emptyPages:0};
  if(document.readyState!=='complete') await new Promise(r=>addEventListener('load',r,{once:true}));
  await sleep(1800);

  const dom=extractFromDom();
  const html=dom.items.length?{items:[],htmlMatches:0}:extractFromHtml();
  const items=dom.items.length?dom.items:html.items;
  console.log(`HomeHoliday Casa.it diagnostics: anchors=${document.querySelectorAll('a[href]').length}, candidateListingAnchors=${dom.candidateAnchors}, htmlListingMatches=${html.htmlMatches}, extracted=${items.length}`);

  const before=Object.keys(state.listings).length; for(const item of items) state.listings[item.externalId]=item;
  const added=Object.keys(state.listings).length-before;
  state.pages.push({page,found:items.length,added,diagnostics:{candidateListingAnchors:dom.candidateAnchors,htmlListingMatches:html.htmlMatches}});
  state.lastProcessedPage=page; state.emptyPages=added===0?state.emptyPages+1:0; saveState(state);
  console.log(`HomeHoliday Casa.it: pagina ${page}: ${items.length} letti, ${added} nuovi, totale ${Object.keys(state.listings).length}.`);

  if(page===1&&items.length===0){
    clearState();
    alert('HomeHoliday Casa.it: ancora 0 annunci. Copia dalla Console la riga "HomeHoliday Casa.it diagnostics" e inviamela. Non è stato creato alcun JSON.');
    return;
  }

  const nextLink=[...document.querySelectorAll('a[href]')].find(a=>{try{return Number(new URL(a.href,location.href).searchParams.get('page'))===page+1;}catch{return false;}});
  if(page>=MAX_PAGES||state.emptyPages>=1||!nextLink){download(state);return;}
  console.log(`HomeHoliday Casa.it: apro pagina ${page+1}. Dopo il caricamento riesegui lo stesso Snippet con Ctrl+Enter.`);
  location.href=nextLink.href;
})();
