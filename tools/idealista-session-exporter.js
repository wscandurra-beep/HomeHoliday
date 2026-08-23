/* HomeHoliday – Idealista.it exporter test v2
Run from the filtered Idealista SRP page.
Test mode: extracts the first 3 real listings only.
Uses random 5–20 second pacing between detail loads.
*/
(async()=>{
  const TEST_LIMIT=3;
  const MAX_PRICE=260000;
  const LOAD_WAIT=1800;
  const PAUSE_MIN_MS=5000;
  const PAUSE_MAX_MS=20000;

  const clean=(v='')=>String(v).replace(/\s+/g,' ').trim();
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const randomPause=()=>Math.floor(PAUSE_MIN_MS+Math.random()*(PAUSE_MAX_MS-PAUSE_MIN_MS+1));
  const idOf=url=>String(url).match(/\/inmueble\/(\d+)\/?/i)?.[1]||null;

  function euroNumbers(text=''){
    const out=[];
    for(const m of String(text).matchAll(/([\d.]+(?:,\d{1,2})?)\s*€/g)){
      const n=Number(m[1].replace(/\./g,'').replace(',','.'));
      if(Number.isFinite(n)&&n>=10000&&n<=MAX_PRICE)out.push(n);
    }
    for(const m of String(text).matchAll(/€\s*([\d.]+(?:,\d{1,2})?)/g)){
      const n=Number(m[1].replace(/\./g,'').replace(',','.'));
      if(Number.isFinite(n)&&n>=10000&&n<=MAX_PRICE)out.push(n);
    }
    return out;
  }

  function findListingUrlInCard(card,baseUrl){
    const candidates=[];
    for(const a of card.querySelectorAll('a')){
      const raw=a.getAttribute('href')||'';
      if(raw)candidates.push(raw);
      for(const attr of a.getAttributeNames()){
        if(attr.startsWith('data-')){
          const v=a.getAttribute(attr)||'';
          if(v)candidates.push(v);
        }
      }
      const onclick=a.getAttribute('onclick');
      if(onclick)candidates.push(onclick);
    }
    for(const el of card.querySelectorAll('*')){
      for(const attr of el.getAttributeNames?.()||[]){
        if(attr.startsWith('data-')||attr==='onclick'){
          const v=el.getAttribute(attr)||'';
          if(v)candidates.push(v);
        }
      }
    }
    candidates.push(card.outerHTML||'');
    for(const raw of candidates){
      const m=String(raw).match(/(?:https?:\/\/www\.idealista\.it)?\/inmueble\/(\d+)\/?/i);
      if(!m)continue;
      try{return new URL(`/inmueble/${m[1]}/`,baseUrl).href;}catch{}
    }
    return null;
  }

  function listingLinks(doc,baseUrl){
    const seen=new Set(),out=[];
    for(const card of doc.querySelectorAll('article.item')){
      const href=findListingUrlInCard(card,baseUrl);
      const id=idOf(href);
      if(!id||seen.has(id))continue;
      seen.add(id);
      const title=clean(card.querySelector('.item-link,h2,h3')?.textContent||'');
      out.push({id,href,title});
    }
    if(!out.length){
      const html=doc.documentElement?.outerHTML||'';
      for(const m of html.matchAll(/\/inmueble\/(\d+)\/?/gi)){
        const id=m[1];
        if(seen.has(id))continue;
        seen.add(id);
        out.push({id,href:new URL(`/inmueble/${id}/`,baseUrl).href,title:''});
      }
    }
    return out;
  }

  function detail(doc,url){
    const id=idOf(url);if(!id)return null;
    const title=clean(doc.querySelector('h1')?.textContent||doc.title||`Immobile Idealista ${id}`);
    const body=clean(doc.body?.innerText||'');
    const p=body.indexOf(title),near=p>=0?body.slice(p,p+2200):body.slice(0,2600);
    let price=null;
    for(const s of ['.info-data-price','.price-container','.price-row','[class*="price"]']){
      const e=doc.querySelector(s);if(!e)continue;
      const vals=euroNumbers(clean(e.textContent||''));if(vals.length){price=vals[0];break;}
    }
    if(!price)price=euroNumbers(near)[0]||euroNumbers(body)[0]||null;
    if(!price)return null;
    const sqm=Number(near.match(/(\d{1,3})\s*m²\b/i)?.[1]);
    const rooms=Number(near.match(/(\d{1,2})\s*(?:local[ei]|habitacion(?:es)?|stanze?)\b/i)?.[1]);
    const baths=Number(near.match(/(\d{1,2})\s*bagn[oi]\b/i)?.[1]);
    const floor=clean(near.match(/(?:piano\s+terra|\d+[°º]?\s*piano|piano\s+\w+)/i)?.[0]||'');
    return{id:`idealista-${id}`,externalId:id,title,location:'Bardonecchia',price,sellerType:'Agenzia',source:'Idealista',sourceUrl:url,sqm:sqm>=10&&sqm<=1000?sqm:undefined,rooms:rooms>=1&&rooms<=30?rooms:undefined,bathrooms:baths>=1&&baths<=20?baths:undefined,floor:floor||undefined,status:'ACTIVE'};
  }

  function makeFrame(){const f=document.createElement('iframe');Object.assign(f.style,{position:'fixed',left:'-10000px',top:'0',width:'1280px',height:'900px',opacity:'0',pointerEvents:'none'});document.body.appendChild(f);return f;}
  async function loadInFrame(frame,url){return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error(`timeout: ${url}`)),25000);frame.onload=async()=>{try{await sleep(LOAD_WAIT);const doc=frame.contentDocument,currentUrl=frame.contentWindow?.location?.href||url;if(!doc||!idOf(currentUrl))throw new Error('pagina dettaglio non leggibile');clearTimeout(timer);resolve({doc,url:currentUrl});}catch(e){clearTimeout(timer);reject(e);}};frame.src=url;});}
  function download(listings,steps,startUrl,startedAt){const capturedAt=new Date().toISOString(),normalized=listings.map(x=>({...x,firstSeenAt:startedAt,lastSeenAt:capturedAt,priceHistory:[{price:x.price,capturedAt}]})),payload={provider:'Idealista',mode:'srp-detail-test-v2',search:'Bardonecchia vendita ≤ €260.000, pubblicazione desc',sourcePage:startUrl,capturedAt,count:normalized.length,steps,listings:normalized};const u=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=u;a.download=`homeholiday-idealista-test-${capturedAt.slice(0,10)}.json`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),5000);alert(`HomeHoliday Idealista: test completato (${normalized.length}/${TEST_LIMIT} annunci).`);}

  if(document.readyState!=='complete')await new Promise(r=>addEventListener('load',r,{once:true}));
  const startUrl=location.href;
  if(!/idealista\.it\/vendita-case\//i.test(startUrl)){alert('Apri la pagina risultati Idealista indicata e riesegui lo Snippet.');return;}
  const cards=[...document.querySelectorAll('article.item')];
  const candidates=listingLinks(document,startUrl);
  console.log(`Idealista diagnostics: cards=${cards.length}, listings=${candidates.length}`);
  console.table(candidates.slice(0,10));
  if(!candidates.length){
    console.log('Idealista first card HTML sample:',cards[0]?.outerHTML?.slice(0,4000)||'nessuna card');
    alert('Idealista: nessun annuncio identificato. Copiami la riga diagnostics e, se presente, il sample HTML.');
    return;
  }

  const selected=candidates.slice(0,TEST_LIMIT),listings=[],steps=[],frame=makeFrame(),startedAt=new Date().toISOString();
  try{
    for(let i=0;i<selected.length;i++){
      const candidate=selected[i];
      if(i>0){const pause=randomPause();console.log(`Idealista: attesa casuale ${(pause/1000).toFixed(1)}s prima dell'annuncio ${i+1}/${selected.length}…`);await sleep(pause);}
      console.log(`Idealista: apertura ${i+1}/${selected.length} – ${candidate.id}`);
      try{const loaded=await loadInFrame(frame,candidate.href),item=detail(loaded.doc,loaded.url);if(item){listings.push(item);steps.push({sequence:i+1,id:item.externalId,status:'ok',price:item.price,url:item.sourceUrl});console.log(`Idealista ${i+1}/${selected.length}: ${item.externalId} €${item.price}`);}else{steps.push({sequence:i+1,id:candidate.id,status:'parse-error',url:candidate.href});console.warn(`Idealista: parsing fallito per ${candidate.id}`);}}
      catch(e){steps.push({sequence:i+1,id:candidate.id,status:'load-error',url:candidate.href,error:String(e?.message||e)});console.warn(`Idealista: caricamento fallito per ${candidate.id}`,e);}
    }
  }finally{frame.remove();}
  console.log(`Idealista test completato: ${listings.length}/${selected.length}`);
  download(listings,steps,startUrl,startedAt);
})();