/* Puts "Ask Sakhi" on every store page and opens the stylist in a side drawer. */
(function(){
  var page=(location.pathname.split('/').pop()||'index.html').replace('.html','')||'index';
  var lines={bridal:'Style my bridal look',festive:'Style my Onam look',celebrations:'Style my festive look',occasions:'Style my party look',everyday:'Style my office look',ornaments:'Help me pick ornaments'};
  var css=document.createElement('link');css.rel='stylesheet';css.href='assets/stylist.css';document.head.appendChild(css);
  // add Stylist to the main nav
  var nav=document.getElementById('mainNav');
  if(nav&&!nav.querySelector('a[href="stylist.html"]')){var a=document.createElement('a');a.href='stylist.html';a.textContent='Stylist';nav.appendChild(a)}
  var btn=document.createElement('button');btn.className='sk-launch';btn.type='button';btn.setAttribute('aria-haspopup','dialog');
  btn.innerHTML='<span class="mono" aria-hidden="true">S</span><span class="txt">Ask Sakhi<small>'+(lines[page]||'Your personal stylist')+'</small></span>';
  btn.setAttribute('aria-label','Ask Sakhi, your personal stylist');
  document.body.appendChild(btn);
  var drawer=null,scrim=null;
  function open(){
    if(innerWidth<600){location.href='stylist.html?from='+page;return}
    scrim=document.createElement('div');scrim.className='sk-dscrim';scrim.addEventListener('click',close);
    drawer=document.createElement('div');drawer.className='sk-drawer';drawer.setAttribute('role','dialog');drawer.setAttribute('aria-label','Sakhi, your stylist');
    var th=document.documentElement.dataset.theme;
    drawer.innerHTML='<iframe title="Sakhi, your stylist" src="stylist.html?embed=1&from='+page+(th?'&theme='+th:'')+'"></iframe>';
    document.body.appendChild(scrim);document.body.appendChild(drawer);btn.hidden=true;
    document.documentElement.style.overflow='hidden';
    setTimeout(function(){try{drawer.querySelector('iframe').focus()}catch(e){}},50);
  }
  function close(){if(drawer){drawer.remove();scrim.remove();drawer=scrim=null;btn.hidden=false;document.documentElement.style.overflow='';btn.focus()}}
  btn.addEventListener('click',open);
  document.addEventListener('keydown',function(e){if(e.key==='Escape'&&drawer)close()});
  addEventListener('message',function(e){
    if(e.origin!==location.origin||!e.data)return;
    if(e.data.type==='sd-close')close();
    if(e.data.type==='sd-bag'){
      try{var fresh=JSON.parse(localStorage.getItem('sd-bag')||'[]');if(typeof bag!=='undefined'){bag.length=0;Array.prototype.push.apply(bag,fresh)}if(typeof renderBag==='function')renderBag()}catch(err){}
    }
  });
})();
