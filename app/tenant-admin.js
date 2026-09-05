/* ═══════════════════════════════════════════════════════════════════════
   tenant-admin.js — In-app tenant-configurator voor QuoteStudio
   ───────────────────────────────────────────────────────────────────────
   v2 — Odoo-stijl sectie-navigatie met sidebar, live preview,
         feature toggles, sector-presets.

   Drop-in: voeg <script src="tenant-admin.js"></script> ná tenant-config.js
   toe in index.html. Openen: klik op de knop rechtsonder,
   of roep window.openTenantConfig() aan.
   ═══════════════════════════════════════════════════════════════════════ */
(function (global) {
  "use strict";

  if (typeof global.TC === "undefined") {
    console.warn("[tenant-admin] TC ontbreekt — laad tenant-config.js eerst.");
    return;
  }
  var TC = global.TC;

  /* Voorkom dat globale plak-/sleep-handlers het configuratiescherm kapen */
  ["paste", "drop", "dragover", "dragenter"].forEach(function (type) {
    try {
      global.addEventListener(type, function (e) {
        var m = document.getElementById("tc-admin");
        if (!m || m.style.display === "none") return;
        if (!m.contains(e.target)) return;
        e.stopImmediatePropagation();
        if (type !== "paste") e.preventDefault();
      }, true);
    } catch (e) {}
  });

  /* ── Velddefinities ──────────────────────────────────────────────── */
  var FIELDS = [
    { key: "slug",             label: "Tenant-ID (slug)", type: "text",   section: "general",
      hint: "Uniek, kleine letters, bv. 'acme'. Bepaalt ?tenant= en de Supabase-rij." },
    { key: "companyNameShort", label: "Merknaam (kort)",  type: "text",   section: "general",
      hint: "Vervangt overal de tekst in de app." },
    { key: "companyName",      label: "Bedrijfsnaam",     type: "text",   section: "general" },
    { key: "primaryColor",     label: "Merkkleur",        type: "color",  section: "branding" },
    { key: "coverColor",       label: "Cover-kleur",      type: "color",  section: "branding",
      hint: "Achtergrond coverpagina. Leeg = volgt merkkleur." },
    { key: "logo",             label: "Logo (SVG of URL)", type: "textarea", section: "branding",
      hint: "Plak <svg>…</svg> of een URL. Leeg = woordmerk." },
    { key: "logoBackdrop",     label: "Logo op wit vlak (cover)", type: "checkbox", section: "branding",
      hint: "Subtiel wit kader achter het cover-logo." },
    { key: "logoSize",         label: "Logogrootte balk", type: "range",  section: "layout",
      min: 14, max: 44, step: 1, def: 24,
      hint: "Hoogte logo linksboven (px)." },
    { key: "coverLogoSize",    label: "Logogrootte cover", type: "range", section: "layout",
      min: 20, max: 90, step: 1, def: 34,
      hint: "Hoogte logo op de coverpagina (px)." },
    { key: "showMraas",        label: "MRaaS-knop tonen", type: "checkbox", section: "features",
      hint: "Ricoh-specifiek. Standaard uit." },
    { key: "roomLabel",        label: "Zaal → (enkelvoud)",  type: "text",  section: "labels",
      hint: "Vervangt overal 'Zaal'. Bv. Installatie, Zone, Ruimte, Locatie." },
    { key: "roomLabelPlural", label: "Zalen → (meervoud)",   type: "text",  section: "labels",
      hint: "Vervangt overal 'Zalen'. Bv. Installaties, Zones, Ruimtes." },
    { key: "productLabel",     label: "Product → (enkelvoud)", type: "text", section: "labels",
      hint: "Vervangt overal 'Product'. Bv. Paneel, Component, Toestel." },
    { key: "productLabelPlural", label: "Producten → (meervoud)", type: "text", section: "labels",
      hint: "Vervangt overal 'Producten'. Bv. Panelen, Componenten." },
    { key: "leaseName",        label: "Naam huurformule", type: "text",   section: "labels",
      hint: "Vervangt 'Meeting Room as a Service'." },
    { key: "leaseAbbr",        label: "Afkorting huurformule", type: "text", section: "labels",
      hint: "Vervangt 'MRaaS'. Leeg = ongewijzigd." },
    { key: "website",          label: "Website",          type: "text",   section: "general" },
    { key: "address",          label: "Adres",            type: "textarea", section: "general" },
    { key: "vatLabel",         label: "BTW-label",        type: "text",   section: "legal" },
    { key: "vatNumber",        label: "BTW-nummer",       type: "text",   section: "legal" },
    { key: "rszLabel",         label: "RSZ-label",        type: "text",   section: "legal" },
    { key: "rszNumber",        label: "RSZ-nummer",       type: "text",   section: "legal" },
    { key: "contactSubtitle",  label: "Contact-ondertitel", type: "text", section: "labels",
      hint: "{companyNameShort} wordt vervangen." },
    { key: "signingLegalUrl",  label: "URL voorwaarden",  type: "url",   section: "legal" },
    { key: "pdfFooter",        label: "PDF-voettekst",    type: "text",  section: "legal",
      hint: "Tokens: {companyName}, {website}, {companyNameShort}." },
    { key: "pwaName",          label: "PWA-naam",         type: "text",  section: "labels" },
    { key: "pwaShortName",     label: "PWA-korte naam",   type: "text",  section: "labels" }
  ];

  /* Secties — volgorde bepaalt de sidebar */
  var SECTIONS = [
    { id: "general",  label: "Algemeen",     icon: "🏢" },
    { id: "branding", label: "Branding",     icon: "🎨" },
    { id: "layout",   label: "Layout",       icon: "📐" },
    { id: "labels",   label: "Labels",       icon: "🏷️" },
    { id: "legal",    label: "Juridisch",    icon: "📄" },
    { id: "features", label: "Features",     icon: "⚡" }
  ];

  /* camelCase → snake_case voor Supabase */
  var DB = {
    slug: "slug", companyName: "company_name", companyNameShort: "company_name_short",
    primaryColor: "primary_color", coverColor: "cover_color", website: "website", address: "address",
    rszLabel: "rsz_label", rszNumber: "rsz_number", vatLabel: "vat_label",
    vatNumber: "vat_number", signingLegalUrl: "signing_legal_url",
    contactSubtitle: "contact_subtitle", pwaName: "pwa_name",
    pwaShortName: "pwa_short_name", logo: "logo_svg", logoWhite: "logo_svg_white",
    pdfFooter: "pdf_footer", logoBackdrop: "logo_backdrop", showMraas: "show_mraas",
    logoSize: "logo_size", coverLogoSize: "cover_logo_size",
    leaseName: "lease_name", leaseAbbr: "lease_abbr",
    roomLabel: "room_label", roomLabelPlural: "room_label_plural",
    productLabel: "product_label", productLabelPlural: "product_label_plural"
  };

  /* ── Sector-presets ─────────────────────────────────────────────── */
  var PRESETS = {
    av: {
      _label: "AV / Meeting rooms",
      roomLabel: "Zaal", roomLabelPlural: "Zalen",
      productLabel: "Product", productLabelPlural: "Producten",
      leaseName: "Meeting Room as a Service", leaseAbbr: "MRaaS",
      showMraas: true,
      contactSubtitle: "Uw aanspreekpunten bij {companyNameShort}"
    },
    solar: {
      _label: "Solar",
      roomLabel: "Installatie", roomLabelPlural: "Installaties",
      productLabel: "Paneel", productLabelPlural: "Panelen",
      leaseName: "Solar as a Service", leaseAbbr: "SaaS",
      showMraas: true,
      contactSubtitle: "Uw energieadviseurs bij {companyNameShort}"
    },
    security: {
      _label: "Security",
      roomLabel: "Zone", roomLabelPlural: "Zones",
      productLabel: "Component", productLabelPlural: "Componenten",
      leaseName: "Security as a Service", leaseAbbr: "SecaaS",
      showMraas: false,
      contactSubtitle: "Uw beveiligingsexperts bij {companyNameShort}"
    },
    hvac: {
      _label: "HVAC / Klimaat",
      roomLabel: "Ruimte", roomLabelPlural: "Ruimtes",
      productLabel: "Toestel", productLabelPlural: "Toestellen",
      leaseName: "Comfort as a Service", leaseAbbr: "CaaS",
      showMraas: true,
      contactSubtitle: "Uw klimaatexperts bij {companyNameShort}"
    },
    events: {
      _label: "Events",
      roomLabel: "Locatie", roomLabelPlural: "Locaties",
      productLabel: "Item", productLabelPlural: "Items",
      leaseName: "Event as a Service", leaseAbbr: "EaaS",
      showMraas: false,
      contactSubtitle: "Uw eventcoördinatoren bij {companyNameShort}"
    },
    interior: {
      _label: "Interieur",
      roomLabel: "Ruimte", roomLabelPlural: "Ruimtes",
      productLabel: "Element", productLabelPlural: "Elementen",
      leaseName: "Design as a Service", leaseAbbr: "DaaS",
      showMraas: false,
      contactSubtitle: "Uw interieurarchitecten bij {companyNameShort}"
    }
  };

  var _originalTenant = null;
  var _activeSection = "general";

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function toast(msg) {
    try { if (typeof global.toast === "function") return global.toast(msg); } catch (e) {}
    console.log("[tenant-admin]", msg);
  }

  /* ── Accentkleur berekenen ───────────────────────────────────────── */
  function hexToRgb(hex) {
    hex = (hex || "#714b67").replace("#", "");
    if (hex.length === 3) hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
    var n = parseInt(hex, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }
  function darken(hex, amt) {
    var c = hexToRgb(hex);
    var r = Math.max(0, Math.round(c.r * (1 - amt)));
    var g = Math.max(0, Math.round(c.g * (1 - amt)));
    var b = Math.max(0, Math.round(c.b * (1 - amt)));
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }
  function applyAccentColor(hex) {
    var el = document.getElementById("tc-admin");
    if (!el) return;
    hex = hex || "#714b67";
    var rgb = hexToRgb(hex);
    el.style.setProperty("--tc-accent", hex);
    el.style.setProperty("--tc-accent-rgb", rgb.r + "," + rgb.g + "," + rgb.b);
    el.style.setProperty("--tc-accent-dark", darken(hex, 0.18));
  }

  /* ── Stylesheet (eenmalig injecteren) ───────────────────────────── */
  function injectStyles() {
    if (document.getElementById("tc-admin-css")) return;
    var style = document.createElement("style");
    style.id = "tc-admin-css";
    style.textContent = [
      "/* Odoo-inspired visual system — logic intentionally untouched */",
      "#tc-admin *{box-sizing:border-box}",
      "#tc-admin{display:none;position:fixed;inset:0;z-index:100000;background:rgba(17,24,39,.58);backdrop-filter:blur(7px);align-items:center;justify-content:center;padding:24px;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1f2937}",
      ".tc-shell{background:#fff;border:1px solid #e5e7eb;border-radius:12px;width:min(1180px,100%);height:min(88vh,820px);display:flex;flex-direction:column;box-shadow:0 30px 80px rgba(17,24,39,.22);overflow:hidden}",

      /* top application bar */
      ".tc-header{height:58px;display:flex;align-items:center;justify-content:space-between;padding:0 22px;border-bottom:1px solid #e5e7eb;background:#fff;flex-shrink:0}",
      ".tc-header h2{font-size:15px;font-weight:600;color:#212529;letter-spacing:-.01em}",
      ".tc-header h2:before{content:'⚙';display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;margin-right:9px;border-radius:7px;background:var(--tc-accent,#714b67);color:#fff;font-size:13px;vertical-align:-7px}",
      ".tc-close{background:transparent;border:0;font-size:22px;cursor:pointer;color:#6b7280;line-height:1;padding:6px 9px;border-radius:6px}",
      ".tc-close:hover{background:#f3f4f6;color:#374151}",

      /* tenant switcher */
      ".tc-tenant-bar{height:52px;display:flex;align-items:center;gap:10px;padding:0 22px;border-bottom:1px solid #e5e7eb;background:#f8f9fa;flex-shrink:0}",
      ".tc-tenant-bar:before{content:'Database';font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.06em;margin-right:3px}",
      ".tc-tenant-bar>span{display:none!important}",
      ".tc-tenant-bar select{width:250px;max-width:100%;padding:7px 10px;border:1px solid #ced4da;border-radius:5px;font-size:13px;color:#343a40;background:#fff;font-family:inherit;outline:0}",
      ".tc-tenant-bar select:focus{border-color:var(--tc-accent,#714b67);box-shadow:0 0 0 2px rgba(var(--tc-accent-rgb,113,75,103),.12)}",

      /* body */
      ".tc-body{display:flex;flex:1;min-height:0;overflow:hidden}",
      ".tc-side{width:218px;background:#f8f9fa;border-right:1px solid #e5e7eb;padding:16px 10px;overflow-y:auto;flex-shrink:0}",
      ".tc-nav{display:flex;flex-direction:column;gap:2px}",
      ".tc-nav:before{content:'CONFIGURATIE';display:block;padding:5px 12px 9px;font-size:10px;font-weight:700;color:#9ca3af;letter-spacing:.08em}",
      ".tc-nav-item{position:relative;display:flex;align-items:center;gap:11px;padding:9px 12px;font-size:13px;color:#4b5563;cursor:pointer;border:0;background:transparent;text-align:left;font-family:inherit;width:100%;border-radius:5px;transition:background .12s,color .12s}",
      ".tc-nav-item:hover{background:#eceef0;color:#212529}",
      ".tc-nav-item.active{background:rgba(var(--tc-accent-rgb,113,75,103),.1);color:var(--tc-accent,#714b67);font-weight:600}",
      ".tc-nav-item.active:before{content:'';position:absolute;left:0;top:5px;bottom:5px;width:3px;border-radius:0 3px 3px 0;background:var(--tc-accent,#714b67)}",
      ".tc-nav-icon{font-size:15px;flex-shrink:0;width:22px;text-align:center;filter:saturate(.65)}",

      /* content */
      ".tc-content{flex:1;overflow-y:auto;background:#fff}",
      ".tc-section{display:none;padding:30px 42px 46px;max-width:820px}",
      ".tc-section.active{display:block}",
      ".tc-section-title{font-size:22px;font-weight:600;color:#212529;margin-bottom:5px;letter-spacing:-.025em}",
      ".tc-section-sub{font-size:13px;color:#6c757d;margin-bottom:28px}",

      /* forms */
      ".tc-field{margin-bottom:22px}",
      ".tc-label{display:block;font-size:12px;font-weight:600;color:#495057;margin-bottom:7px}",
      ".tc-hint{display:block;font-size:11.5px;color:#868e96;margin-top:6px;line-height:1.5}",
      ".tc-input{width:100%;min-height:38px;padding:8px 10px;border:1px solid #ced4da;border-radius:5px;font-size:13px;color:#212529;background:#fff;font-family:inherit;transition:border-color .12s,box-shadow .12s}",
      ".tc-input:hover{border-color:#adb5bd}",
      ".tc-input:focus{outline:0;border-color:var(--tc-accent,#714b67);box-shadow:0 0 0 2px rgba(var(--tc-accent-rgb,113,75,103),.12)}",
      "textarea.tc-input{resize:vertical;line-height:1.45}",

      /* color */
      ".tc-color-wrap{display:flex;gap:8px;align-items:center}",
      ".tc-color-swatch{width:40px;height:38px;border-radius:5px;border:1px solid #ced4da;cursor:pointer;flex-shrink:0;padding:3px;background:#fff}",
      ".tc-color-swatch::-webkit-color-swatch-wrapper{padding:0}",
      ".tc-color-swatch::-webkit-color-swatch{border:none;border-radius:3px}",

      /* range */
      ".tc-range-wrap{display:flex;gap:14px;align-items:center}",
      ".tc-range-wrap input[type=range]{flex:1;accent-color:var(--tc-accent,#714b67);cursor:pointer;height:4px}",
      ".tc-range-val{min-width:45px;text-align:right;font-size:12px;font-weight:600;color:#495057;font-variant-numeric:tabular-nums}",

      /* switches */
      ".tc-toggle{position:relative;display:inline-block;width:34px;height:18px;flex-shrink:0}",
      ".tc-toggle input{opacity:0;width:0;height:0;position:absolute}",
      ".tc-toggle-track{position:absolute;inset:0;background:#adb5bd;border-radius:20px;cursor:pointer;transition:background .15s}",
      ".tc-toggle-track::before{content:'';position:absolute;width:14px;height:14px;background:#fff;border-radius:50%;left:2px;top:2px;transition:transform .15s;box-shadow:0 1px 2px rgba(0,0,0,.18)}",
      ".tc-toggle input:checked+.tc-toggle-track{background:var(--tc-accent,#714b67)}",
      ".tc-toggle input:checked+.tc-toggle-track::before{transform:translateX(16px)}",
      ".tc-toggle-row{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:3px 0}",
      ".tc-toggle-row>span{font-size:13px!important;color:#343a40!important}",

      /* preview */
      ".tc-preview{background:#f8f9fa;border:1px solid #e5e7eb;border-radius:7px;padding:18px;margin:0 0 28px}",
      ".tc-preview-label{font-size:10px;font-weight:700;color:#868e96;text-transform:uppercase;letter-spacing:.08em;margin-bottom:12px}",
      ".tc-preview-bar{display:flex;align-items:center;gap:11px;padding:10px 12px;border-radius:5px;border:1px solid #dee2e6;background:#fff;margin-bottom:10px}",
      ".tc-preview-logo{width:30px;height:30px;border-radius:5px;display:flex;align-items:center;justify-content:center}",
      ".tc-preview-name{font-size:13px;font-weight:600;color:#343a40}",
      ".tc-preview-swatch{height:6px;border-radius:3px;margin-bottom:5px}",

      /* presets */
      ".tc-presets{display:flex;flex-wrap:wrap;gap:7px;margin-bottom:26px}",
      ".tc-preset{padding:7px 11px;border-radius:5px;border:1px solid #ced4da;font-size:12px;color:#495057;cursor:pointer;background:#fff;font-family:inherit;transition:all .12s}",
      ".tc-preset:hover{border-color:var(--tc-accent,#714b67);color:var(--tc-accent,#714b67);background:rgba(var(--tc-accent-rgb,113,75,103),.05)}",
      ".tc-preset.active{background:var(--tc-accent,#714b67);color:#fff;border-color:var(--tc-accent,#714b67)}",
      ".tc-logo-upload{margin-top:8px}",
      ".tc-logo-upload input[type=file]{font-size:12px;color:#6c757d}",

      /* footer */
      ".tc-footer{display:flex;gap:8px;justify-content:flex-end;padding:12px 22px;border-top:1px solid #e5e7eb;flex-shrink:0;background:#f8f9fa}",
      ".tc-btn{min-height:34px;padding:7px 18px;border-radius:5px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;transition:all .12s}",
      ".tc-btn-cancel{background:#fff;color:#495057;border:1px solid #ced4da}",
      ".tc-btn-cancel:hover{background:#f1f3f5;border-color:#adb5bd}",
      ".tc-btn-save{background:var(--tc-accent,#714b67);color:#fff;border:1px solid var(--tc-accent,#714b67)}",
      ".tc-btn-save:hover{background:var(--tc-accent-dark,#5d3d55);border-color:var(--tc-accent-dark,#5d3d55)}",

      /* scrollbar */
      ".tc-content::-webkit-scrollbar,.tc-side::-webkit-scrollbar{width:7px}",
      ".tc-content::-webkit-scrollbar-thumb,.tc-side::-webkit-scrollbar-thumb{background:#ced4da;border-radius:8px}",
      ".tc-content::-webkit-scrollbar-track,.tc-side::-webkit-scrollbar-track{background:transparent}",

      /* mobile */
      "@media(max-width:700px){",
        "#tc-admin{padding:10px}",
        ".tc-shell{width:100%;height:96vh;max-height:none;border-radius:8px}",
        ".tc-side{display:none}",
        ".tc-body{flex-direction:column}",
        ".tc-section{padding:24px 20px 35px;max-width:none}",
        ".tc-tabs{display:flex;overflow-x:auto;gap:0;border-bottom:1px solid #e5e7eb;background:#f8f9fa;flex-shrink:0;padding:0 4px}",
        ".tc-tab{padding:10px 12px;font-size:12px;color:#6c757d;border:0;background:none;cursor:pointer;white-space:nowrap;font-family:inherit;border-bottom:2px solid transparent}",
        ".tc-tab.active{color:var(--tc-accent,#714b67);font-weight:600;border-bottom-color:var(--tc-accent,#714b67)}",
        ".tc-header{padding:0 15px}",
        ".tc-tenant-bar{padding:0 15px}",
        ".tc-footer{padding:10px 15px}",
      "}",
      "@media(min-width:701px){.tc-tabs{display:none}}"
    ].join("\n");
    document.head.appendChild(style);
  }

  /* ── Modal opbouwen ─────────────────────────────────────────────── */
  function buildModal() {
    if (document.getElementById("tc-admin")) return;
    injectStyles();

    var wrap = document.createElement("div");
    wrap.id = "tc-admin";
    wrap.setAttribute("data-no-brand", "");

    /* Tenant selector options — respecteer TC lock */
    var tenants = TC.list();
    if (TC.locked && TC.allowedTenants) {
      tenants = tenants.filter(function (s) { return TC.allowedTenants.indexOf(s) !== -1; });
    }
    var isLocked = TC.locked && tenants.length <= 1;
    var options = tenants.map(function (s) {
      return '<option value="' + esc(s) + '"' + (s === TC.tenant ? " selected" : "") + ">" + esc(s) + "</option>";
    }).join("");

    /* Sidebar nav */
    var navHtml = SECTIONS.map(function (sec) {
      var cls = sec.id === _activeSection ? " active" : "";
      return '<button class="tc-nav-item' + cls + '" data-sec="' + sec.id + '" onclick="window._tcNav(\'' + sec.id + '\')">' +
        '<span class="tc-nav-icon">' + sec.icon + '</span>' + esc(sec.label) + '</button>';
    }).join("");

    /* Mobile tabs */
    var tabsHtml = SECTIONS.map(function (sec) {
      var cls = sec.id === _activeSection ? " active" : "";
      return '<button class="tc-tab' + cls + '" data-sec="' + sec.id + '" onclick="window._tcNav(\'' + sec.id + '\')">' +
        sec.icon + ' ' + esc(sec.label) + '</button>';
    }).join("");

    /* Section descriptions */
    var secMeta = {
      general:  { title: "Algemeen",      sub: "Bedrijfsgegevens en identiteit" },
      branding: { title: "Branding",      sub: "Logo, kleuren en visuele stijl" },
      layout:   { title: "Layout",        sub: "Afmetingen en opmaak" },
      labels:   { title: "Labels",        sub: "Benamingen en terminologie" },
      legal:    { title: "Juridisch",     sub: "BTW, RSZ, voorwaarden en voettekst" },
      features: { title: "Features",      sub: "Modules en functies per tenant" }
    };

    /* Build section content */
    var sectionsHtml = SECTIONS.map(function (sec) {
      var cls = sec.id === _activeSection ? " active" : "";
      var meta = secMeta[sec.id];
      var fieldsHtml = "";

      /* Sector presets for labels section */
      if (sec.id === "labels") {
        var presetChips = Object.keys(PRESETS).map(function (pid) {
          return '<button class="tc-preset" data-preset="' + pid + '" onclick="window._tcPreset(\'' + pid + '\')">' +
            esc(PRESETS[pid]._label) + '</button>';
        }).join("");
        fieldsHtml += '<div style="margin-bottom:6px"><span class="tc-label">Sector-preset</span>' +
          '<span class="tc-hint" style="margin-top:0;margin-bottom:10px">Klik op een sector om alle labels automatisch in te vullen.</span></div>' +
          '<div class="tc-presets">' + presetChips + '</div>';
      }

      /* Live preview for branding section */
      if (sec.id === "branding") {
        fieldsHtml += '<div class="tc-preview">' +
          '<div class="tc-preview-label">Live preview</div>' +
          '<div class="tc-preview-bar">' +
            '<div class="tc-preview-logo" id="tc-pv-logo" style="background:#2563eb"></div>' +
            '<span class="tc-preview-name" id="tc-pv-name">Bedrijf</span>' +
          '</div>' +
          '<div class="tc-preview-swatch" id="tc-pv-swatch1" style="background:#2563eb;width:60%"></div>' +
          '<div class="tc-preview-swatch" style="background:#e2e5e9;width:80%"></div>' +
        '</div>';
      }

      /* Fields for this section */
      FIELDS.forEach(function (f) {
        if (f.section !== sec.id) return;
        var id = "tcf-" + f.key;
        var val = esc(TC.all()[f.key] || "");
        var inputHtml;

        if (f.type === "textarea") {
          inputHtml = '<textarea id="' + id + '" rows="' + (f.key === "logo" ? 4 : 2) +
            '" class="tc-input">' + val + '</textarea>';
          if (f.key === "logo") {
            inputHtml += '<div class="tc-logo-upload"><input type="file" id="tcf-logo-file" ' +
              'accept=".svg,image/svg+xml,image/png,image/jpeg,image/webp,image/*"></div>';
          }
        } else if (f.type === "color") {
          var hex = TC.all()[f.key] || "#2563eb";
          inputHtml = '<div class="tc-color-wrap">' +
            '<input type="color" id="' + id + '" value="' + esc(hex) + '" class="tc-color-swatch">' +
            '<input type="text" id="' + id + '-t" value="' + esc(hex) +
            '" class="tc-input" style="flex:1;font-family:monospace;font-size:12px"></div>';
        } else if (f.type === "checkbox") {
          var on = TC.all()[f.key] ? " checked" : "";
          inputHtml = '<div class="tc-toggle-row">' +
            '<span style="font-size:12.5px;color:#334155">' + esc(f.label) + '</span>' +
            '<label class="tc-toggle"><input type="checkbox" id="' + id + '"' + on + '>' +
            '<span class="tc-toggle-track"></span></label></div>';
        } else if (f.type === "range") {
          var rv = Number(TC.all()[f.key]) || f.def || 24;
          inputHtml = '<div class="tc-range-wrap">' +
            '<input type="range" id="' + id + '" min="' + (f.min || 12) + '" max="' + (f.max || 64) +
            '" step="' + (f.step || 1) + '" value="' + rv + '">' +
            '<span class="tc-range-val" id="' + id + '-v">' + rv + 'px</span></div>';
        } else {
          inputHtml = '<input type="text" id="' + id + '" value="' + val + '" class="tc-input">';
        }

        /* Checkbox toggle rows already include the label */
        if (f.type === "checkbox") {
          fieldsHtml += '<div class="tc-field">' + inputHtml +
            (f.hint ? '<span class="tc-hint">' + esc(f.hint) + '</span>' : '') + '</div>';
        } else {
          fieldsHtml += '<div class="tc-field"><label class="tc-label">' + esc(f.label) + '</label>' +
            inputHtml +
            (f.hint ? '<span class="tc-hint">' + esc(f.hint) + '</span>' : '') + '</div>';
        }
      });

      return '<div class="tc-section' + cls + '" id="tc-sec-' + sec.id + '">' +
        '<div class="tc-section-title">' + esc(meta.title) + '</div>' +
        '<div class="tc-section-sub">' + esc(meta.sub) + '</div>' +
        fieldsHtml + '</div>';
    }).join("");

    wrap.innerHTML =
      '<div class="tc-shell">' +
        '<div class="tc-header">' +
          '<h2>Instellingen</h2>' +
          '<button class="tc-close" id="tc-x">&times;</button>' +
        '</div>' +
        '<div class="tc-tenant-bar"' + (isLocked ? ' style="display:none"' : '') + '>' +
          '<span style="font-size:12px;color:#64748b;font-weight:600;white-space:nowrap">Tenant</span>' +
          '<select id="tc-sel">' + options + (TC.locked ? '' : '<option value="__new__">+ Nieuwe tenant…</option>') + '</select>' +
        '</div>' +
        '<div class="tc-tabs">' + tabsHtml + '</div>' +
        '<div class="tc-body">' +
          '<div class="tc-side"><div class="tc-nav">' + navHtml + '</div></div>' +
          '<div class="tc-content">' + sectionsHtml + '</div>' +
        '</div>' +
        '<div class="tc-footer">' +
          '<button class="tc-btn tc-btn-cancel" id="tc-cancel">Annuleren</button>' +
          '<button class="tc-btn tc-btn-save" id="tc-save">Opslaan</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(wrap);
    wireEvents();
  }

  /* ── Navigatie ───────────────────────────────────────────────────── */
  global._tcNav = function (id) {
    _activeSection = id;
    var wrap = document.getElementById("tc-admin");
    if (!wrap) return;
    wrap.querySelectorAll(".tc-section").forEach(function (el) {
      el.classList.toggle("active", el.id === "tc-sec-" + id);
    });
    wrap.querySelectorAll(".tc-nav-item").forEach(function (el) {
      el.classList.toggle("active", el.getAttribute("data-sec") === id);
    });
    wrap.querySelectorAll(".tc-tab").forEach(function (el) {
      el.classList.toggle("active", el.getAttribute("data-sec") === id);
    });
  };

  /* ── Sector-preset toepassen ───────────────────────────────────── */
  global._tcPreset = function (pid) {
    var preset = PRESETS[pid];
    if (!preset) return;

    /* Highlight de actieve chip */
    var wrap = document.getElementById("tc-admin");
    if (wrap) wrap.querySelectorAll(".tc-preset").forEach(function (el) {
      el.classList.toggle("active", el.getAttribute("data-preset") === pid);
    });

    /* Vul de formuliervelden in met de preset-waarden */
    Object.keys(preset).forEach(function (key) {
      if (key === "_label") return;
      var el = document.getElementById("tcf-" + key);
      if (!el) return;
      if (el.type === "checkbox") {
        el.checked = !!preset[key];
      } else {
        el.value = preset[key];
      }
    });

    preview();
    updatePreviewCard();
  };

  /* ── Events koppelen ────────────────────────────────────────────── */
  function wireEvents() {
    var wrap = document.getElementById("tc-admin");
    wrap.addEventListener("click", function (e) { if (e.target === wrap) close(true); });
    document.getElementById("tc-x").onclick = function () { close(true); };
    document.getElementById("tc-cancel").onclick = function () { close(true); };
    document.getElementById("tc-save").onclick = save;

    document.getElementById("tc-sel").onchange = function () {
      var v = this.value;
      if (v === "__new__") { startNew(); return; }
      TC.tenant = v; TC.apply(); fillForm();
      applyAccentColor(TC.all().primaryColor);
    };

    /* Kleurkoppeling picker <-> tekstveld + live preview */
    FIELDS.forEach(function (f) {
      if (f.type !== "color") return;
      var pc = document.getElementById("tcf-" + f.key);
      var pt = document.getElementById("tcf-" + f.key + "-t");
      if (pc && pt) {
        pc.oninput = function () { pt.value = pc.value; preview(); updatePreviewCard(); };
        pt.oninput = function () {
          if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(pt.value)) pc.value = pt.value;
          preview(); updatePreviewCard();
        };
      }
    });

    /* Overige velden */
    FIELDS.forEach(function (f) {
      if (f.type === "color") return;
      var el = document.getElementById("tcf-" + f.key);
      if (!el) return;
      if (f.type === "range") {
        var lv = document.getElementById("tcf-" + f.key + "-v");
        el.oninput = function () {
          if (lv) lv.textContent = el.value + "px";
          preview();
        };
        return;
      }
      el.oninput = function () { preview(); updatePreviewCard(); };
      el.onchange = function () { preview(); updatePreviewCard(); };
    });

    /* Logo file upload */
    var logoTa = document.getElementById("tcf-logo");
    var fi = document.getElementById("tcf-logo-file");
    if (logoTa && fi) {
      fi.onchange = function () {
        var f = fi.files && fi.files[0];
        if (!f) return;
        var rd = new FileReader();
        if (/svg/i.test(f.type) || /\.svg$/i.test(f.name)) {
          rd.onload = function () { logoTa.value = String(rd.result || "").trim(); preview(); };
          rd.readAsText(f);
        } else {
          rd.onload = function () { logoTa.value = String(rd.result || ""); preview(); };
          rd.readAsDataURL(f);
        }
      };
    }
  }

  /* ── Live preview card ──────────────────────────────────────────── */
  function updatePreviewCard() {
    var logo = document.getElementById("tc-pv-logo");
    var name = document.getElementById("tc-pv-name");
    var sw1  = document.getElementById("tc-pv-swatch1");
    if (!logo) return;
    var pc = (document.getElementById("tcf-primaryColor") || {}).value || "#2563eb";
    var nm = (document.getElementById("tcf-companyNameShort") || {}).value || "Bedrijf";
    logo.style.background = pc;
    if (sw1) sw1.style.background = pc;
    if (name) name.textContent = nm;
    /* Accentkleur van de hele modal meebewegen */
    applyAccentColor(pc);
  }

  /* ── Formulier ↔ TC ─────────────────────────────────────────────── */
  function collect() {
    var cfg = {};
    FIELDS.forEach(function (f) {
      var el = document.getElementById("tcf-" + f.key);
      if (!el) return;
      if (f.type === "checkbox") { cfg[f.key] = !!el.checked; return; }
      if (f.type === "range")    { cfg[f.key] = Number(el.value) || f.def || 0; return; }
      var v = el.value;
      if (f.key === "logo") v = normalizeLogo(v);
      cfg[f.key] = v;
    });
    if (!cfg.slug) cfg.slug = "tenant";
    cfg.slug = String(cfg.slug).toLowerCase().replace(/[^a-z0-9_-]/g, "-");
    return cfg;
  }

  function normalizeLogo(v) {
    v = (v || "").trim();
    if (!v) return "";
    if (/^https?:\/\//i.test(v) || /^data:image\//i.test(v)) {
      return '<img src="' + v.replace(/"/g, "&quot;") + '" alt="" style="display:block;height:100%;width:auto">';
    }
    return v;
  }

  function fillForm() {
    var t = TC.all();
    FIELDS.forEach(function (f) {
      var el = document.getElementById("tcf-" + f.key);
      if (!el) return;
      if (f.type === "checkbox") { el.checked = !!t[f.key]; return; }
      if (f.type === "range") {
        var rv = Number(t[f.key]) || f.def || 24;
        el.value = rv;
        var lv = document.getElementById("tcf-" + f.key + "-v");
        if (lv) lv.textContent = rv + "px";
        return;
      }
      if (f.type === "color") {
        var fallback = f.key === "coverColor" ? (t.primaryColor || "#2563eb") : "#2563eb";
        var hex = t[f.key] || fallback;
        el.value = hex;
        var mt = document.getElementById("tcf-" + f.key + "-t");
        if (mt) mt.value = hex;
      } else {
        el.value = t[f.key] || "";
      }
    });
    var sel = document.getElementById("tc-sel");
    if (sel && sel.value !== "__new__") sel.value = TC.tenant;
    updatePreviewCard();
  }

  function preview() {
    var cfg = collect();
    TC.register(cfg.slug, cfg);
    TC.tenant = cfg.slug;
    TC.apply();
  }

  function startNew() {
    var slug = (global.prompt && global.prompt("Nieuwe tenant-ID (bv. 'acme'):", "")) || "";
    slug = slug.toLowerCase().replace(/[^a-z0-9_-]/g, "-");
    if (!slug) { fillForm(); document.getElementById("tc-sel").value = TC.tenant; return; }
    TC.register(slug, { companyNameShort: slug, companyName: "", primaryColor: TC.all().primaryColor });
    TC.tenant = slug; TC.apply();
    rebuildSelect(slug);
    fillForm();
  }

  function rebuildSelect(selected) {
    var sel = document.getElementById("tc-sel");
    if (!sel) return;
    var list = TC.list();
    if (TC.locked && TC.allowedTenants) {
      list = list.filter(function (s) { return TC.allowedTenants.indexOf(s) !== -1; });
    }
    sel.innerHTML = list.map(function (s) {
      return '<option value="' + esc(s) + '"' + (s === selected ? " selected" : "") + ">" + esc(s) + "</option>";
    }).join("") + (TC.locked ? '' : '<option value="__new__">+ Nieuwe tenant…</option>');
  }

  /* ── Opslaan (lokaal + Supabase) ────────────────────────────────── */
  async function save() {
    var cfg = collect();
    TC.register(cfg.slug, cfg);
    TC.tenant = cfg.slug;
    TC.apply();

    try {
      global.localStorage.setItem("qs_tenant_cfg:" + cfg.slug, JSON.stringify(cfg));
      global.localStorage.setItem("qs_tenant", cfg.slug);
    } catch (e) {}

    var saved = "lokaal";
    try {
      var cl = typeof global.supaInit === "function" ? global.supaInit() : null;
      if (cl && cl.from) {
        var row = {};
        Object.keys(DB).forEach(function (k) { if (cfg[k] != null) row[DB[k]] = cfg[k]; });
        var res = await cl.from("qs_tenants").upsert(row, { onConflict: "slug" });
        if (res && res.error) throw new Error(res.error.message);
        saved = "Supabase + lokaal";
      }
    } catch (e) {
      toast("⚠ Supabase-opslag mislukt (" + e.message + ") — lokaal wél bewaard.");
      _originalTenant = cfg.slug; close(false); return;
    }

    _originalTenant = cfg.slug;
    toast("✓ Tenant opgeslagen (" + saved + ")");
    close(false);
  }

  function close(restore) {
    var el = document.getElementById("tc-admin");
    if (el) el.style.display = "none";
    if (restore && _originalTenant) { TC.tenant = _originalTenant; TC.apply(); }
  }

  /* ── Publieke opener + entrypoint ───────────────────────────────── */
  global.openTenantConfig = function () {
    buildModal();
    _originalTenant = TC.tenant;
    _activeSection = "general";
    global._tcNav("general");
    fillForm();
    document.getElementById("tc-admin").style.display = "flex";
    applyAccentColor(TC.all().primaryColor);

    try {
      var cl = typeof global.supaInit === "function" ? global.supaInit() : null;
      if (cl && TC.loadAll) TC.loadAll(cl).then(function () {
        rebuildSelect(TC.tenant);
        fillForm();
      });
    } catch (e) {}
  };

  /* Injecteer menu-item in bestaand settings-menu */
  function injectMenuItem() {
    var menu = document.getElementById("settings-menu");
    if (!menu) return false;
    if (menu.querySelector("[data-tc-menu]")) return true;
    var block = document.createElement("div");
    block.setAttribute("data-tc-menu", "");
    block.innerHTML =
      '<div class="sm-label">White-label</div>' +
      '<button type="button" class="sm-item" data-no-brand ' +
        'onclick="openTenantConfig();(window.closeSettings||function(){})()">' +
        '<span class="sm-icon">&#9881;</span>Tenant-instellingen</button>' +
      '<div class="sm-div"></div>';
    menu.insertBefore(block, menu.firstChild);
    return true;
  }

  /* Zwevende knop als fallback */
  function addFloatingButton() {
    if (!document.body) return;
    if (document.getElementById("tc-fab")) return;
    var b = document.createElement("button");
    b.id = "tc-fab";
    b.type = "button";
    b.setAttribute("data-no-brand", "");
    b.title = "Tenant-instellingen";
    b.innerHTML = "&#9881;";
    b.style.cssText =
      "position:fixed;right:16px;bottom:16px;z-index:2147483000;width:46px;height:46px;border-radius:50%;" +
      "border:none;background:#0f172a;color:#fff;font-size:20px;cursor:pointer;" +
      "box-shadow:0 8px 24px rgba(0,0,0,.28);display:flex;align-items:center;justify-content:center";
    b.onclick = global.openTenantConfig;
    document.body.appendChild(b);
  }

  function ensureEntry() {
    if (injectMenuItem()) {
      var fab = document.getElementById("tc-fab");
      if (fab) fab.parentNode && fab.parentNode.removeChild(fab);
    } else {
      addFloatingButton();
    }
  }

  function startEntry() {
    ensureEntry();
    try { setInterval(ensureEntry, 1500); } catch (e) {}
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startEntry);
  } else {
    startEntry();
  }

})(typeof window !== "undefined" ? window : this);
