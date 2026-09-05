/* ═══════════════════════════════════════════════════════════════════════
   env-config.js — Environment-aware configuratielader
   ───────────────────────────────────────────────────────────────────────
   Laad dit script VÓÓR alle andere scripts in index.html:
     <script src="env-config.js"></script>

   Werking:
     1. Detecteert het environment op basis van de hostname
     2. Haalt config op via /api/config (Cloudflare Pages Function)
     3. Zet de juiste Supabase- en Worker-URL's als globale variabelen
     4. De app pikt deze op via zijn bestaande fallback-mechanisme

   Environments:
     visioffer.be / www.visioffer.be  → production
     test.visioffer.be                → staging
     *.visioffer.pages.dev            → preview (staging config)
     localhost / 127.0.0.1            → development
     stijnborloo.github.io            → legacy (hardcoded fallbacks)
   ═══════════════════════════════════════════════════════════════════════ */
(function(global) {
  "use strict";

  /* ── Environment detectie ──────────────────────────────────────────── */
  var host = global.location ? global.location.hostname : "";
  var env = "production";

  if (host === "test.visioffer.be") {
    env = "staging";
  } else if (/\.visioffer\.pages\.dev$/.test(host)) {
    env = "staging";
  } else if (host === "localhost" || host === "127.0.0.1") {
    env = "development";
  } else if (host.indexOf("github.io") !== -1) {
    env = "legacy";   /* GitHub Pages — gebruikt de bestaande hardcoded fallbacks */
  }

  /* Maak environment globaal beschikbaar */
  global.__APP_ENV = env;

  /* ── Staging-indicator ─────────────────────────────────────────────── */
  if (env === "staging" || env === "development") {
    /* Toon een kleine badge zodat je altijd weet dat je op staging zit */
    function showStagingBadge() {
      if (document.getElementById("env-badge")) return;
      var badge = document.createElement("div");
      badge.id = "env-badge";
      badge.textContent = env === "staging" ? "STAGING" : "DEV";
      badge.style.cssText =
        "position:fixed;bottom:8px;left:8px;z-index:999999;" +
        "background:#f59e0b;color:#000;font-size:10px;font-weight:700;" +
        "padding:3px 8px;border-radius:4px;font-family:monospace;" +
        "letter-spacing:.05em;opacity:.85;pointer-events:none;" +
        "text-transform:uppercase";
      document.body.appendChild(badge);
    }
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", showStagingBadge);
    } else {
      showStagingBadge();
    }
  }

  /* ── Config ophalen via /api/config (Cloudflare Pages Function) ───── */
  if (env !== "legacy") {
    /* Async fetch — als de config arriveert vóór supaInit(), worden de
       waarden opgepikt. Als de fetch faalt, valt de app terug op de
       bestaande hardcoded SUPA_DEFAULT_URL / SUPA_DEFAULT_ANON. */
    try {
      var xhr = new XMLHttpRequest();
      xhr.open("GET", "/api/config", true);
      xhr.timeout = 3000;  /* max 3 sec wachten */
      xhr.onload = function() {
        if (xhr.status !== 200) return;
        try {
          var cfg = JSON.parse(xhr.responseText);
          if (cfg.supabaseUrl && cfg.supabaseAnon) {
            /* Zet de globale variabelen die index.html als fallback gebruikt */
            global.SUPA_DEFAULT_URL  = cfg.supabaseUrl;
            global.SUPA_DEFAULT_ANON = cfg.supabaseAnon;
            /* Als er nog geen localStorage override is, neem de env-waarden */
            try {
              if (!localStorage.getItem("qs_supa_url")) {
                global._supaUrl  = cfg.supabaseUrl;
              }
              if (!localStorage.getItem("qs_supa_anon")) {
                global._supaAnon = cfg.supabaseAnon;
              }
            } catch(e) {}
          }
          if (cfg.workerUrl) {
            try {
              if (!localStorage.getItem("qs_worker_url")) {
                global._workerUrl = cfg.workerUrl;
              }
            } catch(e) {}
          }
          /* Bewaar referentie voor andere scripts */
          global.__APP_CONFIG = cfg;
        } catch(e) {
          console.log("[env-config] Config parse fout:", e.message);
        }
      };
      xhr.onerror = function() {
        console.log("[env-config] /api/config niet bereikbaar — fallback naar hardcoded config");
      };
      xhr.send();
    } catch(e) {
      /* XMLHttpRequest niet beschikbaar — service worker context? */
    }
  }

})(typeof window !== "undefined" ? window : this);
