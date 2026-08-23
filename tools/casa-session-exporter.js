/* HomeHoliday – Casa.it exporter v12 SRP blocks
Run once from the Casa.it filtered results page.
Reads listing links from each 20-item SRP page, opens detail pages one by one,
and refreshes the SRP source every 40 details (pages 1-2, then 3-4, then 5-6...).
Uses a conservative random pacing delay of 5–20 seconds between detail openings.
*/
(async()=>{
  const MAX_PRICE=260000;
  const MAX_PAGES=10;
  const SRP_RENDER_WAIT=2600;
  const DETAIL_RENDER_WAIT=1500;
  const PAUSE_MIN_MS=5000;
  const PAUSE_MAX_MS=20000;
  const BLOCK_SIZE=40;

  const clean=(v='')=>String(v).replace(/\s+/g,' ').trim();
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const randomPause=()=>Math.floor(PAUSE_MIN_MS+Math.random()*(PAUSE_MAX_MS-PAUSE_MIN_MS+1));
  const idOf=url=>String(url).match(/\/immobili\/(\d+)\/?/i)?.[1]||null;

  function euroNumbers(text=''){
    const out=[];
    for(const m of String(text).matchAll(/€\s*([\d.]+(?:,\d{1,2})?)/g)){
      const n=Number(m[1].replace(/\./g,'').replace(',','.'));
      if(Number.isFinite(n)&&n>=10000&&n<=MAX_PRICE)out.push(n);
    }
    return out;
  }

  function parseDetail(doc,url){
    const id=idOf(url);if(!id)return null;
    const title=clean(doc.querySelector('h1')?.textContent||doc.title||`Immobile Casa.it ${id}`);
    let price=null,node=doc.querySelector('h1');
    for(let i=0;node&&i<7;i++,node=node.parentElement){
      const ns=euroNumbers(clean(node.textContent||''));
      if(ns.length){price=ns[0];break;}
    }
    if(!price)price=euroNumbers(clean(doc.body?.innerText||''))[0]||null;
    if(!price)return null;

    const body=clean(doc.body?.innerText||''),p=body.indexOf(title),near=p>=0?body.slice(p,p+1800):body.slice(0,2400);
    const sqm=Number(near.match(/(\d{1,3})\s*m²\b/i)?.[1]);
    const rooms=Number(near.match(/(\d{1,2})\s*local[ei]\b/i)?.[1]);
    const baths=Number(near.match(/(\d{1,2})\s*bagn[oi]\b/i)?.[1]);
    const floor=clean(near.match(/(?:piano\s+terra|\d+[°º]?\s*piano|piano\s+\w+)/i)?.[0]||'');
    const seller=[...doc.querySelectorAll('a,button,div,span')].map(e=>clean(e.textContent||'')).find(t=>/Agenzia Immobiliare|Inserzionista privato|^Privato$/i.test(t))||'';
    const sellerType=/Inserzionista privato|^Privato$/i.test(seller)?'Privato':'Agenzia';

    return {
      id:`casa-${id}`,externalId:id,title,location:'Bardonecchia',price,sellerType,
      agencyName:sellerType==='Agenzia'&&seller&&seller.length<=120?seller:undefined,
      source:'Casa.it',sourceUrl:url,
      sqm:sqm>=10&&sqm<=1000?sqm:undefined,
      rooms:rooms>=1&&rooms<=30?rooms:undefined,
      bathrooms:baths>=1&&baths<=20?baths:undefined,
      floor:floor||undefined,status:'ACTIVE'
    };
  }

  function makeFrame(){
    const f=document.createElement('iframe');
    Object.assign(f.style,{position:'fixed',left:'-10000px',top:'0',width:'1365px',height:'950px',opacity:'0',pointerEvents:'none'});
    document.body.appendChild(f);return f;
  }

  async function loadFrame(f,url,waitMs){
    return new Promise((resolve,reject)=>{
      let done=false;
      const timer=setTimeout(()=>{if(!done){done=true;reject(new Error(`timeout: ${url}`));}},25000);
      f.onload=async()=>{
        if(done)return;
        try{
          await sleep(waitMs);
          const doc=f.contentDocument,finalUrl=f.contentWindow?.location?.href||url;
          if(!doc)throw new Error('iframe non accessibile');
          done=true;clearTimeout(timer);resolve({doc,url:finalUrl});
        }catch(e){done=true;clearTimeout(timer);reject(e);}
      };
      f.src=url;
    });
  }

  function collectListingLinks(doc,pageUrl){
    const seen=new Set(),links=[];
    for(const a of doc.querySelectorAll('a[href*="/immobili/"]')){
      let href;try{href=new URL(a.getAttribute('href'),pageUrl).href.split('#')[0];}catch{continue;}
      const id=idOf(href);if(!id||seen.has(id))continue;
      seen.add(id);links.push({id,href});
    }
    return links;
  }

  function totalResults(doc){
    const m=clean(doc.body?.innerText||'').match(/\b(\d{1,4})\s+Case\s+in\s+vendita\s+a\s+Bardonecchia\b/i);
    return m?Number(m[1]):undefined;
  }

  function pageUrl(base,page){
    const u=new URL(base);
    if(page<=1)u.searchParams.delete('page');else u.searchParams.set('page',String(page));
    return u.href;
  }

  function download(all,steps,sourcePage,startedAt,meta){
    const capturedAt=new Date().toISOString();
    const listings=[...all.values()].map(x=>({...x,firstSeenAt:startedAt,lastSeenAt:capturedAt,priceHistory:[{price:x.price,capturedAt}]}));
    const payload={provider:'Casa.it',mode:'srp-blocks-v12',search:'Bardonecchia vendita ≤ €260.000, data più recente',sourcePage,capturedAt,steps,count:listings.length,meta,listings};
    const u=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}));
    const a=document.createElement('a');a.href=u;a.download=`homeholiday-casa-${capturedAt.slice(0,10)}.json`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),5000);
    alert(`HomeHoliday Casa.it: ${listings.length} annunci esportati.`);
  }

  if(document.readyState!=='complete')await new Promise(r=>addEventListener('load',r,{once:true}));
  const startUrl=new URL(location.href);
  if(!/\/srp\//i.test(startUrl.pathname)){
    alert('Apri la pagina risultati Casa.it filtrata e riesegui lo Snippet.');return;
  }
  startUrl.searchParams.set('tr','vendita');
  startUrl.searchParams.set('priceMax','260000');
  startUrl.searchParams.set('sortType','date_desc');
  startUrl.searchParams.set('propertyTypeGroup','case');
  startUrl.searchParams.set('q','008fc8d1');
  startUrl.searchParams.delete('page');
  startUrl.hash='';

  const startedAt=new Date().toISOString(),frame=makeFrame(),all=new Map(),steps=[];
  let expectedTotal,stopReason='pages-exhausted',detailsSinceRefresh=0;

  try{
    for(let page=1;page<=MAX_PAGES;page++){
      if(detailsSinceRefresh>=BLOCK_SIZE){
        console.log(`Casa.it: completati ${detailsSinceRefresh} dettagli nel blocco. Nuovo ingresso dalla SRP pagina ${page}.`);
        detailsSinceRefresh=0;
      }

      const srp=pageUrl(startUrl.href,page);
      console.log(`Casa.it: caricamento pagina risultati ${page}: ${srp}`);
      let r;
      try{r=await loadFrame(frame,srp,SRP_RENDER_WAIT);}catch(e){stopReason=`srp-load-error-p${page}`;console.warn(e);break;}
      expectedTotal=expectedTotal||totalResults(r.doc);
      const pageLinks=collectListingLinks(r.doc,r.url);
      const newLinks=pageLinks.filter(x=>!all.has(x.id));
      console.log(`Casa.it SRP pagina ${page}: ${pageLinks.length} annunci individuati, ${newLinks.length} nuovi.`);
      steps.push({type:'srp',page,found:pageLinks.length,new:newLinks.length,url:r.url});
      if(pageLinks.length===0){stopReason='empty-srp-page';break;}

      for(let i=0;i<newLinks.length;i++){
        const link=newLinks[i];
        const pause=randomPause();
        console.log(`Casa.it: attesa ${(pause/1000).toFixed(1)}s prima del dettaglio ${all.size+1}${expectedTotal?`/${expectedTotal}`:''}…`);
        await sleep(pause);
        let d;
        try{d=await loadFrame(frame,link.href,DETAIL_RENDER_WAIT);}catch(e){console.warn(`Casa.it: dettaglio ${link.id} non caricato`,e);steps.push({type:'detail',id:link.id,status:'load-error',url:link.href});continue;}
        const item=parseDetail(d.doc,d.url);
        if(!item){console.warn(`Casa.it: dettaglio ${link.id} non leggibile`);steps.push({type:'detail',id:link.id,status:'parse-error',url:d.url});continue;}
        all.set(item.externalId,item);detailsSinceRefresh++;
        steps.push({type:'detail',page,indexOnPage:i+1,id:item.externalId,price:item.price,status:'ok',url:item.sourceUrl});
        console.log(`Casa.it: ${all.size}${expectedTotal?`/${expectedTotal}`:''} – ${item.externalId} €${item.price}`);
        if(expectedTotal&&all.size>=expectedTotal){stopReason='expected-total-reached';break;}
      }
      if(stopReason==='expected-total-reached')break;
      if(pageLinks.length<20){stopReason='last-partial-page';break;}
    }
  }catch(e){stopReason=`error:${e.message}`;console.warn('Casa.it stop:',e);}finally{frame.remove();}

  console.log(`Casa.it completato: ${all.size}${expectedTotal?`/${expectedTotal}`:''}; stop=${stopReason}`);
  download(all,steps,startUrl.href,startedAt,{expectedTotal,stopReason,blockSize:BLOCK_SIZE,pauseRangeSeconds:[5,20]});
})();