const CACHE_NAME = 'eosphorus-labyrinth-trial-v3';
const FILES = ['./','./index.html','./style.css','./app.js?v=3','./vault.js','./manifest.webmanifest','./icon.svg','./icon.png','./icon-512.png'];
self.addEventListener('install', event=>{
  event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(FILES)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('eosphorus-labyrinth-trial-')&&key!==CACHE_NAME).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',event=>{
  const req=event.request;
  if(req.method!=='GET' || new URL(req.url).origin!==self.location.origin) return;
  event.respondWith(caches.match(req).then(cached=>cached||fetch(req).then(response=>{
    if(response.ok && response.type==='basic') {
      const copy=response.clone();caches.open(CACHE_NAME).then(cache=>cache.put(req,copy));
    }
    return response;
  })));
});
