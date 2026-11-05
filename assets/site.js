
function saveTheme(v){try{localStorage.setItem('sd-theme',v)}catch(e){}window.name=window.name.replace(/(^|;)sd-theme=\w+/,'')+';sd-theme='+v}
document.addEventListener('click',e=>{const a=e.target.closest('a[href]');if(!a)return;const h=a.getAttribute('href');const th=document.documentElement.dataset.theme;if(!th||!/^[\w-]+\.html/.test(h))return;const u=new URL(h,location.href);u.searchParams.set('theme',th);a.href=u.href});
const SLOTS=[['necklace','Necklace'],['bangles','Bangles'],['earrings','Earrings'],['ring','Ring'],['anklet','Anklet'],['bracelet','Bracelet'],['waistband','Waistband']];
const ORN={
OR00001:['necklace','Temple Kundan Necklace',2499,2499],OR00002:['necklace','Emerald Drop Necklace',3499,3149],OR00003:['necklace','Polki Choker Necklace',4999,4999],
OR00004:['bangles','Gold Plated Bangles, set of 2',1299,1299],OR00005:['bangles','Kada Bangles Pair',1799,1799],OR00006:['bangles','Pearl Studded Bangles',2199,1869],
OR00007:['earrings','Jhumka Earrings',899,899],OR00008:['earrings','Chandbali Earrings',1099,934],OR00009:['earrings','Kundan Stud Earrings',799,799],
OR00010:['ring','Adjustable Kundan Ring',599,599],OR00011:['ring','Floral Gold Ring',699,699],OR00012:['ring','Pearl Cluster Ring',849,849],
OR00013:['anklet','Silver Payal Pair',1199,1199],OR00014:['anklet','Temple Anklet Pair',1499,1499],OR00015:['anklet','Beaded Anklet Pair',799,799],
OR00016:['bracelet','Gold Chain Bracelet',899,899],OR00017:['bracelet','Pearl Bracelet',999,999],OR00018:['bracelet','Charm Bracelet',1099,989],
OR00019:['waistband','Kamarbandh Waist Chain',1599,1599],OR00020:['waistband','Temple Waist Belt',1899,1899],OR00021:['waistband','Oxidised Waistband',1299,1299]};
const OPTS={};SLOTS.forEach(([k])=>OPTS[k]=Object.keys(ORN).filter(id=>ORN[id][0]===k));
const SAREES=[
{id:'SA00001',name:'Banarasi Silk Saree',tone:'Royal Maroon',fabric:'Banarasi Silk',mrp:8999,eff:8099,disc:10,blouse:'Unstitched blouse piece',stock:17,worlds:['bridal','festive'],base:'#7b1e2c',trim:'#d4af5a',weave:'zari',combo:{necklace:'OR00001',bangles:'OR00004',earrings:'OR00009'}},
{id:'SA00002',name:'Kanjivaram Silk Saree',tone:'Emerald Green',fabric:'Kanjivaram Silk',mrp:12999,eff:12999,disc:0,blouse:'Unstitched blouse piece',stock:10,worlds:['bridal','festive'],base:'#0f5a45',trim:'#d9b45a',weave:'temple',combo:{necklace:'OR00003',bangles:'OR00005',earrings:'OR00008'}},
{id:'SA00003',name:'Chiffon Printed Saree',tone:'Peach',fabric:'Chiffon',mrp:2499,eff:2124,disc:15,blouse:'Stitched blouse',stock:30,worlds:['parties'],base:'#efb399',trim:'#fff1e6',weave:'floral',combo:{bangles:'OR00004',earrings:'OR00007'}},
{id:'SA00004',name:'Organza Saree',tone:'Royal Blue',fabric:'Organza',mrp:4499,eff:4499,disc:0,blouse:'Saree only',stock:18,worlds:['festive','parties'],base:'#1f3f8e',trim:'#c9d3f2',weave:'sequin',combo:{necklace:'OR00002',earrings:'OR00008'}},
{id:'SA00005',name:'Cotton Handloom Saree',tone:'Mustard',fabric:'Cotton Handloom',mrp:1899,eff:1899,disc:0,blouse:'Stitched blouse',stock:40,worlds:['everyday'],base:'#cf9a22',trim:'#7a5412',weave:'thin',combo:{}},
{id:'SA00006',name:'Georgette Party Saree',tone:'Wine',fabric:'Georgette',mrp:3599,eff:2879,disc:20,blouse:'Stitched blouse',stock:16,worlds:['celebrations','parties'],base:'#6c1536',trim:'#e0c27a',weave:'sequin',combo:{necklace:'OR00003',bangles:'OR00006',earrings:'OR00009'}},
{id:'SA00007',name:'Kasavu Cotton Saree',tone:'Ivory & Gold',fabric:'Kasavu Cotton',mrp:2999,eff:2999,disc:0,blouse:'Saree only',stock:25,worlds:['festive'],base:'#f2e9d0',trim:'#c79a2e',weave:'kasavu',combo:{necklace:'OR00001',bangles:'OR00004',earrings:'OR00007',anklet:'OR00014'}},
{id:'SA00008',name:'Tussar Silk Saree',tone:'Rust',fabric:'Tussar Silk',mrp:3999,eff:3999,disc:0,blouse:'Unstitched blouse piece',stock:14,worlds:['parties','everyday'],base:'#a24a2a',trim:'#e3b277',weave:'thin',combo:{bangles:'OR00004',earrings:'OR00009'}}];
const WORLDS=[
{k:'bridal',name:'The Bridal House',line:'Muhurtham to reception. Kanjivaram and Banarasi silk with a full set of gold.',tone:'#6e1b2b',trim:'#d4af5a'},
{k:'festive',name:'Festive Kerala',line:'Kasavu and silk for Onam, Vishu, Thiruvathira and temple days.',tone:'#f2e9d0',trim:'#c79a2e'},
{k:'celebrations',name:'Celebrations',line:'Deepavali, Christmas, Perunnal. Evening colour and stone borders.',tone:'#6c1536',trim:'#e0c27a'},
{k:'parties',name:'Occasions & parties',line:'Receptions and guest wear, ready to drape in a lighter fabric.',tone:'#efb399',trim:'#fff1e6'},
{k:'everyday',name:'Everyday & office',line:'Handloom cotton and easy silk for long working days.',tone:'#cf9a22',trim:'#7a5412'}];
const BRIDAL_FULL={necklace:'OR00003',bangles:'OR00005',earrings:'OR00008',ring:'OR00011',anklet:'OR00014',bracelet:'OR00016',waistband:'OR00020'};
const $=s=>document.querySelector(s), inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
const saree=id=>SAREES.find(s=>s.id===id);
const PAGES={bridal:'bridal.html',festive:'festive.html',celebrations:'celebrations.html',parties:'occasions.html',everyday:'everyday.html'};
const WSID={bridal:'SA00002',festive:'SA00007',celebrations:'SA00006',parties:'SA00003',everyday:'SA00005'};
const reduce=matchMedia('(prefers-reduced-motion:reduce)').matches;
let bag=[];try{bag=JSON.parse(localStorage.getItem('sd-bag')||'[]')}catch(e){}
function saveBag(){try{localStorage.setItem('sd-bag',JSON.stringify(bag))}catch(e){}}
const photo=(id,alt,cls)=>`<img class="${cls||''}" src="img/${id}.jpg" alt="${alt}" width="1600" height="2000" loading="lazy">`;
const HAS_DETAIL=['SA00001','SA00002'];
function toast(msg){const t=$('#toast');t.textContent=msg;t.hidden=false;clearTimeout(toast.h);toast.h=setTimeout(()=>t.hidden=true,2600)}

