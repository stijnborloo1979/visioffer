/* ═══════════════════════════════════════════════════════════════════════
   tenant-admin.js — In-app tenant-configurator voor QuoteStudio
   ───────────────────────────────────────────────────────────────────────
   Drop-in: voeg <script src="tenant-admin.js"></script> ná tenant-config.js
   toe in index.html. Geeft een instellingenscherm waarmee je de actieve
   tenant volledig in de app configureert — sector-onafhankelijk.

     • Live voorbeeld: kleur, merknaam en logo veranderen meteen.
     • Bewaart lokaal (localStorage) én in Supabase (tabel 'tenants') indien
       de app een client levert via window.supaInit().
     • Nieuwe tenant maken = een nieuwe 'slug' typen en opslaan.

   Openen: klik op de knop rechtsonder, of roep window.openTenantConfig() aan
   vanuit een bestaande knop/menu in je app.
   ═══════════════════════════════════════════════════════════════════════ */
(function (global) {
  "use strict";

  if (typeof global.TC === "undefined") {
    console.warn("[tenant-admin] TC ontbreekt — laad tenant-config.js eerst.");
    return;
  }
  var TC = global.TC;   /* zelfde object-referentie; mutaties blijven zichtbaar */

  /* Voorkom dat de globale plak-/sleep-handlers van de app (voor product-
     import) het plakken in dit configuratiescherm kapen. Vroeg geregistreerd
     op window-capture, zodat we vóór de app-handlers komen. Bij 'paste' laten
     we de standaardactie (plakken in het tekstvak) gewoon doorgaan. */
  ["paste", "drop", "dragover", "dragenter"].forEach(function (type) {
    try {
      global.addEventListener(type, function (e) {
        var m = document.getElementById("tc-admin");
        if (!m || m.style.display === "none") return;
        if (!m.contains(e.target)) return;
        e.stopImmediatePropagation();
        if (type !== "paste") e.preventDefault();   /* sleep: browser niet laten navigeren */
      }, true);
    } catch (e) {}
  });

  /* Velddefinities. type: text | color | textarea | url
     hint verschijnt als kleine hulptekst onder het veld. */
  var FIELDS = [
    { key: "slug",             label: "Tenant-ID (slug)", type: "text",
      hint: "Uniek, kleine letters, bv. 'acme'. Bepaalt ?tenant= en de Supabase-rij." },
    { key: "companyNameShort", label: "Merknaam (kort)",  type: "text",
      hint: "Vervangt overal de tekst in de app en is het woordmerk zonder eigen logo." },
    { key: "companyName",      label: "Bedrijfsnaam",     type: "text" },
    { key: "primaryColor",     label: "Merkkleur",        type: "color" },
    { key: "coverColor",       label: "Cover-kleur",      type: "color",
      hint: "Achtergrond van de coverpagina. Leeg/gelijk = volgt de merkkleur." },
    { key: "logoBackdrop",     label: "Logo op wit vlak (cover)", type: "checkbox",
      hint: "Toont een subtiel wit kader achter het cover-logo, leesbaar op elke kleur." },
    { key: "logoSize",         label: "Logogrootte balk", type: "range",
      min: 14, max: 44, step: 1, def: 24,
      hint: "Hoogte van het logo linksboven. De balk is 64px hoog (58px op mobiel)." },
    { key: "coverLogoSize",    label: "Logogrootte cover", type: "range",
      min: 20, max: 90, step: 1, def: 34,
      hint: "Hoogte van het logo op de coverpagina van de offerte." },
    { key: "showMraas",        label: "MRaaS-knop tonen", type: "checkbox",
      hint: "Ricoh-specifiek. Standaard uit; enkel aanzetten voor een Ricoh-tenant." },
    { key: "leaseName",        label: "Naam huurformule", type: "text",
      hint: "Vervangt overal 'Meeting Room as a Service'. Bv. 'Solar as a Service'." },
    { key: "leaseAbbr",        label: "Afkorting huurformule", type: "text",
      hint: "Vervangt overal 'MRaaS'. Bv. 'SaaS'. Leeg = ongewijzigd." },
    { key: "website",          label: "Website",          type: "text" },
    { key: "address",          label: "Adres",            type: "textarea" },
    { key: "vatLabel",         label: "BTW-label",        type: "text" },
    { key: "vatNumber",        label: "BTW-nummer",       type: "text" },
    { key: "rszLabel",         label: "RSZ-label",        type: "text" },
    { key: "rszNumber",        label: "RSZ-nummer",       type: "text" },
    { key: "contactSubtitle",  label: "Contact-ondertitel", type: "text",
      hint: "{companyNameShort} wordt vervangen door de merknaam." },
    { key: "signingLegalUrl",  label: "URL voorwaarden",  type: "url" },
    { key: "pdfFooter",        label: "PDF-voettekst",    type: "text",
      hint: "Tokens: {companyName}, {website}, {companyNameShort}." },
    { key: "pwaName",          label: "PWA-naam",         type: "text" },
    { key: "pwaShortName",     label: "PWA-korte naam",   type: "text" },
    { key: "logo",             label: "Logo (SVG of URL)", type: "textarea",
      hint: "Plak een <svg>…</svg> of een afbeeldings-URL. Leeg = woordmerk in de merkkleur." }
  ];

  /* camelCase → snake_case voor de Supabase 'qs_tenants'-tabel */
  var DB = {
    slug: "slug", companyName: "company_name", companyNameShort: "company_name_short",
    primaryColor: "primary_color", coverColor: "cover_color", website: "website", address: "address",
    rszLabel: "rsz_label", rszNumber: "rsz_number", vatLabel: "vat_label",
    vatNumber: "vat_number", signingLegalUrl: "signing_legal_url",
    contactSubtitle: "contact_subtitle", pwaName: "pwa_name",
    pwaShortName: "pwa_short_name", logo: "logo_svg", logoWhite: "logo_svg_white",
    pdfFooter: "pdf_footer", logoBackdrop: "logo_backdrop", showMraas: "show_mraas",
    logoSize: "logo_size", coverLogoSize: "cover_logo_size",
    leaseName: "lease_name", leaseAbbr: "lease_abbr"
  };

  var _originalTenant = null;

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function toast(msg) {
    try { if (typeof global.toast === "function") return global.toast(msg); } catch (e) {}
    console.log("[tenant-admin]", msg);
  }

  /* ── Modal opbouwen ─────────────────────────────────────────────── */
  function buildModal() {
    if (document.getElementById("tc-admin")) return;

    var wrap = document.createElement("div");
    wrap.id = "tc-admin";
    wrap.setAttribute("data-no-brand", "");
    wrap.style.cssText =
      "display:none;position:fixed;inset:0;z-index:100000;background:rgba(15,23,42,.55);" +
      "align-items:center;justify-content:center;padding:16px;font-family:Inter,Arial,sans-serif";

    var tenants = TC.list();
    var options = tenants.map(function (s) {
      return '<option value="' + esc(s) + '"' + (s === TC.tenant ? " selected" : "") + ">" + esc(s) + "</option>";
    }).join("");

    var rows = FIELDS.map(function (f) {
      var id = "tcf-" + f.key;
      var val = esc(TC.all()[f.key] || "");
      var input;
      if (f.type === "textarea") {
        input = '<textarea id="' + id + '" rows="' + (f.key === "logo" ? 4 : 2) +
          '" style="' + inputCss() + 'resize:vertical;font-family:inherit">' + val + "</textarea>";
      } else if (f.type === "color") {
        var hex = (TC.all()[f.key] || "#2563eb");
        input = '<div style="display:flex;gap:8px;align-items:center">' +
          '<input type="color" id="' + id + '" value="' + esc(hex) +
          '" style="width:46px;height:38px;border:1px solid #d1d5db;border-radius:8px;background:#fff;cursor:pointer">' +
          '<input type="text" id="' + id + '-t" value="' + esc(hex) +
          '" style="' + inputCss() + 'flex:1"></div>';
      } else if (f.type === "checkbox") {
        var on = TC.all()[f.key] ? " checked" : "";
        input = '<input type="checkbox" id="' + id + '"' + on +
          ' style="width:18px;height:18px;vertical-align:middle;cursor:pointer;margin-top:2px">';
      } else if (f.type === "range") {
        var rv = Number(TC.all()[f.key]) || f.def || 24;
        input = '<div style="display:flex;gap:10px;align-items:center">' +
          '<input type="range" id="' + id + '" min="' + (f.min || 12) + '" max="' + (f.max || 64) +
          '" step="' + (f.step || 1) + '" value="' + rv +
          '" style="flex:1;accent-color:' + (TC.all().primaryColor || "#2563eb") + ';cursor:pointer">' +
          '<span id="' + id + '-v" style="min-width:44px;text-align:right;font-size:12px;' +
          'font-weight:700;color:#0f172a;font-variant-numeric:tabular-nums">' + rv + 'px</span></div>';
      } else {
        input = '<input type="text" id="' + id + '" value="' + val + '" style="' + inputCss() + '">';
      }
      return '<label style="display:block;margin-bottom:14px">' +
        '<span style="display:block;font-size:12px;font-weight:600;color:#334155;margin-bottom:5px">' +
        esc(f.label) + "</span>" + input +
        (f.hint ? '<span style="display:block;font-size:11px;color:#94a3b8;margin-top:4px">' + esc(f.hint) + "</span>" : "") +
        "</label>";
    }).join("");

    wrap.innerHTML =
      '<div style="background:#fff;border-radius:16px;max-width:520px;width:100%;max-height:92vh;' +
        'display:flex;flex-direction:column;box-shadow:0 24px 70px rgba(0,0,0,.35)">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;padding:18px 22px;border-bottom:1px solid #eef2f7">' +
          '<div style="font-weight:800;font-size:16px;color:#0f172a">Tenant-instellingen</div>' +
          '<button id="tc-x" style="background:none;border:none;font-size:22px;cursor:pointer;color:#94a3b8;line-height:1">&times;</button>' +
        "</div>" +
        '<div style="padding:18px 22px;overflow-y:auto">' +
          '<label style="display:block;margin-bottom:16px">' +
            '<span style="display:block;font-size:12px;font-weight:600;color:#334155;margin-bottom:5px">Actieve tenant</span>' +
            '<select id="tc-sel" style="' + inputCss() + '">' + options +
              '<option value="__new__">+ Nieuwe tenant…</option></select>' +
          "</label>" +
          rows +
        "</div>" +
        '<div style="display:flex;gap:10px;justify-content:flex-end;padding:16px 22px;border-top:1px solid #eef2f7">' +
          '<button id="tc-cancel" style="' + btnCss("#fff", "#475569", "1px solid #d1d5db") + '">Annuleren</button>' +
          '<button id="tc-save" style="' + btnCss("#2563eb", "#fff", "none") + '">Opslaan</button>' +
        "</div>" +
      "</div>";

    document.body.appendChild(wrap);

    /* Events */
    wrap.addEventListener("click", function (e) { if (e.target === wrap) close(true); });
    document.getElementById("tc-x").onclick = function () { close(true); };
    document.getElementById("tc-cancel").onclick = function () { close(true); };
    document.getElementById("tc-save").onclick = save;

    document.getElementById("tc-sel").onchange = function () {
      var v = this.value;
      if (v === "__new__") { startNew(); return; }
      TC.tenant = v; TC.apply(); fillForm();
    };

    /* Kleurkoppeling picker <-> tekstveld + live preview op elke kleur */
    FIELDS.forEach(function (f) {
      if (f.type !== "color") return;
      var pc = document.getElementById("tcf-" + f.key);
      var pt = document.getElementById("tcf-" + f.key + "-t");
      if (pc && pt) {
        pc.oninput = function () { pt.value = pc.value; preview(); };
        pt.oninput = function () {
          if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(pt.value)) { pc.value = pt.value; }
          preview();
        };
      }
    });
    FIELDS.forEach(function (f) {
      if (f.type === "color") return;   /* kleuren zijn hierboven al gewired */
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
      el.oninput = preview; el.onchange = preview;
    });

    /* Logo-bestand kiezen (betrouwbaarder dan plakken) */
    var logoTa = document.getElementById("tcf-logo");
    if (logoTa && !document.getElementById("tcf-logo-file")) {
      var fi = document.createElement("input");
      fi.type = "file";
      fi.id = "tcf-logo-file";
      fi.accept = ".svg,image/svg+xml,image/png,image/jpeg,image/webp,image/*";
      fi.style.cssText = "display:block;margin-top:8px;font-size:12px;color:#475569";
      fi.onchange = function () {
        var f = fi.files && fi.files[0];
        if (!f) return;
        var rd = new FileReader();
        if (/svg/i.test(f.type) || /\.svg$/i.test(f.name)) {
          rd.onload = function () { logoTa.value = String(rd.result || "").trim(); preview(); };
          rd.readAsText(f);            /* SVG als tekst → inline <svg> */
        } else {
          rd.onload = function () { logoTa.value = String(rd.result || ""); preview(); };
          rd.readAsDataURL(f);         /* raster → data-URL, wordt <img> in normalizeLogo */
        }
      };
      logoTa.parentNode.appendChild(fi);
    }
  }

  function inputCss() {
    return "width:100%;padding:9px 11px;border:1px solid #d1d5db;border-radius:8px;" +
      "font-size:13px;color:#0f172a;box-sizing:border-box;";
  }
  function btnCss(bg, fg, border) {
    return "padding:9px 18px;border-radius:9px;border:" + border + ";background:" + bg +
      ";color:" + fg + ";font-size:13px;font-weight:700;cursor:pointer;font-family:inherit";
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

  /* SVG blijft SVG; een URL/dataURL wordt in een <img> gewikkeld */
  function normalizeLogo(v) {
    v = (v || "").trim();
    if (!v) return "";
    if (/^https?:\/\//i.test(v) || /^data:image\//i.test(v)) {
      return '<img src="' + v.replace(/"/g, "&quot;") + '" alt="" style="display:block;height:100%;width:auto">';
    }
    return v; /* aangenomen: <svg> of andere inline HTML */
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
        /* cover-kleur valt terug op de merkkleur wanneer nog niet gezet */
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
  }

  function preview() {
    var cfg = collect();
    TC.register(cfg.slug, cfg);
    TC.tenant = cfg.slug;   /* niet persisteren tot Opslaan */
    TC.apply();
  }

  function startNew() {
    var slug = (global.prompt && global.prompt("Nieuwe tenant-ID (bv. 'acme'):", "")) || "";
    slug = slug.toLowerCase().replace(/[^a-z0-9_-]/g, "-");
    if (!slug) { fillForm(); document.getElementById("tc-sel").value = TC.tenant; return; }
    /* Start van een lege basis (neem de huidige kleur als vertrekpunt) */
    TC.register(slug, { companyNameShort: slug, companyName: "", primaryColor: TC.all().primaryColor });
    TC.tenant = slug; TC.apply();
    rebuildSelect(slug);
    fillForm();
  }

  function rebuildSelect(selected) {
    var sel = document.getElementById("tc-sel");
    if (!sel) return;
    /* Bepaal welke tenants getoond worden */
    var slugs;
    if (TC.allowedTenants && TC.locked) {
      slugs = TC.allowedTenants;
      sel.disabled = (slugs.length <= 1);
    } else {
      slugs = TC.list();
      sel.disabled = false;
    }
    sel.innerHTML = slugs.map(function (s) {
      /* Toon bedrijfsnaam als die beschikbaar is */
      var label = s;
      try { var t = TC.all && TC.tenant === s ? TC.all() : null;
        if (t && t.companyNameShort && t.companyNameShort !== s) label = s + " — " + t.companyNameShort;
      } catch(e){}
      return '<option value="' + esc(s) + '"' + (s === selected ? " selected" : "") + ">" + esc(label) + "</option>";
    }).join("")
    + (!TC.locked ? '<option value="__new__">+ Nieuwe tenant…</option>' : '');
  }

  /* ── Opslaan (lokaal + Supabase) ────────────────────────────────── */
  async function save() {
    var cfg = collect();
    TC.register(cfg.slug, cfg);
    TC.tenant = cfg.slug;
    TC.apply();

    /* Lokaal bewaren zodat het na herladen blijft (ook zonder Supabase) */
    try {
      global.localStorage.setItem("qs_tenant_cfg:" + cfg.slug, JSON.stringify(cfg));
      global.localStorage.setItem("qs_tenant", cfg.slug);
    } catch (e) {}

    /* Supabase upsert indien de app een client aanbiedt */
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

  /* ── Publieke opener + zwevende knop ────────────────────────────── */
  global.openTenantConfig = function () {
    buildModal();
    _originalTenant = TC.tenant;
    fillForm();
    document.getElementById("tc-admin").style.display = "flex";
    /* Haal alle tenants uit Supabase op, zodat de keuzelijst er élke toont
       (ook tenants die niet lokaal op dit toestel bewaard zijn). */
    try {
      var cl = typeof global.supaInit === "function" ? global.supaInit() : null;
      if (cl && TC.loadAll) TC.loadAll(cl).then(function () {
        rebuildSelect(TC.tenant);
        fillForm();
      });
    } catch (e) {}
  };

  /* Voeg het item toe aan het bestaande instellingen-dropdown (#settings-menu).
     Geeft true wanneer het menu bestaat en het item aanwezig is. */
  function injectMenuItem() {
    var menu = document.getElementById("settings-menu");
    if (!menu) return false;
    if (menu.querySelector("[data-tc-menu]")) return true;   /* al aanwezig */
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

  /* Zwevende knop — enkel als terugvaloptie wanneer het menu niet bestaat */
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

  /* Zorg voor precies één ingang: menu-item indien mogelijk, anders de knop.
     Herhaalt zich, zodat een herrender van de app het item terugzet. */
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
