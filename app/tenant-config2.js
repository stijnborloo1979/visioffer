/* ═══════════════════════════════════════════════════════════════════════
   tenant-config.js — QuoteStudio multi-tenant configuratielaag
   ───────────────────────────────────────────────────────────────────────
   Losstaande white-label versie: neutraal, zonder klant-specifieke branding.
   Nieuwe tenants voeg je toe in de TENANTS-registry hieronder óf — beter —
   als rij in de Supabase 'tenants'-tabel (zie supabase/tenants.sql).

   Levert het globale TC-object dat index.html verwacht:

     TC.get(key)        → string, met {token}-interpolatie
     TC.logoPdf()       → logo-HTML/SVG voor PDF & preview (auto-woordmerk)
     TC.pdfFooter()     → voettekst onderaan PDF-pagina's
     TC.tenant          → id van de actieve tenant
     TC.all()           → volledig config-object van de actieve tenant
     TC.set(id)         → wissel actieve tenant (+ herbrandt de UI)
     TC.apply()         → past kleur/titel/theme-color/manifest + merktekst toe
     TC.applyBrand()    → vervangt de tekst "QuoteStudio" overal door de
                          tenant-naam (ook in dynamische inhoud, via observer)
     TC.load(supabase)  → async: overschrijf statische config uit Supabase

   Merktekst-vervanging:
     De letterlijke tekst TC.brandToken ("QuoteStudio") wordt in alle zichtbare
     tekst vervangen door TC.brandName() (= companyNameShort van de tenant).
     Zet data-no-brand op een element om dat element over te slaan.

   Tenant-resolutie (eerste match wint):
     1. ?tenant=<id> in de URL
     2. localStorage "qs_tenant"
     3. subdomein  (acme.quotestudio.app → "acme")
     4. fallback   → "default"
   ═══════════════════════════════════════════════════════════════════════ */
