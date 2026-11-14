/* Sakhi, the Sopanam Drapes stylist.
   Works in two layers: an on-device styling engine (always on, instant) and the AI stylist at /api/chat
   for open questions. If the AI is unreachable, the engine answers on its own. */
(function(){
'use strict';
const $=s=>document.querySelector(s), inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const qs=new URLSearchParams(location.search), EMBED=qs.get('embed')==='1', FROM=qs.get('from')||'', ROOM=qs.get('room')==='1';
let stage='';
const roomUrl=L=>'styling-room.html?style='+L.s.id+'&sel='+Object.values(L.sel).filter(Boolean).join(',');
function toStage(L){try{parent.postMessage({type:'sd-look',sid:L.s.id,sel:L.sel},location.origin)}catch(e){}}
const reduce=matchMedia('(prefers-reduced-motion:reduce)').matches;
// On GitHub Pages (saffronlabs.in) there is no server, so the AI route is called on Vercel.
const API=/vercel\.app$|^localhost/.test(location.hostname)?'/api/chat':'https://sopanam-drapes.vercel.app/api/chat';

/* ---------- catalogue ---------- */
const SLOTS=[['necklace','Necklace'],['bangles','Bangles'],['earrings','Earrings'],['ring','Ring'],['anklet','Anklet'],['bracelet','Bracelet'],['waistband','Waistband']];
const SLOT_LABEL=Object.fromEntries(SLOTS);
const ORN={
OR00001:['necklace','Temple Kundan Necklace',2499],OR00002:['necklace','Emerald Drop Necklace',3149],OR00003:['necklace','Polki Choker Necklace',4999],
OR00004:['bangles','Gold Plated Bangles, set of 2',1299],OR00005:['bangles','Kada Bangles Pair',1799],OR00006:['bangles','Pearl Studded Bangles',1869],
OR00007:['earrings','Jhumka Earrings',899],OR00008:['earrings','Chandbali Earrings',934],OR00009:['earrings','Kundan Stud Earrings',799],
OR00010:['ring','Adjustable Kundan Ring',599],OR00011:['ring','Floral Gold Ring',699],OR00012:['ring','Pearl Cluster Ring',849],
OR00013:['anklet','Silver Payal Pair',1199],OR00014:['anklet','Temple Anklet Pair',1499],OR00015:['anklet','Beaded Anklet Pair',799],
OR00016:['bracelet','Gold Chain Bracelet',899],OR00017:['bracelet','Pearl Bracelet',999],OR00018:['bracelet','Charm Bracelet',989],
OR00019:['waistband','Kamarbandh Waist Chain',1599],OR00020:['waistband','Temple Waist Belt',1899],OR00021:['waistband','Oxidised Waistband',1299]};
const SLOT_OPTS={};SLOTS.forEach(([k])=>SLOT_OPTS[k]=Object.keys(ORN).filter(id=>ORN[id][0]===k));
const SAREES=[
{id:'SA00001',name:'Banarasi Silk Saree',tone:'Royal Maroon',col:'maroon',hex:'#7b1e2c',fabric:'Banarasi silk',feel:'heavy',border:'wide',mrp:8999,eff:8099,blouse:'Unstitched blouse piece',stock:17,combo:{necklace:'OR00001',bangles:'OR00004',earrings:'OR00009'}},
{id:'SA00002',name:'Kanjivaram Silk Saree',tone:'Emerald Green',col:'emerald',hex:'#0f5a45',fabric:'Kanjivaram silk',feel:'heavy',border:'wide',mrp:12999,eff:12999,blouse:'Unstitched blouse piece',stock:10,combo:{necklace:'OR00003',bangles:'OR00005',earrings:'OR00008'}},
{id:'SA00003',name:'Chiffon Printed Saree',tone:'Peach',col:'peach',hex:'#efb399',fabric:'Chiffon',feel:'fluid',border:'slim',mrp:2499,eff:2124,blouse:'Stitched blouse',stock:30,combo:{bangles:'OR00004',earrings:'OR00007'}},
{id:'SA00004',name:'Organza Saree',tone:'Royal Blue',col:'blue',hex:'#1f3f8e',fabric:'Organza',feel:'crisp',border:'slim',mrp:4499,eff:4499,blouse:'Saree only, pair any blouse',stock:18,combo:{necklace:'OR00002',earrings:'OR00008'}},
{id:'SA00005',name:'Cotton Handloom Saree',tone:'Mustard',col:'mustard',hex:'#cf9a22',fabric:'Handloom cotton',feel:'crisp',border:'slim',mrp:1899,eff:1899,blouse:'Stitched blouse',stock:40,combo:{}},
{id:'SA00006',name:'Georgette Party Saree',tone:'Wine',col:'wine',hex:'#6c1536',fabric:'Georgette',feel:'fluid',border:'slim',mrp:3599,eff:2879,blouse:'Stitched blouse',stock:16,combo:{necklace:'OR00003',bangles:'OR00006',earrings:'OR00009'}},
{id:'SA00007',name:'Kasavu Cotton Saree',tone:'Ivory & Gold',col:'ivory',hex:'#f2e9d0',fabric:'Kasavu cotton',feel:'crisp',border:'wide',mrp:2999,eff:2999,blouse:'Saree only, pair any blouse',stock:25,combo:{necklace:'OR00001',bangles:'OR00004',earrings:'OR00007',anklet:'OR00014'}},
{id:'SA00008',name:'Tussar Silk Saree',tone:'Rust',col:'rust',hex:'#a24a2a',fabric:'Tussar silk',feel:'medium',border:'slim',mrp:3999,eff:3999,blouse:'Unstitched blouse piece',stock:14,combo:{bangles:'OR00004',earrings:'OR00009'}}];
const S=id=>SAREES.find(s=>s.id===id);

/* ---------- styling knowledge ---------- */
const TONES=[
 {k:'fair',label:'Fair',hex:'#f2d7c3'},{k:'light',label:'Light',hex:'#e6bf9c'},{k:'wheatish',label:'Wheatish',hex:'#d2a073'},
 {k:'medium',label:'Medium',hex:'#b5804f'},{k:'dusky',label:'Dusky',hex:'#8a5735'},{k:'deep',label:'Deep',hex:'#5a3722'}];
const TONE=k=>TONES.find(t=>t.k===k);
// colour against skin tone, 0..1, plus undertone nudge
const COLOR_FIT={
 maroon:{fair:.95,light:.95,wheatish:.95,medium:.92,dusky:.9,deep:.86,warm:.03,cool:.03},
 emerald:{fair:.86,light:.9,wheatish:.98,medium:.96,dusky:.96,deep:.92,warm:0,cool:.05},
 peach:{fair:.95,light:.95,wheatish:.86,medium:.76,dusky:.66,deep:.64,warm:.05,cool:-.06},
 blue:{fair:.9,light:.86,wheatish:.86,medium:.86,dusky:.93,deep:.96,warm:-.02,cool:.06},
 mustard:{fair:.6,light:.7,wheatish:.86,medium:.92,dusky:.96,deep:.95,warm:.06,cool:-.07},
 wine:{fair:.93,light:.93,wheatish:.95,medium:.94,dusky:.92,deep:.9,warm:0,cool:.04},
 ivory:{fair:.72,light:.78,wheatish:.88,medium:.92,dusky:.98,deep:.98,warm:.03,cool:0},
 rust:{fair:.64,light:.74,wheatish:.9,medium:.93,dusky:.92,deep:.88,warm:.07,cool:-.07}};
const COLOR_WHY={
 maroon:t=>({fair:'Deep maroon gives fair skin warmth and depth without overpowering it.',light:'Maroon adds warmth and makes a light complexion glow.',wheatish:'Maroon and gold is the classic pairing for wheatish skin: rich, never washed out.',medium:'Maroon deepens beautifully against a medium tone.',dusky:'Maroon reads rich and regal on dusky skin, and the gold zari lifts it.',deep:'The gold zari border catches light against deep skin.'}[t]),
 emerald:t=>({fair:'Emerald is a jewel tone that makes fair skin look luminous.',light:'Emerald brightens a light complexion and reads instantly festive.',wheatish:'Emerald is one of the most flattering shades on wheatish skin.',medium:'Emerald makes a medium tone look warm and lit from within.',dusky:'Emerald and gold against dusky skin is a stunning, high-contrast combination.',deep:'Emerald holds its richness against deep skin, and the gold border glows.'}[t]),
 peach:t=>({fair:'Soft peach warms fair skin and keeps the look fresh.',light:'Peach sits close to a light skin tone and gives a soft glow.',wheatish:'Peach keeps wheatish skin looking fresh for daytime.',medium:'Peach is soft on a medium tone; a bold lip keeps it lively.',dusky:'Peach works best in daylight on dusky skin; add gold to lift it.',deep:'Peach on deep skin is a gentle contrast; pair it with gold-tone jewellery.'}[t]),
 blue:t=>({fair:'Royal blue is crisp and striking on fair skin.',light:'Royal blue gives a light complexion clarity and contrast.',wheatish:'Royal blue reads bright and confident on wheatish skin.',medium:'Royal blue suits a medium tone and photographs well in the evening.',dusky:'Royal blue is one of the best shades on dusky skin: vivid and elegant.',deep:'Royal blue against deep skin is rich and luminous.'}[t]),
 mustard:t=>({fair:'Mustard is bolder on fair skin; keep the jewellery gold to tie it together.',light:'Mustard gives a light complexion a sunny warmth.',wheatish:'Mustard brings out the golden warmth in wheatish skin.',medium:'Mustard is a natural match for a medium tone.',dusky:'Mustard glows against dusky skin, one of its best pairings.',deep:'Mustard is vivid and joyful against deep skin.'}[t]),
 wine:t=>({fair:'Wine is a deep, grown-up colour that suits fair skin for evenings.',light:'Wine adds depth and drama to a light complexion.',wheatish:'Wine is almost universally flattering, and especially rich on wheatish skin.',medium:'Wine deepens beautifully on a medium tone under evening light.',dusky:'Wine on dusky skin looks rich and elegant.',deep:'Wine gives deep skin a soft, glowing finish.'}[t]),
 ivory:t=>({fair:'Ivory and gold is gentle on fair skin; a bold border and bindi keep it from looking pale.',light:'The gold kasavu border warms a light complexion.',wheatish:'Ivory and gold kasavu makes wheatish skin look warm and radiant.',medium:'Ivory and gold is a lovely contrast for a medium tone.',dusky:'Ivory and gold against dusky skin is the most striking kasavu look there is.',deep:'Ivory with a gold border is a beautiful high contrast on deep skin.'}[t]),
 rust:t=>({fair:'Rust is earthy on fair skin; it suits warm undertones most.',light:'Rust warms a light complexion for a relaxed festive look.',wheatish:'Rust brings out the warmth in wheatish skin.',medium:'Rust is a natural, earthy match for a medium tone.',dusky:'Rust looks rich and grounded on dusky skin.',deep:'Rust has a quiet richness against deep skin.'}[t])};
const OCC=[
 {k:'bride',label:'My wedding',note:'Muhurtham, reception'},
 {k:'wedding-guest',label:'A wedding I am attending',note:'Guest or family'},
 {k:'onam-vishu',label:'Onam, Vishu, Thiruvathira',note:'Kerala festivals'},
 {k:'festival',label:'Deepavali, Christmas, Perunnal',note:'Festive evenings'},
 {k:'party',label:'Party or reception',note:'Evening, dressy'},
 {k:'temple',label:'Temple or pooja',note:'Traditional, modest'},
 {k:'office',label:'Office or work event',note:'Comfortable, smart'},
 {k:'everyday',label:'Everyday',note:'Easy to wear'}];
const OCC_LABEL=Object.fromEntries(OCC.map(o=>[o.k,o.label]));
const OCC_FIT={
 bride:{SA00002:1,SA00001:.96,SA00007:.6,SA00006:.4,SA00004:.35,SA00008:.3,SA00003:.15,SA00005:.05},
 'wedding-guest':{SA00001:.92,SA00006:.88,SA00004:.86,SA00002:.82,SA00008:.74,SA00003:.68,SA00007:.62,SA00005:.2},
 'onam-vishu':{SA00007:1,SA00004:.72,SA00002:.64,SA00008:.58,SA00005:.52,SA00001:.48,SA00006:.3,SA00003:.3},
 festival:{SA00006:1,SA00004:.9,SA00001:.84,SA00002:.76,SA00008:.7,SA00003:.6,SA00007:.55,SA00005:.3},
 party:{SA00006:.96,SA00004:.92,SA00003:.9,SA00008:.7,SA00001:.6,SA00002:.5,SA00007:.3,SA00005:.25},
 temple:{SA00007:1,SA00005:.72,SA00008:.66,SA00002:.62,SA00001:.55,SA00004:.4,SA00003:.35,SA00006:.2},
 office:{SA00005:1,SA00008:.86,SA00003:.62,SA00007:.55,SA00004:.3,SA00006:.2,SA00001:.12,SA00002:.1},
 everyday:{SA00005:.96,SA00008:.82,SA00003:.82,SA00007:.62,SA00004:.4,SA00006:.35,SA00001:.15,SA00002:.1}};
const BUILDS=[{k:'petite',label:'Petite'},{k:'slim',label:'Slim'},{k:'average',label:'Average'},{k:'athletic',label:'Athletic'},{k:'curvy',label:'Curvy'},{k:'plus',label:'Plus size'}];
const JEWEL=[
 {k:'temple',label:'Temple and antique gold',note:'Traditional Kerala'},
 {k:'kundan-polki',label:'Kundan and polki',note:'Stone-set, festive'},
 {k:'pearl',label:'Pearl',note:'Soft and elegant'},
 {k:'oxidised',label:'Oxidised silver',note:'Earthy, modern'},
 {k:'minimal',label:'Minimal',note:'Just studs and a bangle'},
 {k:'statement',label:'Statement',note:'Go bold'}];
const JEWEL_LABEL=Object.fromEntries(JEWEL.map(j=>[j.k,j.label]));
const STYLE_SET={
 temple:{necklace:'OR00001',bangles:'OR00005',earrings:'OR00007',ring:'OR00011',anklet:'OR00014',bracelet:'OR00016',waistband:'OR00020'},
 'kundan-polki':{necklace:'OR00003',bangles:'OR00004',earrings:'OR00008',ring:'OR00010',anklet:'OR00014',bracelet:'OR00016',waistband:'OR00019'},
 pearl:{necklace:'OR00002',bangles:'OR00006',earrings:'OR00009',ring:'OR00012',anklet:'OR00015',bracelet:'OR00017',waistband:'OR00019'},
 oxidised:{bangles:'OR00005',earrings:'OR00007',ring:'OR00011',anklet:'OR00013',bracelet:'OR00018',waistband:'OR00021'},
 minimal:{bangles:'OR00004',earrings:'OR00009',ring:'OR00010',bracelet:'OR00016'},
 statement:{necklace:'OR00003',bangles:'OR00006',earrings:'OR00008',ring:'OR00010',anklet:'OR00014',bracelet:'OR00018',waistband:'OR00020'}};
const OCC_SLOTS={
 bride:['necklace','bangles','earrings','ring','anklet','bracelet','waistband'],
 'wedding-guest':['necklace','earrings','bangles','ring'],
 'onam-vishu':['necklace','earrings','bangles','anklet'],
 festival:['necklace','earrings','bangles','ring'],
 party:['earrings','bangles','ring'],
 temple:['necklace','earrings','bangles','anklet'],
 office:['earrings','bracelet'],
 everyday:['earrings','bangles']};
const BUDGETS=[{k:3000,label:'Under ₹3,000'},{k:6000,label:'Under ₹6,000'},{k:10000,label:'Under ₹10,000'},{k:20000,label:'Under ₹20,000'},{k:0,label:'No limit'}];

/* ---------- state ---------- */
const store={get(k,d){try{const v=localStorage.getItem(k);return v?JSON.parse(v):d}catch(e){return d}},set(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}};
let profile=store.get('sd-sakhi-profile',{});
let saved=store.get('sd-sakhi-saved',[]);
let bag=store.get('sd-bag',[]);
let history=[]; // {role, content, image?}
let shown=[];   // saree ids shown so far
let looks={};   // card key -> look object (for swaps)
let quiz=null;  // active guided flow
let aiOK=null;  // null unknown, true/false after first call
const saveProfile=()=>{store.set('sd-sakhi-profile',profile);renderProfile()};

/* ---------- engine ---------- */
function bodyFit(s,p){
  let v=.8,why=null;
  const h=p.heightCm||0,b=p.build;
  if(h&&h<155){
    if(s.feel==='fluid'){v+=.12;why='Light, fluid '+s.fabric.toLowerCase()+' drapes close and adds length to a petite frame.'}
    else if(s.feel==='heavy'){v-=.06;why='A heavy silk on a petite frame looks best with slim pleats, a pleated pallu and a small heel.'}
    else if(s.border==='slim'){v+=.06;why='The slim border keeps the line long on a petite frame.'}
  }else if(h>=168){
    if(s.border==='wide'||s.feel==='heavy'){v+=.1;why='Your height carries a wide border and a full, open pallu beautifully.'}
    else why='At your height you can wear the pallu open and long.';
  }
  if(b==='curvy'||b==='plus'){
    if(s.feel==='fluid'){v+=.1;why='Fluid '+s.fabric.toLowerCase()+' follows your shape softly instead of adding volume.'}
    else if(s.feel==='crisp'){v-=.1;why=why||'Crisp '+s.fabric.toLowerCase()+' holds volume, so keep the pleats narrow and the pallu pinned.'}
  }else if(b==='slim'||b==='petite'&&!h){
    if(s.feel==='crisp'||s.feel==='heavy'){v+=.08;why=why||s.fabric+' adds body and structure to a slim frame.'}
  }
  return {v:Math.max(0,Math.min(1,v)),why};
}
function colorFit(s,p){
  if(!p.skinTone)return {v:.85,why:null};
  const t=COLOR_FIT[s.col];let v=t[p.skinTone]||.85;
  if(p.undertone==='warm')v+=t.warm;if(p.undertone==='cool')v+=t.cool;
  return {v:Math.max(0,Math.min(1,v)),why:COLOR_WHY[s.col](p.skinTone)};
}
function pickOrnaments(s,p,overrideSlots){
  const occ=p.occasion||'festival';
  const slots=overrideSlots||OCC_SLOTS[occ]||OCC_SLOTS.festival;
  let style=p.jewellery;
  if(!style){
    if(occ==='bride')style=s.id==='SA00002'?'kundan-polki':'temple';
    else if(occ==='onam-vishu'||occ==='temple')style='temple';
    else if(occ==='office'||occ==='everyday')style='minimal';
    else if(p.undertone==='cool')style='pearl';
  }
  const set=style?STYLE_SET[style]:{};
  const out={};
  const useSlots=style==='minimal'&&occ!=='bride'?slots.filter(k=>k!=='necklace'&&k!=='waistband'):slots;
  useSlots.forEach(k=>{
    let id=set[k]||s.combo[k]||null;
    if(!id){id={necklace:'OR00001',bangles:'OR00004',earrings:'OR00009',ring:'OR00010',anklet:'OR00015',bracelet:'OR00016',waistband:'OR00019'}[k]}
    if(k==='necklace'&&style!=='pearl'&&(s.col==='emerald'||s.col==='blue')&&!p.jewellery&&occ!=='bride')id=s.combo.necklace||id;
    out[k]=id;
  });
  if(style==='oxidised'&&useSlots.includes('necklace')&&!set.necklace)delete out.necklace;
  return {sel:out,style};
}
function totals(s,sel){
  const ids=Object.values(sel),sum=ids.reduce((a,id)=>a+ORN[id][2],0),save=ids.length>=2?Math.round(sum*.10):0;
  return {ids,sum,save,total:s.eff+sum-save,mrpSave:s.mrp-s.eff};
}
function fitBudget(s,sel,budget){
  if(!budget)return {sel,trimmed:[]};
  const order=['waistband','bracelet','anklet','ring','necklace','bangles','earrings'];
  const out={...sel},trimmed=[];
  for(const k of order){if(totals(s,out).total<=budget)break;if(out[k]){trimmed.push(SLOT_LABEL[k].toLowerCase());delete out[k]}}
  // try a cheaper option per slot before giving up
  if(totals(s,out).total>budget){Object.keys(out).forEach(k=>{const cheap=SLOT_OPTS[k].slice().sort((a,b)=>ORN[a][2]-ORN[b][2])[0];out[k]=cheap})}
  return {sel:out,trimmed};
}
function drapeTips(s,p){
  const h=p.heightCm||0,b=p.build,occ=p.occasion;const t=[];
  if(occ==='onam-vishu'||occ==='temple'&&s.col==='ivory')t.push('Drape it Kerala style with neat front pleats and the kasavu pallu over the left shoulder.');
  else if(h&&h<155)t.push('Nivi drape with narrow pleats and the pallu pleated and pinned, so the line stays long.');
  else if(h>=168)t.push('Nivi drape with an open, free-flowing pallu to show off the border.');
  else if(b==='curvy'||b==='plus')t.push('Nivi drape with the pallu pleated and pinned at the shoulder, pleats tucked slightly to the left.');
  else if(occ==='party'&&s.feel==='fluid')t.push('Try a butterfly drape: slim pleated pallu, waist on show, very evening.');
  else t.push('Classic Nivi drape, pleats crisp, pallu open to mid-arm.');
  const blouse=s.blouse.startsWith('Saree only')?'Pair it with ':s.blouse.startsWith('Unstitched')?'Have the blouse piece stitched as ':'The stitched blouse works; for a sharper fit consider ';
  if(b==='curvy'||b==='plus')t.push(blouse+'a V or sweetheart neckline with elbow-length sleeves.');
  else if(occ==='bride')t.push(blouse+'a high back with elbow sleeves and latkans, in a contrast colour.');
  else if(occ==='office')t.push(blouse+'a boat neck with three-quarter sleeves, clean and comfortable.');
  else if(h&&h<155)t.push(blouse+'a short-sleeve or sleeveless cut with a deep back to add length.');
  else t.push(blouse+'a classic round neck with elbow sleeves'+(s.col==='ivory'?' in a deep green or maroon for contrast.':'.'));
  const fin={bride:'Jasmine in a low bun, kohl, a red bindi. Block heels if the muhurtham is long.','wedding-guest':'A low bun or soft waves, a small bindi, and heels you can stand in for hours.','onam-vishu':'Jasmine in your hair and a small round bindi. Flats for the sadya.',festival:'Soft waves, a bold lip, and a little shimmer on the lids.',party:'A sleek bun and a bold lip; let the earrings do the talking.',temple:'Hair braided with jasmine, a sandal-paste kuri. Slip-on flats.',office:'A neat low bun and minimal makeup. Comfortable flats or low block heels.',everyday:'Easy open hair or a quick bun; kolhapuris or flats.'}[occ];
  if(fin)t.push(fin);
  return t;
}
function recommend(p,opts){
  opts=opts||{};
  const exclude=opts.exclude||[];
  const ranked=SAREES.filter(s=>!exclude.includes(s.id)&&s.stock>0).map(s=>{
    const o=p.occasion?(OCC_FIT[p.occasion][s.id]||.3):.7,c=colorFit(s,p),b=bodyFit(s,p);
    let score=.48*o+.34*c.v+.18*b.v;
    if(p.budget&&s.eff>p.budget)score-=.6;
    if(opts.prefer&&opts.prefer.includes(s.id))score+=.3;
    return {s,score,o,c,b};
  }).sort((a,b)=>b.score-a.score);
  return ranked.slice(0,opts.n||3).map((r,i)=>buildLook(r,p,i));
}
function buildLook(r,p,i,forcedSel){
  const s=r.s;let {sel,style}=pickOrnaments(s,p);
  if(forcedSel)sel=forcedSel;
  const fb=fitBudget(s,sel,p.budget);sel=fb.sel;
  const why=[];
  if(r.c.why)why.push(r.c.why);
  if(p.occasion){const o=OCC_FIT[p.occasion][s.id]||0;why.push(o>=.9?occWhy(s,p.occasion):o>=.7?'Right for '+OCC_LABEL[p.occasion].toLowerCase()+': dressy without trying too hard.':'A lighter take on '+OCC_LABEL[p.occasion].toLowerCase()+'.')}
  if(r.b.why)why.push(r.b.why);
  if(why.length<2)why.push(s.fabric+', '+s.tone.toLowerCase()+'. '+(s.feel==='heavy'?'A saree you will keep for years.':'Easy to carry through a long day.'));
  const match=Math.round(Math.min(98,62+r.score*36));
  const notes=[];
  if(fb.trimmed.length)notes.push('Kept to your budget by leaving out the '+fb.trimmed.join(', ')+'.');
  if(p.budget&&s.eff>p.budget)notes.push('This saree alone is above your budget, shown because it suits you so well.');
  return {s,sel,style,why:why.slice(0,3),tips:drapeTips(s,p),match,notes,rank:i};
}
function occWhy(s,occ){return {
 bride:s.id==='SA00002'?'A Kanjivaram is the South Indian bridal saree: heavy silk, temple pallu, made to be the centre of the room.':'Banarasi silk with real zari is a timeless bridal choice, perfect for the reception.',
 'wedding-guest':'Rich enough for a wedding, while leaving the spotlight to the bride.',
 'onam-vishu':s.col==='ivory'?'Kasavu is the Onam saree. Nothing else feels as right at the sadya.':'A festive alternative to kasavu that still feels at home in Kerala.',
 festival:'Built for festive evenings: it catches lamp light and moves well.',
 party:'Light enough to dance in, with a border that sparkles at night.',
 temple:'Traditional and modest, comfortable for a long darshan queue.',
 office:'Breathable and smart. You can wear it from a 9 am meeting to the evening.',
 everyday:'Easy to drape and easy to care for.'}[occ]}

/* ---------- local language understanding ---------- */
function parse(text){
  const t=text.toLowerCase(),up={};
  let m;
  if((m=t.match(/(\d)\s*(?:'|’|ft|feet|foot)\s*(\d{1,2})?/)))up.heightCm=Math.round(+m[1]*30.48+(+(m[2]||0))*2.54);
  else if((m=t.match(/(1[3-9]\d)\s*cm/)))up.heightCm=+m[1];
  if(/\b(fair)\b/.test(t))up.skinTone='fair';
  else if(/\bwheat/.test(t))up.skinTone='wheatish';
  else if(/\b(dusky|duskey|brown skin|tan(ned)?)\b/.test(t))up.skinTone='dusky';
  else if(/\b(deep|dark) (skin|complexion|tone)|\bdark[- ]skinned\b/.test(t))up.skinTone='deep';
  else if(/\b(medium|olive) (skin|complexion|tone)/.test(t))up.skinTone='medium';
  else if(/\blight (skin|complexion|tone)|\blight[- ]skinned\b/.test(t))up.skinTone='light';
  if(/\bwarm (undertone|skin)|undertone.{0,10}warm/.test(t))up.undertone='warm';
  else if(/\bcool (undertone|skin)|undertone.{0,10}cool/.test(t))up.undertone='cool';
  if(/\b(my wedding|my marriage|i am the bride|i'm the bride|bridal|bride|muhurtham|getting married)\b/.test(t))up.occasion='bride';
  else if(/\b(wedding|marriage|reception|engagement|nischayam)\b/.test(t))up.occasion='wedding-guest';
  else if(/\b(onam|vishu|thiruvathira|kasavu|chingam)\b/.test(t))up.occasion='onam-vishu';
  else if(/\b(deepavali|diwali|christmas|perunnal|eid|ramadan|easter|festival|pooram)\b/.test(t))up.occasion='festival';
  else if(/\b(party|cocktail|evening|birthday|anniversary|dinner)\b/.test(t))up.occasion='party';
  else if(/\b(temple|pooja|puja|guruvayur|church)\b/.test(t))up.occasion='temple';
  else if(/\b(office|work|meeting|interview|college|teacher)\b/.test(t))up.occasion='office';
  else if(/\b(daily|everyday|casual)\b/.test(t))up.occasion='everyday';
  if((m=t.match(/(?:under|below|within|budget(?: is| of)?|less than|upto|up to|max|around)\s*(?:rs\.?|₹|inr)?\s*([\d,]+(?:\.\d+)?)\s*(k|thousand)?/))){let n=parseFloat(m[1].replace(/,/g,''));if(m[2])n*=1000;if(n>=500)up.budget=Math.round(n)}
  else if((m=t.match(/₹\s*([\d,]+)/))){const n=+m[1].replace(/,/g,'');if(n>=500)up.budget=n}
  if(/\bpetite\b/.test(t))up.build='petite';else if(/\b(plus[- ]size|plus)\b/.test(t))up.build='plus';else if(/\bcurvy\b/.test(t))up.build='curvy';else if(/\b(slim|thin|lean)\b/.test(t))up.build='slim';else if(/\bathletic\b/.test(t))up.build='athletic';
  if(/\btemple (jewel|necklace|set)|antique gold/.test(t))up.jewellery='temple';else if(/\b(kundan|polki)\b/.test(t))up.jewellery='kundan-polki';else if(/\bpearl/.test(t))up.jewellery='pearl';else if(/\boxidi[sz]ed|silver jewel/.test(t))up.jewellery='oxidised';else if(/\b(minimal|light jewel|simple jewel|less jewel)/.test(t))up.jewellery='minimal';else if(/\b(statement|heavy jewel|bold jewel)/.test(t))up.jewellery='statement';
  return up;
}
const FAQ=[
 [/return|exchange|refund/,'You can request a return within **7 days of delivery**, right from My Orders. The saree and ornaments should be unused, with tags and the original packaging. We arrange the pickup, and once it is inspected the refund goes back to your original payment method.'],
 [/\bcod\b|cash on delivery|pay(ment)?|upi|card/,'You can pay online by card, UPI or netbanking, or choose **Cash on Delivery**. COD has an order limit that is shown at checkout.'],
 [/cancel/,'Orders can be cancelled free of charge while they are Placed, Confirmed or Packed, from My Orders. Online payments are refunded by our team.'],
 [/deliver|ship|courier|how long|when will/,'We deliver **across India**. Delivery charges and timelines are confirmed at checkout. For an urgent date, write to care@sopanamdrapes.com before ordering and the team will tell you what is possible.'],
 [/real gold|gold plated|authentic|is it gold|diamond/,'Our ornaments are **fashion jewellery**: gold-tone, gold-plated and oxidised pieces, made to be styled with the saree. They are not real gold or diamonds, which keeps a full look affordable.'],
 [/wash|care|dry clean|clean|store/,'**Silks** (Kanjivaram, Banarasi, Tussar): dry clean only, store wrapped in muslin, refold every few months so the zari does not crack. **Cotton and kasavu**: gentle hand wash in cold water the first few times, dry in shade, starch lightly for a crisp drape. **Chiffon, georgette, organza**: dry clean or a very gentle cold hand wash. Keep ornaments away from perfume and water and store them in the pouch.'],
 [/blouse|stitch|tailor/,'Each saree says what comes with it: a **stitched blouse** (Chiffon, Cotton Handloom, Georgette), an **unstitched blouse piece** for your tailor (Banarasi, Kanjivaram, Tussar), or **saree only** (Organza, Kasavu). Tell me your build and occasion and I will suggest a blouse cut.'],
 [/how (do|to) (i )?drape|draping|wear a saree/,'For a classic **Nivi drape**: tuck the plain end in at the navel and go round once. Make 5 to 7 pleats of about 5 inches, tuck them in slightly left of centre. Take the rest round once more and bring the pallu over the left shoulder, then pleat and pin it or leave it open. For kasavu, keep the pleats neat and let the gold border fall straight.'],
 [/kanjivaram|banarasi|difference|which fabric|tussar|organza|georgette|chiffon/,'Quick guide: **Kanjivaram** is heavy, structured South Indian silk with temple borders, the bridal saree. **Banarasi** is softer silk with intricate zari, rich and drapey. **Tussar** is a lighter, textured silk for everyday festive wear. **Organza** is crisp and sheer, holds its shape. **Georgette** and **chiffon** are light and fluid, easy to wear for hours.'],
 [/contact|human|call|whatsapp|talk to/,'Our customer care team can help at **care@sopanamdrapes.com**. If you like, share your look from any card and send it to them or to family on WhatsApp.'],
 [/size|length|fit/,'Our sarees are free size. The blouse is where fit matters: stitched blouses come in standard sizes, and unstitched pieces can be tailored to your measurements. Exact saree lengths will be listed on each product page.']];
function localFaq(t){t=t.toLowerCase();for(const [re,a] of FAQ)if(re.test(t))return a;return null}

/* ---------- rendering ---------- */
const log=$('#log');
function md(s){return esc(s).replace(/\*\*(.+?)\*\*/g,'<b>$1</b>').split(/\n{2,}/).map(p=>'<p>'+p.replace(/\n/g,'<br>')+'</p>').join('')}
function scrollDown(){requestAnimationFrame(()=>{log.scrollTop=log.scrollHeight})}
function say(text,opts){opts=opts||{};const d=document.createElement('div');d.className='m bot';d.innerHTML=md(text)+(opts.src?`<span class="src">${esc(opts.src)}</span>`:'');log.appendChild(d);scrollDown();if(!opts.noHistory)history.push({role:'assistant',content:text});return d}
function me(text,img){const d=document.createElement('div');d.className='m me';d.innerHTML=md(text)+(img?`<img src="${img}" alt="Photo you shared">`:'');log.appendChild(d);scrollDown();return d}
function typing(){const d=document.createElement('div');d.className='m bot';d.innerHTML='<span class="typing" aria-label="Sakhi is typing"><i></i><i></i><i></i></span>';log.appendChild(d);scrollDown();return d}
const wait=ms=>new Promise(r=>setTimeout(r,reduce?0:ms));
function chips(list){$('#chips').innerHTML=(list||[]).slice(0,4).map(c=>`<button class="chip" data-chip="${esc(c)}">${esc(c)}</button>`).join('')}

function lookCard(L,key){
  const s=L.s,t=totals(s,L.sel);
  looks[key]=L;
  const pieces=SLOTS.filter(([k])=>L.sel[k]).map(([k,l])=>{const id=L.sel[k],o=ORN[id];
    return `<button class="lk-pc" data-swap="${key}|${k}" title="${esc(o[1])} · ${inr(o[2])}. Tap to try another ${l.toLowerCase()}" aria-label="${esc(o[1])}, ${l}, ${inr(o[2])}. Tap to swap"><img src="img/orn/${id}-s.jpg" alt="" loading="lazy"></button>`}).join('');
  const isSaved=saved.some(x=>x.key===sig(L));
  const saving=t.save+t.mrpSave;
  return `<article class="lk" data-key="${key}">
   <div class="lk-ph"><img src="img/${s.id}.jpg" alt="${esc(s.name+', '+s.tone)}" loading="lazy">${L.rank===0?'<span class="lk-badge">Best match</span>':''}</div>
   <div class="lk-head">
    <div class="lk-meta"><span class="lk-score">${L.match}% match</span>${s.stock<=14?`<span class="lk-low">Only ${s.stock} left</span>`:''}</div>
    <h4>${esc(s.name)}</h4>
    <p class="lk-tone">${esc(s.tone)} · ${esc(s.fabric)}</p>
    <p class="lk-why">${esc(L.why[0]||'')}</p>
    <div class="lk-views" role="group" aria-label="More photos of this saree">${[['','Full view'],...[['close','Close-up'],['back','Back'],['pallu','Pallu'],['detail','The weave']]].map(([k,l],i)=>`<button data-lkview="${key}|${k}" aria-pressed="${i===0}" title="${l}" aria-label="${l}"><img src="img/${s.id}${k?'-'+k:''}.jpg" alt="" loading="lazy"></button>`).join('')}</div>
   </div>
   <div class="lk-rest">
    ${pieces?`<div class="lk-orn"><span>Styled with</span><div class="lk-pcs">${pieces}</div></div>`:''}
    <div class="lk-price"><b>${inr(t.total)}</b><span>full look${t.ids.length?' · '+(t.ids.length+1)+' pieces':''}</span>${saving?`<em>Save ${inr(saving)}</em>`:''}</div>
    <div class="lk-acts">
     ${ROOM?`<button class="btn lk-add" data-stage="${key}">See it on the stage</button>`:`<a class="btn lk-add" href="${roomUrl(L)}" target="${EMBED?'_top':'_self'}">Open in the Styling Room</a>`}
     <button class="lk-ic" data-addlook="${key}" aria-label="Add look to bag" title="Add look to bag"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5.5 8.5h13l-1 11h-11z"/><path d="M9 8.5V7a3 3 0 016 0v1.5"/></svg></button>
     <button class="lk-ic" data-save="${key}" aria-pressed="${isSaved}" aria-label="${isSaved?'Saved':'Save look'}" title="Save look"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7.5-4.4-7.5-10A4.3 4.3 0 0112 7.4 4.3 4.3 0 0119.5 10c0 5.6-7.5 10-7.5 10z"/></svg></button>
     <button class="lk-ic" data-share="${key}" aria-label="Share on WhatsApp" title="Share on WhatsApp"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="18" cy="5.5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="18.5" r="2.5"/><path d="M8.2 10.8l7.6-4.1M8.2 13.2l7.6 4.1"/></svg></button>
    </div>
    <details class="lk-more"><summary>Why it suits you &amp; how to wear it</summary>
     <div class="lk-more-in">
      <h5>Why it suits you</h5><ul>${L.why.map(w=>`<li>${esc(w)}</li>`).join('')}</ul>
      <h5>How to wear it</h5><ul>${L.tips.map(w=>`<li>${esc(w)}</li>`).join('')}</ul>
      <h5>Price</h5><ul><li>Saree ${inr(s.eff)}${s.mrp>s.eff?' (was '+inr(s.mrp)+')':''} · ${esc(s.blouse)}</li>${t.ids.map(id=>`<li>${esc(ORN[id][1])} ${inr(ORN[id][2])}</li>`).join('')}${t.save?'<li>10% off ornaments when bought as a look</li>':''}${L.notes.map(n=>`<li>${esc(n)}</li>`).join('')}</ul>
     </div>
    </details>
   </div></article>`;
}
let lookSeq=0;
function showLooks(list,intro){
  if(intro)say(intro);
  const wrap=document.createElement('div');wrap.className='looks';
  wrap.innerHTML=list.map(L=>lookCard(L,'L'+(++lookSeq))).join('');
  log.appendChild(wrap);
  if(ROOM&&list[0])toStage(list[0]);
  list.forEach(L=>{if(!shown.includes(L.s.id))shown.push(L.s.id)});
  history.push({role:'assistant',content:'[Showed looks: '+list.map(L=>L.s.name+' '+L.s.tone+' with '+Object.values(L.sel).map(id=>ORN[id][1]).join(', ')+' = '+inr(totals(L.s,L.sel).total)).join(' | ')+']'});
  scrollDown();
}
const sig=L=>L.s.id+':'+Object.values(L.sel).sort().join(',');

/* ---------- guided flow ---------- */
const STEPS=['occasion','skinTone','heightCm','budget'];
const ALL_STEPS=['occasion','skinTone','undertone','heightCm','build','jewellery','budget'];
function startQuiz(fromStep){
  quiz={steps:fromStep?[fromStep]:STEPS,i:0,single:!!fromStep};
  nextStep();
}
function curStep(){return log.querySelector('.step.live')}
function nextStep(force){
  if(!quiz)return;
  while(!force&&quiz.i<quiz.steps.length&&!quiz.single&&profile[quiz.steps[quiz.i]]!==undefined)quiz.i++;
  if(quiz.i>=quiz.steps.length){quiz=null;return styleNow()}
  renderStep(quiz.steps[quiz.i]);
}
function stepShell(title,note,body,skip){
  const old=curStep();if(old)old.remove();
  const n=quiz?quiz.steps.length:1,i=quiz?quiz.i:0,single=!quiz||quiz.single;
  const d=document.createElement('div');d.className='step live';
  d.innerHTML=`<div class="step-top">${single?'<span class="step-count">Update your details</span>':`<button class="step-back" data-back="1" ${i===0?'disabled':''} aria-label="Previous question"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 6l-6 6 6 6"/></svg></button><span class="step-count">${i+1} of ${n}</span><span class="step-bar" aria-hidden="true"><i style="width:${Math.round((i+1)/n*100)}%"></i></span>`}${skip||single?`<button class="step-skip" data-skip="1">${single?'Cancel':'Skip'}</button>`:''}</div>
  <h3>${title}</h3>${note?`<p class="q-note">${note}</p>`:''}${body}`;
  log.appendChild(d);scrollDown();return d;
}
function renderStep(k){
  chips([]);
  if(k==='occasion')stepShell('What are you dressing for?','',`<div class="opts g2">${OCC.map(o=>`<button class="opt" data-ans="occasion|${o.k}">${o.label}<small>${o.note}</small></button>`).join('')}</div>`);
  if(k==='skinTone')stepShell('Which is closest to your skin tone?','So I pick shades that make yours glow.',`<div class="tones">${TONES.map(t=>`<button class="tone" data-ans="skinTone|${t.k}"><span style="background:${t.hex}"></span>${t.label}</button>`).join('')}</div><button class="step-alt" data-photo="skin"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="6" width="17" height="13" rx="2.5"/><circle cx="12" cy="12.5" r="3.4"/></svg>Not sure? Read it from a selfie</button>`,true);
  if(k==='undertone')stepShell('Gold or silver: which looks better on you?','',`<div class="opts g3"><button class="opt" data-ans="undertone|warm">Gold<small>Warm</small></button><button class="opt" data-ans="undertone|cool">Silver<small>Cool</small></button><button class="opt" data-ans="undertone|neutral">Both<small>Neutral</small></button></div>`,true);
  if(k==='heightCm'){const v=profile.heightCm||160;const d=stepShell('How tall are you?','It decides the border width and how to wear the pallu.',`<div class="height"><output>${fmtH(v)}</output><input type="range" min="140" max="190" step="1" value="${v}" aria-label="Height in centimetres"><div class="scale"><span>4′7″</span><span>5′3″</span><span>6′3″</span></div></div><button class="btn step-go" data-hset="x">Continue</button>`,true);
    const r=d.querySelector('input[type=range]');r.addEventListener('input',()=>{d.querySelector('output').textContent=fmtH(+r.value)});d._range=r;}
  if(k==='build')stepShell('How would you describe your build?','',`<div class="opts g3">${BUILDS.map(b=>`<button class="opt" data-ans="build|${b.k}">${b.label}</button>`).join('')}</div>`,true);
  if(k==='jewellery')stepShell('What jewellery do you love?','',`<div class="opts g2">${JEWEL.map(j=>`<button class="opt" data-ans="jewellery|${j.k}">${j.label}<small>${j.note}</small></button>`).join('')}<button class="opt" data-ans="jewellery|">Surprise me<small>Sakhi decides</small></button></div>`);
  if(k==='budget')stepShell('Budget for the full look?','Saree and ornaments together.',`<div class="opts g2">${BUDGETS.map(b=>`<button class="opt" data-ans="budget|${b.k}">${b.label}</button>`).join('')}</div>`);
}
const fmtH=cm=>{const inch=Math.round(cm/2.54),f=Math.floor(inch/12),i=inch%12;return `${f}′${i}″ · ${cm} cm`};
function labelFor(k,v){
  if(k==='occasion')return OCC_LABEL[v];
  if(k==='skinTone')return TONE(v)?TONE(v).label:v;
  if(k==='undertone')return {warm:'Gold, warm undertone',cool:'Silver, cool undertone',neutral:'Both, neutral'}[v];
  if(k==='heightCm')return fmtH(v);
  if(k==='build')return (BUILDS.find(b=>b.k===v)||{}).label;
  if(k==='jewellery')return v?JEWEL_LABEL[v]:'Surprise me';
  if(k==='budget')return v?'Under '+inr(v):'No limit';
  return v;
}
function answer(k,v,el){
  const step=el&&el.closest('.step');if(step)step.remove();
  if(v===null){if(!(quiz&&quiz.single)){profile[k]=null;me('Skip')}}else{profile[k]=v;me(labelFor(k,v))}
  saveProfile();
  if(quiz&&quiz.single){quiz=null;if(v===null){chips(defaultChips());return}return styleNow('Updated. Here is your restyled edit.')}
  if(quiz){quiz.i++;setTimeout(nextStep,reduce?0:200)}
}
async function styleNow(intro){
  chips([]);
  const t=typing();await wait(700);t.remove();
  const p={...profile};
  const list=recommend(p);
  const tone=p.skinTone?TONE(p.skinTone).label.toLowerCase()+' skin':'';
  const bits=[p.occasion?OCC_LABEL[p.occasion].toLowerCase():null,tone,p.heightCm?fmtH(p.heightCm).split(' · ')[0]:null,p.budget?'under '+inr(p.budget):null].filter(Boolean);
  showLooks(list,intro||(`Here are your looks${bits.length?' for '+bits.join(', '):''}. Tap an ornament to swap it.`));
  chips(['Show me other options','Make it cheaper','Lighter jewellery','How do I drape it?']);
}

/* ---------- AI ---------- */
async function askAI(text,image){
  const payload={messages:history.slice(-14),profile,page:FROM,shown,stage,context:describeHere()};
  const ctl=new AbortController();const to=setTimeout(()=>ctl.abort(),20000);
  try{
    const r=await fetch(API,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:ctl.signal});
    clearTimeout(to);
    if(!r.ok)throw new Error('status '+r.status);
    const d=await r.json();if(!d||!d.reply)throw new Error('empty');
    aiOK=true;return d;
  }catch(e){clearTimeout(to);aiOK=false;return null}
}
function applyProfile(up){
  if(!up)return false;let changed=false;
  const ok={occasion:OCC_LABEL,skinTone:Object.fromEntries(TONES.map(t=>[t.k,1])),undertone:{warm:1,cool:1,neutral:1},build:Object.fromEntries(BUILDS.map(b=>[b.k,1])),jewellery:JEWEL_LABEL};
  for(const k in up){const v=up[k];if(v===''||v===null||v===undefined||v===0)continue;
    if(k==='heightCm'||k==='budget'){const n=+v;if(n>0&&profile[k]!==n){profile[k]=n;changed=true}continue}
    if(ok[k]&&ok[k][v]&&profile[k]!==v){profile[k]=v;changed=true}}
  if(changed)saveProfile();return changed;
}

/* ---------- main send ---------- */
async function send(text,image){
  text=text.trim();if(!text&&!image)return;
  hideHello();
  quiz=null;chips([]);
  me(text||'Here is a look I like.',image);
  history.push({role:'user',content:text||'Find the closest look to this photo in your collection and explain.',image:image||undefined});
  const ab=image?null:aboutHere(text||'');
  if(ab&&ab.cmd){const t0=typing();await wait(350);t0.remove();say(ab.text);chips(ab.chips||ctxQs());return}
  const local=parse(text||'');
  const changed=applyProfile(local);
  const t=typing();
  const ai=await askAI(text,image);
  t.remove();
  if(ai){
    applyProfile(ai.profile);
    if(ai.stage&&ROOM&&typeof ai.stage==='object'){const a={};const g=ai.stage;if(VIEW_LABEL[g.view])a.view=g.view;if(g.saree&&S(g.saree))a.saree=g.saree;if(g.set&&typeof g.set==='object'){a.set={};for(const k in g.set)if(ORN[g.set[k]])a.set[k]=g.set[k]}if(Array.isArray(g.remove))a.remove=g.remove.filter(k=>SLOT_LABEL[k]);if(Object.keys(a).length)act(a)}
    say(ai.reply,{noHistory:false});
    const ids=(ai.sarees||[]).filter(id=>S(id)).slice(0,3);
    if(ids.length){
      const list=ids.map((id,i)=>{const s=S(id);const r={s,score:.8,c:colorFit(s,profile),b:bodyFit(s,profile)};
        r.score=.48*(profile.occasion?(OCC_FIT[profile.occasion][id]||.4):.75)+.34*r.c.v+.18*r.b.v;
        let forced=null;const ao=ai.ornaments&&ai.ornaments[id];
        if(Array.isArray(ao)&&ao.length){forced={};ao.forEach(oid=>{if(ORN[oid])forced[ORN[oid][0]]=oid})}
        return buildLook(r,profile,i,forced)});
      showLooks(list);
    }
    chips((ai.chips&&ai.chips.length?ai.chips:defaultChips()).slice(0,4));
    return;
  }
  // on-device answer
  if(ab){say(ab.text,{src:'Answered on device'});chips(ab.chips||ctxQs().concat(defaultChips()).slice(0,4));return}
  const faq=localFaq(text);
  if(faq&&!changed){say(faq,{src:'Answered on device'});chips(defaultChips());return}
  if(/cheaper|budget|less expensive|lower price/.test(text.toLowerCase())&&!local.budget){return cheaper()}
  if(/other|more options|different|something else/.test(text.toLowerCase())){return moreOptions()}
  if(changed||profile.occasion){
    const missing=['occasion','skinTone','heightCm'].filter(k=>profile[k]===undefined);
    if(missing.length&&!profile.occasion){say('Lovely. Tell me a little more and I will style you.');quiz={i:0};return nextStep()}
    return styleNow(changed?'Noted. Here is what I would style for you.':null);
  }
  say('I can style a complete look for you, or answer anything about sarees, ornaments, draping, delivery and returns. Shall we start with the occasion?');
  chips(['Find my look','How do I care for silk?','What is your return policy?','Kanjivaram vs Banarasi?']);
}
const defaultChips=()=>subject()?ctxQs().concat(['Find my look']).slice(0,4):profile.occasion?['Show me other options','Make it cheaper','How do I drape it?','What blouse should I wear?']:['Find my look','Match an inspiration photo','What suits dusky skin?','What is your return policy?'];
function cheaper(){
  const cur=shown.length?Math.min(...shown.map(id=>S(id).eff)):5000;
  const target=profile.budget?Math.round(profile.budget*.7):Math.max(3000,Math.round(cur*1.1+2000));
  profile.budget=target;saveProfile();
  showLooks(recommend(profile),`Here is the edit kept under ${inr(target)} for the full look.`);
  chips(['Show me other options','No budget limit','Lighter jewellery']);
}
function moreOptions(){
  const list=recommend(profile,{exclude:shown.slice(-3),n:3});
  if(!list.length){shown=[];return styleNow()}
  showLooks(list,'A few more directions you might love.');
  chips(['Go back to my best match','Make it cheaper','Lighter jewellery']);
}

/* ---------- photo: skin tone + inspiration ---------- */
const pm={mode:null,img:null,sample:null};
function openPhoto(mode){
  $('#photoModal').hidden=false;$('#pmPick').hidden=!!mode;$('#pmWork').hidden=true;$('#pmUse').hidden=true;$('#pmResult').hidden=true;$('#pmDot').hidden=true;
  pm.mode=mode||null;
  if(mode){$('#pmFile').click()}else $('#pmPick .pm-opt').focus();
}
function closePhoto(){$('#photoModal').hidden=true;$('#pmFile').value=''}
function toLab(r,g,b){
  [r,g,b]=[r,g,b].map(v=>{v/=255;return v>.04045?Math.pow((v+.055)/1.055,2.4):v/12.92});
  let x=(r*.4124+g*.3576+b*.1805)/.95047,y=r*.2126+g*.7152+b*.0722,z=(r*.0193+g*.1192+b*.9505)/1.08883;
  const f=t=>t>.008856?Math.cbrt(t):7.787*t+16/116;x=f(x);y=f(y);z=f(z);
  return [116*y-16,500*(x-y),200*(y-z)];
}
function sampleAt(cx,cy){
  const c=$('#pmCanvas'),ctx=c.getContext('2d');const r=Math.max(4,Math.round(c.width/60));
  const d=ctx.getImageData(Math.max(0,cx-r),Math.max(0,cy-r),r*2,r*2).data;let R=0,G=0,B=0,n=0;
  for(let i=0;i<d.length;i+=4){R+=d[i];G+=d[i+1];B+=d[i+2];n++}
  return [R/n,G/n,B/n];
}
function readSkin(rgb){
  const [L,a,b]=toLab(...rgb);
  const tone=L>74?'fair':L>67?'light':L>59?'wheatish':L>50?'medium':L>40?'dusky':'deep';
  const hue=Math.atan2(b,a)*180/Math.PI;
  const under=hue>60?'warm':hue<50?'cool':'neutral';
  return {tone,under,hex:'#'+rgb.map(v=>Math.round(v).toString(16).padStart(2,'0')).join(''),L};
}
function nearestSaree(rgb){
  const [L,a,b]=toLab(...rgb);let best=null,bd=1e9;
  SAREES.forEach(s=>{const h=s.hex.slice(1);const q=toLab(parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16));const d=(q[0]-L)**2*.5+(q[1]-a)**2+(q[2]-b)**2;if(d<bd){bd=d;best=s}});
  return best;
}
function dominant(){
  const c=$('#pmCanvas'),ctx=c.getContext('2d'),w=c.width,h=c.height;
  const d=ctx.getImageData(Math.round(w*.2),Math.round(h*.25),Math.round(w*.6),Math.round(h*.6)).data;
  const bins={};
  for(let i=0;i<d.length;i+=16){const r=d[i],g=d[i+1],b=d[i+2];const mx=Math.max(r,g,b),mn=Math.min(r,g,b);if(mx-mn<28&&mx>40&&mx<235)continue;const k=(r>>5)+','+(g>>5)+','+(b>>5);(bins[k]=bins[k]||{n:0,r:0,g:0,b:0});bins[k].n++;bins[k].r+=r;bins[k].g+=g;bins[k].b+=b}
  const top=Object.values(bins).sort((x,y)=>y.n-x.n)[0];
  return top?[top.r/top.n,top.g/top.n,top.b/top.n]:[128,64,64];
}
$('#pmFile').addEventListener('change',e=>{
  const f=e.target.files[0];if(!f)return closePhoto();
  const img=new Image();img.onload=()=>{
    const max=900,sc=Math.min(1,max/Math.max(img.width,img.height));
    const c=$('#pmCanvas');c.width=Math.round(img.width*sc);c.height=Math.round(img.height*sc);
    c.getContext('2d').drawImage(img,0,0,c.width,c.height);
    pm.img=c.toDataURL('image/jpeg',.82);
    $('#pmPick').hidden=true;$('#pmWork').hidden=false;
    if(pm.mode==='skin'){
      $('#pmHint').textContent='Tap a spot on your cheek, away from shadow and makeup. Daylight works best.';
      const s=sampleAt(Math.round(c.width/2),Math.round(c.height*.45));showSkin(s,c.width/2,c.height*.45);
    }else{
      $('#pmHint').textContent='Sakhi reads the main colour of the saree. Tap the saree itself if it picks the background.';
      const rgb=dominant();pm.sample=rgb;showInspo(rgb);
    }
    URL.revokeObjectURL(img.src);
  };img.src=URL.createObjectURL(f);
});
function placeDot(x,y){const c=$('#pmCanvas'),k=c.clientWidth/c.width,dot=$('#pmDot');dot.hidden=false;dot.style.left=(x*k)+'px';dot.style.top=(y*k)+'px'}
function showSkin(rgb,x,y){const r=readSkin(rgb);pm.sample=r;placeDot(x,y);
  $('#pmResult').hidden=false;$('#pmResult').innerHTML=`<span class="sw" style="background:${r.hex}"></span><div><b>${TONE(r.tone).label}, ${r.under} undertone</b>Not quite right? Tap another spot, or pick the swatch yourself after.</div>`;$('#pmUse').hidden=false}
function showInspo(rgb){const s=nearestSaree(rgb);pm.match=s;const hex='#'+rgb.map(v=>Math.round(v).toString(16).padStart(2,'0')).join('');
  $('#pmResult').hidden=false;$('#pmResult').innerHTML=`<span class="sw" style="background:${hex}"></span><div><b>Closest in the collection: ${esc(s.name)}, ${esc(s.tone)}</b>Sakhi will look at the full photo when you send it.</div>`;$('#pmUse').hidden=false}
$('#pmCanvas').addEventListener('click',e=>{
  const c=e.currentTarget,rect=c.getBoundingClientRect(),k=c.width/rect.width;
  const x=Math.round((e.clientX-rect.left)*k),y=Math.round((e.clientY-rect.top)*k);
  const rgb=sampleAt(x,y);
  if(pm.mode==='skin')showSkin(rgb,x,y);else{placeDot(x,y);pm.sample=rgb;showInspo(rgb)}
});
$('#pmUse').addEventListener('click',async()=>{
  closePhoto();
  if(pm.mode==='skin'){
    const r=pm.sample;
    const step=curStep();if(step)step.remove();
    profile.skinTone=r.tone;profile.undertone=r.under;saveProfile();
    me('Read from my selfie: '+TONE(r.tone).label+', '+r.under+' undertone');
    say(`Your skin reads as **${TONE(r.tone).label.toLowerCase()}** with a **${r.under}** undertone. ${r.under==='warm'?'Yellow gold will glow on you.':r.under==='cool'?'Pearl, polki and silver tones will look lovely, and jewel colours suit you.':'You can wear both gold and silver tones.'} You can change this any time in your profile.`);
    if(quiz){quiz.i++;if(quiz.single){quiz=null;styleNow()}else nextStep()}else if(profile.occasion)styleNow();else startQuiz();
  }else{
    const s=pm.match;
    const small=await shrink(pm.img,512);
    profile.occasion=profile.occasion||null;
    await sendInspo(s,small);
  }
});
async function shrink(dataUrl,max){return new Promise(res=>{const i=new Image();i.onload=()=>{const sc=Math.min(1,max/Math.max(i.width,i.height));const c=document.createElement('canvas');c.width=Math.round(i.width*sc);c.height=Math.round(i.height*sc);c.getContext('2d').drawImage(i,0,0,c.width,c.height);res(c.toDataURL('image/jpeg',.8))};i.src=dataUrl})}
async function sendInspo(s,img){
  chips([]);me('Find me something like this.',img);
  history.push({role:'user',content:'Here is an inspiration photo. Describe the saree in it in one line, then suggest the closest looks from your collection with ornaments.',image:img});
  const t=typing();const ai=await askAI('',img);t.remove();
  if(ai){applyProfile(ai.profile);say(ai.reply);const ids=(ai.sarees||[]).filter(id=>S(id)).slice(0,3);
    const list=(ids.length?ids:[s.id]).map((id,i)=>buildLook({s:S(id),score:.85-i*.05,c:colorFit(S(id),profile),b:bodyFit(S(id),profile)},profile,i));showLooks(list);chips((ai.chips||defaultChips()).slice(0,4));return}
  const others=recommend(profile,{prefer:[s.id],n:2});
  const list=[buildLook({s,score:.9,c:colorFit(s,profile),b:bodyFit(s,profile)},profile,0)].concat(others.filter(L=>L.s.id!==s.id).slice(0,1).map(L=>({...L,rank:1})));
  showLooks(list,`The main colour in your photo is closest to our **${s.name} in ${s.tone}**. Here it is styled as a full look, with one more option.`);
  chips(['Find my look','Make it cheaper','Show me other options']);
}

/* ---------- profile panel ---------- */
function renderCtx(){
  const el=$('#ctx');if(!el)return;
  const bits=[profile.occasion&&OCC_LABEL[profile.occasion],profile.skinTone&&TONE(profile.skinTone)&&TONE(profile.skinTone).label,profile.heightCm&&fmtH(profile.heightCm).split(' · ')[0],profile.budget?'Under '+inr(profile.budget):null].filter(Boolean);
  el.hidden=!bits.length;
  el.innerHTML=bits.length?`<span class="ctx-l">Styling for</span><span class="ctx-v">${bits.map(esc).join(' · ')}</span><button class="ctx-e" data-ctxedit="1">Edit</button>`:'';
}
function renderProfile(){
  renderCtx();
  const rows=[['occasion','Occasion'],['skinTone','Skin tone'],['undertone','Undertone'],['heightCm','Height'],['build','Build'],['jewellery','Jewellery'],['budget','Budget']];
  $('#prof').innerHTML=rows.map(([k,l])=>{const v=profile[k];let txt=v===undefined||v===null||v===''?'<span style="color:var(--muted)">Not set</span>':esc(labelFor(k,v));
    if(k==='skinTone'&&v)txt=`<span><span class="sw" style="background:${TONE(v).hex}"></span>${txt}</span>`;
    return `<div><dt>${l}</dt><dd>${txt}<button data-edit="${k}" aria-label="${v?'Change':'Add'} ${l.toLowerCase()}">${v?'Edit':'Add'}</button></dd></div>`}).join('');
  $('#saved').innerHTML=saved.length?saved.map((x,i)=>`<div class="sl"><img src="img/${x.sid}.jpg" alt=""><div>${esc(x.title)}<small>${inr(x.total)} · ${x.n} pieces</small></div><button data-unsave="${i}">Remove</button></div>`).join(''):'<p class="none">Save a look and it will wait for you here.</p>';
}
function toggleSide(o){const side=$('#skSide');side.classList.toggle('open',o);const pb=$('#profileBtn');if(pb)pb.setAttribute('aria-expanded',o);const sc=$('#sideScrim');if(sc)sc.hidden=!o}

/* ---------- bag ---------- */
function renderBag(){
  const n=bag.length,c=$('#bagCount');c.textContent=n;c.hidden=!n;
  $('#bagSub').textContent=n?n+(n===1?' item':' items'):'';
  if(!n){$('#bagItems').innerHTML='<div class="empty">Your bag is empty. Ask Sakhi for a look and add it here.</div>';$('#bagFoot').innerHTML='';return}
  $('#bagItems').innerHTML=bag.map((b,i)=>{const s=b.sid?S(b.sid):null;const img=s?`img/${s.id}.jpg`:`img/orn/${b.oid}-s.jpg`;const title=s?s.name+', '+s.tone:b.names[0];
    return `<div class="bi"><div><img src="${img}" alt=""></div><div><div class="t">${esc(title)}</div><div class="d">${esc((b.names||[]).join(', ')||'Saree only')}</div><div class="f"><span>${inr(b.total)}</span><button data-remove="${i}">Remove</button></div></div></div>`}).join('');
  $('#bagFoot').innerHTML=`<div class="row total"><span>Subtotal</span><span>${inr(bag.reduce((a,b)=>a+b.total,0))}</span></div><button class="btn" style="width:100%;justify-content:center;margin-top:12px" data-checkout>Buy now →</button><p style="margin:8px 0 0;text-align:center;font-size:12px;color:var(--muted)">UPI, cards or cash on delivery. Ships in 24 hours.</p>`;
}
function openBag(o){$('#bag').hidden=!o;$('#scrim').hidden=!o}
function notifyParent(){try{if(EMBED&&parent!==window)parent.postMessage({type:'sd-bag'},location.origin)}catch(e){}}
function toast(msg){const t=$('#toast');t.textContent=msg;t.hidden=false;clearTimeout(toast.h);toast.h=setTimeout(()=>t.hidden=true,2600)}

/* ---------- events ---------- */
document.addEventListener('click',e=>{
  const b=e.target.closest('button');if(!b)return;
  const d=b.dataset;
  if((d.chip||d.photo)&&b.closest('.sk-hello,.sk-starters'))hideHello();
  if(d.ans){const [k,v]=d.ans.split('|');answer(k,k==='budget'?+v:v===''&&k==='jewellery'?'':v,b);return}
  if(d.skip){if(!quiz){curStep()&&curStep().remove();return}const k=quiz.steps[quiz.i];answer(k,null,b);return}
  if(d.back){if(quiz&&quiz.i>0){quiz.i--;const m=[...log.querySelectorAll('.m.me')].pop();if(m)m.remove();nextStep(true)}return}
  if(d.ctxedit){toggleSide(true);return}
  if(d.hset){const step=b.closest('.step');answer('heightCm',+step._range.value,b);return}
  if(d.photo){openPhoto(d.photo);return}
  if(d.chip){const c=d.chip;
    if(c==='Find my look'){chips([]);me('Style my look');startQuiz();return}
    if(c==='Style a new look'){chips([]);me(c);delete profile.occasion;saveProfile();startQuiz();return}
    if(c==='Match an inspiration photo'){openPhoto('inspo');return}
    if(c==='Read my skin tone from a selfie'){openPhoto('skin');return}
    if(c==='Make it cheaper'&&aiOK===false){me(c);return cheaper()}
    if(c==='Show me other options'&&aiOK!==true){me(c);return moreOptions()}
    if(c==='No budget limit'){me(c);profile.budget=0;saveProfile();return styleNow()}
    if(c==='Lighter jewellery'){me(c);profile.jewellery='minimal';saveProfile();return styleNow('Lighter on the ornaments, same sarees.')}
    if(c==='Go full bridal'){me(c);profile.occasion='bride';saveProfile();return styleNow('The full bridal treatment: all seven pieces.')}
    if(c==='Go back to my best match'){me(c);return styleNow()}
    send(c);return}
  if(d.swap){const [key,slot]=d.swap.split('|');const L=looks[key];if(!L)return;const opts=SLOT_OPTS[slot];const next=opts[(opts.indexOf(L.sel[slot])+1)%opts.length];L.sel={...L.sel,[slot]:next};
    const card=b.closest('.lk');const tmp=document.createElement('div');tmp.innerHTML=lookCard(L,key);card.replaceWith(tmp.firstElementChild);if(ROOM)toStage(L);return}
  if(d.lkview!==undefined){const [key,v]=d.lkview.split('|');const L=looks[key];if(!L)return;const card=b.closest('.lk');card.querySelectorAll('[data-lkview]').forEach(x=>x.setAttribute('aria-pressed',x===b));
    if(ROOM){try{parent.postMessage({type:'sd-view',sid:L.s.id,sel:L.sel,view:v||'model'},location.origin)}catch(e){}}else{card.querySelector('.lk-ph img').src='img/'+L.s.id+(v?'-'+v:'')+'.jpg'}return}
  if(d.stage){toStage(looks[d.stage]);toast('On the stage');return}
  if(d.addlook){const L=looks[d.addlook],t=totals(L.s,L.sel);bag.push({sid:L.s.id,names:t.ids.map(id=>ORN[id][1]),total:t.total});store.set('sd-bag',bag);renderBag();if(ROOM){try{parent.postMessage({type:'sd-added'},location.origin)}catch(e){}}else{notifyParent();toast('Look added to your bag')}return}
  if(d.save){const L=looks[d.save],k=sig(L),i=saved.findIndex(x=>x.key===k);
    if(i>=0){saved.splice(i,1);b.setAttribute('aria-pressed','false');b.setAttribute('aria-label','Save look')}else{const t=totals(L.s,L.sel);saved.unshift({key:k,sid:L.s.id,title:L.s.name+', '+L.s.tone,total:t.total,n:t.ids.length+1,sel:L.sel});b.setAttribute('aria-pressed','true');b.setAttribute('aria-label','Saved');toast('Saved to your profile')}
    store.set('sd-sakhi-saved',saved);renderProfile();return}
  if(d.share){const L=looks[d.share],t=totals(L.s,L.sel);const txt=`My look from Sopanam Drapes, styled by Sakhi:\n${L.s.name}, ${L.s.tone} (${inr(L.s.eff)})\n${t.ids.map(id=>'+ '+ORN[id][1]).join('\n')}\nFull look: ${inr(t.total)}\n${new URL('styling-room.html?style='+L.s.id,location.href).href.replace(/embed=1&?/,'')}`;window.open('https://wa.me/?text='+encodeURIComponent(txt),'_blank','noopener');return}
  if(d.edit){toggleSide(false);me('Change my '+d.edit.replace('Cm','').replace(/([A-Z])/g,' $1').toLowerCase());startQuiz(d.edit);return}
  if(d.unsave){saved.splice(+d.unsave,1);store.set('sd-sakhi-saved',saved);renderProfile();return}
  if(d.remove){bag.splice(+d.remove,1);store.set('sd-bag',bag);renderBag();notifyParent();return}
  if('checkout' in d){if(EMBED&&parent!==window){try{parent.postMessage({type:'sd-checkout'},location.origin)}catch(e){}}else location.href='index.html?checkout=1';return}
  if(d.mode){pm.mode=d.mode;$('#pmFile').click();return}
  switch(b.id){
    case 'restartBtn':case 'newChatBtn':toggleSide(false);if(confirmRestart())restart();return;
    case 'menuSideBtn':toggleSide(true);return;
    case 'sideCloseBtn':toggleSide(false);return;
    case 'restyleBtn':toggleSide(false);me('Restyle me');return styleNow();
    case 'profileBtn':toggleSide(!$('#skSide').classList.contains('open'));return;
    case 'photoBtn':openPhoto();return;
    case 'pmCancel':closePhoto();return;
    case 'bagBtn':openBag(true);return;
    case 'bagClose':openBag(false);return;
    case 'closeEmbed':try{parent.postMessage({type:'sd-close'},location.origin)}catch(e){}return;
    case 'menuBtn':{const h=b.closest('header'),o=h.classList.toggle('open');b.setAttribute('aria-expanded',o);return}
    case 'themeBtn':{const r=document.documentElement,dark=r.dataset.theme?r.dataset.theme==='dark':matchMedia('(prefers-color-scheme:dark)').matches;r.dataset.theme=dark?'light':'dark';try{localStorage.setItem('sd-theme',r.dataset.theme)}catch(e){}return}
  }
});
function confirmRestart(){return true}
$('#scrim').addEventListener('click',()=>openBag(false));
document.addEventListener('keydown',e=>{if(e.key==='Escape'){if(!$('#photoModal').hidden)closePhoto();else if(!$('#bag').hidden)openBag(false);else if($('#skSide').classList.contains('open'))toggleSide(false);else if(EMBED){try{parent.postMessage({type:'sd-close'},location.origin)}catch(err){}}}});
$('#photoModal').addEventListener('click',e=>{if(e.target.id==='photoModal')closePhoto()});
$('#form').addEventListener('submit',e=>{e.preventDefault();const v=$('#msg').value;$('#msg').value='';$('#sendBtn').disabled=true;send(v)});
$('#msg').addEventListener('input',()=>{$('#sendBtn').disabled=!$('#msg').value.trim()});

// voice input, en-IN
const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
if(SR){const mic=$('#micBtn');mic.hidden=false;let rec=null;
  mic.addEventListener('click',()=>{
    if(rec){rec.stop();return}
    rec=new SR();rec.lang='en-IN';rec.interimResults=true;mic.setAttribute('aria-pressed','true');
    rec.onresult=ev=>{$('#msg').value=[...ev.results].map(r=>r[0].transcript).join('');if(ev.results[ev.results.length-1].isFinal){const v=$('#msg').value;$('#msg').value='';send(v)}};
    rec.onend=()=>{rec=null;mic.setAttribute('aria-pressed','false')};rec.onerror=()=>{rec=null;mic.setAttribute('aria-pressed','false')};rec.start();
  })}

const NOTES={"SA00001": {"one": "Banarasi silk with a soft sheen and gold zari buttas. It has some weight but drapes softly, so it photographs richly at weddings.", "feel": "Banarasi silk: medium-heavy with a soft fall. Comfortable for a wedding or reception of a few hours; warm for a full outdoor day in peak summer.", "drape": "A Nivi drape with 5 to 7 deep pleats suits it best. Leave the pallu open to about knee length so the gold buttas show, or pleat and pin it on the shoulder for a neater, formal look.", "blouse": "It comes with an unstitched blouse piece. A maroon or red blouse with elbow-length sleeves and a boat or sweetheart neck is classic; gold zari edging on the sleeves echoes the border.", "back": "From behind, the gold zari pallu is the hero. A deep-back blouse with a dori tie and small latkans shows it off without competing.", "pallu": "The pallu carries dense gold buttas and a woven zari end panel. Open pallu for photos, pleated and pinned if you will be moving around a lot.", "weave": "Look for the small gold buttas spaced across the body and the solid zari band at the border: that density is what gives Banarasi its richness.", "care": "Dry clean only. Store it folded in a muslin cloth away from damp, and refold it every few months so the zari does not crack along the folds.", "best": "weddings, receptions and festive evenings", "jewel": "Gold-tone temple or kundan pieces: a mid-length necklace, studs or jhumkas and a couple of bangles. Skip silver; it fights the zari."}, "SA00002": {"one": "Kanjivaram silk in emerald with a wide gold border and a temple-motif pallu. It is heavy and structured: the statement bridal saree.", "feel": "Kanjivaram silk is heavy and structured. It holds crisp pleats all day and feels substantial; plan for a light inner layer and comfortable footwear on a long muhurtham day.", "drape": "Nivi drape with fewer, wider pleats (5 is plenty with this weight), pressed flat. The pallu is best pleated and pinned for a bride, or let it fall open for portraits.", "blouse": "It comes with an unstitched blouse piece. Brides usually go for a contrast gold or maroon silk blouse, elbow sleeves, and a high back neck or a deep back with tassels.", "back": "The back is where the temple-motif pallu shows: a high-neck or deep-back blouse frames it. Hair in a braid or bun with jasmine completes the view from behind.", "pallu": "The pallu has a large temple motif woven in gold. Spread it open across the arm for photos; it is the most photographed part of a Kanjivaram.", "weave": "The border is woven separately and interlocked with the body (the korvai join), which is why the contrast is so crisp and the saree feels heavy.", "care": "Dry clean only. Wrap it in muslin, never plastic, and refold every couple of months. Keep perfume and deodorant off the zari.", "best": "bridal looks, muhurtham, and weddings where you want to stand out", "jewel": "This one carries a full set: a polki choker or temple necklace, kada bangles, chandbalis, a ring, temple anklets and a waist belt. Gold-tone throughout."}, "SA00003": {"one": "A light peach chiffon with an all-over floral print. Very soft and flowy, easy to wear for hours.", "feel": "Chiffon is very light and fluid. It falls close to the body and moves with you, so it is comfortable for long afternoon events and warm weather.", "drape": "Nivi drape with narrow pleats; chiffon slips, so pin the pleats at the waist. A free-flowing open pallu suits the print, or a pleated pinned pallu for a neater line.", "blouse": "It comes with a stitched blouse. A sleeveless or cap-sleeve blouse keeps it airy; a pearl or champagne blouse works if you want to swap.", "back": "From behind, the open pallu shows the floral print falling in soft folds. A simple round or V back suits it better than heavy embroidery.", "pallu": "The pallu continues the floral print with no heavy border, so it looks best left open and loose.", "weave": "Chiffon is a sheer, finely twisted fabric; the print sits on the surface, which is why it feels so light and drapes so close.", "care": "Gentle hand wash in cold water or dry clean. Do not wring; roll it in a towel to dry, and iron on low with a cloth on top.", "best": "afternoon events, small celebrations and day parties", "jewel": "Keep it light: pearl or delicate gold-tone pieces, jhumkas or studs and a couple of bangles. A heavy necklace overwhelms chiffon."}, "SA00004": {"one": "Royal blue organza with a fine sequin border. Crisp and light, it holds its shape and adds volume.", "feel": "Organza is crisp and light. It stands away from the body a little, so it adds volume, and it is cool to wear. It can feel slightly stiff at first.", "drape": "Fewer pleats (4 to 5), pressed with a cool iron so they stay sharp. An open pallu shows the sheen; pin it at the shoulder so it does not slip.", "blouse": "It comes as the saree only, so pair any blouse. A silver or gold sequin blouse lifts it for evenings; a contrast blush or ivory blouse feels fresh for day festivals.", "back": "From behind the sheer organza pallu catches the light; a backless or deep-back blouse with a tie looks striking for an evening reception.", "pallu": "The pallu is sheer with the sequin border running along its edge, so it reads best open and spread.", "weave": "Organza is a sheer, tightly twisted weave, which is why it is crisp and holds its shape. The sequins are worked along the border.", "care": "Dry clean only. Do not wring or crush it; hang or fold loosely with tissue between folds so it keeps its crispness.", "best": "festivals like Onam, receptions and evening parties", "jewel": "An emerald drop necklace and chandbalis look regal with the blue. Keep bangles minimal so the sequin border stays the focus."}, "SA00005": {"one": "A mustard handloom cotton with a slim zari-edged border. Breathable and easy for long working days.", "feel": "Handloom cotton is breathable and light. It is the most comfortable saree here for a full working day in Kerala heat.", "drape": "A neat Nivi drape with 5 to 6 pleats, pinned. A light starch keeps the pleats crisp for office; pleat and pin the pallu so it stays out of the way.", "blouse": "It comes with a stitched blouse. A three-quarter sleeve blouse in a contrast colour (rust, maroon or bottle green) looks smart for work.", "back": "From behind the pinned pallu and slim zari edge keep it tidy. A simple round back suits office wear.", "pallu": "The pallu is plain mustard with a thin zari edge; it looks best pleated and pinned.", "weave": "Handloom cotton has a slightly uneven, textured weave that softens with every wash.", "care": "Hand wash in cold water separately for the first few washes (the colour can bleed), dry in shade, and iron on medium while slightly damp.", "best": "office, college and everyday wear", "jewel": "Kundan studs and a single bracelet or bangle. Skip the heavy necklace for work."}, "SA00006": {"one": "Wine georgette with a sequin-and-stone border. Fluid with a slight shimmer, made for evenings.", "feel": "Georgette is fluid and light with a slight grain. It falls close to the body and does not crease easily, so it stays neat through a long party.", "drape": "Nivi drape with narrow pleats pinned well. Pleat and pin the pallu for a sleek line, or leave it open over the arm for photos.", "blouse": "It comes with a stitched blouse. A sleeveless or halter blouse in wine or gold suits an evening; add a deep back for drama.", "back": "From behind the shimmer catches the light; a deep-back blouse with a sparkly tie is the classic party look.", "pallu": "The pallu carries the sequin and stone border, so it shimmers when it moves.", "weave": "Georgette is woven from tightly twisted yarns, which gives it that slight grain and fluid fall.", "care": "Dry clean recommended. If hand washing, use cold water and no wringing. Store folded with the border inside so stones do not snag.", "best": "evening parties, Deepavali, Christmas and Perunnal", "jewel": "Statement chandbalis or a polki choker, with pearl studded bangles. Pick one hero piece rather than both."}, "SA00007": {"one": "An ivory Kerala kasavu with a gold zari border. Crisp handwoven cotton, the classic Onam and temple saree.", "feel": "Kasavu cotton is crisp and breathable, cool to wear even through a long Onam day.", "drape": "Wear it Nivi style with crisp, starched pleats, or in the traditional Kerala style with the pallu over the left shoulder and tucked at the back. Keep the gold border visible at the hem.", "blouse": "It comes as the saree only. Traditional choices are a gold tissue, deep green, maroon or mustard blouse; elbow sleeves look classic.", "back": "From behind the gold kasavu border runs along the pallu; hair in a braid with jasmine is the traditional finish.", "pallu": "The pallu is ivory with the gold kasavu border along its edge, quiet and elegant; pleat and pin it for temple visits.", "weave": "Kasavu is handwoven cotton with a pure zari band woven into the border, which is why the gold has a soft metallic glow.", "care": "Hand wash in cold water separately, dry in shade, and starch lightly. Iron on the reverse to protect the zari.", "best": "Onam, Vishu, temple visits and Kerala weddings as a guest", "jewel": "A temple necklace, jhumkas, gold bangles and temple anklets, with jasmine in the hair."}, "SA00008": {"one": "Rust tussar silk with a hand-printed border. Textured and light, an easy silk for everyday festive wear.", "feel": "Tussar is a light, textured silk, much lighter than Kanjivaram or Banarasi, so it is comfortable for a full day.", "drape": "Nivi drape with 5 to 6 pleats and an open pallu so the printed border shows. It holds pleats well without starch.", "blouse": "It comes with an unstitched blouse piece. A black, deep green or ivory blouse with three-quarter sleeves looks smart; a high neck works for office events.", "back": "From behind the printed border runs along the open pallu; a simple boat-neck back suits the earthy look.", "pallu": "The pallu has the hand-printed border along its edge and the natural slub texture of tussar.", "weave": "Tussar has a natural slubby, uneven texture and a matte golden sheen, which gives it an earthy, handcrafted feel.", "care": "Dry clean for the first few times. Later, a gentle cold hand wash is fine; dry in shade and iron on low.", "best": "everyday festive wear, office events and small functions", "jewel": "Kundan studs and gold plated bangles; oxidised pieces also suit the earthy rust."}};
/* ---------- context: what the shopper is looking at ---------- */
const VIEW_LABEL={model:'Full view',close:'Close-up',back:'Back view',pallu:'Pallu',detail:'The weave',look:'Your look'};
const SLOT_WORDS={necklace:/necklace|choker|haar/,bangles:/bangle|kada|bracelet(?!s? )/,earrings:/earring|jhumka|chandbali|stud/,ring:/\bring\b/,anklet:/anklet|payal/,bracelet:/bracelet/,waistband:/waist|belt|kamarbandh|oddiyanam/};
let here=null, stageSid=null, noted={};
const BRIDAL_SET={...S('SA00002').combo};
try{if(!ROOM){const c=JSON.parse(sessionStorage.getItem('sd-ctx')||'null');if(c&&Date.now()-c.at<30*60e3&&(!FROM||c.page===FROM))here=c}}catch(e){}
const short=s=>s.name.replace(/ Saree$/,'');
function subject(){
  if(!here)return null;
  if(here.stage&&S(here.stage.sid))return {kind:'saree',s:S(here.stage.sid),sel:here.stage.sel||{},view:here.stage.view||'model',room:true};
  if(here.focus&&here.focus.kind==='saree'&&S(here.focus.id))return {kind:'saree',s:S(here.focus.id),sel:S(here.focus.id).combo};
  if(here.focus&&here.focus.kind==='orn'&&ORN[here.focus.id])return {kind:'orn',id:here.focus.id};
  if(here.lead&&S(here.lead)&&/look|jewellery/.test(here.section))return {kind:'saree',s:S(here.lead),sel:here.leadSel||S(here.lead).combo,lead:true};
  return null;
}
function selIds(sel){return Object.values(sel||{}).filter(id=>ORN[id])}
function describeHere(){
  if(!here)return '';
  const sub=subject(),bits=[];
  if(sub&&sub.room){const s=sub.s;bits.push(`They are in the Styling Room. On the stage: ${s.name}, ${s.tone}, ${s.fabric}, ${inr(s.eff)}. Ornaments on the look: ${selIds(sub.sel).map(id=>ORN[id][1]).join(', ')||'none'}. The photo they are viewing: ${VIEW_LABEL[sub.view]||sub.view}. Look total ${inr(here.stage.total||0)}.`)}
  else{
    bits.push(`They are browsing the ${here.page} page${here.label?', currently at '+here.label:''}.`);
    if(sub&&sub.kind==='saree')bits.push(`${sub.lead?'The styled look on this page':'They just pointed at'}: ${sub.s.name}, ${sub.s.tone}, ${inr(sub.s.eff)}${selIds(sub.sel).length?', styled with '+selIds(sub.sel).map(id=>ORN[id][1]).join(', '):''}.`);
    if(sub&&sub.kind==='orn')bits.push(`They just pointed at the ornament ${ORN[sub.id][1]} (${inr(ORN[sub.id][2])}).`);
    const items=(here.items||[]).map(x=>x.split(':')).map(([k,id])=>k==='saree'&&S(id)?S(id).name:k==='orn'&&ORN[id]?ORN[id][1]:null).filter(Boolean);
    if(items.length)bits.push(`On screen: ${items.join(', ')}.`);
  }
  if(here.bag&&here.bag.length)bits.push(`In their bag: ${here.bag.map(id=>S(id)?S(id).name:ORN[id]?ORN[id][1]:'').filter(Boolean).join(', ')}.`);
  return bits.join(' ');
}
function ctxQs(){
  const sub=subject();
  if(sub&&sub.kind==='saree'){
    const v=sub.view;
    if(sub.room){
      if(v==='back')return ['What blouse back suits this?','How do I wear my hair with it?','Show me the pallu'];
      if(v==='pallu')return ['How should I drape the pallu?','Open or pinned pallu?','Show me the weave'];
      if(v==='detail')return ['How do I care for this fabric?','Is it heavy to wear?','Show me the back'];
      if(v==='look')return ['Is this too much jewellery?','Make it lighter','Is this right for my occasion?'];
      return ['Is this right for my occasion?','What blouse goes with it?','Make the jewellery lighter','Show me the back'];
    }
    return [`Is the ${short(sub.s)} right for my occasion?`,'What blouse goes with it?','How do I drape it?','Which ornaments suit it?'];
  }
  if(sub&&sub.kind==='orn')return [`Which saree goes with the ${ORN[sub.id][1].replace(/, set of \d/,'')}?`,'Is it real gold?','What else pairs with it?'];
  if(here&&here.section==='jewellery')return ['Which of these suit me?','Can I skip the necklace?','Is it real gold?'];
  if(here&&here.section==='catalogue')return ['Which of these suits me?','Which is lightest to wear?','Kanjivaram vs Banarasi?'];
  if(here&&here.section==='festivals')return ['What do I wear for Onam?','Something for Deepavali','Which saree for a temple visit?'];
  return [];
}
function hereLine(){
  const sub=subject();if(!sub)return here&&here.label&&here.section!=='hero'?{t:'Looking at',v:here.label.replace(/^the /,'').replace(/^./,c=>c.toUpperCase())}:null;
  if(sub.kind==='orn')return {t:'Looking at',v:ORN[sub.id][1],img:`img/orn/${sub.id}-s.jpg`};
  return {t:sub.room?'On the stage':sub.lead?'This page’s look':'Looking at',v:sub.s.name+(sub.room&&sub.view!=='model'?' · '+(VIEW_LABEL[sub.view]||''):''),img:`img/${sub.s.id}${sub.room&&sub.view&&!/model|look/.test(sub.view)?'-'+sub.view:''}.jpg`};
}
function renderHere(){
  let el=$('#here');
  if(!el){el=document.createElement('div');el.id='here';el.className='sk-here';$('#log').before(el)}
  const h=hereLine();el.hidden=!h;if(!h)return;
  el.innerHTML=`${h.img?`<img src="${h.img}" alt="">`:''}<span><small>${esc(h.t)}</small>${esc(h.v)}</span>`;
  const st=$('#starters');
  if(st&&$('.sk-chat').classList.contains('is-empty')){const q=ctxQs();st.querySelectorAll('.starter.q').forEach(b=>b.remove());st.insertAdjacentHTML('beforeend',(q.length?q:['What suits dusky skin?','Kanjivaram vs Banarasi?','How do I care for silk?']).map(x=>`<button class="starter q" data-chip="${esc(x)}" type="button">${esc(x)}</button>`).join(''));
    const p=log.querySelector('.sk-hello p'),hh=hereHello();if(p&&hh)p.textContent=hh}
}
function hereHello(){const sub=subject();if(!sub)return '';
  if(sub.kind==='orn')return `You’re looking at the ${ORN[sub.id][1]}. Ask me what it goes with, or let me style a full look around it.`;
  if(sub.room)return `I’m right here while you style. The ${sub.s.name} is on the stage: ask me anything about it, or tell me to change the jewellery or show you another angle.`;
  return `You’re looking at the ${sub.s.name}. Ask me anything about it, or let me style a full look for you.`}
function act(a){try{parent.postMessage({type:'sd-act',act:a},location.origin)}catch(e){}}
function occVerdict(s,occ){
  occ=occ||profile.occasion;const N=NOTES[s.id];
  if(!occ)return `It is made for ${N.best}. Tell me your occasion and I will tell you honestly if it fits.`;
  const f=(OCC_FIT[occ]&&OCC_FIT[occ][s.id])||.4,lab=OCC_LABEL[occ].toLowerCase();
  if(f>=.8)return `Yes, it is a strong choice for ${lab}. It is made for ${N.best}.`;
  if(f>=.55)return `It works for ${lab}, though it is really made for ${N.best}. Style it ${s.feel==='heavy'?'lighter, with fewer ornaments,':'up with a statement piece'} to fit the day.`;
  const alt=SAREES.filter(x=>x.id!==s.id).sort((a,b)=>((OCC_FIT[occ]||{})[b.id]||0)-((OCC_FIT[occ]||{})[a.id]||0))[0];
  return `Honestly, it is not my first pick for ${lab}: it is made for ${N.best}. For ${lab} I would choose the **${alt.name}** in ${alt.tone.toLowerCase()}.`+(subject()&&subject().room?' Want me to put it on the stage?':'');
}
function aboutHere(text){
  const t=text.toLowerCase(),sub=subject();
  const named=SAREES.find(s=>t.includes(s.fabric.toLowerCase().split(' ')[0])&&!/ vs |versus|difference|compare/.test(t));
  const s=(named&&(!sub||sub.kind!=='saree'||sub.s.id!==named.id)&&/this|it\b/.test(t)===false)?named:(sub&&sub.kind==='saree'?sub.s:named);
  const room=!!(sub&&sub.room);
  // stage commands in the Styling Room
  if(room){
    const V=[[/\bback\b|behind/, 'back'],[/pallu|pallav/, 'pallu'],[/weave|fabric up close|texture|close[- ]?up of the (fabric|saree)/, 'detail'],[/close[- ]?up|closer|face|neckline/, 'close'],[/full view|full length|whole saree/, 'model'],[/(my|the|whole) look|everything (i|i've)|all (the )?pieces/, 'look']];
    if(/show|see|view|turn|let me|look at/.test(t)){for(const [re,v] of V)if(re.test(t)){const N=NOTES[sub.s.id];act({view:v});
      const say={back:N.back,pallu:N.pallu,detail:N.weave,close:N.blouse,model:N.one,look:`Here is everything on your look: the ${sub.s.name}${selIds(sub.sel).length?' with '+selIds(sub.sel).map(id=>ORN[id][1]).join(', '):''}, ${inr(here.stage.total||sub.s.eff)} in all.`}[v];
      return {text:say,cmd:true}}}
    if(/too much|too heavy|overdone|enough/.test(t)&&/\?|is (it|this)/.test(t)){const n=selIds(sub.sel).length;
      return n>=5&&sub.s.feel!=='heavy'?{text:`A little, yes. ${n} pieces on a ${sub.s.fabric.toLowerCase()} saree competes with it. I would keep earrings and bangles and drop the rest.`,chips:['Make it lighter','Show my look']}
        :n>=5?{text:`Not for this saree. ${sub.s.fabric} is rich enough to carry ${n} pieces; that is a proper ${sub.s.feel==='heavy'?'bridal':'festive'} look.`,chips:['Make it lighter','Show my look']}
        :{text:`No, ${n||'no'} piece${n===1?'':'s'} is balanced. ${n<2?'You could add a necklace for more presence.':''}`,chips:['Add a necklace','Show my look']}}
    if(/lighter|less jewel|less heavy|simpler|minimal|toned? down/.test(t)){
      const keep={};['earrings','bangles'].forEach(k=>{if(sub.sel[k])keep[k]=sub.sel[k]});if(!keep.earrings)keep.earrings=sub.s.combo.earrings||'OR00009';
      act({sel:keep});return {text:`Done. I have kept just ${selIds(keep).map(id=>'the '+ORN[id][1]).join(' and ')}. With ${sub.s.fabric.toLowerCase()} this lets the saree do the talking.`,cmd:true,chips:['Add a necklace back','Show my look','Is this right for my occasion?']}}
    if(/full (set|bridal|look)|heavier|grand|go all out|bridal set/.test(t)){act({sel:{...BRIDAL_SET}});return {text:`I have put the full seven-piece set on: necklace to waist belt. ${sub.s.feel==='heavy'?'This saree carries it well.':'On a lighter saree like this, a full set is a lot; consider skipping the waist belt and anklets.'}`,cmd:true,chips:['Make it lighter','Show my look','How much is it now?']}}
    for(const k in SLOT_WORDS){if(SLOT_WORDS[k].test(t)){
      if(/remove|no |without|skip|take (off|out)|drop/.test(t)&&sub.sel[k]){act({remove:[k]});return {text:`Removed the ${ORN[sub.sel[k]][1]}.`,cmd:true}}
      if(/different|another|swap|change|other|instead|next/.test(t)||(/add|put|give/.test(t))){const opts=SLOT_OPTS[k];const cur=sub.sel[k];const nx=opts[(opts.indexOf(cur)+1)%opts.length];act({set:{[k]:nx}});
        return {text:`Try the **${ORN[nx][1]}** (${inr(ORN[nx][2])}). ${cur?'Say “another” to keep going, or “back” to see it from behind.':'It is on your look now.'}`,cmd:true,chips:[`Another ${SLOT_LABEL[k].toLowerCase()}`,'Show my look','Make it lighter']}}
    }}
    if(/put (it|the|that)|try (it|the|that)|switch to|change (the )?saree/.test(t)&&named&&named.id!==sub.s.id){act({saree:named.id,view:'model'});return {text:`Here is the **${named.name}** in ${named.tone.toLowerCase()}. ${NOTES[named.id].one}`,cmd:true}}
  }
  if(sub&&sub.kind==='orn'&&/saree|go with|pair|match|wear with|suit/.test(t)){
    const k=ORN[sub.id][0];const with_=SAREES.filter(x=>x.combo[k]===sub.id);
    const list=with_.length?with_:SAREES.filter(x=>x.feel===(['OR00003','OR00001','OR00005','OR00020','OR00014'].includes(sub.id)?'heavy':'crisp'));
    return {text:`The **${ORN[sub.id][1]}** is paired with ${list.slice(0,3).map(x=>'the **'+x.name+'** ('+x.tone.toLowerCase()+')').join(', ')}. ${['OR00003','OR00001','OR00020','OR00014','OR00005'].includes(sub.id)?'It is a statement piece, so it belongs with a rich silk.':'It is light enough for everyday sarees too.'}`,chips:list.slice(0,2).map(x=>'Style the '+short(x))}
  }
  if(!room&&s&&/styling room|open it|try it on|style (it|this|the)/.test(t)){const tgt=/^style the /.test(t)&&named?named:s;const add=sub&&sub.kind==='orn'?{[ORN[sub.id][0]]:sub.id}:{};
    const sel={...tgt.combo,...add};setTimeout(()=>{try{(EMBED?top:window).location.href='styling-room.html?style='+tgt.id+'&sel='+Object.values(sel).join(',')}catch(e){}},500);return {text:`Opening the ${tgt.name} in the Styling Room.`,cmd:true}}
  if(!s)return null;
  const N=NOTES[s.id];
  {const up=parse(text);if(up.skinTone&&text.length<24){applyProfile(up);const c=colorFit(s,profile);return {text:(c.why||'')+(c.v<.7?` For more glow I would look at the ${SAREES.filter(x=>x.id!==s.id).sort((a,b)=>colorFit(b,profile).v-colorFit(a,profile).v)[0].name}.`:` The ${s.tone.toLowerCase()} will suit you.`)}}}
  if(/back/.test(t)&&/blouse/.test(t))return {text:N.back};
  if(/drape|wear it|pleat|how (do|to) (i )?(wear|tie)/.test(t))return {text:N.drape};
  if(/blouse|neck|sleeve/.test(t))return {text:N.blouse};
  if(/hair|bun|braid|jasmine/.test(t))return {text:`${/heavy/.test(s.feel)||/Kasavu/.test(s.fabric)?'A low bun or a braid with jasmine suits it':'Soft waves or a sleek low bun suits it'}. ${N.back}`};
  if(/wash|care|dry ?clean|clean|store|iron/.test(t))return {text:N.care};
  if(/heavy|weight|light|comfortable|hot|summer|all day|itchy/.test(t))return {text:N.feel};
  if(/pallu/.test(t))return {text:N.pallu};
  if(/weave|zari|texture|fabric|material|made/.test(t))return {text:N.weave};
  if(/real gold|gold plated|is it gold/.test(t))return null;
  if(/occasion|right for|good for|suit(able)? for|wear (it|this) (to|for)|office|wedding|party|temple|onam|reception|interview/.test(t)&&/\b(this|it|that|right for|good for|occasion)\b/.test(t)){const up=parse(text);return {text:occVerdict(s,up.occasion),chips:['What blouse goes with it?','Which ornaments suit it?','Show me something else']}}
  if(/jewel|ornament|necklace|earring|bangle|match|go with|pair/.test(t)){const ids=selIds(sub&&sub.s.id===s.id?sub.sel:s.combo);return {text:`${N.jewel}${ids.length?' '+(room?'On your look right now':'Our pairing')+': '+ids.map(id=>ORN[id][1]).join(', ')+'.':''}`,chips:room?['Make it lighter','Another necklace','Full bridal set']:['Open it in the Styling Room','Is it real gold?']}}
  if(/price|cost|how much|discount|offer|total|expensive|cheap/.test(t)){const x=room?here.stage.total:s.eff;return {text:`The ${s.name} is ${inr(s.eff)}${s.mrp>s.eff?` (down from ${inr(s.mrp)})`:''}.${room&&selIds(sub.sel).length?` With the ornaments on your look, it comes to ${inr(x)}${selIds(sub.sel).length>=2?', including 10% off the ornaments':''}.`:''}`}}
  if(/skin|colou?r|complexion|suit me|look good on me/.test(t)){if(!profile.skinTone)return {text:`Tell me your skin tone and I will tell you honestly how the ${s.tone.toLowerCase()} will look on you.`,chips:['Fair','Wheatish','Dusky','Deep']};const c=colorFit(s,profile);return {text:(c.why||'')+(c.v<.7?` If you want more glow, I would look at ${SAREES.filter(x=>x.id!==s.id).sort((a,b)=>colorFit(b,profile).v-colorFit(a,profile).v)[0].name}.`:'')}}
  if(/tall|short|petite|height|curvy|slim|plus/.test(t)){const up=parse(text);applyProfile(up);const b=bodyFit(s,profile);return {text:b.why||N.drape}}
  if(/tell me about|what is this|describe|about this|about it|details/.test(t))return {text:`**${s.name}, ${s.tone}.** ${N.one} ${N.feel.split('. ').slice(1).join('. ')}`};
  return null;
}
function stageNote(){
  const sub=subject();if(!sub||!sub.room)return;
  const sid=sub.s.id;if(sid===stageSid)return;const first=stageSid===null;stageSid=sid;
  if(first||noted[sid])return;
  if($('.sk-chat').classList.contains('is-empty'))return;
  noted[sid]=1;
  const c=profile.skinTone?colorFit(sub.s,profile):null;
  const occ=profile.occasion,f=occ&&OCC_FIT[occ]?OCC_FIT[occ][sid]||.4:null;
  const fit=f===null?'':f>=.8?` A strong pick for ${OCC_LABEL[occ].toLowerCase()}.`:f<.55?` Honestly, not my first pick for ${OCC_LABEL[occ].toLowerCase()}.`:'';
  say(`**${sub.s.name}, ${sub.s.tone}.** ${NOTES[sid].one}${fit}${c&&c.why?' '+c.why:''}`,{noHistory:true}).classList.add('note');
  chips(ctxQs());
}
addEventListener('message',e=>{
  if(e.origin!==location.origin||!e.data)return;
  if(e.data.type==='sd-context'&&!ROOM){here=e.data.ctx;renderHere()}
  if(e.data.type==='sd-stage'&&ROOM&&e.data.stage){here={section:'room',page:'styling-room',stage:e.data.stage};renderHere();stageNote()}
});

/* ---------- start ---------- */
const OPENERS={bridal:'Planning a wedding look? I can style the full seven-piece bridal set around your skin tone and height.',festive:'Getting ready for Onam or Vishu? Tell me a little about you and I will style a kasavu look that suits you.',celebrations:'Deepavali, Christmas or Perunnal? Let me find the evening saree that suits you best.',occasions:'Going to a party or reception? I will find something light, dressy and right for you.',everyday:'Looking for something for work or everyday? I will keep it comfortable and smart.',ornaments:'Choosing ornaments? Tell me the saree and the occasion, and I will style the pieces for you.'};
const OCC_FROM={bridal:'bride',festive:'onam-vishu',celebrations:'festival',occasions:'party',everyday:'office'};
function restart(){
  log.innerHTML='';history=[];shown=[];looks={};quiz=null;
  profile={};store.set('sd-sakhi-profile',profile);renderProfile();greet(true);
}
const HELLO={bridal:'Planning your wedding look? I will style the full bridal set around you.',festive:'Getting ready for Onam or Vishu? Let me style a kasavu look for you.',celebrations:'Deepavali, Christmas or Perunnal? I will find your evening saree.',occasions:'Party or reception? I will find something light, dressy and right for you.',everyday:'Something for work or everyday? I will keep it comfortable and smart.',ornaments:'Choosing ornaments? Tell me the saree and occasion and I will style them.'};
const I_SPARK='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5l1.9 5.1 5.1 1.9-5.1 1.9L12 17.5l-1.9-5.1L5 10.5l5.1-1.9z"/><path d="M18.5 15.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/></svg>';
const I_PIC='<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><circle cx="9" cy="10" r="1.8"/><path d="M4 17l5-4.5 4 3.5 3-2.5 4 3.5"/></svg>';
const I_FACE='<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M9 14.5c.8.9 1.8 1.4 3 1.4s2.2-.5 3-1.4"/><path d="M9.2 10h.01M14.8 10h.01" stroke-width="2.4" stroke-linecap="round"/></svg>';
const I_GO='<svg class="ha-go" viewBox="0 0 24 24" aria-hidden="true"><path d="M9.5 6l6 6-6 6"/></svg>';
function hideHello(){const h=log.querySelector('.sk-hello');if(h)h.remove();const st=$('#starters');if(st)st.innerHTML='';const c=$('.sk-chat');if(c)c.classList.remove('is-empty')}
function hello(back){
  const d=document.createElement('div');d.className='sk-hello';
  const summary=[profile.occasion&&OCC_LABEL[profile.occasion],profile.skinTone&&TONE(profile.skinTone)&&TONE(profile.skinTone).label.toLowerCase()+' skin'].filter(Boolean).join(', ');
  d.innerHTML=`<h1>${back?'Welcome back':'What are we dressing for?'}</h1>
   <p>${!back&&hereHello()?esc(hereHello()):back?(summary?'Last time: '+esc(summary)+'. Pick up there, or start something new.':'Pick up where we left off, or start something new.'):esc(HELLO[FROM]||'I’m Sakhi, your personal stylist. I’ll put together the saree, the ornaments and how to wear it.')}</p>`;
  log.appendChild(d);
  const acts=back
    ?[['Restyle me','Show my looks again',I_SPARK],['Style a new look','Style a new look',I_SPARK],['Match an inspiration photo','Match a photo',I_PIC]]
    :[['Find my look','Style my look',I_SPARK],['Match an inspiration photo','Match a photo',I_PIC],['Read my skin tone from a selfie','Find my colours',I_FACE]];
  const qs=ctxQs().length?ctxQs():['What suits dusky skin?','Kanjivaram vs Banarasi?','How do I care for silk?'];
  $('#starters').innerHTML=acts.map(([c,l,i])=>`<button class="starter" data-chip="${esc(c)}" type="button">${i}${esc(l)}</button>`).join('')
    +qs.map(q=>`<button class="starter q" data-chip="${esc(q)}" type="button">${esc(q)}</button>`).join('');
  $('.sk-chat').classList.add('is-empty');
}
function greet(fresh){
  const back=!fresh&&Object.keys(profile).some(k=>profile[k]);
  if(!back&&OCC_FROM[FROM]&&!profile.occasion){profile.occasion=OCC_FROM[FROM];saveProfile()}
  hello(back);chips([]);
  history.push({role:'assistant',content:back?'Welcome back. Shall I restyle you, or is there something new?':"Hello, I'm Sakhi, your Sopanam stylist. I can style a complete look or answer anything about sarees."});
}
document.addEventListener('click',e=>{const b=e.target.closest('[data-chip="Restyle me"]');if(b){e.stopImmediatePropagation();hideHello();chips([]);me('Show my looks');styleNow()}},true);
if(EMBED&&!ROOM){$('#closeEmbed').hidden=false}
if(ROOM){document.documentElement.classList.add('room');addEventListener('message',e=>{if(e.origin===location.origin&&e.data&&e.data.type==='sd-stage')stage=String(e.data.text||'')})}
document.body.classList.add('sk-page');
{const sc=document.createElement('div');sc.id='sideScrim';sc.className='sk-side-scrim';sc.hidden=true;sc.addEventListener('click',()=>toggleSide(false));document.body.appendChild(sc)}
function setHH(){const h=document.querySelector('.site-head');document.documentElement.style.setProperty('--hh',(EMBED||!h?0:h.getBoundingClientRect().height)+'px')}
setHH();addEventListener('resize',setHH);
renderProfile();renderBag();greet(false);renderHere();
})();
