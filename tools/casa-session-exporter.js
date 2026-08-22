/* HomeHoliday – Casa.it detail exporter v9
Open the FIRST Casa.it detail page (1 di N) and run once from DevTools > Sources > Snippets.
Uses one persistent same-origin iframe and actually clicks Casa.it's "Successivo" control, so it also works when Next has no href.
*/
(async()=>{
  const MAX_PRICE=260000, WAIT_AFTER_LOAD=1400, WAIT_AFTER_CLICK=500, MAX_ITEMS=500;
  const clean=(v='')=>String(v).replace(/\s+/g,' ').trim();
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const idOf=url=>String(url).match(/\/immobili\/(\d+)\/?/i)?.[1]||null;

  function euroNumbers(text=''){
    const out=[];
    for(const m of String(text).matchAll(/€\s*([\d.]+(?:,\d{1,2})?)/g)){
      const n=Number(m[1].replace(/\./g,'').replace(',','.'));
      if(Number.isFinite(n)&&n>=10000&&n<=MAX_PRICE) out.push(n);
    }
    return out;
  }
  function position(doc){const m=clean(doc.body?.innerText||'').match(/\b(\d{1,4})\s+di\s+(\d{1,4})\b/i);return m?{index:+m[1],total:+m[2]}:{};}

  function detail(doc,url){
    const id=idOf(url); if(!id)return null;
    const title=clean(doc.querySelector('h1')?.textContent||doc.title||`Immobile Casa.it ${id}`);
    let price=null,node=doc.querySelector('h1');
    for(let i=0;node&&i<6;i++,node=node.parentElement){const nums=euroNumbers(clean(node.textContent||''));if(nums.length){price=nums[0];break;}}
    if(!price)price=euroNumbers(clean(doc.body?.innerText||''))[0]||null;
    if(!price)return null;
    const body=clean(doc.body?.innerText||''),p=body.indexOf(title),near=p>=0?body.slice(p,p+1400):body.slice(0,2000);
    const sqm=Number(near.match(/(\d{1,3})\s*m²\b/i)?.[1]);
    const rooms=Number(near.match(/(\d{1,2})\s*local[ei]\b/i)?.[1]);
    const baths=Number(near.match(/(\d{1,2})\s*bagn[oi]\b/i)?.[1]);
    const floor=clean(near.match(/(?:piano\s+terra|\d+[°º]?\s*piano|piano\s+\w+)/i)?.[0]||'');
    const seller=[...doc.querySelectorAll('a,button,div,span')].map(e=>clean(e.textContent||'')).find(t=>/Agenzia Immobiliare|Inserzionista privato|^Privato$/i.test(t))||'';
    const sellerType=/Inserzionista privato|^Privato$/i.test(seller)?'Privato':'Agenzia';
    const pos=position(doc);
    return{id:`casa-${id}`,externalId:id,title,location:'Bardonecchia',price,sellerType,agencyName:sellerType==='Agenzia'&&seller.length<=120?seller:undefined,source:'Casa.it',sourceUrl:url,sqm:sqm>=10&&sqm<=1000?sqm:undefined,rooms:rooms>=1&&rooms<=30?rooms:undefined,bathrooms:baths>=1&&baths<=20?baths:undefined,floor:floor||undefined,position:pos.index,totalInSearch:pos.total,status:'ACTIVE'};
  }

  function nextControl(doc){
    const els=[...doc.querySelectorAll('a,button,[role="button"]')];
    return els.find(e=>{
      const label=clean(`${e.textContent||''} ${e.getAttribute('aria-label')||''} ${e.getAttribute('title')||''}`);
      const disabled=e.disabled||e.getAttribute('aria-disabled')==='true'||e.hasAttribute('disabled');
      return !disabled&&/^Successivo\b|\bSuccessivo\b/i.test(label);
    })||null;
  }

  function makeFrame(startUrl){
    const f=document.createElement('iframe');
    Object.assign(f.style,{position:'fixed',left:'-10000px',top:'0',width:'1280px',height:'900px',opacity:'0',pointerEvents:'none'});
    f.src=startUrl;document.body.appendChild(f);return f;
  }
  async function waitFrameLoad(f,previousUrl){
    const started=Date.now();
    while(Date.now()-started<20000){
      try{
        const d=f.contentDocument,u=f.contentWindow?.location?.href||'';
        if(d&&d.readyState==='complete'&&idOf(u)&&(!previousUrl||u!==previousUrl)){await sleep(WAIT_AFTER_LOAD);return{doc:d,url:u};}
      }catch{}
      await sleep(200);
    }
    throw new Error('timeout attesa scheda successiva');
  }

  function download(all,steps,startUrl,startedAt){
    const capturedAt=new Date().toISOString();
    const listings=[...all.values()].map(x=>({...x,firstSeenAt:startedAt,lastSeenAt:capturedAt,priceHistory:[{price:x.price,capturedAt}]}));
    const payload={provider:'Casa.it',mode:'detail-sequence-click',search:'Bardonecchia vendita ≤ €260.000',sourcePage:startUrl,capturedAt,steps,count:listings.length,listings};
    const u=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}));
    const a=document.createElement('a');a.href=u;a.download=`homeholiday-casa-${capturedAt.slice(0,10)}.json`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),5000);
    alert(`HomeHoliday Casa.it: ${listings.length} annunci esportati.`);
  }

  if(document.readyState!=='complete')await new Promise(r=>addEventListener('load',r,{once:true}));
  let startUrl=location.href;
  if(!idOf(startUrl)){alert('Apri la prima scheda dettaglio Casa.it (1 di 108) e riesegui lo Snippet.');return;}

  const startedAt=new Date().toISOString(),all=new Map(),steps=[],visited=new Set(),frame=makeFrame(startUrl);
  let current=await waitFrameLoad(frame,null),expected;
  try{
    for(let n=1;n<=MAX_ITEMS;n++){
      const item=detail(current.doc,current.url);if(!item){console.warn('Casa.it: scheda non leggibile',current.url);break;}
      if(visited.has(item.externalId))break;visited.add(item.externalId);all.set(item.externalId,item);
      const pos=position(current.doc);expected=expected||pos.total||item.totalInSearch;
      steps.push({sequence:n,id:item.externalId,position:pos.index,total:pos.total,price:item.price,url:current.url});
      console.log(`Casa.it ${pos.index||n}/${pos.total||expected||'?'}: ${item.externalId} €${item.price}`);
      if(expected&&all.size>=expected)break;
      const next=nextControl(current.doc);if(!next){console.log('Casa.it: nessun controllo Successivo attivo.');break;}
      const oldUrl=current.url;
      next.click();
      await sleep(WAIT_AFTER_CLICK);
      try{current=await waitFrameLoad(frame,oldUrl);}catch(e){console.warn('Casa.it stop:',e.message);break;}
    }
  } finally {frame.remove();}
  console.log(`Casa.it completato: ${all.size}${expected?`/${expected}`:''}`);
  download(all,steps,startUrl,startedAt);
})();