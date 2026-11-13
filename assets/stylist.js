/* Sakhi, the Sopanam Drapes stylist.
   Works in two layers: an on-device styling engine (always on, instant) and the AI stylist at /api/chat
   for open questions. If the AI is unreachable, the engine answers on its own. */
(function(){
'use strict';
const $=s=>document.querySelector(s), inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const qs=new URLSearchParams(location.search), EMBED=qs.get('embed')==='1', FROM=qs.get('from')||'';
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
function chips(list){$('#chips').innerHTML=(list||[]).map(c=>`<button class="chip" data-chip="${esc(c)}">${esc(c)}</button>`).join('')}

function lookCard(L,key){
  const s=L.s,t=totals(s,L.sel);
  looks[key]=L;
  const pieces=SLOTS.filter(([k])=>L.sel[k]).map(([k,l])=>{const id=L.sel[k],o=ORN[id];
    return `<button class="piece" data-swap="${key}|${k}" title="Tap to try another ${l.toLowerCase()}"><img src="img/orn/${id}-s.jpg" alt="" loading="lazy"><span>${esc(o[1])}<small>${l} · ${inr(o[2])}</small></span></button>`}).join('');
  const isSaved=saved.some(x=>x.key===sig(L));
  return `<article class="lk" data-key="${key}">
   <div class="ph"><img src="img/${s.id}.jpg" alt="${esc(s.name+', '+s.tone)}" loading="lazy"></div>
   <div class="bd">
    <div><div class="rank">${L.rank===0?'<b>Best match</b> · ':''}${L.match}% match for you</div>
    <h4>${esc(s.name)}, ${esc(s.tone)}</h4><div class="sub">${esc(s.fabric)} · ${esc(s.blouse)}${s.stock<=14?' · only '+s.stock+' left':''}</div></div>
    <div class="two">
     <div><h5>Why it suits you</h5><ul>${L.why.map(w=>`<li>${esc(w)}</li>`).join('')}</ul></div>
     <div><h5>How to wear it</h5><ul>${L.tips.map(w=>`<li>${esc(w)}</li>`).join('')}</ul></div>
    </div>
    ${pieces?`<div><h5>Ornaments Sakhi picked · tap one to swap</h5><div class="pieces">${pieces}</div></div>`:''}
    <div class="tot"><span>Saree ${inr(s.eff)}${t.ids.length?' + '+t.ids.length+' ornament'+(t.ids.length>1?'s':''):''}</span><b>${inr(t.total)}</b>${t.save||t.mrpSave?`<span class="sv">You save ${inr(t.save+t.mrpSave)}</span>`:''}${t.save?'<span class="tn">Includes 10% off ornaments for styling them as a look.</span>':''}${L.notes.map(n=>`<span class="tn">${esc(n)}</span>`).join('')}</div>
    <div class="acts"><button class="btn small" data-addlook="${key}">Add look to bag</button><button class="iconbtn" data-save="${key}" aria-pressed="${isSaved}">${isSaved?'Saved':'Save look'}</button><button class="iconbtn" data-share="${key}">Share on WhatsApp</button><a class="iconbtn" href="index.html?style=${s.id}#builder" target="${EMBED?'_top':'_self'}">Open in builder</a></div>
   </div></article>`;
}
let lookSeq=0;
function showLooks(list,intro){
  if(intro)say(intro);
  const wrap=document.createElement('div');wrap.className='looks';
  wrap.innerHTML=list.map(L=>lookCard(L,'L'+(++lookSeq))).join('');
  log.appendChild(wrap);
  list.forEach(L=>{if(!shown.includes(L.s.id))shown.push(L.s.id)});
  history.push({role:'assistant',content:'[Showed looks: '+list.map(L=>L.s.name+' '+L.s.tone+' with '+Object.values(L.sel).map(id=>ORN[id][1]).join(', ')+' = '+inr(totals(L.s,L.sel).total)).join(' | ')+']'});
  scrollDown();
}
const sig=L=>L.s.id+':'+Object.values(L.sel).sort().join(',');

/* ---------- guided flow ---------- */
const STEPS=['occasion','skinTone','undertone','heightCm','build','jewellery','budget'];
function startQuiz(fromStep){
  quiz={i:fromStep?STEPS.indexOf(fromStep):0,single:!!fromStep};
  nextStep();
}
function nextStep(){
  if(!quiz)return;
  while(quiz.i<STEPS.length&&!quiz.single&&profile[STEPS[quiz.i]]!==undefined)quiz.i++;
  if(quiz.i>=STEPS.length){quiz=null;return styleNow()}
  renderStep(STEPS[quiz.i]);
}
function stepShell(title,note,body,skip){
  const d=document.createElement('div');d.className='step';
  d.innerHTML=`<h3>${title}</h3>${note?`<p class="q-note">${note}</p>`:''}${body}${skip?`<div class="row-act"><button class="opt link" data-skip="1">Skip this</button></div>`:''}`;
  log.appendChild(d);scrollDown();return d;
}
function renderStep(k){
  chips([]);
  if(k==='occasion')stepShell('What is the occasion?','I will match the saree and how much jewellery to wear.',`<div class="opts">${OCC.map(o=>`<button class="opt" data-ans="occasion|${o.k}">${o.label}<small>${o.note}</small></button>`).join('')}</div>`);
  if(k==='skinTone')stepShell('Which is closest to your skin tone?','Every tone is beautiful. This just tells me which shades will make yours glow.',`<div class="tones">${TONES.map(t=>`<button class="tone" data-ans="skinTone|${t.k}"><span style="background:${t.hex}"></span>${t.label}</button>`).join('')}</div><div class="row-act"><button class="opt" data-photo="skin">Read it from a selfie instead</button><button class="opt link" data-skip="1">Skip this</button></div>`);
  if(k==='undertone')stepShell('Which looks better on you, gold or silver?','A quick way to read your undertone.',`<div class="opts"><button class="opt" data-ans="undertone|warm">Gold<small>Warm undertone</small></button><button class="opt" data-ans="undertone|cool">Silver<small>Cool undertone</small></button><button class="opt" data-ans="undertone|neutral">Both look fine<small>Neutral</small></button></div>`,true);
  if(k==='heightCm'){const v=profile.heightCm||160;const d=stepShell('How tall are you?','Height decides border width and how to wear the pallu.',`<div class="height"><output id="hOut">${fmtH(v)}</output><input type="range" id="hRange" min="140" max="190" step="1" value="${v}" aria-label="Height in centimetres"><div class="scale"><span>4′7″</span><span>5′3″</span><span>6′3″</span></div></div><div class="row-act"><button class="btn small" data-hset="1">That is me</button><button class="opt link" data-skip="1">Skip this</button></div>`);
    const r=d.querySelector('#hRange');r.addEventListener('input',()=>{d.querySelector('#hOut').textContent=fmtH(+r.value)});r.removeAttribute('id');d.querySelector('#hOut').removeAttribute('id');d.querySelector('[data-hset]').dataset.hset='x';d._range=r;}
  if(k==='build')stepShell('How would you describe your build?','Optional. It helps me choose between fluid and structured fabrics.',`<div class="opts">${BUILDS.map(b=>`<button class="opt" data-ans="build|${b.k}">${b.label}</button>`).join('')}</div>`,true);
  if(k==='jewellery')stepShell('What jewellery do you love?','I will style the ornaments in this direction.',`<div class="opts">${JEWEL.map(j=>`<button class="opt" data-ans="jewellery|${j.k}">${j.label}<small>${j.note}</small></button>`).join('')}<button class="opt" data-ans="jewellery|">Surprise me<small>Sakhi decides</small></button></div>`);
  if(k==='budget')stepShell('What is your budget for the full look?','Saree and ornaments together.',`<div class="opts">${BUDGETS.map(b=>`<button class="opt" data-ans="budget|${b.k}">${b.label}</button>`).join('')}</div>`);
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
  const step=el&&el.closest('.step');
  if(step){step.querySelectorAll('button').forEach(b=>{b.disabled=true;if(b===el)b.setAttribute('aria-pressed','true')})}
  if(v===null){profile[k]=null;me('Skip')}else{profile[k]=v;me(labelFor(k,v))}
  saveProfile();
  if(quiz&&quiz.single){quiz=null;return styleNow('Updated. Here is your restyled edit.')}
  if(quiz){quiz.i++;setTimeout(nextStep,reduce?0:260)}
}
async function styleNow(intro){
  chips([]);
  const t=typing();await wait(700);t.remove();
  const p={...profile};
  const list=recommend(p);
  const tone=p.skinTone?TONE(p.skinTone).label.toLowerCase()+' skin':'';
  const bits=[p.occasion?OCC_LABEL[p.occasion].toLowerCase():null,tone,p.heightCm?fmtH(p.heightCm).split(' · ')[0]:null,p.budget?'under '+inr(p.budget):null].filter(Boolean);
  showLooks(list,intro||(`Here is your edit${bits.length?' for '+bits.join(', '):''}. I ranked every saree on colour, fabric and occasion, then styled the ornaments to match.`));
  chips(['Show me other options','Make it cheaper','Lighter jewellery','Go full bridal','How do I drape it?']);
}

/* ---------- AI ---------- */
async function askAI(text,image){
  const payload={messages:history.slice(-14),profile,page:FROM,shown};
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
  quiz=null;chips([]);
  me(text||'Here is a look I like.',image);
  history.push({role:'user',content:text||'Find the closest look to this photo in your collection and explain.',image:image||undefined});
  const local=parse(text||'');
  const changed=applyProfile(local);
  const t=typing();
  const ai=await askAI(text,image);
  t.remove();
  if(ai){
    applyProfile(ai.profile);
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
const defaultChips=()=>profile.occasion?['Show me other options','Make it cheaper','How do I drape it?','What blouse should I wear?']:['Find my look','Match an inspiration photo','What suits dusky skin?','What is your return policy?'];
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
    const step=[...log.querySelectorAll('.step')].pop();if(step)step.querySelectorAll('button').forEach(b=>b.disabled=true);
    profile.skinTone=r.tone;profile.undertone=r.under;saveProfile();
    me('Read from my selfie: '+TONE(r.tone).label+', '+r.under+' undertone');
    say(`Your skin reads as **${TONE(r.tone).label.toLowerCase()}** with a **${r.under}** undertone. ${r.under==='warm'?'Yellow gold will glow on you.':r.under==='cool'?'Pearl, polki and silver tones will look lovely, and jewel colours suit you.':'You can wear both gold and silver tones.'} You can change this any time in your profile.`);
    if(quiz){quiz.i=STEPS.indexOf('heightCm');nextStep()}else if(profile.occasion)styleNow();else startQuiz();
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
function renderProfile(){
  const rows=[['occasion','Occasion'],['skinTone','Skin tone'],['undertone','Undertone'],['heightCm','Height'],['build','Build'],['jewellery','Jewellery'],['budget','Budget']];
  $('#prof').innerHTML=rows.map(([k,l])=>{const v=profile[k];let txt=v===undefined||v===null||v===''?'<span style="color:var(--muted)">Not set</span>':esc(labelFor(k,v));
    if(k==='skinTone'&&v)txt=`<span><span class="sw" style="background:${TONE(v).hex}"></span>${txt}</span>`;
    return `<div><dt>${l}</dt><dd>${txt}<button data-edit="${k}">${v?'Change':'Add'}</button></dd></div>`}).join('');
  $('#saved').innerHTML=saved.length?saved.map((x,i)=>`<div class="sl"><img src="img/${x.sid}.jpg" alt=""><div>${esc(x.title)}<small>${inr(x.total)} · ${x.n} pieces</small></div><button data-unsave="${i}">Remove</button></div>`).join(''):'<p class="none">Save a look and it will wait for you here.</p>';
}
function toggleSide(o){const side=$('#skSide');side.classList.toggle('open',o);$('#profileBtn').setAttribute('aria-expanded',o);if(o&&!side.querySelector('.sk-close')){const b=document.createElement('button');b.className='btn small ghost sk-close';b.textContent='Back to chat';b.style.marginBottom='16px';b.addEventListener('click',()=>toggleSide(false));side.querySelector('.sk-side-in').prepend(b)}}

/* ---------- bag ---------- */
function renderBag(){
  const n=bag.length,c=$('#bagCount');c.textContent=n;c.hidden=!n;
  $('#bagSub').textContent=n?n+(n===1?' item':' items'):'';
  if(!n){$('#bagItems').innerHTML='<div class="empty">Your bag is empty. Ask Sakhi for a look and add it here.</div>';$('#bagFoot').innerHTML='';return}
  $('#bagItems').innerHTML=bag.map((b,i)=>{const s=b.sid?S(b.sid):null;const img=s?`img/${s.id}.jpg`:`img/orn/${b.oid}-s.jpg`;const title=s?s.name+', '+s.tone:b.names[0];
    return `<div class="bi"><div><img src="${img}" alt=""></div><div><div class="t">${esc(title)}</div><div class="d">${esc((b.names||[]).join(', ')||'Saree only')}</div><div class="f"><span>${inr(b.total)}</span><button data-remove="${i}">Remove</button></div></div></div>`}).join('');
  $('#bagFoot').innerHTML=`<div class="row total"><span>Subtotal</span><span>${inr(bag.reduce((a,b)=>a+b.total,0))}</span></div><button class="btn" style="width:100%;justify-content:center;margin-top:12px" data-checkout>Continue to checkout</button>`;
}
function openBag(o){$('#bag').hidden=!o;$('#scrim').hidden=!o}
function notifyParent(){try{if(EMBED&&parent!==window)parent.postMessage({type:'sd-bag'},location.origin)}catch(e){}}
function toast(msg){const t=$('#toast');t.textContent=msg;t.hidden=false;clearTimeout(toast.h);toast.h=setTimeout(()=>t.hidden=true,2600)}

/* ---------- events ---------- */
document.addEventListener('click',e=>{
  const b=e.target.closest('button');if(!b)return;
  const d=b.dataset;
  if(d.ans){const [k,v]=d.ans.split('|');answer(k,k==='budget'?+v:v===''&&k==='jewellery'?'':v,b);return}
  if(d.skip){const k=STEPS[quiz?quiz.i:0];answer(k,null,b);return}
  if(d.hset){const step=b.closest('.step');answer('heightCm',+step._range.value,b);return}
  if(d.photo){openPhoto(d.photo);return}
  if(d.chip){const c=d.chip;
    if(c==='Find my look'){chips([]);me('Find my look');say('Wonderful. A few quick questions and I will put together your looks.');startQuiz();return}
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
    const card=b.closest('.lk');const tmp=document.createElement('div');tmp.innerHTML=lookCard(L,key);card.replaceWith(tmp.firstElementChild);return}
  if(d.addlook){const L=looks[d.addlook],t=totals(L.s,L.sel);bag.push({sid:L.s.id,names:t.ids.map(id=>ORN[id][1]),total:t.total});store.set('sd-bag',bag);renderBag();notifyParent();toast('Look added to your bag');return}
  if(d.save){const L=looks[d.save],k=sig(L),i=saved.findIndex(x=>x.key===k);
    if(i>=0){saved.splice(i,1);b.setAttribute('aria-pressed','false');b.textContent='Save look'}else{const t=totals(L.s,L.sel);saved.unshift({key:k,sid:L.s.id,title:L.s.name+', '+L.s.tone,total:t.total,n:t.ids.length+1,sel:L.sel});b.setAttribute('aria-pressed','true');b.textContent='Saved';toast('Saved to your profile')}
    store.set('sd-sakhi-saved',saved);renderProfile();return}
  if(d.share){const L=looks[d.share],t=totals(L.s,L.sel);const txt=`My look from Sopanam Drapes, styled by Sakhi:\n${L.s.name}, ${L.s.tone} (${inr(L.s.eff)})\n${t.ids.map(id=>'+ '+ORN[id][1]).join('\n')}\nFull look: ${inr(t.total)}\n${location.origin}/index.html?style=${L.s.id}`;window.open('https://wa.me/?text='+encodeURIComponent(txt),'_blank','noopener');return}
  if(d.edit){toggleSide(false);me('Change my '+d.edit.replace('Cm','').replace(/([A-Z])/g,' $1').toLowerCase());startQuiz(d.edit);return}
  if(d.unsave){saved.splice(+d.unsave,1);store.set('sd-sakhi-saved',saved);renderProfile();return}
  if(d.remove){bag.splice(+d.remove,1);store.set('sd-bag',bag);renderBag();notifyParent();return}
  if('checkout' in d){toast('Checkout is the next build phase');return}
  if(d.mode){pm.mode=d.mode;$('#pmFile').click();return}
  switch(b.id){
    case 'restartBtn':if(confirmRestart())restart();return;
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
$('#form').addEventListener('submit',e=>{e.preventDefault();const v=$('#msg').value;$('#msg').value='';send(v)});

// voice input, en-IN
const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
if(SR){const mic=$('#micBtn');mic.hidden=false;let rec=null;
  mic.addEventListener('click',()=>{
    if(rec){rec.stop();return}
    rec=new SR();rec.lang='en-IN';rec.interimResults=true;mic.setAttribute('aria-pressed','true');
    rec.onresult=ev=>{$('#msg').value=[...ev.results].map(r=>r[0].transcript).join('');if(ev.results[ev.results.length-1].isFinal){const v=$('#msg').value;$('#msg').value='';send(v)}};
    rec.onend=()=>{rec=null;mic.setAttribute('aria-pressed','false')};rec.onerror=()=>{rec=null;mic.setAttribute('aria-pressed','false')};rec.start();
  })}

/* ---------- start ---------- */
const OPENERS={bridal:'Planning a wedding look? I can style the full seven-piece bridal set around your skin tone and height.',festive:'Getting ready for Onam or Vishu? Tell me a little about you and I will style a kasavu look that suits you.',celebrations:'Deepavali, Christmas or Perunnal? Let me find the evening saree that suits you best.',occasions:'Going to a party or reception? I will find something light, dressy and right for you.',everyday:'Looking for something for work or everyday? I will keep it comfortable and smart.',ornaments:'Choosing ornaments? Tell me the saree and the occasion, and I will style the pieces for you.'};
const OCC_FROM={bridal:'bride',festive:'onam-vishu',celebrations:'festival',occasions:'party',everyday:'office'};
function restart(){
  log.innerHTML='';history=[];shown=[];looks={};quiz=null;
  profile={};store.set('sd-sakhi-profile',profile);renderProfile();greet(true);
}
function greet(fresh){
  const back=!fresh&&Object.keys(profile).some(k=>profile[k]);
  if(back){
    say(`Welcome back. I still have your details${profile.occasion?' for '+OCC_LABEL[profile.occasion].toLowerCase():''}. Shall I restyle you, or is there something new?`);
    chips(['Restyle me','Find my look','Match an inspiration photo','What is your return policy?']);
    return;
  }
  say("Hello, I'm **Sakhi**, your Sopanam stylist.\n\n"+(OPENERS[FROM]||'Tell me the occasion, your skin tone and height, and I will style a complete look from our collection: the saree, the ornaments, the drape and the blouse. Or ask me anything about sarees.'));
  if(OCC_FROM[FROM]&&!profile.occasion){profile.occasion=OCC_FROM[FROM];saveProfile()}
  chips(['Find my look','Match an inspiration photo','Read my skin tone from a selfie','What suits dusky skin?','Kanjivaram vs Banarasi?']);
}
document.addEventListener('click',e=>{const b=e.target.closest('[data-chip="Restyle me"]');if(b){e.stopImmediatePropagation();chips([]);me('Restyle me');styleNow()}},true);
if(EMBED){$('#closeEmbed').hidden=false}
document.body.classList.add('sk-page');
function setHH(){const h=document.querySelector('.site-head');document.documentElement.style.setProperty('--hh',(EMBED||!h?0:h.getBoundingClientRect().height)+'px')}
setHH();addEventListener('resize',setHH);
renderProfile();renderBag();greet(false);
})();