(function (global) {
  "use strict";

  /* ═══════════════════════════════════════════════════════════════
     1. TENANT-REGISTER  (statische fallback / offline-modus)
        Supabase kan deze waarden runtime overschrijven via TC.load().
     ═══════════════════════════════════════════════════════════════ */
  var TENANTS = {

    /* ── Standaard white-label baseline ─────────────────────────── */
    "default": {
      slug:             "default",
      companyName:      "QuoteStudio Demo BV",
      companyNameShort: "QuoteStudio",
      primaryColor:     "#2563eb",
      coverColor:       "",          /* leeg → volgt primaryColor */
      logoBackdrop:     false,       /* wit vlak achter cover-logo */
      logoSize:         24,          /* hoogte logo in de app-balk (px) */
      coverLogoSize:    34,          /* hoogte logo op de coverpagina (px) */
      showMraas:        false,       /* MRaaS-knop (Ricoh-specifiek) */
      /* Naam van de huur-/abonnementsformule. Sector-afhankelijk:
         AV → "Meeting Room as a Service" / "MRaaS"
         solar → "Solar as a Service" / "SaaS", enz. */
      leaseName:        "Meeting Room as a Service",
      leaseAbbr:        "MRaaS",
      website:          "www.quotestudio.app",
      address:          "",
      rszLabel:         "Inschrijvingsnummer bij de RSZ",
      rszNumber:        "",
      vatLabel:         "Ondernemingsnummer bij de BTW",
      vatNumber:        "",
      signingLegalUrl:  "",
      contactSubtitle:  "Uw aanspreekpunten bij {companyNameShort}",
      pwaName:          "QuoteStudio — Offerte Studio",
      pwaShortName:     "QuoteStudio",
      logo:             "",          /* leeg → auto-woordmerk (zie logoPdf) */
      logoWhite:        "",
      pdfFooter:        "{companyName} — {website}"
    }

    /* Nieuwe tenant toevoegen? Kopieer het blok hierboven met een eigen
       slug, of zet de rij in de Supabase 'tenants'-tabel (aanbevolen).
       Voeg voor een eigen logo een SVG-string toe onder 'logo'/'logoWhite'. */
  };

  /* Registreer/overschrijf een tenant in het register (statisch + lokaal) */
  function _register(id, cfg) {
    TENANTS[id] = Object.assign({}, TENANTS[id] || {}, cfg, { slug: id });
  }

  /* Laad tenants die in de app zijn geconfigureerd en lokaal bewaard
     (sleutel "qs_tenant_cfg:<slug>"), zodat ze na herladen herkend worden. */
  try {
    for (var _i = 0; _i < global.localStorage.length; _i++) {
      var _k = global.localStorage.key(_i);
      if (_k && _k.indexOf("qs_tenant_cfg:") === 0) {
        try { _register(_k.slice(14), JSON.parse(global.localStorage.getItem(_k))); }
        catch (e) {}
      }
    }
  } catch (e) {}

  /* ═══════════════════════════════════════════════════════════════
     2. HULPFUNCTIES
     ═══════════════════════════════════════════════════════════════ */
  /* De letterlijke termen in de HTML die door tenant-waarden vervangen worden.
     Pas deze enkel aan als je basis-HTML andere woorden gebruikt. */
  var LEASE_NAME_TOKEN = "Meeting Room as a Service";
  var LEASE_ABBR_TOKEN = "MRaaS";

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  /* Schaal een logo (SVG of <img>) netjes naar een gevraagde hoogte in px.
     Waarom expliciete pixelmaten i.p.v. height:100%? html2canvas (de PDF-
     pipeline) rendert SVG's zonder eigen afmetingen onbetrouwbaar: het logo
     wordt uitgerekt of verdwijnt. Daarom:
       • lees de verhouding uit viewBox (of uit width/height als viewBox mist)
       • synthetiseer een viewBox wanneer die ontbreekt
       • forceer preserveAspectRatio zodat niets vervormt
       • zet width én height in px, berekend uit de verhouding
     Zonder hoogte (h leeg) valt hij terug op meeschalen met de container. */
  function fitLogo(html, h) {
    var inner = String(html || "");
    h = Number(h) || 0;

    if (/<svg\b/i.test(inner)) {
      inner = inner.replace(/<svg\b([^>]*)>/i, function (m, attrs) {
        var vbM   = attrs.match(/viewBox\s*=\s*("([^"]*)"|'([^']*)')/i);
        var vbVal = vbM ? (vbM[2] != null ? vbM[2] : (vbM[3] || "")) : "";
        var wAttr = (attrs.match(/\swidth\s*=\s*["']?\s*([\d.]+)/i)  || [])[1];
        var hAttr = (attrs.match(/\sheight\s*=\s*["']?\s*([\d.]+)/i) || [])[1];

        /* verhouding breedte/hoogte bepalen */
        var ratio = 0;
        if (vbVal) {
          var p = vbVal.trim().split(/[\s,]+/).map(Number);
          if (p.length === 4 && p[2] > 0 && p[3] > 0) ratio = p[2] / p[3];
        }
        if (!ratio && wAttr && hAttr && Number(hAttr) > 0) ratio = Number(wAttr) / Number(hAttr);

        /* eigen maten/stijl weghalen, daarna gecontroleerd terugzetten */
        var clean = attrs
          .replace(/\swidth\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/ig, "")
          .replace(/\sheight\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/ig, "")
          .replace(/\sstyle\s*=\s*("[^"]*"|'[^']*')/i, "");

        /* viewBox synthetiseren uit width/height wanneer die ontbreekt */
        if (!vbVal && wAttr && hAttr) clean += ' viewBox="0 0 ' + wAttr + ' ' + hAttr + '"';
        if (!/preserveAspectRatio/i.test(clean)) clean += ' preserveAspectRatio="xMidYMid meet"';

        if (h) {
          var w = ratio ? Math.round(h * ratio * 100) / 100 : 0;
          return '<svg' + clean +
            (w ? ' width="' + w + '"' : "") + ' height="' + h + '"' +
            ' style="height:' + h + 'px;' + (w ? "width:" + w + "px;" : "width:auto;") +
            'display:block">';
        }
        return '<svg' + clean + ' style="height:100%;width:auto;max-width:100%;display:block">';
      });
    } else if (/<img\b/i.test(inner)) {
      inner = inner.replace(/<img\b([^>]*)>/i, function (m, attrs) {
        var clean = attrs.replace(/\sstyle\s*=\s*("[^"]*"|'[^']*')/i, "");
        var st = h ? "height:" + h + "px;width:auto;" : "height:100%;width:auto;";
        return '<img' + clean + ' style="' + st + 'max-width:100%;object-fit:contain;display:block">';
      });
    }

    var wrapH = h ? "height:" + h + "px;" : "height:100%;";
    return '<span style="display:inline-flex;align-items:center;' + wrapH +
           'max-width:100%;line-height:0">' + inner + "</span>";
  }

  /* Maak een hexkleur donkerder (0..1). Voor de cover-gradiënt (--cover-d). */
  function darken(hex, amt) {
    try {
      hex = String(hex).replace("#", "");
      if (hex.length === 3) hex = hex.split("").map(function (c) { return c + c; }).join("");
      var n = parseInt(hex, 16);
      var r = Math.round(((n >> 16) & 255) * (1 - amt));
      var g = Math.round(((n >> 8) & 255) * (1 - amt));
      var b = Math.round((n & 255) * (1 - amt));
      return "#" + [r, g, b].map(function (v) {
        return ("0" + Math.max(0, Math.min(255, v)).toString(16)).slice(-2);
      }).join("");
    } catch (e) { return "#1e293b"; }
  }

  /* {token} → waarde uit de tenant; max. 3 niveaus diep (voorkomt loops) */
  function interp(str, t, depth) {
    if (typeof str !== "string" || str.indexOf("{") === -1) return str;
    if (depth == null) depth = 0;
    if (depth > 3) return str;
    return str.replace(/\{(\w+)\}/g, function (_, k) {
      var v = t[k];
      return v == null ? "" : interp(String(v), t, depth + 1);
    });
  }

  function resolveTenantId() {
    /* 1. expliciete override in de URL */
    try {
      var q = new URLSearchParams(global.location.search).get("tenant");
      if (q && TENANTS[q]) return q;
    } catch (e) {}
    /* 2. door de app gezette voorkeur */
    try {
      var ls = global.localStorage.getItem("qs_tenant");
      if (ls && TENANTS[ls]) return ls;
    } catch (e) {}
    /* 3. subdomein */
    try {
      var host = global.location.hostname.split(".");
      if (host.length > 2 && TENANTS[host[0]]) return host[0];
    } catch (e) {}
    /* 4. fallback */
    return "default";
  }

  /* ═══════════════════════════════════════════════════════════════
     3. HET TC-OBJECT
     ═══════════════════════════════════════════════════════════════ */
  var TC = {
    tenant: resolveTenantId(),

    /* De letterlijke merktekst in de HTML die vervangen wordt door de
       tenant-naam. Pas dit aan als je basismerk anders heet. */
    brandToken: "QuoteStudio",

    all: function () {
      return TENANTS[TC.tenant] || TENANTS["default"];
    },

    get: function (key) {
      var t = TC.all();
      var v = t[key];
      if (v == null) return "";
      return interp(v, t);
    },

    /* h = gewenste hoogte in px (index.html roept aan met 34 op de cover,
       30/26/22 in paginakoppen). Zonder h: meeschalen met de container. */
    logoPdf: function (h) {
      var t = TC.all();
      if (t.logo) return fitLogo(t.logo, h);
      /* geen logo → automatische woordmerk-fallback in de merkkleur */
      var fs = h ? Math.max(11, Math.round(h * 0.62)) : 20;
      return '<span style="font-family:Inter,Arial,sans-serif;font-weight:800;'
           + 'font-size:' + fs + 'px;letter-spacing:-.5px;white-space:nowrap;color:' + t.primaryColor + '">'
           + esc(t.companyNameShort) + '</span>';
    },

    logoWhitePdf: function (h) {
      var t = TC.all();
      if (t.logoWhite) return fitLogo(t.logoWhite, h);
      if (t.logo)      return fitLogo(t.logo, h);
      var fs = h ? Math.max(11, Math.round(h * 0.62)) : 20;
      return '<span style="font-family:Inter,Arial,sans-serif;font-weight:800;'
           + 'font-size:' + fs + 'px;letter-spacing:-.5px;white-space:nowrap;color:#fff">'
           + esc(t.companyNameShort) + '</span>';
    },

    pdfFooter: function () {
      var t = TC.all();
      return interp(t.pdfFooter || "{companyName}", t);
    },

    /* Vergrendeling: gewone users mogen alleen hun eigen tenant(s) kiezen.
       De échte beveiliging zit in RLS (qs_tenant_members); dit is de UI-kant. */
    locked: false,
    allowedTenants: null,  /* null = alles; array = alleen die slugs */

    /* Vergrendel op één tenant (user met één membership) */
    lockToTenant: function (id) {
      if (!id) return;
      if (!TENANTS[id]) _register(id, { slug: id, companyNameShort: id });
      TC.tenant = id;
      TC.locked = true;
      TC.allowedTenants = [id];
      try { global.localStorage.setItem("qs_tenant", id); } catch (e) {}
      TC.apply();
    },

    /* Vergrendel op een lijst van tenants (user met meerdere memberships) */
    lockToList: function (slugs, activeTenant) {
      TC.locked = true;
      TC.allowedTenants = slugs || [];
      slugs.forEach(function(s){
        if (!TENANTS[s]) _register(s, { slug: s, companyNameShort: s });
      });
      var active = activeTenant && slugs.indexOf(activeTenant) !== -1 ? activeTenant : slugs[0];
      TC.tenant = active;
      try { global.localStorage.setItem("qs_tenant", active); } catch (e) {}
      TC.apply();
    },

    /* Alleen voor super-admins: heft de vergrendeling op */
    unlock: function () { TC.locked = false; TC.allowedTenants = null; },

    /* Wissel actieve tenant en herbrand de UI */
    set: function (id) {
      /* Vergrendeld? Alleen wisselen als die tenant in de lijst staat */
      if (TC.locked && TC.allowedTenants && TC.allowedTenants.indexOf(id) === -1) {
        console.warn("[TC] tenant", id, "niet toegestaan — vergrendeld op", TC.allowedTenants);
        return;
      }
      if (!TENANTS[id]) { console.warn("[TC] onbekende tenant:", id); return; }
      TC.tenant = id;
      try { global.localStorage.setItem("qs_tenant", id); } catch (e) {}
      /* Supabase client resetten zodat de header mee-update */
      if (typeof global.supaResetClient === "function") global.supaResetClient();
      TC.apply();
    },

    /* Registreer/overschrijf een tenant runtime (gebruikt door TC.load) */
    register: function (id, cfg) {
      _register(id, cfg);
    },

    /* Lijst van alle bekende tenant-slugs (statisch + lokaal geladen) */
    list: function () {
      return Object.keys(TENANTS);
    },

    /* Pas kleur, coverkleur, logo-backdrop, titel, theme-color en manifest toe */
    apply: function () {
      var t = TC.all();
      try {
        var root = document.documentElement;
        root.style.setProperty("--red", t.primaryColor);
        root.style.setProperty("--rl", hexToRgba(t.primaryColor, 0.08));

        /* Coverpagina: --cover en de donkere gradiëntstop --cover-d.
           Leeg coverColor → volgt de merkkleur (zoals de CSS-fallback). */
        var cv = t.coverColor || t.primaryColor;
        root.style.setProperty("--cover", cv);
        root.style.setProperty("--cover-d", darken(cv, 0.55));

        /* Wit vlak achter het cover-logo (aan/uit via de checkbox) */
        if (t.logoBackdrop) {
          root.style.setProperty("--logo-bg",     "rgba(255,255,255,.94)");
          root.style.setProperty("--logo-pad",    "10px 14px");
          root.style.setProperty("--logo-radius", "10px");
          root.style.setProperty("--logo-shadow", "0 2px 10px rgba(0,0,0,.18)");
        } else {
          root.style.setProperty("--logo-bg",     "transparent");
          root.style.setProperty("--logo-pad",    "0");
          root.style.setProperty("--logo-radius", "0");
          root.style.setProperty("--logo-shadow", "none");
        }
      } catch (e) {}
      try {
        var meta = document.querySelector('meta[name="theme-color"]');
        if (meta) meta.setAttribute("content", t.primaryColor);
      } catch (e) {}
      try {
        if (document.title && /QuoteStudio/i.test(document.title)) {
          document.title = (t.pwaName || t.companyNameShort) + " — Offerte Studio";
        }
      } catch (e) {}
      TC.applyManifest();
      TC.applyBrand();
      TC.applyTopbar();
      TC.applyCoverLogos();
      TC.applyMraas();
    },

    /* De coverpagina's zijn al opgebouwd wanneer je aan de schuifregelaar
       sleept — TC.logoPdf() draait enkel tijdens het renderen. Daarom werken
       we hier de reeds getoonde cover-logo's meteen bij, zodat de instelling
       live zichtbaar is. Bij een volgende render leest index.html dezelfde
       waarde op via TC.get("coverLogoSize"), dus beide blijven gelijk. */
    applyCoverLogos: function () {
      try {
        var t = TC.all();
        var h = Math.max(20, Math.min(90, Number(t.coverLogoSize) || 34));

        /* nieuwe cover (.cvr2-logo): container schaalt mee */
        var a = document.querySelectorAll(".cvr2-logo");
        Array.prototype.forEach.call(a, function (el) {
          el.innerHTML = TC.logoPdf(h);
        });

        /* klassieke cover (.cvr-rl): heeft een vaste inline-hoogte die we
           mee moeten optrekken, anders wordt het logo afgesneden */
        var hb = Math.round(h * 0.76);
        var b = document.querySelectorAll(".cvr-rl");
        Array.prototype.forEach.call(b, function (el) {
          el.style.height = hb + "px";
          el.innerHTML = TC.logoPdf(hb);
        });
      } catch (e) {}
    },

    /* Logo linksboven in de balk. De balk is donker/gekleurd, dus:
       logoWhite → rechtstreeks; anders het gewone logo op een wit chipje
       zodat elk logo leesbaar blijft; zonder logo → woordmerk in wit. */
    /* Logo linksboven in de app-balk. De balk is wit (.topbar{background:#fff}),
       dus het gewone kleurenlogo komt er rechtstreeks op — geen wit kader.
       Hoogte instelbaar via de schuifregelaar (logoSize). */
    applyTopbar: function () {
      try {
        var el = document.getElementById("topbar-logo");
        if (!el) return;
        var t = TC.all();
        var h = Math.max(12, Math.min(44, Number(t.logoSize) || 24));
        el.setAttribute("data-no-brand", "");
        el.style.height = h + "px";
        if (t.logo) {
          el.innerHTML = fitLogo(t.logo, h);
        } else {
          /* geen logo → woordmerk in de merkkleur (donker, leesbaar op wit) */
          el.innerHTML = '<span style="font-size:' + Math.max(13, Math.round(h * 0.72)) + 'px;'
            + 'font-weight:900;color:' + (t.primaryColor || "#2563eb") + ';'
            + 'letter-spacing:-.02em;white-space:nowrap">' + esc(t.companyNameShort) + '</span>';
        }
      } catch (e) {}
    },

    /* MRaaS-knop enkel tonen wanneer de tenant hem aanzet */
    applyMraas: function () {
      try {
        var b = document.getElementById("mraas-btn");
        if (b) b.style.display = TC.all().showMraas ? "" : "none";
      } catch (e) {}
    },

    /* Genereer een tenant-specifieke manifest en hang hem in de <head> */
    applyManifest: function () {
      try {
        var t = TC.all();
        var base = (function () {
          try { return new URL(".", global.location.href).pathname; }
          catch (e) { return "/"; }
        })();
        var mf = {
          name:             t.pwaName || (t.companyNameShort + " — Offerte Studio"),
          short_name:       t.pwaShortName || t.companyNameShort,
          description:      "Professionele offertetool — " + t.companyName,
          start_url:        base,
          scope:            base,
          display:          "standalone",
          background_color:  t.primaryColor,
          theme_color:       t.primaryColor,
          orientation:      "any",
          lang:             "nl",
          icons: [
            { src: base + "icon192.png",        sizes: "192x192", type: "image/png", purpose: "any maskable" },
            { src: base + "icon512.png",        sizes: "512x512", type: "image/png", purpose: "any maskable" },
            { src: base + "appletouchicon.png", sizes: "180x180", type: "image/png" }
          ],
          categories: ["business", "productivity"]
        };
        var blob = new Blob([JSON.stringify(mf)], { type: "application/manifest+json" });
        var url  = URL.createObjectURL(blob);
        var link = document.querySelector('link[rel="manifest"]');
        if (!link) {
          link = document.createElement("link");
          link.rel = "manifest";
          document.head.appendChild(link);
        }
        link.href = url;
      } catch (e) { /* manifest optioneel — nooit blokkeren */ }
    },

    /* Naam van de huurformule voor gebruik in de offerte-HTML.
       Komt rechtstreeks uit de tenant-instellingen; valt terug op de
       standaardterm wanneer de tenant niets invulde. */
    leaseLabel: function () {
      var v = (TC.all().leaseName || "").trim();
      return v || LEASE_NAME_TOKEN;
    },

    /* Afkorting; valt terug op de volledige naam als er geen afkorting is. */
    leaseShort: function () {
      var v = (TC.all().leaseAbbr || "").trim();
      return v || TC.leaseLabel();
    },

    /* De naam die de merktekst "QuoteStudio" op de pagina vervangt */
    brandName: function () {
      var t = TC.all();
      return t.companyNameShort || t.companyName || TC.brandToken;
    },

    /* Vervang overal de zichtbare merktekst door de tenant-naam +
       werk de head-metagegevens bij. Veilig bij default (dan geen wijziging). */
    /* De termen die overal in zichtbare tekst vervangen worden.
       Volgorde is belangrijk: de LANGSTE eerst, anders zou "MRaaS" al
       vervangen zijn binnen "Meeting Room as a Service (MRaaS)". */
    brandPairs: function () {
      var t = TC.all();
      var pairs = [];
      var name = TC.brandName();
      if (name && name !== TC.brandToken) pairs.push([TC.brandToken, name]);

      var ln = (t.leaseName || "").trim();
      if (ln && ln !== LEASE_NAME_TOKEN) pairs.push([LEASE_NAME_TOKEN, ln]);

      var la = (t.leaseAbbr || "").trim();
      if (la && la !== LEASE_ABBR_TOKEN) pairs.push([LEASE_ABBR_TOKEN, la]);

      return pairs;
    },

    applyBrand: function () {
      var name = TC.brandName();

      /* Head: apple-titel + omschrijving */
      try {
        var at = document.querySelector('meta[name="apple-mobile-web-app-title"]');
        if (at) at.setAttribute("content", TC.all().pwaShortName || name);
        var ds = document.querySelector('meta[name="description"]');
        if (ds) ds.setAttribute("content", "Professionele offertetool — " + name);
      } catch (e) {}

      var pairs = TC.brandPairs();
      if (!pairs.length) return;      /* niets aan te passen */

      brandSweep(document.body, pairs);
      installBrandObserver();
    },

    /* ── Async: overschrijf statische config met een Supabase-rij ──
       Verwacht een geïnitialiseerde supabase-js client.
       Tabel 'tenants' met kolom 'slug' (zie supabase/tenants.sql). */
    load: async function (supa) {
      try {
        if (!supa || !supa.from) return TC.all();
        var res = await supa.from("qs_tenants").select("*").eq("slug", TC.tenant).maybeSingle();
        if (res && res.data) {
          TC.register(TC.tenant, mapRow(res.data));
          TC.apply();
        }
      } catch (e) {
        console.log("[TC] Supabase-config overslaan:", e && e.message);
      }
      return TC.all();
    },

    /* ── Async: laad ALLE tenants uit Supabase in het register ──
       Zodat de tenant-keuzelijst elke tenant toont, ook die niet lokaal op
       dit toestel bekend zijn. Wijzigt de actieve tenant niet. */
    loadAll: async function (supa) {
      try {
        if (!supa || !supa.from) return TC.list();
        var res = await supa.from("qs_tenants").select("*");
        if (res && res.data) res.data.forEach(function (row) {
          if (row && row.slug) TC.register(row.slug, mapRow(row));
        });
      } catch (e) {
        console.log("[TC] loadAll overslaan:", e && e.message);
      }
      return TC.list();
    }
  };

  /* DB-kolommen → config-sleutels (snake_case → camelCase waar nodig) */
  function mapRow(r) {
    var out = {};
    var map = {
      company_name: "companyName", company_name_short: "companyNameShort",
      primary_color: "primaryColor", cover_color: "coverColor",
      website: "website", address: "address",
      rsz_label: "rszLabel", rsz_number: "rszNumber",
      vat_label: "vatLabel", vat_number: "vatNumber",
      signing_legal_url: "signingLegalUrl", contact_subtitle: "contactSubtitle",
      pwa_name: "pwaName", pwa_short_name: "pwaShortName",
      logo_svg: "logo", logo_svg_white: "logoWhite", pdf_footer: "pdfFooter",
      lease_name: "leaseName", lease_abbr: "leaseAbbr"
    };
    Object.keys(map).forEach(function (k) {
      if (r[k] != null && r[k] !== "") out[map[k]] = r[k];
    });
    /* Booleans apart: false is een geldige waarde en mag niet wegvallen */
    if (r.logo_backdrop != null) out.logoBackdrop = !!r.logo_backdrop;
    if (r.show_mraas    != null) out.showMraas    = !!r.show_mraas;
    /* Getallen apart: als getal bewaren, niet als tekst */
    if (r.logo_size       != null && r.logo_size       !== "") out.logoSize      = Number(r.logo_size) || 24;
    if (r.cover_logo_size != null && r.cover_logo_size !== "") out.coverLogoSize = Number(r.cover_logo_size) || 34;
    return out;
  }

  /* Vervang alle geconfigureerde termen in zichtbare tekstknopen onder 'root'.
     pairs = [[van, naar], ...] — in volgorde toegepast, langste term eerst.
     Slaat scripts, styles, invoervelden en [data-no-brand] over. */
  function brandSweep(root, pairs) {
    try {
      if (!root || !pairs || !pairs.length) return;

      /* regex per paar, één keer opgebouwd */
      var rules = pairs.filter(function (p) { return p[0] && p[0] !== p[1]; })
        .map(function (p) {
          return {
            from: p[0],
            to:   p[1],
            rx:   new RegExp(p[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")
          };
        });
      if (!rules.length) return;

      function hits(s) {
        for (var i = 0; i < rules.length; i++) if (s.indexOf(rules[i].from) !== -1) return true;
        return false;
      }
      function swap(s) {
        for (var i = 0; i < rules.length; i++) s = s.replace(rules[i].rx, rules[i].to);
        return s;
      }

      var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode: function (node) {
          var p = node.parentNode;
          if (!p) return NodeFilter.FILTER_REJECT;
          var tag = p.nodeName;
          if (tag === "SCRIPT" || tag === "STYLE" || tag === "TEXTAREA")
            return NodeFilter.FILTER_REJECT;
          if (p.closest && p.closest("[data-no-brand]"))
            return NodeFilter.FILTER_REJECT;
          return hits(node.nodeValue)
            ? NodeFilter.FILTER_ACCEPT
            : NodeFilter.FILTER_SKIP;
        }
      });
      var nodes = [], n;
      while ((n = walker.nextNode())) nodes.push(n);
      nodes.forEach(function (node) {
        var nv = swap(node.nodeValue);
        if (nv !== node.nodeValue) node.nodeValue = nv;   /* enkel schrijven bij wijziging → geen lus */
      });

      /* Ook placeholder-attributen op invoervelden meenemen */
      try {
        var inputs = root.querySelectorAll ? root.querySelectorAll("[placeholder]") : [];
        Array.prototype.forEach.call(inputs, function (el) {
          var ph = el.getAttribute("placeholder");
          if (ph && hits(ph)) el.setAttribute("placeholder", swap(ph));
        });
      } catch (e) {}
    } catch (e) { /* nooit blokkeren */ }
  }

  /* Houd de merktekst toegepast op dynamisch bijgerenderde inhoud */
  var _brandObserver = null;
  function installBrandObserver() {
    try {
      if (_brandObserver) return;
      if (!TC.brandPairs().length) return;            /* niets te vervangen */
      if (typeof MutationObserver === "undefined" || !document.body) return;
      var pending = false;
      _brandObserver = new MutationObserver(function () {
        if (pending) return;
        pending = true;
        var run = function () {
          pending = false;
          /* opnieuw ophalen: de tenant kan intussen gewisseld zijn */
          brandSweep(document.body, TC.brandPairs());
        };
        (global.requestAnimationFrame || function (f) { setTimeout(f, 16); })(run);
      });
      _brandObserver.observe(document.body, { childList: true, subtree: true, characterData: true });
    } catch (e) { /* observer optioneel */ }
  }

  function hexToRgba(hex, a) {
    try {
      hex = String(hex).replace("#", "");
      if (hex.length === 3) hex = hex.split("").map(function (c) { return c + c; }).join("");
      var n = parseInt(hex, 16);
      return "rgba(" + ((n >> 16) & 255) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + a + ")";
    } catch (e) { return "rgba(37,99,235," + a + ")"; }
  }

  /* ═══════════════════════════════════════════════════════════════
     4. INITIALISATIE — brand direct toepassen (script staat in <head>)
     ═══════════════════════════════════════════════════════════════ */
  global.TC = TC;
  function boot() { try { TC.apply(); } catch (e) {} }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
    try { document.documentElement.style.setProperty("--red", TC.all().primaryColor); } catch (e) {}
  } else {
    boot();
  }

})(typeof window !== "undefined" ? window : this);