const TYPE={};SLOTS.forEach(([k,l])=>TYPE[k]=l);
function ornCard(id){const o=ORN[id];
  return `<article class="card"><div class="art wide"><img src="img/orn/${id}-s.jpg" alt="${o[1]}" width="640" height="360" loading="lazy"></div>
  <div><h3>${o[1]}</h3><div class="meta">${TYPE[o[0]]}</div></div>
  <div class="price"><b>${inr(o[3])}</b>${o[2]>o[3]?`<s>${inr(o[2])}</s><i>${Math.round((1-o[3]/o[2])*100)}% off</i>`:''}</div>
  <div class="actions"><button class="btn small" data-orn="${id}">Add to bag</button></div></article>`}
function renderEdits(key){
  const w=k=>WORLDS.find(x=>x.k===k);
  let h=Object.keys(PAGES).filter(k=>k!==key).map(k=>`<a class="edit" href="${PAGES[k]}"><img src="img/edit-${k}.jpg" alt="${w(k).name}" loading="lazy"><span><b>${w(k).name}</b><small>${w(k).line}</small></span></a>`).join('');
  if(key!=='ornaments')h+=`<a class="edit" href="ornaments.html"><img src="img/edit-ornaments.jpg" alt="Ornaments" loading="lazy"><span><b>Ornaments</b><small>Necklaces, bangles, earrings and more, priced piece by piece.</small></span></a>`;
  $('#edits').innerHTML=h;
}
let ornFilter='all';
function renderOrnaments(){
  const ids=Object.keys(ORN).filter(id=>ornFilter==='all'||ORN[id][0]===ornFilter);
  $('#chips').innerHTML=[['all','All ornaments'],...SLOTS].map(([k,l])=>`<button class="chip" data-filter="${k}" aria-pressed="${ornFilter===k}">${l}</button>`).join('');
  $('#count').textContent=ids.length+(ids.length===1?' piece':' pieces');
  $('#grid').innerHTML=ids.map(ornCard).join('');
}

