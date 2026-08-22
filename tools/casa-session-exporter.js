/* HomeHoliday – Casa.it detail exporter v10.2
Open the FIRST Casa.it detail page from the filtered search and run once.
Persistent same-origin iframe; resilient retries on Casa.it "Successivo" navigation.
*/
(async()=>{
  const MAX_PRICE=260000,MAX_ITEMS=500,LOAD_WAIT=1200,CLICK_RETRIES=8,RETRY_WAIT=700;
  const clean=(v='')=>String(v).replace(/\s+/g,' ').trim();
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const idOf=url=>String(url).match(/\/immobili\/(\d+)\/?/i)?.[1]||null;

  function euroNumbers(text=''){
    const out=[];
    for(const m of String(text).matchAll(/€\s*([\d.]+(?:,\d{1,2})?)/g)){
      const n=Number(m[1].replace(/\./g,'').replace(',','.'));
      if(Number.isFinite(n)&&n>=10000&&n<=MAX_PRICE)out.push(n);
    }
    return out;
  }

  function position(doc){
    const texts=[clean(doc.body?.innerText||''),...[...doc.querySelectorAll('*')].filter(e=>/\bdi\b/i.test(e.textContent||'')).slice(0,100).map(e=>clean(e.textContent||''))];
    for(const t of texts){
      const m=t.match(/\b(\d{1,4})\s*di\s*(\d{1,4})\b/i);
      if(m)return{index:+m[1],total:+m[2]};
    }
    return{};
  }

  function detail(doc,url){
    const id=idOf(url);if(!id)return null;
    const title=clean(doc.querySelector('h1')?.textContent||doc.title||`Immobile Casa.it ${id}`);
    let price=null,node=doc.querySelector('h1');
    for(let i=0;node&&i<7;i++,node=node.parentElement){
      const ns=euroNumbers(clean(node.textContent||''));
      if(ns.length){price=ns[0];break;}
    }
    if(!price)price=euroNumbers(clean(doc.body?.innerText||''))[0]||null;
    if(!price)return null;
    const body=clean(doc.body?.innerText||''),p=body.indexOf(title),near=p>=0?body.slice(p,p+1600):body.slice(0,2200);
    const sqm=Number(near.match(/(\d{1,3})\s*m²\b/i)?.[1]);
    const rooms=Number(near.match(/(\d{1,2})\s*local[ei]\b/i)?.[1]);
    const baths=Number(near.match(/(\d{1,2})\s*bagn[oi]\b/i)?.[1]);
    const floor=clean(near.match(/(?:piano\s+terra|\d+[°º]?\s*piano|piano\s+\w+)/i)?.[0]||'');
    const seller=[...doc.querySelectorAll('a,button,div,span')].map(e=>clean(e.textContent||'')).find(t=>/Agenzia Immobiliare|Inserzionista privato|^Privato$/i.test(t))||'';
    const sellerType=/Inserzionista privato|^Privato$/i.test(seller)?'Privato':'Agenzia',pos=position(doc);
    return{id:`casa-${id}`,externalId:id,title,location:'Bardonecchia',price,sellerType,agencyName:sellerType==='Agenzia'&&seller&&seller.length<=120?seller:undefined,source:'Casa.it',sourceUrl:url,sqm:sqm>=10&&sqm<=1000?sqm:undefined,rooms:rooms>=1&&rooms<=30?rooms:undefined,bathrooms:baths>=1&&baths<=20?baths:undefined,floor:floor||undefined,position:pos.index,totalInSearch:pos.total,status:'ACTIVE'};
  }

  function nextControls(doc){
    return [...doc.querySelectorAll('a,button,[role="button"],div[tabindex]')].filter(e=>{
      const l=clean(`${e.textContent||''} ${e.getAttribute('aria-label')||''} ${e.getAttribute('title')||''}`);
      const disabled=e.disabled||e.getAttribute('aria-disabled')==='true'||e.hasAttribute('disabled');
      return !disabled&&/\bSuccessivo\b/i.test(l);
    });
  }

  function makeFrame(url){
    const f=document.createElement('iframe');
    Object.assign(f.style,{position:'fixed',left:'-10000px',top:'0',width:'1280px',height:'900px',opacity:'0',pointerEvents:'none'});
    f.src=url;document.body.appendChild(f);return f;
  }

  async function waitReady(f){
    const end=Date.now()+20000;
    while(Date.now()<end){
      try{
        const d=f.contentDocument,u=f.contentWindow?.location?.href||'';
        if(d&&d.readyState==='complete'&&idOf(u)){
          await sleep(LOAD_WAIT);
          return{doc:d,url:u,id:idOf(u)};
        }
      }catch{}
      await sleep(200);
    }
    throw new Error('timeout caricamento scheda');
  }

  async function advance(f,current){
    for(let attempt=1;attempt<=CLICK_RETRIES;attempt++){
      let d;
      try{d=f.contentDocument}catch{}
      if(!d){await sleep(RETRY_WAIT);continue;}
      const controls=nextControls(d);
      console.log(`Casa.it: tentativo Successivo ${attempt}/${CLICK_RETRIES}, controlli=${controls.length}`);
      for(const c of controls){
        try{
          c.scrollIntoView?.({block:'center'});
          c.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,cancelable:true,view:f.contentWindow}));
          c.dispatchEvent(new MouseEvent('mouseup',{bubbles:true,cancelable:true,view:f.contentWindow}));
          c.click?.();
        }catch{}
        const end=Date.now()+7000;
        while(Date.now()<end){
          await sleep(250);
          try{
            const u=f.contentWindow?.location?.href||'',id=idOf(u),doc=f.contentDocument;
            if(id&&id!==current.id&&doc?.readyState==='complete'){
              await sleep(LOAD_WAIT);
              return{doc,url:u,id};
            }
          }catch{}
        }
      }
      await sleep(RETRY_WAIT);
    }
    return null;
  }

  function download(all,steps,startUrl,startedAt,meta){
    const capturedAt=new Date().toISOString();
    const listings=[...all.values()].map(x=>({...x,firstSeenAt:startedAt,lastSeenAt:capturedAt,priceHistory:[{price:x.price,capturedAt}]}));
    const payload={provider:'Casa.it',mode:'detail-sequence-click-v10.2',search:'Bardonecchia vendita ≤ €260.000',sourcePage:startUrl,capturedAt,steps,count:listings.length,meta,listings};
    const u=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}));
    const a=document.createElement('a');a.href=u;a.download=`homeholiday-casa-${capturedAt.slice(0,10)}.json`;document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(u),5000);
    alert(`HomeHoliday Casa.it: ${listings.length} annunci esportati.`);
  }

  if(document.readyState!=='complete')await new Promise(r=>addEventListener('load',r,{once:true}));
  const startUrl=location.href;
  if(!idOf(startUrl)){alert('Apri la prima scheda dettaglio Casa.it e riesegui lo Snippet.');return;}

  const startedAt=new Date().toISOString(),all=new Map(),steps=[],visited=new Set(),frame=makeFrame(startUrl);
  let stopReason='max-items',expected;
  try{
    let current=await waitReady(frame);
    for(let n=1;n<=MAX_ITEMS;n++){
      const item=detail(current.doc,current.url);
      if(!item){stopReason='detail-unreadable';break;}
      if(visited.has(item.externalId)){stopReason='duplicate-loop';break;}
      visited.add(item.externalId);all.set(item.externalId,item);
      const pos=position(current.doc);expected=expected||pos.total||item.totalInSearch;
      steps.push({sequence:n,id:item.externalId,position:pos.index,total:pos.total,price:item.price,url:current.url});
      console.log(`Casa.it ${pos.index||n}/${pos.total||expected||'?'}: ${item.externalId} €${item.price}`);
      if(expected&&all.size>=expected){stopReason='expected-total-reached';break;}
      const next=await advance(frame,current);
      if(!next){stopReason='next-navigation-failed';console.warn(`Casa.it: navigazione bloccata dopo ${n} annunci.`);break;}
      current=next;
    }
  }catch(e){
    stopReason=`error:${e.message}`;
    console.warn('Casa.it stop:',e);
  }finally{
    frame.remove();
  }
  console.log(`Casa.it completato: ${all.size}${expected?`/${expected}`:''}; stop=${stopReason}`);
  download(all,steps,startUrl,startedAt,{expectedTotal:expected,stopReason});
})();