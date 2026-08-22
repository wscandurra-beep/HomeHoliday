/* HomeHoliday – Casa.it detail exporter v8
Recommended: open the FIRST Casa.it detail page from the filtered Bardonecchia search, then run this snippet once.
It follows the detail-page "Successivo" sequence (1 di N -> 2 di N -> ...) automatically in a hidden same-origin iframe.
*/
(async()=>{
  const MAX_PRICE=260000, WAIT_MS=1800, MAX_ITEMS=500;
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

  function parsePosition(doc){
    const text=clean(doc.body?.innerText||'');
    const m=text.match(/\b(\d{1,4})\s+di\s+(\d{1,4})\b/i);
    return m?{index:Number(m[1]),total:Number(m[2])}:{};
  }

  function parseDetail(doc,pageUrl){
    const id=idOf(pageUrl); if(!id) return null;
    const title=clean(doc.querySelector('h1')?.textContent||doc.title||`Immobile Casa.it ${id}`);

    // Prefer the detail header around H1: on Casa.it the main sale price precedes installment/optional extras.
    let header=doc.querySelector('h1');
    for(let i=0;header&&i<5;i++,header=header.parentElement){
      const nums=euroNumbers(clean(header.textContent||''));
      if(nums.length){
        var price=nums[0];
        break;
      }
    }
    if(!price){
      const nums=euroNumbers(clean(doc.body?.innerText||''));
      price=nums[0]||null;
    }
    if(!price) return null;

    const body=clean(doc.body?.innerText||'');
    const nearTitle=(()=>{
      const p=body.indexOf(title);
      return p>=0?body.slice(p,p+1200):body.slice(0,1800);
    })();
    const sqm=Number(nearTitle.match(/(\d{1,3})\s*m²\b/i)?.[1]);
    const rooms=Number(nearTitle.match(/(\d{1,2})\s*local[ei]\b/i)?.[1]);
    const baths=Number(nearTitle.match(/(\d{1,2})\s*bagn[oi]\b/i)?.[1]);
    const floor=clean(nearTitle.match(/(?:piano\s+terra|\d+[°º]?\s*piano|piano\s+\w+)/i)?.[0]||'');

    const sellerText=clean([...doc.querySelectorAll('a,button,div,span')].map(e=>e.textContent||'').find(t=>/Agenzia Immobiliare|Inserzionista privato|Privato/i.test(t))||'');
    const sellerType=/Inserzionista privato|^Privato$/i.test(sellerText)?'Privato':'Agenzia';
    const agencyName=sellerType==='Agenzia'&&sellerText.length<=120?sellerText:undefined;
    const position=parsePosition(doc);

    return {id:`casa-${id}`,externalId:id,title,location:'Bardonecchia',price,sellerType,agencyName,source:'Casa.it',sourceUrl:pageUrl,
      sqm:sqm>=10&&sqm<=1000?sqm:undefined,rooms:rooms>=1&&rooms<=30?rooms:undefined,bathrooms:baths>=1&&baths<=20?baths:undefined,floor:floor||undefined,
      position:position.index,totalInSearch:position.total,status:'ACTIVE'};
  }

  function nextHref(doc,pageUrl){
    const candidates=[...doc.querySelectorAll('a[href]')];
    for(const a of candidates){
      const label=clean(`${a.textContent||''} ${a.getAttribute('aria-label')||''} ${a.getAttribute('title')||''}`);
      if(/\bSuccessivo\b/i.test(label)){
        try{return new URL(a.getAttribute('href'),pageUrl).href;}catch{}
      }
    }
    return null;
  }

  async function load(url){
    return new Promise((resolve,reject)=>{
      const f=document.createElement('iframe');
      Object.assign(f.style,{position:'fixed',left:'-10000px',top:'0',width:'1200px',height:'800px',opacity:'0',pointerEvents:'none'});
      let done=false;
      const timer=setTimeout(()=>{if(!done){done=true;f.remove();reject(new Error('timeout'))}},20000);
      f.onload=async()=>{
        if(done)return;
        try{
          await sleep(WAIT_MS);
          const doc=f.contentDocument,finalUrl=f.contentWindow?.location?.href||url;
          if(!doc)throw new Error('iframe non accessibile');
          const item=parseDetail(doc,finalUrl),next=nextHref(doc,finalUrl),pos=parsePosition(doc);
          done=true;clearTimeout(timer);f.remove();resolve({item,next,pos,finalUrl});
        }catch(e){done=true;clearTimeout(timer);f.remove();reject(e)}
      };
      f.onerror=()=>{if(!done){done=true;clearTimeout(timer);f.remove();reject(new Error('iframe load error'))}};
      f.src=url;document.body.appendChild(f);
    });
  }

  function download(all,steps,sourcePage,startedAt){
    const capturedAt=new Date().toISOString();
    const listings=[...all.values()].map(x=>({...x,firstSeenAt:startedAt,lastSeenAt:capturedAt,priceHistory:[{price:x.price,capturedAt}]}));
    const payload={provider:'Casa.it',mode:'detail-sequence',search:'Bardonecchia vendita ≤ €260.000',sourcePage,capturedAt,steps,count:listings.length,listings};
    const u=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}));
    const a=document.createElement('a');a.href=u;a.download=`homeholiday-casa-${capturedAt.slice(0,10)}.json`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),5000);
    alert(`HomeHoliday Casa.it: ${listings.length} annunci esportati.`);
  }

  if(document.readyState!=='complete') await new Promise(r=>addEventListener('load',r,{once:true}));
  await sleep(1000);

  let startUrl=location.href;
  if(!idOf(startUrl)){
    const first=[...document.querySelectorAll('a[href*="/immobili/"]')].map(a=>a.href).find(Boolean);
    if(!first){alert('Apri la prima scheda dettaglio Casa.it e riesegui lo Snippet.');return;}
    startUrl=first;
  }

  const startedAt=new Date().toISOString(),all=new Map(),steps=[],visited=new Set();
  let current=startUrl,expected;
  for(let n=1;n<=MAX_ITEMS&&current;n++){
    if(visited.has(current))break;visited.add(current);
    console.log(`Casa.it dettaglio ${n}: ${current}`);
    let r;
    try{r=await load(current)}catch(e){console.warn('Casa.it stop:',e);break;}
    if(!r.item){console.warn('Casa.it: impossibile leggere la scheda',r.finalUrl);break;}
    all.set(r.item.externalId,r.item);
    expected=expected||r.pos.total||r.item.totalInSearch;
    steps.push({sequence:n,id:r.item.externalId,position:r.pos.index,total:r.pos.total,price:r.item.price,url:r.finalUrl});
    console.log(`Casa.it ${r.pos.index||n}/${r.pos.total||expected||'?'}: ${r.item.externalId} €${r.item.price}`);
    if(expected&&all.size>=expected)break;
    if(!r.next)break;
    current=r.next;
    await sleep(350);
  }
  console.log(`Casa.it completato: ${all.size}${expected?`/${expected}`:''}`);
  download(all,steps,startUrl,startedAt);
})();