// QuoteStudio - Service Worker
// Timestamp: 2026-06-22T00:00:00Z
var CACHE = "visioffer-v12";
var INDEX = "index.html";

self.addEventListener("install", function(e) {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then(function(cache) {
      return Promise.all([
        "index.html",
        "manifest.json",
        "icon192.png",
        "icon512.png",
        "appletouchicon.png"
      ].map(function(url) {
        return cache.add(url).catch(function(err) {
          console.log("SW cache skip:", url, err);
        });
      }));
    })
  );
});

self.addEventListener("activate", function(e) {
  e.waitUntil(
    // Verwijder ALLE oude caches, niet alleen de vorige versie
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(k) { return k !== CACHE; })
            .map(function(k) {
              console.log("SW: verwijder oude cache:", k);
              return caches.delete(k);
            })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener("fetch", function(e) {
  var req = e.request;
  var url = req.url;

  // Alleen GET komt door de SW. De  API ondersteunt geen POST/PUT/DELETE
  // ("Request method 'POST' is unsupported") — die requests moeten dus
  // rechtstreeks naar het netwerk, zonder tussenkomst.
  if(req.method !== "GET") return;

  // Externe diensten: nooit via SW
  if(url.includes("supabase.co") ||
     url.includes("api.anthropic.com") ||
     url.includes("workers.dev") ||
     url.includes("googleapis.com")) {
    return;
  }

  // Navigatie naar een echt bestaand bestand (bv. sign.html) NIET omleiden naar index.html.
  // Alleen "kale" app-navigatie (root of index.html) krijgt de SPA-fallback.
  if(req.mode === "navigate") {
    var isAppRoot = url.endsWith("/") || url.indexOf("index.html") !== -1;
    var hasOwnPage = /\/[a-z0-9_-]+\.html(\?|$|#)/i.test(url) && url.indexOf("index.html") === -1;
    if(hasOwnPage || !isAppRoot) {
      // Laat sign.html en andere echte pagina's gewoon van het netwerk komen
      e.respondWith(
        fetch(req).then(function(r){
          if(r && r.status === 200){ var cl=r.clone(); s.open().then(function(c){return c.put(req,cl);}).catch(function(err){console.log("SW  put skip:",err&&err.message);}); }
          return r;
        }).catch(function(){ return s.match(req); })
      );
      return;
    }
    // Kale app-navigatie: verse index.html
    e.respondWith(
      fetch(INDEX, {: "no-"}).then(function(r) {
        if(r && r.status === 200) {
          var clone = r.clone();
          s.open().then(function(c) { return c.put(INDEX, clone); }).catch(function(err){console.log("SW  put skip:",err&&err.message);});
        }
        return r;
      }).catch(function() {
        return s.match(INDEX);
      })
    );
    return;
  }

  // Overige assets: network-first
  e.respondWith(
    fetch(req).then(function(r) {
      if(r && r.status === 200) {
        var clone = r.clone();
        s.open().then(function(c) { return c.put(req, clone); }).catch(function(err){console.log("SW cache put skip:",err&&err.message);});
      }
      return r;
    }).catch(function() {
      return caches.match(req);
    })
  );
});
