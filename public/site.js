(function(){var f=document.getElementById('enquiry');if(!f)return;var ok=document.getElementById('ok'),err=document.getElementById('err'),btn=f.querySelector('button[type=submit]');
f.addEventListener('submit',function(e){e.preventDefault();if(f.elements.website&&f.elements.website.value)return;ok.hidden=true;err.hidden=true;btn.disabled=true;var label=btn.textContent;btn.textContent='Sending\u2026';
var d=new FormData(f);d.delete('website');
fetch(f.action,{method:'POST',mode:'no-cors',body:new URLSearchParams(d)}).then(function(){f.reset();ok.hidden=false;ok.scrollIntoView({block:'nearest',behavior:'smooth'})}).catch(function(){err.hidden=false}).then(function(){btn.disabled=false;btn.textContent=label})});})();

(function(){var b=document.querySelector('.menu'),n=document.getElementById('nav');if(!b||!n)return;
function set(o){n.classList.toggle('open',o);b.setAttribute('aria-expanded',o?'true':'false')}
b.addEventListener('click',function(){set(!n.classList.contains('open'))});
n.addEventListener('click',function(e){if(e.target.closest('a'))set(false)});
document.addEventListener('keydown',function(e){if(e.key==='Escape'&&n.classList.contains('open')){set(false);b.focus()}});})();

(function(){var r=document.querySelector('.rot');if(!r)return;var s=r.firstElementChild,ws=[].slice.call(s.children),i=0;
function w(el){var g=document.createRange();g.selectNodeContents(el);return g.getBoundingClientRect().width}
function fit(){r.style.width=Math.ceil(w(ws[i]))+'px'}
if(matchMedia('(prefers-reduced-motion: reduce)').matches){r.classList.add('js');fit();if(document.fonts)document.fonts.ready.then(fit);return}
r.classList.add('js');fit();if(document.fonts)document.fonts.ready.then(fit);window.addEventListener('resize',fit);
setInterval(function(){i++;s.style.transform='translateY(-'+(i*1.65)+'em)';fit();
if(i===ws.length-1){setTimeout(function(){s.style.transition='none';s.style.transform='none';i=0;void s.offsetHeight;s.style.transition=''},520)}},2500);})();
