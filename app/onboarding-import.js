/* ═══════════════════════════════════════════════════════════════════════
   onboarding-import.js — Docx-intake importeren voor super-admins
   ───────────────────────────────────────────────────────────────────────
   Drop-in: voeg <script src="onboarding-import.js"></script> ná
   super-admin.js toe in index.html.

   Voegt een "📄 Intake" tab toe aan het super-admin panel.
   Upload een ingevuld VisiOffer Onboarding Intake .docx →
   Claude parst het → preview → toepassen op een tenant.

   Vereist: JSZip (reeds geladen), super-admin.js, tenant-config.js.
   ═══════════════════════════════════════════════════════════════════════ */
(function (global) {
  "use strict";

  var TC = global.TC;
  if (!TC) return;

  /* ── Helpers ──────────────────────────────────────────────────────── */
  function workerUrl() { return global._workerUrl || ""; }
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function toast(m) {
    if (typeof global.toast === "function") global.toast(m);
    else console.log("[onboarding-import]", m);
  }
  function supa() { return typeof global.supaInit === "function" ? global.supaInit() : null; }
  async function authToken() {
    var c = supa(); if (!c) return null;
    var s = await c.auth.getSession();
    return (s && s.data && s.data.session) ? s.data.session.access_token : null;
  }

  /* ── State ───────────────────────────────────────────────────────── */
  var _parsed = null;   // resultaat van Claude parse
  var _rawText = "";    // ruwe tekst uit docx

  /* ── CSS ──────────────────────────────────────────────────────────── */
  var CSS = [
    "#oi-drop{border:2px dashed #cbd5e1;border-radius:10px;padding:32px 20px;text-align:center;cursor:pointer;transition:border-color .2s,background .2s;margin-bottom:16px}",
    "#oi-drop:hover,#oi-drop.drag{border-color:var(--red,#2563eb);background:#f0f7ff}",
    "#oi-drop .oi-icon{font-size:32px;margin-bottom:8px}",
    "#oi-drop .oi-label{font-size:13px;color:#64748b}",
    "#oi-drop .oi-label b{color:#1e293b}",
    "#oi-file{display:none}",
    "#oi-status{font-size:12px;color:#64748b;margin-bottom:12px;min-height:18px}",
    "#oi-preview{max-height:50vh;overflow-y:auto;margin-bottom:14px}",
    ".oi-section{margin-bottom:14px}",
    ".oi-section-head{font-size:11px;font-weight:700;color:var(--red,#2563eb);text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px;padding-bottom:4px;border-bottom:1px solid #e5e7eb}",
    ".oi-row{display:flex;gap:8px;padding:4px 0;font-size:12.5px;border-bottom:1px solid #f1f5f9}",
    ".oi-row:last-child{border-bottom:none}",
    ".oi-key{width:160px;min-width:160px;font-weight:600;color:#475569}",
    ".oi-val{flex:1;color:#1e293b;word-break:break-word}",
    ".oi-val.empty{color:#cbd5e1;font-style:italic}",
    ".oi-users{width:100%;border-collapse:collapse;font-size:12px;margin-top:4px}",
    ".oi-users th{text-align:left;font-size:10px;font-weight:700;color:#64748b;padding:4px 6px;border-bottom:1px solid #e5e7eb}",
    ".oi-users td{padding:4px 6px;border-bottom:1px solid #f1f5f9}",
    ".oi-target{margin-bottom:14px}",
    ".oi-target label{font-size:11px;font-weight:600;color:#64748b;display:block;margin-bottom:3px}",
    ".oi-target select,.oi-target input{width:100%;padding:7px 10px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;font-family:inherit;box-sizing:border-box}",
    ".oi-actions{display:flex;gap:8px;justify-content:flex-end}",
    ".oi-btn{padding:8px 18px;border:none;border-radius:6px;font-size:12.5px;font-weight:600;cursor:pointer;font-family:inherit;transition:opacity .15s}",
    ".oi-btn:disabled{opacity:.5;cursor:default}",
    ".oi-btn-p{background:var(--red,#2563eb);color:#fff}",
    ".oi-btn-p:hover:not(:disabled){opacity:.88}",
    ".oi-btn-s{background:#f1f5f9;color:#334155}",
    ".oi-btn-s:hover:not(:disabled){background:#e2e8f0}",
    ".oi-ok{background:#f0fdf4;color:#166534;font-size:12px;padding:8px 12px;border-radius:6px;margin-top:8px}",
    ".oi-err{background:#fef2f2;color:#dc2626;font-size:12px;padding:8px 12px;border-radius:6px;margin-top:8px}",
    ".oi-spinner{display:inline-block;width:14px;height:14px;border:2px solid #cbd5e1;border-top-color:var(--red,#2563eb);border-radius:50%;animation:oi-spin .6s linear infinite;vertical-align:middle;margin-right:6px}",
    "@keyframes oi-spin{to{transform:rotate(360deg)}}"
  ].join("\n");

  var _cssInjected = false;
  function injectCSS() {
    if (_cssInjected) return;
    var s = document.createElement("style");
    s.textContent = CSS;
    document.head.appendChild(s);
    _cssInjected = true;
  }

  /* ── Docx text extraction via JSZip ──────────────────────────────── */
  async function extractDocxText(file) {
    if (typeof JSZip === "undefined") throw new Error("JSZip niet geladen");
    var zip = await JSZip.loadAsync(file);
    var docXml = zip.file("word/document.xml");
    if (!docXml) throw new Error("Geen word/document.xml gevonden in het bestand");
    var xml = await docXml.async("string");
    // Strip XML tags, keep text content
    var text = xml
      .replace(/<w:tab[^/]*\/>/gi, "\t")
      .replace(/<w:br[^/]*\/>/gi, "\n")
      .replace(/<\/w:p>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    return text;
  }

  /* ── Claude parse via Worker ─────────────────────────────────────── */
  async function parseWithClaude(text) {
    var url = workerUrl();
    if (!url) throw new Error("Worker URL niet ingesteld");
    var token = await authToken();
    if (!token) throw new Error("Niet ingelogd");

    var res = await fetch(url.replace(/\/+$/, "") + "/onboarding-import", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + token
      },
      body: JSON.stringify({ text: text })
    });
    var data = await res.json().catch(function () { return {}; });
    if (!res.ok || data.error) throw new Error(data.error || "Fout " + res.status);
    return data.parsed;
  }

  /* ── Render preview ──────────────────────────────────────────────── */
  function renderPreview(d) {
    var html = "";

    function section(title, rows) {
      html += '<div class="oi-section"><div class="oi-section-head">' + esc(title) + '</div>';
      rows.forEach(function (r) {
        var val = r[1];
        var cls = val ? "" : " empty";
        html += '<div class="oi-row"><div class="oi-key">' + esc(r[0]) + '</div><div class="oi-val' + cls + '">' + esc(val || "niet ingevuld") + '</div></div>';
      });
      html += '</div>';
    }

    section("Bedrijfsgegevens", [
      ["Bedrijfsnaam", d.companyName],
      ["Handelsnaam", d.companyNameShort],
      ["BTW-nummer", d.vatNumber],
      ["Adres", d.address],
      ["Website", d.website],
      ["Contactpersoon", d.contactPerson],
      ["E-mail contact", d.contactEmail],
      ["Telefoon contact", d.contactPhone]
    ]);

    section("Sector & activiteit", [
      ["Sector(en)", (d.sectors || []).join(", ")],
      ["Offertes per maand", d.quotesPerMonth],
      ["Gemiddelde offertewaarde", d.avgQuoteValue],
      ["Huidige tool", d.currentTool]
    ]);

    section("Branding", [
      ["Primaire kleur", d.primaryColor],
      ["Secundaire kleur", d.secondaryColor],
      ["Achtergrondkleur", d.backgroundColor],
      ["Tekstkleur", d.textColor]
    ]);

    section("Offerte-instellingen", [
      ["Geldigheidsduur", d.quoteValidity],
      ["Betalingstermijn", d.paymentTerms],
      ["BTW-percentage", d.vatPercentage],
      ["Voettekst", d.pdfFooter],
      ["Valuta", d.currency]
    ]);

    section("Terminologie", [
      ["Offerte heet", d.quoteLabel],
      ["Ruimte heet", d.roomLabel],
      ["Product heet", d.productLabel]
    ]);

    section("Installatie", [
      ["Installatie aanbieden", d.offersInstallation],
      ["Uurtarief", d.installRate],
      ["Minimum uren", d.installMinHours],
      ["Tier — Plug & Play", d.tierPlugPlay],
      ["Tier — Standaard", d.tierStandard],
      ["Tier — Complex", d.tierComplex],
      ["Tier — Zwaar", d.tierHeavy]
    ]);

    section("Facturatie", [
      ["Facturatie inrichten", d.setupInvoicing],
      ["Factuurnummering", d.invoiceFormat],
      ["IBAN", d.iban],
      ["OGM gebruiken", d.useOGM],
      ["Betalingstermijn factuur", d.invoicePaymentTerms]
    ]);

    // Users table
    if (d.users && d.users.length) {
      html += '<div class="oi-section"><div class="oi-section-head">Teamleden</div>';
      html += '<table class="oi-users"><tr><th>Naam</th><th>E-mail</th><th>Rol</th><th>Telefoon</th></tr>';
      d.users.forEach(function (u) {
        html += '<tr><td>' + esc(u.name) + '</td><td>' + esc(u.email) + '</td><td>' + esc(u.role) + '</td><td>' + esc(u.phone) + '</td></tr>';
      });
      html += '</table></div>';
    }

    if (d.extraNotes) {
      section("Extra opmerkingen", [["", d.extraNotes]]);
    }

    return html;
  }

  /* ── Apply parsed data to tenant ─────────────────────────────────── */
  async function applyToTenant(tenantSlug, d) {
    var c = supa();
    if (!c) throw new Error("Supabase niet beschikbaar");

    // Map sector to preset key
    var sectorMap = {
      "av": "av", "it": "av", "av / it": "av",
      "solar": "solar", "zonnepanelen": "solar",
      "beveiliging": "security", "security": "security",
      "hvac": "hvac", "klimaat": "hvac",
      "events": "events", "evenementen": "events",
      "interieur": "interior", "interior": "interior"
    };
    var sectorKey = null;
    if (d.sectors && d.sectors.length) {
      var first = d.sectors[0].toLowerCase().trim();
      sectorKey = sectorMap[first] || null;
    }

    // Build tenant update row
    var row = {};
    if (d.companyName) row.company_name = d.companyName;
    if (d.companyNameShort) row.company_name_short = d.companyNameShort;
    else if (d.companyName) row.company_name_short = d.companyName;
    if (d.primaryColor) row.primary_color = d.primaryColor;
    if (d.website) row.website = d.website;
    if (d.address) row.address = d.address;
    if (d.vatNumber) {
      row.vat_label = "Ondernemingsnummer bij de BTW";
      row.vat_number = d.vatNumber;
    }
    if (d.pdfFooter) row.pdf_footer = d.pdfFooter;

    // Sector terminology
    if (sectorKey && typeof global._tcPresets !== "undefined") {
      // Apply preset labels
      var preset = global._tcPresets[sectorKey];
      if (preset) {
        if (preset.roomLabel) row.room_label = preset.roomLabel;
        if (preset.roomLabelPlural) row.room_label_plural = preset.roomLabelPlural;
        if (preset.productLabel) row.product_label = preset.productLabel;
        if (preset.productLabelPlural) row.product_label_plural = preset.productLabelPlural;
        if (preset.leaseName) row.lease_name = preset.leaseName;
        if (preset.leaseAbbr) row.lease_abbr = preset.leaseAbbr;
        if (preset.showMraas != null) row.show_mraas = preset.showMraas;
      }
    }

    // Custom terminology overrides from the intake
    if (d.roomLabel) {
      row.room_label = d.roomLabel;
      // Try to pluralize simply
      if (!d.roomLabel.endsWith("s") && !d.roomLabel.endsWith("en")) {
        row.room_label_plural = d.roomLabel + (d.roomLabel.endsWith("e") ? "s" : "en");
      }
    }
    if (d.productLabel) {
      row.product_label = d.productLabel;
      if (!d.productLabel.endsWith("s") && !d.productLabel.endsWith("en")) {
        row.product_label_plural = d.productLabel + (d.productLabel.endsWith("e") ? "s" : "en");
      }
    }

    // Sector tag
    if (sectorKey) row.sector = sectorKey;

    // Update tenant in Supabase
    var res = await c.from("qs_tenants").update(row).eq("slug", tenantSlug);
    if (res.error) throw new Error("Tenant update mislukt: " + res.error.message);

    // Also update locally
    TC.register(tenantSlug, {
      companyName: row.company_name || undefined,
      companyNameShort: row.company_name_short || undefined,
      primaryColor: row.primary_color || undefined,
      website: row.website || undefined,
      address: row.address || undefined,
      vatNumber: row.vat_number || undefined,
      vatLabel: row.vat_label || undefined,
      pdfFooter: row.pdf_footer || undefined,
      roomLabel: row.room_label || undefined,
      roomLabelPlural: row.room_label_plural || undefined,
      productLabel: row.product_label || undefined,
      productLabelPlural: row.product_label_plural || undefined,
      leaseName: row.lease_name || undefined,
      leaseAbbr: row.lease_abbr || undefined,
      showMraas: row.show_mraas != null ? row.show_mraas : undefined,
    });

    return { tenantUpdated: true, row: row };
  }

  /* ── Create users via Worker ─────────────────────────────────────── */
  async function createUsers(tenantSlug, users) {
    var url = workerUrl();
    var token = await authToken();
    var created = [];
    var errors = [];

    for (var i = 0; i < users.length; i++) {
      var u = users[i];
      if (!u.email) continue;
      try {
        var res = await fetch(url.replace(/\/+$/, "") + "/invite-user", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer " + token
          },
          body: JSON.stringify({
            email: u.email,
            tenant_slug: tenantSlug
          })
        });
        var data = await res.json().catch(function () { return {}; });
        if (data.ok) {
          created.push(u.email);
          // Set role if admin
          if (u.role && u.role.toLowerCase() === "admin" && data.user_id) {
            await fetch(url.replace(/\/+$/, "") + "/set-role", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": "Bearer " + token
              },
              body: JSON.stringify({ user_id: data.user_id, role: "admin" })
            });
          }
        } else {
          errors.push(u.email + ": " + (data.error || "onbekend"));
        }
      } catch (e) {
        errors.push(u.email + ": " + e.message);
      }
    }
    return { created: created, errors: errors };
  }

  /* ── Build the import tab panel ──────────────────────────────────── */
  function buildPanel() {
    return '<div id="oi-panel" style="display:none">' +
      '<div id="oi-upload">' +
        '<div id="oi-drop">' +
          '<div class="oi-icon">📄</div>' +
          '<div class="oi-label">Sleep het ingevulde <b>Onboarding Intake .docx</b> hierheen<br>of klik om te kiezen</div>' +
        '</div>' +
        '<input type="file" id="oi-file" accept=".docx">' +
      '</div>' +
      '<div id="oi-status"></div>' +
      '<div id="oi-preview"></div>' +
      '<div id="oi-apply" style="display:none">' +
        '<div class="oi-target">' +
          '<label>Toepassen op tenant</label>' +
          '<select id="oi-tenant"></select>' +
        '</div>' +
        '<div class="oi-actions">' +
          '<button class="oi-btn oi-btn-s" onclick="oiReset()">Opnieuw</button>' +
          '<button class="oi-btn oi-btn-s" id="oi-btn-users" onclick="oiCreateUsers()" style="display:none">👤 Users aanmaken</button>' +
          '<button class="oi-btn oi-btn-p" onclick="oiApply()">✓ Tenant configureren</button>' +
        '</div>' +
        '<div id="oi-result"></div>' +
      '</div>' +
    '</div>';
  }

  /* ── Inject tab into super-admin modal ───────────────────────────── */
  var _injected = false;
  function injectTab() {
    if (_injected) return;
    var tabs = document.querySelector("#sa-modal .sa-tabs");
    var body = document.getElementById("sa-body");
    if (!tabs || !body) return;

    injectCSS();

    // Add tab button
    var btn = document.createElement("button");
    btn.className = "sa-tab";
    btn.textContent = "📄 Intake";
    btn.onclick = function () { global.saTab("oi", btn); };
    tabs.appendChild(btn);

    // Add panel
    var panel = document.createElement("div");
    panel.innerHTML = buildPanel();
    body.appendChild(panel.firstChild);

    // Wire up saTab to handle "oi"
    var origSaTab = global.saTab;
    global.saTab = function (id, b) {
      var oiPanel = document.getElementById("oi-panel");
      if (oiPanel) oiPanel.style.display = (id === "oi") ? "" : "none";
      if (id === "oi") {
        // Deselect other tabs
        Array.prototype.forEach.call(document.querySelectorAll(".sa-tab"), function (t) { t.classList.remove("on"); });
        if (b) b.classList.add("on");
        // Hide other panels
        ["list", "add", "members"].forEach(function (t) {
          var p = document.getElementById("sa-panel-" + t);
          if (p) p.style.display = "none";
        });
        initUpload();
      } else {
        origSaTab(id, b);
      }
    };

    _injected = true;
  }

  /* ── Upload handling ─────────────────────────────────────────────── */
  function initUpload() {
    var drop = document.getElementById("oi-drop");
    var fileInput = document.getElementById("oi-file");
    if (!drop || !fileInput) return;

    // Remove old listeners by cloning
    var newDrop = drop.cloneNode(true);
    drop.parentNode.replaceChild(newDrop, drop);
    drop = newDrop;

    var newInput = fileInput.cloneNode(true);
    fileInput.parentNode.replaceChild(newInput, fileInput);
    fileInput = newInput;

    drop.addEventListener("click", function () { fileInput.click(); });
    drop.addEventListener("dragover", function (e) { e.preventDefault(); drop.classList.add("drag"); });
    drop.addEventListener("dragleave", function () { drop.classList.remove("drag"); });
    drop.addEventListener("drop", function (e) {
      e.preventDefault();
      drop.classList.remove("drag");
      if (e.dataTransfer.files.length) processFile(e.dataTransfer.files[0]);
    });
    fileInput.addEventListener("change", function () {
      if (fileInput.files.length) processFile(fileInput.files[0]);
    });
  }

  async function processFile(file) {
    if (!file.name.toLowerCase().endsWith(".docx")) {
      setStatus("⚠️ Alleen .docx-bestanden worden ondersteund.", true);
      return;
    }
    setStatus('<span class="oi-spinner"></span>Tekst extracten uit ' + esc(file.name) + '…');

    try {
      _rawText = await extractDocxText(file);
      if (_rawText.length < 50) throw new Error("Het bestand lijkt leeg of beschadigd");

      setStatus('<span class="oi-spinner"></span>Claude analyseert het intakeformulier…');

      _parsed = await parseWithClaude(_rawText);

      // Show preview
      document.getElementById("oi-preview").innerHTML = renderPreview(_parsed);
      document.getElementById("oi-upload").style.display = "none";
      document.getElementById("oi-apply").style.display = "";

      // Show users button if there are users
      var usersBtn = document.getElementById("oi-btn-users");
      if (usersBtn && _parsed.users && _parsed.users.length) {
        usersBtn.style.display = "";
      }

      // Fill tenant selector
      fillTenantSelect();

      setStatus("✓ Intake succesvol geparsed — controleer de gegevens en klik op 'Tenant configureren'.");
    } catch (e) {
      setStatus("❌ " + e.message, true);
    }
  }

  function setStatus(html, isError) {
    var el = document.getElementById("oi-status");
    if (el) {
      el.innerHTML = html;
      el.style.color = isError ? "#dc2626" : "#64748b";
    }
  }

  async function fillTenantSelect() {
    var sel = document.getElementById("oi-tenant");
    if (!sel) return;
    var c = supa();
    var tenants = [];
    if (c) {
      try {
        var r = await c.rpc("all_tenants");
        tenants = (r && r.data) || [];
      } catch (e) {}
    }
    sel.innerHTML = tenants.map(function (t) {
      return '<option value="' + esc(t.slug) + '">' + esc(t.company_name || t.slug) + ' (' + esc(t.slug) + ')</option>';
    }).join("");
  }

  /* ── Global actions ──────────────────────────────────────────────── */
  global.oiReset = function () {
    _parsed = null;
    _rawText = "";
    document.getElementById("oi-upload").style.display = "";
    document.getElementById("oi-apply").style.display = "none";
    document.getElementById("oi-preview").innerHTML = "";
    document.getElementById("oi-result").innerHTML = "";
    setStatus("");
    var usersBtn = document.getElementById("oi-btn-users");
    if (usersBtn) usersBtn.style.display = "none";
  };

  global.oiApply = async function () {
    if (!_parsed) return;
    var slug = (document.getElementById("oi-tenant") || {}).value;
    if (!slug) { toast("Selecteer eerst een tenant"); return; }

    var result = document.getElementById("oi-result");
    result.innerHTML = '<div style="font-size:12px;color:#64748b"><span class="oi-spinner"></span>Tenant configureren…</div>';

    try {
      var r = await applyToTenant(slug, _parsed);
      result.innerHTML = '<div class="oi-ok">✓ Tenant <b>' + esc(slug) + '</b> geconfigureerd! ' +
        Object.keys(r.row).length + ' velden bijgewerkt.</div>';
      toast("✓ Onboarding intake toegepast op " + slug);
    } catch (e) {
      result.innerHTML = '<div class="oi-err">❌ ' + esc(e.message) + '</div>';
    }
  };

  global.oiCreateUsers = async function () {
    if (!_parsed || !_parsed.users || !_parsed.users.length) return;
    var slug = (document.getElementById("oi-tenant") || {}).value;
    if (!slug) { toast("Selecteer eerst een tenant"); return; }

    var result = document.getElementById("oi-result");
    result.innerHTML = '<div style="font-size:12px;color:#64748b"><span class="oi-spinner"></span>Users aanmaken en uitnodigen…</div>';

    try {
      var r = await createUsers(slug, _parsed.users);
      var msg = "✓ " + r.created.length + " user(s) uitgenodigd";
      if (r.errors.length) msg += " · " + r.errors.length + " fout(en): " + r.errors.join("; ");
      result.innerHTML = '<div class="' + (r.errors.length ? "oi-err" : "oi-ok") + '">' + esc(msg) + '</div>';
    } catch (e) {
      result.innerHTML = '<div class="oi-err">❌ ' + esc(e.message) + '</div>';
    }
  };

  /* ── Expose presets for sector mapping ────────────────────────────── */
  // Try to grab presets from tenant-admin scope (they're in a closure)
  // We define a fallback mapping here
  global._tcPresets = global._tcPresets || {
    av:       { roomLabel: "Zaal", roomLabelPlural: "Zalen", productLabel: "Product", productLabelPlural: "Producten", leaseName: "Meeting Room as a Service", leaseAbbr: "MRaaS", showMraas: true },
    solar:    { roomLabel: "Installatie", roomLabelPlural: "Installaties", productLabel: "Paneel", productLabelPlural: "Panelen", leaseName: "Solar as a Service", leaseAbbr: "SaaS", showMraas: true },
    security: { roomLabel: "Zone", roomLabelPlural: "Zones", productLabel: "Component", productLabelPlural: "Componenten", leaseName: "Security as a Service", leaseAbbr: "SecaaS", showMraas: false },
    hvac:     { roomLabel: "Ruimte", roomLabelPlural: "Ruimtes", productLabel: "Toestel", productLabelPlural: "Toestellen", leaseName: "Comfort as a Service", leaseAbbr: "CaaS", showMraas: true },
    events:   { roomLabel: "Locatie", roomLabelPlural: "Locaties", productLabel: "Item", productLabelPlural: "Items", leaseName: "Event as a Service", leaseAbbr: "EaaS", showMraas: false },
    interior: { roomLabel: "Ruimte", roomLabelPlural: "Ruimtes", productLabel: "Element", productLabelPlural: "Elementen", leaseName: "Design as a Service", leaseAbbr: "DaaS", showMraas: false }
  };

  /* ── Auto-inject ─────────────────────────────────────────────────── */
  function tryInject() {
    if (!global._isSuper && !(global.isSuper && global.isSuper())) return;
    injectTab();
  }

  function start() {
    tryInject();
    try { setInterval(tryInject, 2000); } catch (e) {}
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }

})(typeof window !== "undefined" ? window : this);
