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

  /* ── Stylesheet (eenmalig injecteren) ───────────────────────────── */
  function injectStyles() {
    if (document.getElementById("tc-admin-css")) return;
    var style = document.createElement("style");
    style.id = "tc-admin-css";
    style.textContent = [
      "#tc-admin *{box-sizing:border-box;margin:0}",
      "#tc-admin{display:none;position:fixed;inset:0;z-index:100000;background:rgba(15,23,42,.55);align-items:center;justify-content:center;padding:12px;font-family:Inter,-apple-system,system-ui,sans-serif}",

      /* Outer shell — large & roomy */
      ".tc-shell{background:#fff;border-radius:16px;width:100%;max-width:860px;height:92vh;max-height:800px;display:flex;flex-direction:column;box-shadow:0 24px 70px rgba(0,0,0,.32);overflow:hidden}",

      /* Header */
      ".tc-header{display:flex;align-items:center;justify-content:space-between;padding:18px 28px;border-bottom:1px solid #f1f3f5;flex-shrink:0}",
      ".tc-header h2{font-size:17px;font-weight:700;color:#0f172a}",
      ".tc-close{background:none;border:none;font-size:22px;cursor:pointer;color:#94a3b8;line-height:1;padding:4px 6px;border-radius:6px}",
      ".tc-close:hover{color:#475569;background:#f1f3f5}",

      /* Tenant selector bar */
      ".tc-tenant-bar{display:flex;align-items:center;gap:12px;padding:12px 28px;border-bottom:1px solid #f1f3f5;background:#fafbfc;flex-shrink:0}",
      ".tc-tenant-bar select{flex:1;max-width:280px;padding:9px 12px;border:1px solid #e2e5e9;border-radius:8px;font-size:13px;color:#0f172a;background:#fff;font-family:inherit}",

      /* Body = sidebar + content */
      ".tc-body{display:flex;flex:1;min-height:0;overflow:hidden}",

      /* Sidebar — wider */
      ".tc-side{width:180px;background:#f8f9fb;border-right:1px solid #f1f3f5;padding:12px 0;overflow-y:auto;flex-shrink:0}",
      ".tc-nav{display:flex;flex-direction:column;gap:2px;padding:0 8px}",
      ".tc-nav-item{display:flex;align-items:center;gap:10px;padding:11px 16px;font-size:13px;color:#64748b;cursor:pointer;border:none;background:none;text-align:left;font-family:inherit;width:100%;border-radius:8px;border-left:none;transition:all .15s}",
      ".tc-nav-item:hover{background:#eef0f4;color:#334155}",
      ".tc-nav-item.active{background:#eff6ff;color:#2563eb;font-weight:600}",
      ".tc-nav-icon{font-size:16px;flex-shrink:0;width:22px;text-align:center}",

      /* Content area — generous padding */
      ".tc-content{flex:1;overflow-y:auto;padding:0}",

      /* Section */
      ".tc-section{display:none;padding:28px 32px}",
      ".tc-section.active{display:block}",
      ".tc-section-title{font-size:16px;font-weight:700;color:#0f172a;margin-bottom:4px}",
      ".tc-section-sub{font-size:13px;color:#94a3b8;margin-bottom:24px}",

      /* Form fields — more spacing */
      ".tc-field{margin-bottom:20px}",
      ".tc-label{display:block;font-size:12px;font-weight:600;color:#475569;margin-bottom:7px;text-transform:uppercase;letter-spacing:.03em}",
      ".tc-hint{display:block;font-size:11.5px;color:#94a3b8;margin-top:6px;line-height:1.5}",
      ".tc-input{width:100%;padding:10px 13px;border:1px solid #e2e5e9;border-radius:8px;font-size:14px;color:#0f172a;background:#fff;font-family:inherit;transition:border-color .15s}",
      ".tc-input:focus{outline:none;border-color:#2563eb;box-shadow:0 0 0 3px rgba(37,99,235,.1)}",
      "textarea.tc-input{resize:vertical}",

      /* Color picker */
      ".tc-color-wrap{display:flex;gap:10px;align-items:center}",
      ".tc-color-swatch{width:44px;height:44px;border-radius:10px;border:2px solid #e2e5e9;cursor:pointer;flex-shrink:0;padding:0}",
      ".tc-color-swatch::-webkit-color-swatch-wrapper{padding:0}",
      ".tc-color-swatch::-webkit-color-swatch{border:none;border-radius:8px}",

      /* Range slider */
      ".tc-range-wrap{display:flex;gap:12px;align-items:center}",
      ".tc-range-wrap input[type=range]{flex:1;accent-color:#2563eb;cursor:pointer;height:6px}",
      ".tc-range-val{min-width:44px;text-align:right;font-size:13px;font-weight:700;color:#0f172a;font-variant-numeric:tabular-nums}",

      /* Checkbox as toggle */
      ".tc-toggle{position:relative;display:inline-block;width:44px;height:24px;flex-shrink:0}",
      ".tc-toggle input{opacity:0;width:0;height:0;position:absolute}",
      ".tc-toggle-track{position:absolute;inset:0;background:#d1d5db;border-radius:24px;cursor:pointer;transition:background .2s}",
      ".tc-toggle-track::before{content:'';position:absolute;width:18px;height:18px;background:#fff;border-radius:50%;left:3px;top:3px;transition:transform .2s;box-shadow:0 1px 3px rgba(0,0,0,.15)}",
      ".tc-toggle input:checked+.tc-toggle-track{background:#2563eb}",
      ".tc-toggle input:checked+.tc-toggle-track::before{transform:translateX(20px)}",
      ".tc-toggle-row{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:6px 0}",

      /* Live preview card */
      ".tc-preview{background:#f8f9fb;border:1px solid #f1f3f5;border-radius:12px;padding:18px;margin-bottom:24px}",
      ".tc-preview-label{font-size:11px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:.04em;margin-bottom:12px}",
      ".tc-preview-bar{display:flex;align-items:center;gap:12px;padding:10px 14px;border-radius:10px;border:1px solid #e2e5e9;background:#fff;margin-bottom:10px}",
      ".tc-preview-logo{width:32px;height:32px;border-radius:8px;display:flex;align-items:center;justify-content:center}",
      ".tc-preview-name{font-size:14px;font-weight:600;color:#1e293b}",
      ".tc-preview-swatch{height:8px;border-radius:4px;margin-bottom:5px}",

      /* Footer */
      ".tc-footer{display:flex;gap:12px;justify-content:flex-end;padding:16px 28px;border-top:1px solid #f1f3f5;flex-shrink:0;background:#fafbfc}",
      ".tc-btn{padding:10px 24px;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;font-family:inherit;border:none;transition:all .15s}",
      ".tc-btn-cancel{background:#fff;color:#475569;border:1px solid #e2e5e9}",
      ".tc-btn-cancel:hover{background:#f8f9fb}",
      ".tc-btn-save{background:#2563eb;color:#fff}",
      ".tc-btn-save:hover{background:#1d4ed8}",

      /* Sector presets */
      ".tc-presets{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:20px}",
      ".tc-preset{padding:7px 14px;border-radius:99px;border:1px solid #e2e5e9;font-size:12.5px;color:#64748b;cursor:pointer;background:#fff;font-family:inherit;transition:all .15s}",
      ".tc-preset:hover{border-color:#93c5fd;color:#2563eb;background:#eff6ff}",
      ".tc-preset.active{background:#2563eb;color:#fff;border-color:#2563eb}",

      /* Logo upload area */
      ".tc-logo-upload{margin-top:8px}",
      ".tc-logo-upload input[type=file]{font-size:12px;color:#64748b}",

      /* Mobile: hide sidebar, show tabs */
      "@media(max-width:520px){",
        ".tc-shell{max-width:100%;max-height:95vh;height:95vh;border-radius:10px}",
        ".tc-side{display:none}",
        ".tc-body{flex-direction:column}",
        ".tc-section{padding:20px 18px}",
        ".tc-tabs{display:flex;overflow-x:auto;gap:0;border-bottom:1px solid #f1f3f5;background:#fafbfc;flex-shrink:0;padding:0 4px}",
        ".tc-tab{padding:10px 12px;font-size:12px;color:#64748b;border:none;background:none;cursor:pointer;white-space:nowrap;font-family:inherit;border-bottom:2px solid transparent}",
        ".tc-tab.active{color:#2563eb;font-weight:600;border-bottom-color:#2563eb}",
        ".tc-header{padding:14px 18px}",
        ".tc-tenant-bar{padding:10px 18px}",
        ".tc-footer{padding:12px 18px}",
      "}",
      "@media(min-width:521px){",
        ".tc-tabs{display:none}",
      "}"
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

    /* Tenant selector options */
    var tenants = TC.list();
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
        '<div class="tc-tenant-bar">' +
          '<span style="font-size:12px;color:#64748b;font-weight:600;white-space:nowrap">Tenant</span>' +
          '<select id="tc-sel">' + options + '<option value="__new__">+ Nieuwe tenant…</option></select>' +
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
    sel.innerHTML = TC.list().map(function (s) {
      return '<option value="' + esc(s) + '"' + (s === selected ? " selected" : "") + ">" + esc(s) + "</option>";
    }).join("") + '<option value="__new__">+ Nieuwe tenant…</option>';
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
