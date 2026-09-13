/* ═══════════════════════════════════════════════════════════════════════
   integrations.js — Koppelingen-hub voor de tenant admin
   ───────────────────────────────────────────────────────────────────────
   Drop-in: <script src="integrations.js"></script> ná tenant-admin.js

   Voegt een "Koppelingen" sectie toe aan de tenant-admin sidebar.
   Beheer leveranciers, boekhoudkoppelingen, CRM en API-sleutels.
   ═══════════════════════════════════════════════════════════════════════ */
(function (global) {
  "use strict";

  /* ── Config ──────────────────────────────────────────────────────── */
  var WORKER = (global.TC && global.TC.cfg && global.TC.cfg.workerUrl) ||
    "https://quotestudio.stijn-borloo-968.workers.dev";

  var ACCENT = "#E8404E";

  /* ── Provider registry ───────────────────────────────────────────── */
  var PROVIDERS = {
    supplier: [
      { id: "custom_api",  label: "Eigen API / ERP",     icon: "🔌", available: true },
      { id: "csv_upload",  label: "CSV / Excel upload",  icon: "📄", available: true },
      { id: "techdata",    label: "TD Synnex",           icon: "🏭", available: true },
      { id: "ingram",      label: "Ingram Micro",        icon: "🏭", available: true },
      { id: "also",        label: "ALSO",                icon: "🏭", available: true },
    ],
    accounting: [
      { id: "exact_online", label: "Exact Online",       icon: "📊", available: false },
      { id: "yuki",         label: "Yuki",               icon: "📊", available: false },
      { id: "octopus",      label: "Octopus",            icon: "📊", available: false },
      { id: "horus",        label: "Horus",              icon: "📊", available: false },
    ],
    crm: [
      { id: "teamleader",  label: "Teamleader",          icon: "👥", available: false },
      { id: "hubspot",     label: "HubSpot",             icon: "👥", available: false },
      { id: "salesforce",  label: "Salesforce",          icon: "👥", available: false },
    ],
  };

  /* ── Helpers ─────────────────────────────────────────────────────── */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return [].slice.call((root || document).querySelectorAll(sel)); }

  function el(tag, attrs, kids) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === "style" && typeof attrs[k] === "object") {
        Object.assign(e.style, attrs[k]);
      } else if (k.startsWith("on")) {
        e.addEventListener(k.slice(2), attrs[k]);
      } else {
        e.setAttribute(k, attrs[k]);
      }
    });
    if (kids) (Array.isArray(kids) ? kids : [kids]).forEach(function (c) {
      if (typeof c === "string") e.appendChild(document.createTextNode(c));
      else if (c) e.appendChild(c);
    });
    return e;
  }

  async function api(endpoint, data) {
    var token = null;
    try {
      var sess = await global.supabase.auth.getSession();
      token = sess.data.session.access_token;
    } catch (e) {}
    var res = await fetch(WORKER + "/" + endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: token ? "Bearer " + token : "",
      },
      body: JSON.stringify(data || {}),
    });
    return res.json();
  }

  function timeAgo(iso) {
    if (!iso) return "nooit";
    var diff = Date.now() - new Date(iso).getTime();
    var mins = Math.floor(diff / 60000);
    if (mins < 1) return "zojuist";
    if (mins < 60) return mins + " min geleden";
    var hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs + "u geleden";
    var days = Math.floor(hrs / 24);
    return days + "d geleden";
  }

  /* ── State ───────────────────────────────────────────────────────── */
  var state = { integrations: [], apiKeys: [], syncLog: [], loading: true };

  async function loadData() {
    state.loading = true;
    render();
    var [intR, keyR] = await Promise.all([
      api("list-integrations"),
      api("list-api-keys"),
    ]);
    state.integrations = intR.integrations || [];
    state.apiKeys = (keyR.keys || []).filter(function (k) { return !k.revoked_at; });
    state.loading = false;
    render();
  }

  /* ── Main render ─────────────────────────────────────────────────── */
  function render() {
    var container = $("#intg-root");
    if (!container) return;
    container.innerHTML = "";

    if (state.loading) {
      container.appendChild(el("p", { style: { color: "#9ca3af", fontSize: "13px", padding: "20px 0" } }, "Koppelingen laden…"));
      return;
    }

    // Leveranciers
    container.appendChild(renderCategory("supplier", "Leveranciers", "Koppel leveranciers om prijslijsten automatisch bij te werken."));

    // Boekhouding
    container.appendChild(renderCategory("accounting", "Boekhouding & facturatie", "Stuur facturen automatisch door naar je boekhoudpakket."));

    // CRM
    container.appendChild(renderCategory("crm", "CRM & pipeline", "Sync contacten en deals met je CRM."));

    // Divider
    container.appendChild(el("hr", { style: { border: "0", borderTop: "1px solid #e5e7eb", margin: "28px 0 20px" } }));

    // API keys
    container.appendChild(renderApiKeys());
  }

  /* ── Category section ────────────────────────────────────────────── */
  function renderCategory(type, title, subtitle) {
    var sec = el("div", { style: { marginBottom: "28px" } });

    sec.appendChild(el("h3", { style: { fontSize: "15px", fontWeight: "600", color: "#1f2937", margin: "0 0 4px" } }, title));
    sec.appendChild(el("p", { style: { fontSize: "12px", color: "#9ca3af", margin: "0 0 14px", lineHeight: "1.5" } }, subtitle));

    // Active integrations
    var active = state.integrations.filter(function (i) { return i.type === type; });
    active.forEach(function (intg) {
      sec.appendChild(renderIntegrationCard(intg));
    });

    // Add button
    sec.appendChild(renderAddButton(type));

    return sec;
  }

  /* ── Integration card ────────────────────────────────────────────── */
  function renderIntegrationCard(intg) {
    var providerInfo = findProvider(intg.type, intg.provider);
    var statusColors = {
      active: { bg: "#ecfdf5", color: "#065f46", label: "Actief" },
      setup:  { bg: "#eff6ff", color: "#1e40af", label: "Instellen" },
      error:  { bg: "#fef2f2", color: "#991b1b", label: "Fout" },
      paused: { bg: "#f3f4f6", color: "#6b7280", label: "Gepauzeerd" },
    };
    var st = statusColors[intg.status] || statusColors.setup;

    var card = el("div", {
      style: {
        display: "flex", alignItems: "center", gap: "12px",
        padding: "12px 14px", background: "#fff", border: "1px solid #e5e7eb",
        borderRadius: "10px", marginBottom: "8px", cursor: "pointer",
        transition: "border-color .15s",
      },
      onmouseenter: function () { this.style.borderColor = "#d1d5db"; },
      onmouseleave: function () { this.style.borderColor = "#e5e7eb"; },
    });

    // Icon
    var iconBg = intg.type === "supplier" ? "#eff6ff" : intg.type === "accounting" ? "#ecfdf5" : "#f3e8ff";
    card.appendChild(el("div", { style: {
      width: "38px", height: "38px", borderRadius: "8px", background: iconBg,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: "16px", flexShrink: "0",
    } }, providerInfo.icon));

    // Info
    var info = el("div", { style: { flex: "1", minWidth: "0" } });
    info.appendChild(el("div", { style: { fontSize: "13px", fontWeight: "600", color: "#1f2937" } }, intg.label));

    var meta = providerInfo.label;
    if (intg.last_sync_at) meta += " · Sync: " + timeAgo(intg.last_sync_at);
    info.appendChild(el("div", { style: { fontSize: "11px", color: "#9ca3af", marginTop: "2px" } }, meta));
    card.appendChild(info);

    // Status badge
    card.appendChild(el("span", { style: {
      fontSize: "11px", fontWeight: "600", padding: "3px 10px",
      borderRadius: "6px", background: st.bg, color: st.color, flexShrink: "0",
    } }, st.label));

    // Actions menu
    var dots = el("button", {
      style: {
        background: "none", border: "none", cursor: "pointer",
        fontSize: "16px", color: "#9ca3af", padding: "4px", marginLeft: "4px",
      },
      onclick: function (e) {
        e.stopPropagation();
        showIntegrationMenu(intg, this);
      },
    }, "⋮");
    card.appendChild(dots);

    return card;
  }

  function findProvider(type, providerId) {
    var list = PROVIDERS[type] || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === providerId) return list[i];
    }
    return { id: providerId, label: providerId, icon: "🔗", available: true };
  }

  /* ── Integration context menu ────────────────────────────────────── */
  function showIntegrationMenu(intg, anchor) {
    // Remove any existing menu
    var old = $("#intg-ctx-menu");
    if (old) old.remove();

    var menu = el("div", { id: "intg-ctx-menu", style: {
      position: "absolute", background: "#fff", border: "1px solid #e5e7eb",
      borderRadius: "8px", boxShadow: "0 4px 12px rgba(0,0,0,.1)",
      padding: "4px 0", zIndex: "9999", minWidth: "160px",
    } });

    function menuItem(label, icon, handler) {
      var item = el("button", {
        style: {
          display: "flex", alignItems: "center", gap: "8px", width: "100%",
          padding: "8px 14px", background: "none", border: "none",
          fontSize: "13px", color: "#374151", cursor: "pointer",
          fontFamily: "inherit", textAlign: "left",
        },
        onmouseenter: function () { this.style.background = "#f3f4f6"; },
        onmouseleave: function () { this.style.background = "none"; },
        onclick: function (e) {
          e.stopPropagation();
          menu.remove();
          handler();
        },
      }, [el("span", { style: { fontSize: "14px" } }, icon), label]);
      return item;
    }

    if (intg.status === "active") {
      menu.appendChild(menuItem("Pauzeren", "⏸", function () { updateStatus(intg.id, "paused"); }));
    } else {
      menu.appendChild(menuItem("Activeren", "▶", function () { updateStatus(intg.id, "active"); }));
    }
    menu.appendChild(menuItem("API-sleutel", "🔑", function () { showCreateKeyDialog(intg.id, intg.label); }));
    menu.appendChild(menuItem("Sync-log", "📋", function () { showSyncLog(intg.id); }));
    menu.appendChild(el("hr", { style: { border: "0", borderTop: "1px solid #e5e7eb", margin: "4px 0" } }));
    menu.appendChild(menuItem("Verwijderen", "🗑", function () { deleteIntegration(intg); }));

    // Position
    var rect = anchor.getBoundingClientRect();
    menu.style.top = (rect.bottom + 4) + "px";
    menu.style.left = (rect.left - 120) + "px";
    menu.style.position = "fixed";
    document.body.appendChild(menu);

    // Close on click outside
    setTimeout(function () {
      document.addEventListener("click", function handler() {
        menu.remove();
        document.removeEventListener("click", handler);
      }, { once: true });
    }, 10);
  }

  /* ── Add integration button ──────────────────────────────────────── */
  function renderAddButton(type) {
    var btn = el("button", {
      style: {
        display: "flex", alignItems: "center", gap: "8px", width: "100%",
        padding: "10px 14px", background: "#fafafa", border: "1px dashed #d1d5db",
        borderRadius: "10px", cursor: "pointer", fontSize: "13px",
        color: "#6b7280", fontFamily: "inherit", transition: "border-color .15s, background .15s",
      },
      onmouseenter: function () { this.style.borderColor = ACCENT; this.style.color = ACCENT; },
      onmouseleave: function () { this.style.borderColor = "#d1d5db"; this.style.color = "#6b7280"; },
      onclick: function () { showAddDialog(type); },
    }, [el("span", { style: { fontSize: "16px" } }, "+"), "Koppeling toevoegen"]);
    return btn;
  }

  /* ── Add integration dialog ──────────────────────────────────────── */
  function showAddDialog(type) {
    var providers = PROVIDERS[type] || [];
    var overlay = createOverlay();

    var dialog = el("div", { style: {
      background: "#fff", borderRadius: "14px", padding: "28px",
      width: "380px", maxWidth: "90vw", maxHeight: "80vh", overflowY: "auto",
    } });

    var titles = { supplier: "Leverancier toevoegen", accounting: "Boekhoudpakket koppelen", crm: "CRM koppelen" };
    dialog.appendChild(el("h3", { style: { fontSize: "17px", fontWeight: "600", margin: "0 0 6px", color: "#1f2937" } }, titles[type] || "Koppeling toevoegen"));
    dialog.appendChild(el("p", { style: { fontSize: "12px", color: "#9ca3af", margin: "0 0 20px" } }, "Kies een provider of maak een eigen koppeling."));

    providers.forEach(function (prov) {
      var item = el("button", {
        style: {
          display: "flex", alignItems: "center", gap: "12px", width: "100%",
          padding: "12px 14px", background: "#fff", border: "1px solid #e5e7eb",
          borderRadius: "10px", marginBottom: "8px", cursor: prov.available ? "pointer" : "default",
          fontFamily: "inherit", textAlign: "left", opacity: prov.available ? "1" : ".5",
          transition: "border-color .15s",
        },
        onmouseenter: function () { if (prov.available) this.style.borderColor = ACCENT; },
        onmouseleave: function () { this.style.borderColor = "#e5e7eb"; },
        onclick: function () {
          if (!prov.available) return;
          overlay.remove();
          showConfigDialog(type, prov);
        },
      });

      item.appendChild(el("span", { style: { fontSize: "20px" } }, prov.icon));
      var txt = el("div", { style: { flex: "1" } });
      txt.appendChild(el("div", { style: { fontSize: "13px", fontWeight: "600", color: "#1f2937" } }, prov.label));
      if (!prov.available) txt.appendChild(el("div", { style: { fontSize: "11px", color: "#9ca3af" } }, "Binnenkort beschikbaar"));
      item.appendChild(txt);

      if (prov.available) {
        item.appendChild(el("span", { style: { fontSize: "16px", color: "#9ca3af" } }, "→"));
      }

      dialog.appendChild(item);
    });

    // Cancel button
    dialog.appendChild(el("button", {
      style: {
        marginTop: "12px", padding: "8px 20px", background: "none",
        border: "1px solid #e5e7eb", borderRadius: "8px", fontSize: "13px",
        color: "#6b7280", cursor: "pointer", fontFamily: "inherit",
      },
      onclick: function () { overlay.remove(); },
    }, "Annuleren"));

    overlay.appendChild(dialog);
  }

  /* ── Config dialog (label + create) ──────────────────────────────── */
  function showConfigDialog(type, prov) {
    var overlay = createOverlay();

    var dialog = el("div", { style: {
      background: "#fff", borderRadius: "14px", padding: "28px", width: "380px", maxWidth: "90vw",
    } });

    dialog.appendChild(el("h3", { style: { fontSize: "17px", fontWeight: "600", margin: "0 0 6px" } }, prov.label + " koppelen"));
    dialog.appendChild(el("p", { style: { fontSize: "12px", color: "#9ca3af", margin: "0 0 20px", lineHeight: "1.5" } },
      "Geef deze koppeling een herkenbare naam. Na het aanmaken krijg je een API-sleutel."));

    // Label input
    dialog.appendChild(el("label", { style: { fontSize: "12px", fontWeight: "600", color: "#4b5563", display: "block", marginBottom: "6px" } }, "Naam"));
    var nameInput = el("input", {
      type: "text",
      value: prov.label,
      placeholder: "bv. Techdata prijslijst",
      style: {
        width: "100%", padding: "9px 12px", border: "1px solid #d1d5db",
        borderRadius: "8px", fontSize: "13px", fontFamily: "inherit",
        boxSizing: "border-box", outline: "none",
      },
      onfocus: function () { this.style.borderColor = ACCENT; },
      onblur: function () { this.style.borderColor = "#d1d5db"; },
    });
    dialog.appendChild(nameInput);

    // Error area
    var errEl = el("div", { style: { fontSize: "12px", color: "#dc2626", margin: "8px 0 0", minHeight: "18px" } });
    dialog.appendChild(errEl);

    // Buttons
    var btns = el("div", { style: { display: "flex", gap: "8px", marginTop: "16px", justifyContent: "flex-end" } });

    btns.appendChild(el("button", {
      style: {
        padding: "8px 20px", background: "none", border: "1px solid #e5e7eb",
        borderRadius: "8px", fontSize: "13px", color: "#6b7280", cursor: "pointer", fontFamily: "inherit",
      },
      onclick: function () { overlay.remove(); },
    }, "Annuleren"));

    var saveBtn = el("button", {
      style: {
        padding: "8px 20px", background: ACCENT, color: "#fff", border: "none",
        borderRadius: "8px", fontSize: "13px", fontWeight: "600", cursor: "pointer", fontFamily: "inherit",
      },
      onclick: async function () {
        var label = nameInput.value.trim();
        if (!label) { errEl.textContent = "Naam is verplicht"; return; }

        saveBtn.textContent = "Bezig…";
        saveBtn.disabled = true;

        var res = await api("create-integration", {
          type: type,
          provider: prov.id,
          label: label,
        });

        if (!res.ok) {
          errEl.textContent = res.error || "Aanmaken mislukt";
          saveBtn.textContent = "Aanmaken & API-sleutel genereren";
          saveBtn.disabled = false;
          return;
        }

        // Auto-create an API key for this integration
        var keyRes = await api("create-api-key", {
          label: label,
          integration_id: res.integration.id,
        });

        overlay.remove();

        if (keyRes.ok && keyRes.key) {
          showKeyReveal(keyRes.key, label);
        }

        loadData();
      },
    }, "Aanmaken & API-sleutel genereren");
    btns.appendChild(saveBtn);
    dialog.appendChild(btns);

    overlay.appendChild(dialog);
    nameInput.focus();
  }

  /* ── Key reveal dialog ───────────────────────────────────────────── */
  function showKeyReveal(key, label) {
    var overlay = createOverlay();
    var dialog = el("div", { style: {
      background: "#fff", borderRadius: "14px", padding: "28px", width: "420px", maxWidth: "90vw",
    } });

    dialog.appendChild(el("div", { style: { fontSize: "28px", textAlign: "center", marginBottom: "12px" } }, "🔑"));
    dialog.appendChild(el("h3", { style: { fontSize: "17px", fontWeight: "600", margin: "0 0 6px", textAlign: "center" } }, "API-sleutel aangemaakt"));
    dialog.appendChild(el("p", { style: { fontSize: "12px", color: "#9ca3af", margin: "0 0 16px", textAlign: "center", lineHeight: "1.5" } },
      "Kopieer deze sleutel nu — hij wordt niet meer getoond."));

    // Key display
    var keyBox = el("div", { style: {
      display: "flex", alignItems: "center", gap: "8px",
      background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: "8px",
      padding: "10px 12px", marginBottom: "16px",
    } });
    var keyText = el("code", { style: {
      flex: "1", fontSize: "12px", fontFamily: "'SF Mono',Consolas,monospace",
      color: "#1f2937", wordBreak: "break-all", lineHeight: "1.4",
    } }, key);
    keyBox.appendChild(keyText);

    var copyBtn = el("button", {
      style: {
        padding: "6px 14px", background: ACCENT, color: "#fff", border: "none",
        borderRadius: "6px", fontSize: "12px", fontWeight: "600", cursor: "pointer",
        fontFamily: "inherit", flexShrink: "0",
      },
      onclick: function () {
        navigator.clipboard.writeText(key).then(function () {
          copyBtn.textContent = "✓ Gekopieerd";
          setTimeout(function () { copyBtn.textContent = "Kopiëren"; }, 2000);
        });
      },
    }, "Kopiëren");
    keyBox.appendChild(copyBtn);
    dialog.appendChild(keyBox);

    // Usage example
    dialog.appendChild(el("p", { style: { fontSize: "11px", fontWeight: "600", color: "#4b5563", margin: "0 0 6px" } }, "Voorbeeld gebruik"));
    var example = el("pre", { style: {
      background: "#1f2937", color: "#e5e7eb", borderRadius: "8px",
      padding: "12px 14px", fontSize: "11px", lineHeight: "1.5",
      overflow: "auto", margin: "0 0 20px", fontFamily: "'SF Mono',Consolas,monospace",
    } });
    example.textContent =
      'curl -X POST ' + WORKER + '/api/v1/products \\\n' +
      '  -H "Authorization: Bearer ' + key.slice(0, 14) + '..." \\\n' +
      '  -H "Content-Type: application/json" \\\n' +
      '  -d \'{"action":"upsert","products":[' + '\n' +
      '    {"ref":"ART-001","name":"Product","price":99}' + '\n' +
      '  ]}\'';
    dialog.appendChild(example);

    dialog.appendChild(el("button", {
      style: {
        width: "100%", padding: "10px", background: "#f3f4f6", border: "none",
        borderRadius: "8px", fontSize: "13px", fontWeight: "600", color: "#374151",
        cursor: "pointer", fontFamily: "inherit",
      },
      onclick: function () { overlay.remove(); },
    }, "Sluiten"));

    overlay.appendChild(dialog);
  }

  /* ── API keys section ────────────────────────────────────────────── */
  function renderApiKeys() {
    var sec = el("div");

    sec.appendChild(el("h3", { style: { fontSize: "15px", fontWeight: "600", color: "#1f2937", margin: "0 0 4px" } }, "API-sleutels"));
    sec.appendChild(el("p", { style: { fontSize: "12px", color: "#9ca3af", margin: "0 0 14px", lineHeight: "1.5" } },
      "Beheer de sleutels waarmee externe systemen verbinden met VisiOffer."));

    if (state.apiKeys.length === 0) {
      sec.appendChild(el("p", { style: {
        fontSize: "13px", color: "#9ca3af", fontStyle: "italic", padding: "12px 0",
      } }, "Nog geen API-sleutels. Voeg een leverancier toe om er een aan te maken."));
    }

    state.apiKeys.forEach(function (key) {
      var row = el("div", { style: {
        display: "flex", alignItems: "center", gap: "10px",
        padding: "10px 14px", background: "#f9fafb", borderRadius: "8px",
        marginBottom: "6px",
      } });

      row.appendChild(el("span", { style: { fontSize: "14px" } }, "🔑"));
      var info = el("div", { style: { flex: "1", minWidth: "0" } });
      info.appendChild(el("div", { style: { fontSize: "13px", fontWeight: "600", color: "#1f2937" } }, key.label));

      var meta = key.key_prefix + "… · " + (key.last_used_at ? "Laatst: " + timeAgo(key.last_used_at) : "Nooit gebruikt");
      info.appendChild(el("div", { style: { fontSize: "11px", color: "#9ca3af", marginTop: "1px" } }, meta));
      row.appendChild(info);

      var revokeBtn = el("button", {
        style: {
          padding: "4px 10px", background: "none", border: "1px solid #fecaca",
          borderRadius: "6px", fontSize: "11px", color: "#dc2626", cursor: "pointer",
          fontFamily: "inherit",
        },
        onclick: async function () {
          if (!confirm("Sleutel \"" + key.label + "\" intrekken? Dit kan niet ongedaan worden.")) return;
          await api("revoke-api-key", { key_id: key.id });
          loadData();
        },
      }, "Intrekken");
      row.appendChild(revokeBtn);

      sec.appendChild(row);
    });

    // New key button
    var newBtn = el("button", {
      style: {
        display: "flex", alignItems: "center", gap: "6px",
        marginTop: "10px", padding: "8px 16px", background: "none",
        border: "1px solid #e5e7eb", borderRadius: "8px", fontSize: "13px",
        color: "#374151", cursor: "pointer", fontFamily: "inherit",
        transition: "border-color .15s",
      },
      onmouseenter: function () { this.style.borderColor = ACCENT; },
      onmouseleave: function () { this.style.borderColor = "#e5e7eb"; },
      onclick: function () { showCreateKeyDialog(null, null); },
    }, [el("span", { style: { fontSize: "14px" } }, "+"), "Nieuwe API-sleutel"]);
    sec.appendChild(newBtn);

    return sec;
  }

  /* ── Create standalone key dialog ────────────────────────────────── */
  function showCreateKeyDialog(integrationId, defaultLabel) {
    var overlay = createOverlay();
    var dialog = el("div", { style: {
      background: "#fff", borderRadius: "14px", padding: "28px", width: "360px", maxWidth: "90vw",
    } });

    dialog.appendChild(el("h3", { style: { fontSize: "17px", fontWeight: "600", margin: "0 0 16px" } }, "Nieuwe API-sleutel"));

    dialog.appendChild(el("label", { style: { fontSize: "12px", fontWeight: "600", color: "#4b5563", display: "block", marginBottom: "6px" } }, "Label"));
    var labelInput = el("input", {
      type: "text", value: defaultLabel || "",
      placeholder: "bv. ERP koppeling",
      style: {
        width: "100%", padding: "9px 12px", border: "1px solid #d1d5db",
        borderRadius: "8px", fontSize: "13px", fontFamily: "inherit",
        boxSizing: "border-box",
      },
    });
    dialog.appendChild(labelInput);

    var btns = el("div", { style: { display: "flex", gap: "8px", marginTop: "16px", justifyContent: "flex-end" } });
    btns.appendChild(el("button", {
      style: {
        padding: "8px 20px", background: "none", border: "1px solid #e5e7eb",
        borderRadius: "8px", fontSize: "13px", color: "#6b7280", cursor: "pointer", fontFamily: "inherit",
      },
      onclick: function () { overlay.remove(); },
    }, "Annuleren"));

    btns.appendChild(el("button", {
      style: {
        padding: "8px 20px", background: ACCENT, color: "#fff", border: "none",
        borderRadius: "8px", fontSize: "13px", fontWeight: "600", cursor: "pointer", fontFamily: "inherit",
      },
      onclick: async function () {
        var label = labelInput.value.trim() || "API-sleutel";
        var res = await api("create-api-key", {
          label: label,
          integration_id: integrationId,
        });
        overlay.remove();
        if (res.ok && res.key) {
          showKeyReveal(res.key, label);
        }
        loadData();
      },
    }, "Aanmaken"));
    dialog.appendChild(btns);

    overlay.appendChild(dialog);
    labelInput.focus();
  }

  /* ── Sync log dialog ─────────────────────────────────────────────── */
  async function showSyncLog(integrationId) {
    var overlay = createOverlay();
    var dialog = el("div", { style: {
      background: "#fff", borderRadius: "14px", padding: "28px", width: "440px", maxWidth: "90vw", maxHeight: "70vh", overflowY: "auto",
    } });

    dialog.appendChild(el("h3", { style: { fontSize: "17px", fontWeight: "600", margin: "0 0 14px" } }, "Sync-logboek"));

    var res = await api("list-sync-log", { integration_id: integrationId, limit: 30 });
    var log = res.log || [];

    if (!log.length) {
      dialog.appendChild(el("p", { style: { fontSize: "13px", color: "#9ca3af", fontStyle: "italic" } }, "Nog geen sync-activiteit."));
    }

    log.forEach(function (entry) {
      var row = el("div", { style: {
        display: "flex", alignItems: "center", gap: "10px",
        padding: "8px 0", borderBottom: "1px solid #f3f4f6", fontSize: "12px",
      } });

      var dot = el("span", { style: {
        width: "7px", height: "7px", borderRadius: "50%", flexShrink: "0",
        background: entry.status === "ok" ? "#10b981" : entry.status === "error" ? "#ef4444" : "#f59e0b",
      } });
      row.appendChild(dot);

      var info = el("div", { style: { flex: "1" } });
      info.appendChild(el("span", { style: { fontWeight: "600", color: "#374151" } }, entry.action));
      info.appendChild(el("span", { style: { color: "#9ca3af", marginLeft: "8px" } }, entry.item_count + " items"));
      if (entry.error_message) {
        info.appendChild(el("div", { style: { color: "#ef4444", fontSize: "11px", marginTop: "2px" } }, entry.error_message));
      }
      row.appendChild(info);

      row.appendChild(el("span", { style: { color: "#9ca3af", fontSize: "11px", flexShrink: "0" } }, timeAgo(entry.created_at)));
      dialog.appendChild(row);
    });

    dialog.appendChild(el("button", {
      style: {
        marginTop: "16px", padding: "8px 20px", background: "#f3f4f6", border: "none",
        borderRadius: "8px", fontSize: "13px", color: "#374151", cursor: "pointer",
        fontFamily: "inherit", width: "100%",
      },
      onclick: function () { overlay.remove(); },
    }, "Sluiten"));

    overlay.appendChild(dialog);
  }

  /* ── Actions ─────────────────────────────────────────────────────── */
  async function updateStatus(id, status) {
    await api("update-integration", { id: id, status: status });
    loadData();
  }

  async function deleteIntegration(intg) {
    if (!confirm("Koppeling \"" + intg.label + "\" verwijderen? Gekoppelde producten blijven behouden.")) return;
    await api("delete-integration", { id: intg.id });
    loadData();
  }

  /* ── Overlay helper ──────────────────────────────────────────────── */
  function createOverlay() {
    var overlay = el("div", { style: {
      position: "fixed", top: "0", left: "0", right: "0", bottom: "0",
      background: "rgba(0,0,0,.4)", display: "flex", alignItems: "center",
      justifyContent: "center", zIndex: "10000", backdropFilter: "blur(2px)",
    }, onclick: function (e) { if (e.target === overlay) overlay.remove(); } });
    document.body.appendChild(overlay);
    return overlay;
  }

  /* ── Inject into tenant admin ────────────────────────────────────── */
  function inject() {
    // Wait for tenant-admin to be available
    var check = setInterval(function () {
      var sidebar = $(".tc-nav");
      var content = $(".tc-content");
      if (!sidebar || !content) return;
      clearInterval(check);

      // Add sidebar item
      var navItem = el("button", {
        class: "tc-nav-item",
        "data-sec": "integrations",
        onclick: function () {
          // Deactivate all
          $$(".tc-nav-item").forEach(function (n) { n.classList.remove("active"); });
          $$(".tc-section").forEach(function (s) { s.classList.remove("active"); });
          // Activate ours
          navItem.classList.add("active");
          section.classList.add("active");
          loadData();
        },
      }, [
        el("span", { class: "tc-nav-icon" }, "🔗"),
        "Koppelingen",
      ]);
      sidebar.appendChild(navItem);

      // Add content section
      var section = el("div", { class: "tc-section", id: "tc-sec-integrations" });
      section.appendChild(el("h2", {
        style: { fontSize: "20px", fontWeight: "600", color: "#1f2937", margin: "0 0 4px", fontFamily: "'Space Grotesk',sans-serif" },
      }, "Koppelingen"));
      section.appendChild(el("p", {
        style: { fontSize: "13px", color: "#9ca3af", margin: "0 0 24px", lineHeight: "1.5" },
      }, "Verbind leveranciers, boekhoudpakketten en CRM-systemen met VisiOffer."));

      var root = el("div", { id: "intg-root" });
      section.appendChild(root);
      content.appendChild(section);
    }, 200);
  }

  inject();

})(window);
