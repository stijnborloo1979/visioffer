/* ═══════════════════════════════════════════════════════════════════════
   catalog-import.js — AI-powered catalogus-import voor VisiOffer
   ───────────────────────────────────────────────────────────────────────
   Drop-in: voeg <script src="catalog-import.js"></script> ná tenant-admin.js
   toe in index.html.

   Voegt een "Catalogus" sectie toe aan het tenant-admin panel, plus een
   zelfstandig catalogusbeheer-paneel toegankelijk via het Geavanceerd-menu.

   Vereist: tenant-config.js (TC), Supabase client, quotestudio-worker
   ═══════════════════════════════════════════════════════════════════════ */
(function (global) {
  "use strict";

  var TC = global.TC;
  var WORKER = "https://quotestudio.stijn-borloo-968.workers.dev";

  /* ── Helpers ──────────────────────────────────────────────────────────── */
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function getToken() {
    try {
      var raw = localStorage.getItem("sb-dgzkuqvviivoafinrfty-auth-token");
      if (raw) { var d = JSON.parse(raw); return d.access_token || ""; }
    } catch (e) {}
    return "";
  }

  function isAdmin() {
    try {
      var raw = localStorage.getItem("sb-dgzkuqvviivoafinrfty-auth-token");
      if (!raw) return false;
      var d = JSON.parse(raw);
      var meta = (d.user && d.user.app_metadata) || {};
      return meta.role === "admin" || meta.role === "super";
    } catch (e) { return false; }
  }

  function toast(msg) {
    try { if (typeof global.toast === "function") return global.toast(msg); } catch (e) {}
    console.log("[catalog]", msg);
  }

  /* ── State ────────────────────────────────────────────────────────────── */
  var catalog = [];        // geladen producten
  var importing = false;
  var searchQuery = "";
  var filterCategory = "";
  var sortField = "name";
  var sortDir = "asc";

  /* ── Supabase direct queries ──────────────────────────────────────────── */
  var SB_URL = "https://dgzkuqvviivoafinrfty.supabase.co";

  async function sbGet(path) {
    var r = await fetch(SB_URL + path, {
      headers: {
        apikey: TC.get("supabaseAnonKey") || localStorage.getItem("qs_anon_key") || "",
        Authorization: "Bearer " + getToken(),
        "x-tenant-id": TC.get("slug") || "",
      },
    });
    return r.json();
  }

  async function sbDelete(id) {
    var r = await fetch(SB_URL + "/rest/v1/qs_products?id=eq." + id, {
      method: "DELETE",
      headers: {
        apikey: TC.get("supabaseAnonKey") || localStorage.getItem("qs_anon_key") || "",
        Authorization: "Bearer " + getToken(),
        "Content-Type": "application/json",
        "x-tenant-id": TC.get("slug") || "",
      },
    });
    return r.ok;
  }

  async function sbPatch(id, data) {
    var r = await fetch(SB_URL + "/rest/v1/qs_products?id=eq." + id, {
      method: "PATCH",
      headers: {
        apikey: TC.get("supabaseAnonKey") || localStorage.getItem("qs_anon_key") || "",
        Authorization: "Bearer " + getToken(),
        "Content-Type": "application/json",
        Prefer: "return=representation",
        "x-tenant-id": TC.get("slug") || "",
      },
      body: JSON.stringify(data),
    });
    return r.json();
  }

  /* ── Catalogus laden ──────────────────────────────────────────────────── */
  async function loadCatalog() {
    try {
      var data = await sbGet(
        "/rest/v1/qs_products?tenant_id=eq." + encodeURIComponent(TC.get("slug") || "") +
        "&order=sort_order.asc,name.asc&limit=2000"
      );
      catalog = Array.isArray(data) ? data : [];
    } catch (e) {
      catalog = [];
      console.error("[catalog] laden mislukt:", e);
    }
    return catalog;
  }

  /* ── Categorieën ophalen ──────────────────────────────────────────────── */
  function getCategories() {
    var cats = {};
    catalog.forEach(function (p) { if (p.category) cats[p.category] = true; });
    return Object.keys(cats).sort();
  }

  /* ── Gefilterde producten ─────────────────────────────────────────────── */
  function filtered() {
    var q = searchQuery.toLowerCase();
    var list = catalog.filter(function (p) {
      if (filterCategory && p.category !== filterCategory) return false;
      if (!q) return true;
      return (p.name || "").toLowerCase().includes(q) ||
             (p.reference || "").toLowerCase().includes(q) ||
             (p.brand || "").toLowerCase().includes(q) ||
             (p.category || "").toLowerCase().includes(q);
    });
    list.sort(function (a, b) {
      var va = a[sortField] || "", vb = b[sortField] || "";
      if (typeof va === "number" && typeof vb === "number") return sortDir === "asc" ? va - vb : vb - va;
      va = String(va).toLowerCase(); vb = String(vb).toLowerCase();
      return sortDir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
    });
    return list;
  }

  /* ── Bestand lezen als tekst / base64 ──────────────────────────────────── */
  function readFileAsText(file) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(r.result); };
      r.onerror = function () { reject(new Error("Leesfout")); };
      r.readAsText(file);
    });
  }

  function readFileAsBase64(file) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(r.result.split(",")[1]); };
      r.onerror = function () { reject(new Error("Leesfout")); };
      r.readAsDataURL(file);
    });
  }

  /* ── Excel/CSV parsen (client-side, met XLSX lib) ─────────────────────── */
  function parseExcel(file) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () {
        try {
          var wb = XLSX.read(r.result, { type: "array" });
          var ws = wb.Sheets[wb.SheetNames[0]];
          var csv = XLSX.utils.sheet_to_csv(ws, { FS: "\t", RS: "\n" });
          resolve(csv);
        } catch (e) { reject(e); }
      };
      r.onerror = reject;
      r.readAsArrayBuffer(file);
    });
  }

  /* ── Import versturen naar Worker ─────────────────────────────────────── */
  async function doImport(content, fileType, filename) {
    importing = true;
    renderPanel();

    try {
      var res = await fetch(WORKER + "/catalog-import", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + getToken(),
        },
        body: JSON.stringify({
          content: content,
          file_type: fileType,
          filename: filename,
        }),
      });
      var data = await res.json();

      if (!res.ok || data.error) {
        toast("❌ Import mislukt: " + (data.error || "Onbekende fout"));
        importing = false;
        renderPanel();
        return;
      }

      toast("✅ " + (data.products_imported || 0) + " producten geïmporteerd");
      await loadCatalog();
      importing = false;
      renderPanel();
    } catch (e) {
      toast("❌ " + e.message);
      importing = false;
      renderPanel();
    }
  }

  /* ── Bestand verwerken ────────────────────────────────────────────────── */
  async function handleFile(file) {
    var name = file.name || "upload";
    var ext = name.split(".").pop().toLowerCase();

    if (["xlsx", "xls", "xlsm", "csv", "tsv"].includes(ext)) {
      /* Excel/CSV → parse client-side, stuur als tekst */
      if (typeof XLSX !== "undefined" && ["xlsx", "xls", "xlsm"].includes(ext)) {
        var csv = await parseExcel(file);
        return doImport(csv, ext, name);
      }
      var txt = await readFileAsText(file);
      return doImport(txt, ext, name);
    }

    if (["jpg", "jpeg", "png", "webp"].includes(ext)) {
      /* Afbeelding → base64, Claude vision */
      var b64 = await readFileAsBase64(file);
      return doImport(b64, "image", name);
    }

    if (ext === "pdf") {
      /* PDF → base64 tekst-extractie (Worker/Claude kan PDF lezen) */
      var b64pdf = await readFileAsBase64(file);
      return doImport(b64pdf, "pdf", name);
    }

    /* Platte tekst als fallback */
    var text = await readFileAsText(file);
    return doImport(text, ext, name);
  }

  /* ── Product verwijderen ──────────────────────────────────────────────── */
  async function deleteProduct(id) {
    if (!confirm("Product definitief verwijderen?")) return;
    var ok = await sbDelete(id);
    if (ok) {
      catalog = catalog.filter(function (p) { return p.id !== id; });
      toast("Product verwijderd");
      renderPanel();
    } else {
      toast("❌ Verwijderen mislukt");
    }
  }

  /* ── Alle producten verwijderen ────────────────────────────────────────── */
  async function clearCatalog() {
    if (!confirm("ALLE " + catalog.length + " producten verwijderen? Dit kan niet ongedaan worden.")) return;
    var slug = TC.get("slug") || "";
    var r = await fetch(SB_URL + "/rest/v1/qs_products?tenant_id=eq." + encodeURIComponent(slug), {
      method: "DELETE",
      headers: {
        apikey: TC.get("supabaseAnonKey") || localStorage.getItem("qs_anon_key") || "",
        Authorization: "Bearer " + getToken(),
        "Content-Type": "application/json",
        "x-tenant-id": slug,
      },
    });
    if (r.ok) {
      catalog = [];
      toast("Catalogus gewist");
      renderPanel();
    } else {
      toast("❌ Wissen mislukt");
    }
  }

  /* ── CSS (eenmalig) ───────────────────────────────────────────────────── */
  function injectStyles() {
    if (document.getElementById("cat-import-css")) return;
    var s = document.createElement("style");
    s.id = "cat-import-css";
    s.textContent = `
      #cat-panel { position:fixed; inset:0; z-index:10001; display:none;
        font-family:'Space Grotesk','Inter',system-ui,sans-serif; }
      #cat-panel.open { display:flex; }
      .cat-backdrop { position:absolute; inset:0; background:rgba(0,0,0,.45); }
      .cat-modal { position:relative; margin:auto; width:min(95vw,900px); max-height:90vh;
        background:#fff; border-radius:14px; display:flex; flex-direction:column;
        box-shadow:0 24px 80px rgba(0,0,0,.25); overflow:hidden; }

      .cat-header { display:flex; align-items:center; justify-content:space-between;
        padding:18px 24px; border-bottom:1px solid #e5e7eb; flex-shrink:0; }
      .cat-header h2 { font-size:18px; font-weight:600; color:#1e293b; margin:0; }
      .cat-close { background:none; border:none; font-size:22px; cursor:pointer;
        color:#64748b; padding:4px 8px; border-radius:6px; }
      .cat-close:hover { background:#f1f5f9; }

      .cat-toolbar { display:flex; gap:8px; padding:14px 24px; border-bottom:1px solid #f1f5f9;
        flex-wrap:wrap; align-items:center; flex-shrink:0; }
      .cat-search { flex:1; min-width:180px; padding:8px 12px; border:1px solid #e2e8f0;
        border-radius:8px; font-size:13px; font-family:inherit; outline:none; }
      .cat-search:focus { border-color:#2563eb; box-shadow:0 0 0 3px rgba(37,99,235,.12); }
      .cat-select { padding:8px 12px; border:1px solid #e2e8f0; border-radius:8px;
        font-size:13px; font-family:inherit; background:#fff; cursor:pointer; }

      .cat-body { flex:1; overflow-y:auto; padding:0; }
      .cat-table { width:100%; border-collapse:collapse; font-size:13px; }
      .cat-table th { position:sticky; top:0; background:#f8fafc; padding:10px 14px;
        text-align:left; font-weight:500; color:#64748b; border-bottom:1px solid #e5e7eb;
        cursor:pointer; user-select:none; white-space:nowrap; }
      .cat-table th:hover { color:#1e293b; }
      .cat-table td { padding:10px 14px; border-bottom:1px solid #f1f5f9; color:#334155;
        vertical-align:top; }
      .cat-table tr:hover td { background:#f8fafc; }
      .cat-ref { color:#64748b; font-size:12px; font-family:'SF Mono','Fira Code',monospace; }
      .cat-cat { display:inline-block; padding:2px 8px; border-radius:4px;
        background:#eff6ff; color:#2563eb; font-size:11px; font-weight:500; }
      .cat-price { font-weight:500; font-variant-numeric:tabular-nums; white-space:nowrap; }
      .cat-actions { display:flex; gap:4px; }
      .cat-btn-sm { padding:4px 8px; border:1px solid #e2e8f0; border-radius:6px;
        background:#fff; cursor:pointer; font-size:12px; color:#64748b; }
      .cat-btn-sm:hover { background:#f1f5f9; border-color:#cbd5e1; }
      .cat-btn-sm.danger { color:#ef4444; }
      .cat-btn-sm.danger:hover { background:#fef2f2; border-color:#fca5a5; }

      .cat-footer { display:flex; align-items:center; justify-content:space-between;
        padding:14px 24px; border-top:1px solid #e5e7eb; flex-shrink:0; gap:12px;
        flex-wrap:wrap; }
      .cat-count { font-size:13px; color:#64748b; }

      .cat-upload-zone { border:2px dashed #cbd5e1; border-radius:12px; padding:32px 24px;
        text-align:center; margin:24px; cursor:pointer; transition:all .2s; }
      .cat-upload-zone:hover, .cat-upload-zone.dragover { border-color:#2563eb;
        background:#eff6ff; }
      .cat-upload-zone h3 { font-size:16px; font-weight:600; color:#1e293b; margin-bottom:6px; }
      .cat-upload-zone p { font-size:13px; color:#64748b; margin:0; }
      .cat-upload-zone .formats { font-size:11px; color:#94a3b8; margin-top:8px; }

      .cat-importing { text-align:center; padding:40px 24px; }
      .cat-importing .spinner { display:inline-block; width:32px; height:32px;
        border:3px solid #e2e8f0; border-top-color:#2563eb; border-radius:50%;
        animation:catspin .8s linear infinite; }
      @keyframes catspin { to { transform:rotate(360deg); } }
      .cat-importing p { font-size:14px; color:#64748b; margin-top:12px; }

      .cat-empty { text-align:center; padding:48px 24px; }
      .cat-empty h3 { font-size:16px; font-weight:600; color:#1e293b; margin-bottom:6px; }
      .cat-empty p { font-size:13px; color:#94a3b8; }

      .cat-btn { padding:8px 18px; border-radius:8px; border:none; font-size:13px;
        font-weight:500; cursor:pointer; font-family:inherit; transition:all .15s; }
      .cat-btn-primary { background:#2563eb; color:#fff; }
      .cat-btn-primary:hover { background:#1d4ed8; }
      .cat-btn-outline { background:#fff; color:#334155; border:1px solid #e2e8f0; }
      .cat-btn-outline:hover { background:#f8fafc; border-color:#cbd5e1; }
      .cat-btn-danger { background:#fff; color:#ef4444; border:1px solid #fca5a5; }
      .cat-btn-danger:hover { background:#fef2f2; }

      /* Toevoegen aan offerte dropdown */
      .cat-add-menu { position:absolute; right:14px; background:#fff; border:1px solid #e2e8f0;
        border-radius:8px; box-shadow:0 8px 24px rgba(0,0,0,.12); padding:4px;
        min-width:180px; z-index:10; }
      .cat-add-item { display:block; width:100%; text-align:left; padding:8px 12px;
        border:none; background:none; cursor:pointer; font-size:13px; color:#334155;
        border-radius:4px; font-family:inherit; }
      .cat-add-item:hover { background:#f1f5f9; }
    `;
    document.head.appendChild(s);
  }

  /* ── Panel renderen ──────────────────────────────────────────────────── */
  function renderPanel() {
    var panel = document.getElementById("cat-panel");
    if (!panel) return;
    var modal = panel.querySelector(".cat-modal");
    if (!modal) return;

    var cats = getCategories();
    var list = filtered();

    var html = "";

    /* Header */
    html += '<div class="cat-header">';
    html += '  <h2>📦 Productcatalogus</h2>';
    html += '  <button class="cat-close" onclick="closeCatalog()" title="Sluiten">✕</button>';
    html += "</div>";

    if (importing) {
      html += '<div class="cat-importing"><div class="spinner"></div>';
      html += "<p>Claude analyseert je bestand…<br>Dit kan even duren bij grote bestanden.</p></div>";
      modal.innerHTML = html;
      return;
    }

    /* Toolbar */
    html += '<div class="cat-toolbar">';
    html += '  <input class="cat-search" type="search" placeholder="Zoek op naam, ref, merk…" value="' + esc(searchQuery) + '" oninput="catSearch(this.value)">';
    if (cats.length > 0) {
      html += '  <select class="cat-select" onchange="catFilterCat(this.value)">';
      html += '    <option value="">Alle categorieën</option>';
      cats.forEach(function (c) {
        html += '    <option value="' + esc(c) + '"' + (filterCategory === c ? " selected" : "") + ">" + esc(c) + "</option>";
      });
      html += "  </select>";
    }
    html += '  <button class="cat-btn cat-btn-primary" onclick="catUploadClick()">＋ Importeer</button>';
    html += "</div>";

    /* Body */
    html += '<div class="cat-body">';

    if (catalog.length === 0) {
      /* Lege staat → upload zone */
      html += '<div class="cat-upload-zone" id="cat-dropzone" onclick="catUploadClick()">';
      html += "  <h3>Importeer je productcatalogus</h3>";
      html += "  <p>Upload een Excel, CSV, PDF of foto van je prijslijst.<br>Claude herkent automatisch producten, prijzen en artikelnummers.</p>";
      html += '  <p class="formats">Excel (.xlsx, .csv) · PDF · Afbeelding (.jpg, .png)</p>';
      html += "</div>";
    } else if (list.length === 0) {
      html += '<div class="cat-empty"><h3>Geen resultaten</h3><p>Pas je zoekopdracht of filter aan.</p></div>';
    } else {
      /* Tabel */
      var arrow = function (f) {
        if (sortField !== f) return "";
        return sortDir === "asc" ? " ↑" : " ↓";
      };
      html += '<table class="cat-table">';
      html += "<thead><tr>";
      html += '<th onclick="catSort(\'name\')">Product' + arrow("name") + "</th>";
      html += '<th onclick="catSort(\'reference\')">Ref' + arrow("reference") + "</th>";
      html += '<th onclick="catSort(\'category\')">Categorie' + arrow("category") + "</th>";
      html += '<th onclick="catSort(\'unit_price\')">Prijs' + arrow("unit_price") + "</th>";
      html += "<th></th>";
      html += "</tr></thead><tbody>";
      list.forEach(function (p) {
        html += "<tr>";
        html += '<td><strong>' + esc(p.name) + "</strong>";
        if (p.brand) html += '<br><span style="font-size:12px;color:#64748b">' + esc(p.brand) + "</span>";
        html += "</td>";
        html += '<td><span class="cat-ref">' + esc(p.reference || "—") + "</span></td>";
        html += "<td>" + (p.category ? '<span class="cat-cat">' + esc(p.category) + "</span>" : "—") + "</td>";
        html += '<td class="cat-price">' + (p.unit_price != null ? "€ " + Number(p.unit_price).toFixed(2) : "—") + "</td>";
        html += '<td class="cat-actions">';
        html += '  <button class="cat-btn-sm" onclick="catAddToQuote(\'' + p.id + '\')" title="Toevoegen aan offerte">＋</button>';
        html += '  <button class="cat-btn-sm danger" onclick="deleteProduct(\'' + p.id + '\')" title="Verwijderen">✕</button>';
        html += "</td>";
        html += "</tr>";
      });
      html += "</tbody></table>";
    }
    html += "</div>";

    /* Footer */
    html += '<div class="cat-footer">';
    html += '  <span class="cat-count">' + list.length + " / " + catalog.length + " producten</span>";
    html += '  <div style="display:flex;gap:8px">';
    if (catalog.length > 0) {
      html += '  <button class="cat-btn cat-btn-outline" onclick="catExportCSV()">⬇ CSV export</button>';
      html += '  <button class="cat-btn cat-btn-danger" onclick="clearCatalog()">🗑 Alles wissen</button>';
    }
    html += "  </div>";
    html += "</div>";

    /* Hidden file input */
    html += '<input type="file" id="cat-file-input" style="display:none" accept=".xlsx,.xls,.xlsm,.csv,.tsv,.pdf,.jpg,.jpeg,.png,.webp" onchange="catFileSelected(this)">';

    modal.innerHTML = html;

    /* Drop zone events */
    var dz = document.getElementById("cat-dropzone");
    if (dz) {
      dz.addEventListener("dragover", function (e) { e.preventDefault(); dz.classList.add("dragover"); });
      dz.addEventListener("dragleave", function () { dz.classList.remove("dragover"); });
      dz.addEventListener("drop", function (e) {
        e.preventDefault();
        dz.classList.remove("dragover");
        if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
      });
    }
  }

  /* ── Publieke functies (global scope voor onclick) ─────────────────────── */
  global.openCatalog = async function () {
    if (!isAdmin()) { toast("Alleen voor beheerders"); return; }
    injectStyles();
    var panel = document.getElementById("cat-panel");
    if (!panel) {
      panel = document.createElement("div");
      panel.id = "cat-panel";
      panel.innerHTML = '<div class="cat-backdrop" onclick="closeCatalog()"></div><div class="cat-modal"></div>';
      document.body.appendChild(panel);
    }
    panel.classList.add("open");
    await loadCatalog();
    renderPanel();
  };

  global.closeCatalog = function () {
    var panel = document.getElementById("cat-panel");
    if (panel) panel.classList.remove("open");
  };

  global.catSearch = function (q) { searchQuery = q; renderPanel(); };
  global.catFilterCat = function (c) { filterCategory = c; renderPanel(); };
  global.catSort = function (field) {
    if (sortField === field) { sortDir = sortDir === "asc" ? "desc" : "asc"; }
    else { sortField = field; sortDir = "asc"; }
    renderPanel();
  };

  global.catUploadClick = function () {
    var inp = document.getElementById("cat-file-input");
    if (inp) inp.click();
  };

  global.catFileSelected = function (inp) {
    if (inp.files && inp.files[0]) handleFile(inp.files[0]);
    inp.value = "";
  };

  global.deleteProduct = deleteProduct;
  global.clearCatalog = clearCatalog;

  /* Product toevoegen aan huidige offerte */
  global.catAddToQuote = function (productId) {
    var product = catalog.find(function (p) { return p.id === productId; });
    if (!product) return;

    /* Integratie met bestaande offerte-logica:
       voegItemToe(zaalIdx, naam, ref, prijs, aantal, foto, beschrijving) */
    if (typeof global.voegItemToe === "function") {
      global.voegItemToe(
        0,                               // eerste zaal
        product.name,
        product.reference || "",
        product.unit_price || 0,
        1,
        product.image_url || "",
        product.description || ""
      );
      toast("✅ " + product.name + " toegevoegd");
    } else if (typeof global.addItemToRoom === "function") {
      global.addItemToRoom(0, {
        name: product.name,
        ref: product.reference || "",
        price: product.unit_price || 0,
        qty: 1,
        photo: product.image_url || "",
        desc: product.description || "",
      });
      toast("✅ " + product.name + " toegevoegd");
    } else {
      toast("Offerte-functie niet gevonden — open eerst een offerte");
    }
  };

  /* CSV export */
  global.catExportCSV = function () {
    if (!catalog.length) return;
    var headers = ["Naam", "Referentie", "Categorie", "Merk", "Prijs", "Eenheid", "Beschrijving"];
    var rows = [headers.join(";")];
    catalog.forEach(function (p) {
      rows.push([
        '"' + (p.name || "").replace(/"/g, '""') + '"',
        '"' + (p.reference || "").replace(/"/g, '""') + '"',
        '"' + (p.category || "").replace(/"/g, '""') + '"',
        '"' + (p.brand || "").replace(/"/g, '""') + '"',
        p.unit_price != null ? p.unit_price : "",
        '"' + (p.unit || "").replace(/"/g, '""') + '"',
        '"' + (p.description || "").replace(/"/g, '""') + '"',
      ].join(";"));
    });
    var blob = new Blob(["\uFEFF" + rows.join("\n")], { type: "text/csv;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "catalogus-" + (TC.get("slug") || "export") + ".csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  /* ── Menu-item injecteren in Geavanceerd-menu ─────────────────────────── */
  function injectMenuItem() {
    if (!isAdmin()) return;
    var MAX_TRIES = 30, tries = 0;
    var iv = setInterval(function () {
      tries++;
      if (tries > MAX_TRIES) { clearInterval(iv); return; }

      /* Zoek het Geavanceerd dropdown-menu */
      var menus = document.querySelectorAll(".adv-menu, .advanced-menu, [id*='adv']");
      menus.forEach(function (menu) {
        if (menu.querySelector(".cat-menu-item")) return;

        /* Zoek de eerste separator of het einde */
        var sep = menu.querySelector("hr, .divider") || menu.lastElementChild;
        var btn = document.createElement("button");
        btn.className = "cat-menu-item";
        btn.style.cssText = "display:block;width:100%;text-align:left;padding:10px 16px;" +
          "border:none;background:none;cursor:pointer;font-size:13px;color:#334155;font-family:inherit;";
        btn.innerHTML = "📦 Productcatalogus";
        btn.onmouseover = function () { btn.style.background = "#f1f5f9"; };
        btn.onmouseout = function () { btn.style.background = "none"; };
        btn.onclick = function (e) {
          e.stopPropagation();
          menu.style.display = "none";
          global.openCatalog();
        };
        if (sep && sep !== menu.lastElementChild) {
          menu.insertBefore(btn, sep);
        } else {
          menu.appendChild(btn);
        }
      });

      /* Stop als we minstens één hebben geïnjecteerd */
      if (document.querySelector(".cat-menu-item")) clearInterval(iv);
    }, 500);
  }

  /* ── Init ──────────────────────────────────────────────────────────────── */
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", injectMenuItem);
  } else {
    injectMenuItem();
  }

})(window);
