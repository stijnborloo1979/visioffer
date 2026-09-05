/* ═══════════════════════════════════════════════════════════════════════
   custom-fields.js — QuoteStudio sector-specifieke veldenlaag
   ───────────────────────────────────────────────────────────────────────
   index.html laadt dit bestand. Vandaag gebruikt de UI het CF-object nog
   niet actief; deze module legt de structuur vast zodat elke tenant
   (security, solar, interieur, events, …) eigen extra offertevelden kan
   definiëren zónder de kern-HTML aan te passen.

     CF.fields()          → array met velddefinities voor de actieve tenant
     CF.get(key)          → opgeslagen waarde van één veld
     CF.set(key, value)   → waarde bewaren (in-memory + optioneel state-hook)
     CF.values()          → alle waarden als object
     CF.render(target)    → (optioneel) velden in een container tekenen
     CF.define(tenant, [])→ velddefinities registreren voor een tenant

   Een velddefinitie:
     { key, label, type, placeholder?, options?, required?, group? }
     type ∈ "text" | "textarea" | "number" | "select" | "checkbox" | "date"
   ═══════════════════════════════════════════════════════════════════════ */
(function (global) {
  "use strict";

  /* Per-tenant velddefinities. Leeg = geen extra velden (neutrale baseline). */
  var DEFS = {

    "default": [],

    /* Voorbeelden voor toekomstige sectoren (nog niet actief):
    security: [
      { key: "zones",        label: "Aantal zones",        type: "number", group: "Installatie" },
      { key: "cert",         label: "Certificering (INCERT)", type: "select",
        options: ["Geen", "B", "A"], group: "Installatie" },
      { key: "monitoring",   label: "24/7 monitoring",     type: "checkbox", group: "Diensten" }
    ],
    solar: [
      { key: "kwp",          label: "Vermogen (kWp)",      type: "number", group: "Technisch" },
      { key: "orientation",  label: "Oriëntatie dak",      type: "select",
        options: ["Zuid", "Oost-West", "Anders"], group: "Technisch" },
      { key: "battery",      label: "Thuisbatterij",       type: "checkbox", group: "Opties" }
    ]
    */
  };

  var VALUES = {};   /* runtime-waarden, key → value */

  var CF = {
    /* Velddefinities voor de actieve tenant (valt terug op default) */
    fields: function () {
      var id = (global.TC && TC.tenant) || "default";
      return DEFS[id] || DEFS["default"] || [];
    },

    /* Registreer/overschrijf definities voor een tenant */
    define: function (tenant, defs) {
      DEFS[tenant] = Array.isArray(defs) ? defs : [];
    },

    get: function (key) {
      return VALUES[key] != null ? VALUES[key] : "";
    },

    set: function (key, value) {
      VALUES[key] = value;
      /* Hook naar de app-state indien beschikbaar (niet-blokkerend) */
      try { if (typeof global.saveState === "function") global.saveState(); } catch (e) {}
      return value;
    },

    values: function () {
      return Object.assign({}, VALUES);
    },

    /* Laad eerder opgeslagen waarden (bv. bij sessie-restore) */
    hydrate: function (obj) {
      if (obj && typeof obj === "object") VALUES = Object.assign({}, obj);
    },

    /* Optionele render-helper. Vereist een DOM-container.
       Doet niets wanneer er geen velden zijn → volledig backward compatible. */
    render: function (target) {
      try {
        var el = typeof target === "string" ? document.getElementById(target) : target;
        if (!el) return;
        var defs = CF.fields();
        if (!defs.length) { el.innerHTML = ""; return; }
        el.innerHTML = defs.map(function (f) {
          var id = "cf-" + f.key;
          var val = CF.get(f.key);
          var input;
          if (f.type === "textarea") {
            input = '<textarea id="' + id + '" placeholder="' + esc(f.placeholder || "") +
                    '">' + esc(val) + '</textarea>';
          } else if (f.type === "select") {
            input = '<select id="' + id + '">' + (f.options || []).map(function (o) {
              return '<option' + (o === val ? " selected" : "") + '>' + esc(o) + '</option>';
            }).join("") + '</select>';
          } else if (f.type === "checkbox") {
            input = '<input type="checkbox" id="' + id + '"' + (val ? " checked" : "") + '>';
          } else {
            input = '<input type="' + (f.type || "text") + '" id="' + id + '" value="' +
                    esc(val) + '" placeholder="' + esc(f.placeholder || "") + '">';
          }
          return '<label style="display:block;margin-bottom:10px">' +
                 '<span style="display:block;font-size:12px;font-weight:600;margin-bottom:4px">' +
                 esc(f.label) + (f.required ? ' <span style="color:var(--red)">*</span>' : "") +
                 '</span>' + input + '</label>';
        }).join("");

        /* Waarden terugkoppelen bij wijziging */
        defs.forEach(function (f) {
          var node = document.getElementById("cf-" + f.key);
          if (!node) return;
          node.addEventListener("change", function () {
            CF.set(f.key, f.type === "checkbox" ? node.checked : node.value);
          });
        });
      } catch (e) { /* render is optioneel */ }
    }
  };

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  global.CF = CF;

})(typeof window !== "undefined" ? window : this);