function card(s){
  return `<article class="card"><div class="art">${photo(s.id,`${s.name}, ${s.tone}, worn by a model`)}${HAS_DETAIL.includes(s.id)?photo(s.id+'-detail',`Weave detail of the ${s.name}`,'alt'):''}${s.disc?`<span class="flag">${s.disc}% off</span>`:s.stock<=14?`<span class="flag">${s.stock} left</span>`:''}</div>
  <div><h3>${s.name}</h3><div class="meta">${s.tone} · ${s.blouse}</div></div>
  <div class="price"><b>${inr(s.eff)}</b>${s.disc?`<s>${inr(s.mrp)}</s>`:''}</div>
  <div class="actions"><a class="btn small ghost" href="index.html?style=${s.id}#builder">Style this saree</a><button class="btn small" data-quick="${s.id}">Add saree to bag</button></div></article>`;
}
function lookTotals(s,sel){
  const ids=Object.values(sel),sum=ids.reduce((a,id)=>a+ORN[id][3],0),save=ids.length>=2?Math.round(sum*.10):0;
  return {ids,sum,save,total:s.eff+sum-save};
}
function renderPage(P){
  const list=P.sarees.map(saree),more=P.more.map(saree);
  $('#count').textContent=list.length+(list.length===1?' saree':' sarees');
  $('#grid').innerHTML=list.map(card).join('');
  $('#more').innerHTML=more.map(card).join('');
  const s=saree(P.lead),t=lookTotals(s,P.set);
  $('#lookArt').innerHTML=photo(s.id,`${s.name}, ${s.tone}, worn by a model`);
  $('#lookName').textContent=s.name+', '+s.tone;
  $('#lookList').innerHTML=`<li><span>${s.name}<small>Saree</small></span><span>${inr(s.eff)}</span></li>`+SLOTS.filter(([k])=>P.set[k]).map(([k,l])=>{const o=ORN[P.set[k]];return `<li><span class="lt"><img src="img/orn/${P.set[k]}-s.jpg" alt="" loading="lazy"><span>${o[1]}<small>${l}</small></span></span><span>${inr(o[3])}</span></li>`}).join('');
  $('#lookTotal').innerHTML=(t.save?`<div class="row save"><span>Look saving, 10% on ornaments</span><span>−${inr(t.save)}</span></div>`:'')+`<div class="row total"><span>Total</span><span>${inr(t.total)}</span></div>`;
  $('#lookAdd').dataset.look='1';
  $('#lookEdit').href=`index.html?style=${s.id}#builder`;
  renderEdits(P.key);
  $('#picks').innerHTML=SLOTS.filter(([k])=>P.set[k]).map(([k])=>ornCard(P.set[k])).join('');
  const pr=list.map(x=>x.eff);
  $('#facts').innerHTML=`<div><dt>In this edit</dt><dd>${list.length} ${list.length===1?'saree':'sarees'}</dd></div><div><dt>Prices from</dt><dd>${inr(Math.min(...pr))}</dd></div><div><dt>Fabrics</dt><dd>${[...new Set(list.map(x=>x.fabric))].join(', ')}</dd></div><div><dt>Styled set</dt><dd>${t.ids.length} pieces</dd></div>`;
}
function renderBag(){
  const n=bag.length;
  $('#bagCount').textContent=n;$('#bagCount').hidden=!n;
  $('#bagSub').textContent=n?n+(n===1?' look':' looks'):'';
  if(!n){$('#bagItems').innerHTML='<div class="empty">Your bag is empty. Build a look and add it here.</div>';$('#bagFoot').innerHTML='';return}
  $('#bagItems').innerHTML=bag.map((b,i)=>{if(b.kind==='orn'){const o=ORN[b.oid];return `<div class="bi"><div><img src="img/orn/${b.oid}-s.jpg" alt="${o[1]}"></div><div><div class="t">${o[1]}</div><div class="d">${TYPE[o[0]]}</div><div class="f"><span>${inr(b.total)}</span><button data-remove="${i}">Remove</button></div></div></div>`}const s=saree(b.sid);return `<div class="bi"><div><img src="img/${s.id}.jpg" alt="${s.name}"></div><div><div class="t">${s.name}, ${s.tone}</div><div class="d">${b.names.length?b.names.join(' · '):'Saree only'}</div><div class="f"><span>${inr(b.total)}</span><button data-remove="${i}">Remove</button></div></div></div>`}).join('');
  $('#bagFoot').innerHTML=`<div class="row total"><span>Subtotal</span><span>${inr(bag.reduce((a,b)=>a+b.total,0))}</span></div><button class="btn" style="width:100%;justify-content:center;margin-top:12px" data-checkout>Continue to checkout</button>`;
}
function openBag(o){$('#bag').hidden=!o;$('#scrim').hidden=!o;if(o)$('#bagClose').focus()}
document.addEventListener('click',e=>{
  const t=e.target.closest('button');if(!t)return;
  if(t.dataset.orn){const o=ORN[t.dataset.orn];bag.push({kind:'orn',oid:t.dataset.orn,names:[o[1]],total:o[3]});saveBag();renderBag();toast('Added to your bag');return}
  if(t.dataset.filter){ornFilter=t.dataset.filter;renderOrnaments();return}
  if(t.dataset.quick){const s=saree(t.dataset.quick);bag.push({sid:s.id,names:[],total:s.eff});saveBag();renderBag();toast('Saree added to your bag');return}
  if(t.dataset.look){const s=saree(PAGE.lead),x=lookTotals(s,PAGE.set);bag.push({sid:s.id,names:x.ids.map(id=>ORN[id][1]),total:x.total});saveBag();renderBag();toast('Look added to your bag');return}
  if(t.dataset.remove){bag.splice(+t.dataset.remove,1);saveBag();renderBag();return}
  if('checkout' in t.dataset){toast('Checkout is the next build phase');return}
  if(t.id==='searchBtn'||t.id==='acctBtn'){toast(t.id==='searchBtn'?'Search arrives with the shop pages':'Accounts arrive with checkout');return}
  if(t.id==='menuBtn'){const h=t.closest('header'),o=h.classList.toggle('open');t.setAttribute('aria-expanded',o);t.setAttribute('aria-label',o?'Close menu':'Open menu');return}
  if(t.id==='bagBtn'){openBag(true);return}
  if(t.id==='bagClose'){openBag(false);return}
  if(t.id==='themeBtn'){const r=document.documentElement,dark=r.dataset.theme?r.dataset.theme==='dark':matchMedia('(prefers-color-scheme:dark)').matches;r.dataset.theme=dark?'light':'dark';saveTheme(r.dataset.theme)}
});
$('#scrim').addEventListener('click',()=>openBag(false));
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('#bag').hidden)openBag(false)});
const CFG=window.PAGE_CFG;
const PAGE=CFG.type==='ornaments'?{key:'ornaments'}:{key:CFG.key,sarees:CFG.sarees,more:CFG.more,lead:CFG.lead,set:CFG.set==='bridal'?BRIDAL_FULL:CFG.set==='combo'?{...saree(CFG.lead).combo}:CFG.set};
if(CFG.type==='ornaments'){renderEdits('ornaments');renderOrnaments()}else renderPage(PAGE);renderBag();
