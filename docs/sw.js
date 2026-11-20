const CACHE='dtrading-mobile-v7-share-report';
const APP=['./','./index.html','./styles.css','./app.js','./mobile_form.js','./mobile_form.css','./mobile_tools.js','./mobile_tools.css','./manifest.webmanifest','./icon.svg'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(APP)));self.skipWaiting()});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));self.clients.claim()});
self.addEventListener('fetch',e=>{
  const u=new URL(e.request.url);
  if(e.request.method!=='GET'||u.origin!==self.location.origin)return;
  if(u.pathname.includes('/api/'))return;
  e.respondWith(fetch(e.request).then(res=>{
    if(res.ok&&res.type==='basic'){const clone=res.clone();caches.open(CACHE).then(c=>c.put(e.request,clone)).catch(()=>{})}
    return res
  }).catch(()=>caches.match(e.request).then(r=>r|| (e.request.mode==='navigate'?caches.match('./index.html'):Response.error()))));
});
