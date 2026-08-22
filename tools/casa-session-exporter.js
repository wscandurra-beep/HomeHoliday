/*
HomeHoliday – Casa.it session exporter v4
Run from Chrome/Edge DevTools > Sources > Snippets while the filtered Casa.it SRP is open.
Reads the rendered DOM and persists progress in window.name across page navigation.
*/
(async () => {
  const MAX_PRICE = 260000;
  const MAX_PAGES = 50;
  const STATE_PREFIX = '__HOMEHOLIDAY_CASA_V4__';
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
  function moneyToNumber(text='') { return euroValues(text)[0] ?? null; }
  const extractId=(href='')=>String(href).match(/\/immobili\/(\d+)\/?/i)?.[1]||null;

  function findCard(link){
    let node=link, best=null;
    for(let i=0;node&&i<12;i++,node=node.parentElement){
      const t=clean(node.textContent||'');
      const ids=[...node.querySelectorAll?.('a[href*="/immobili/"]')||[]].map(a=>extractId(a.href)).filter(Boolean);
      const uniqueIds=new Set(ids);
      if(uniqueIds.size===1 && t.length>=50 && /€/.test(t)) best=node;
      if(best && /m²|mq|local[ei]|bagni?|piano/i.test(t)) return best;
    }
    return best || link.closest('article,li,[data-testid],[class*="card"],[class*="listing"],[class*="property"]') || link.parentElement;
  }

  function parseSqm(text='') {
    const matches=[...String(text).matchAll(/(?:^|\D)(\d{1,3})\s*(?:m²|mq|m2)\b/gi)]
      .map(m=>Number(m[1])).filter(n=>n>=10&&n<=1000);
    return matches.length ? matches[0] : undefined;
  }
  function parseRooms(text='') {
    const n=Number(String(text).match(/(?:^|\D)(\d{1,2})\s*(?:locali|locale|vani|vano)\b/i)?.[1]);
    return n>=1&&n<=30 ? n : undefined;
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

  function extractFromDom(){
    const result=new Map();
    const anchors=[...document.querySelectorAll('a[href*="/immobili/"]')];
    const cards=new Map();
    for(const link of anchors){
      let href; try{href=new URL(link.getAttribute('href'),location.href).href.split('#')[0];}catch{continue;}
      const id=extractId(href); if(!id) continue;
      const card=findCard(link); if(!card) continue;
      if(!cards.has(id)) cards.set(id,{href,card});
    }
    for(const [id,{href,card}] of cards){
      const text=clean(card.textContent||'');
      const heading=card.querySelector('h1,h2,h3,h4,h5,[class*="title"],[data-testid*="title"]');
      const item=buildListing(id,href,text,heading?.textContent||'');
      if(item) result.set(id,item);
    }
    return {items:[...result.values()],candidateIds:cards.size,anchorCount:anchors.length};
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
  console.log(`HomeHoliday Casa.it diagnostics: listingAnchors=${dom.anchorCount}, candidateIds=${dom.candidateIds}, extracted=${dom.items.length}`);
  console.table(dom.items.slice(0,8).map(x=>({id:x.externalId,price:x.price,title:x.title,sqm:x.sqm,rooms:x.rooms})));

  const before=Object.keys(state.listings).length; for(const item of dom.items) state.listings[item.externalId]=item;
  const added=Object.keys(state.listings).length-before;
  state.pages.push({page,found:dom.items.length,added,diagnostics:{listingAnchors:dom.anchorCount,candidateIds:dom.candidateIds}});
  state.lastProcessedPage=page; state.emptyPages=added===0?state.emptyPages+1:0; saveState(state);
  console.log(`HomeHoliday Casa.it: pagina ${page}: ${dom.items.length} letti, ${added} nuovi, totale ${Object.keys(state.listings).length}.`);

  if(page===1&&dom.items.length===0){clearState();alert('HomeHoliday Casa.it: 0 annunci riconosciuti. Inviami la riga diagnostics della Console.');return;}

  const nextLink=[...document.querySelectorAll('a[href]')].find(a=>{try{return Number(new URL(a.href,location.href).searchParams.get('page'))===page+1;}catch{return false;}});
  if(page>=MAX_PAGES||state.emptyPages>=1||!nextLink){download(state);return;}
  console.log(`HomeHoliday Casa.it: apro pagina ${page+1}. Dopo il caricamento riesegui lo stesso Snippet con Ctrl+Enter.`);
  location.href=nextLink.href;
})();
