/* SecurGest — service worker (offline + caricamento veloce)
   Da caricare nella STESSA cartella di index.html sul repo GitHub.
   Per forzare un aggiornamento dopo modifiche importanti: cambia il numero di versione qui sotto (es. v1 -> v2). */
const CACHE = 'securgest-v2';

// Risorse da mettere in cache all'installazione (la "shell" dell'app)
const PRECACHE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2'
];

// CDN di cui mettere in cache le risorse statiche (librerie, font)
const CDN = [/cdn\.jsdelivr\.net/, /cdnjs\.cloudflare\.com/, /fonts\.googleapis\.com/, /fonts\.gstatic\.com/];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then((c) => Promise.allSettled(PRECACHE.map((u) => c.add(u))))
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;

  // Solo richieste GET vengono gestite/cachate. POST/PATCH/DELETE -> direttamente in rete.
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // I dati Supabase NON vengono mai messi in cache: sempre dalla rete (dati freschi, salvataggi affidabili).
  if (url.hostname.endsWith('supabase.co')) return;

  // Navigazione / pagine HTML: prima la rete, con fallback alla cache.
  // Così online prendi sempre l'ultima versione, offline l'app si apre comunque.
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const net = await fetch(req);
        const cache = await caches.open(CACHE);
        cache.put('./index.html', net.clone());
        return net;
      } catch (err) {
        return (await caches.match(req)) || (await caches.match('./index.html')) || (await caches.match('./')) || Response.error();
      }
    })());
    return;
  }

  const sameOrigin = url.origin === self.location.origin;
  const isCDN = CDN.some((re) => re.test(url.href));

  // Risorse statiche (stesso dominio o CDN note): stale-while-revalidate.
  // Risponde dalla cache se c'è (veloce/offline) e aggiorna in background.
  if (sameOrigin || isCDN) {
    e.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const cached = await cache.match(req);
      const network = fetch(req).then((res) => {
        if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
        return res;
      }).catch(() => null);
      return cached || (await network) || fetch(req);
    })());
  }
});
