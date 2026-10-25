var turnstileWidget=null;
window.adaptixTurnstile=function(){var el=document.getElementById('turnstile');if(!el||!window.turnstile)return;
var size=el.clientWidth>=300?'flexible':'compact';
turnstileWidget=window.turnstile.render(el,{sitekey:el.getAttribute('data-sitekey'),theme:'light',size:size})};
(function(){var f=document.getElementById('enquiry');if(!f)return;
var ok=document.getElementById('ok'),err=document.getElementById('err'),btn=f.querySelector('button[type=submit]');
var messages={busy:'Too many enquiries from this connection. Please try again later.',check:'The security check failed. Please try again.',invalid:'Please check the highlighted fields and try again.',network:'Your enquiry did not send. Check your connection and try again, or email <a href="mailto:hello@adaptix.uk" style="color:inherit;font-weight:600;text-decoration:underline">hello@adaptix.uk</a>.'};
function show(el,text,html){ok.hidden=true;err.hidden=true;if(html)el.innerHTML=html;else if(text)el.textContent=text;el.hidden=false;el.scrollIntoView({block:'nearest',behavior:'smooth'})}
var q=new URLSearchParams(location.search);
if(q.get('sent'))show(ok);else if(q.get('error'))show(err,null,messages[q.get('error')]||messages.invalid);
f.addEventListener('submit',function(e){e.preventDefault();btn.disabled=true;var label=btn.textContent;btn.textContent='Sending\u2026';
fetch(f.action,{method:'POST',headers:{accept:'application/json'},body:new URLSearchParams(new FormData(f))})
.then(function(r){return r.json().catch(function(){return {ok:false}})})
.then(function(body){if(body.ok){f.reset();show(ok);return}
var m=body.error;if(!m&&body.errors){var k=Object.keys(body.errors)[0];m=body.errors[k]}if(m)show(err,m);else show(err,null,messages.network)})
.catch(function(){show(err,null,messages.network)})
.then(function(){btn.disabled=false;btn.textContent=label;if(window.turnstile&&turnstileWidget!==null)window.turnstile.reset(turnstileWidget)})});})();

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
