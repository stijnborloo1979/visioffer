/* ═══════════════════════════════════════════════════════════════════════
   invoices-panel.js — Injecteert het Facturen-panel in de DOM
   ───────────────────────────────────────────────────────────────────────
   Laad ná invoice.js en invoice-dashboard.js.
   Voegt panel p-invoices toe + menuknop in het Geavanceerd-menu.
   ═══════════════════════════════════════════════════════════════════════ */
(function(global){
  "use strict";

  function inject(){
    // Voorkom dubbele injectie
    if(document.getElementById("p-invoices")) return;

    /* ─── Panel HTML ─── */
    var panel=document.createElement("div");
    panel.className="panel";
    panel.id="p-invoices";
    panel.style.cssText="max-width:none!important;width:100%;padding:16px;box-sizing:border-box";

    panel.innerHTML=
      '<style>'
      +'#p-invoices{font-family:"Inter",Arial,sans-serif;-webkit-font-smoothing:antialiased}'
      +'#p-invoices .inv-hdr{display:flex;align-items:flex-end;justify-content:space-between;margin-bottom:16px;gap:10px;flex-wrap:wrap}'
      +'#p-invoices .inv-hdr .card-title{font-size:19px;font-weight:800;letter-spacing:-.4px;color:var(--gr);margin-bottom:0}'
      +'#p-invoices .inv-kpi-row{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin-bottom:14px}'
      +'#p-invoices .inv-kpi{background:#fff;border:1px solid var(--bd);border-radius:12px;padding:13px 15px;box-shadow:0 1px 2px rgba(20,20,25,.05),0 4px 14px rgba(20,20,25,.04)}'
      +'#p-invoices .inv-kpi-lbl{font-size:10.5px;font-weight:600;color:var(--gm);margin-bottom:6px}'
      +'#p-invoices .inv-kpi-val{font-size:20px;font-weight:800;letter-spacing:-.6px;color:var(--gr);line-height:1}'
      +'#p-invoices .inv-filters{display:flex;gap:7px;margin-bottom:10px;flex-wrap:wrap;align-items:center}'
      +'#p-invoices .inv-filters input,#p-invoices .inv-filters select{font-size:12px;padding:8px 11px;border:1px solid var(--bd);border-radius:10px;background:#fff;font-family:inherit;height:36px;color:var(--gr);outline:none}'
      +'#p-invoices .inv-filters input:focus,#p-invoices .inv-filters select:focus{border-color:var(--red);box-shadow:0 0 0 3px rgba(37,99,235,.08)}'
      +'#p-invoices .inv-filters input{flex:1;min-width:130px}'
      +'#p-invoices .inv-tbl-wrap{border:1px solid var(--bd);border-radius:12px;overflow:auto;background:#fff;box-shadow:0 1px 2px rgba(20,20,25,.05),0 4px 14px rgba(20,20,25,.04)}'
      +'#p-invoices .inv-tbl{width:100%;border-collapse:collapse;font-size:11.5px;table-layout:fixed;min-width:700px}'
      +'#p-invoices .inv-tbl thead th{background:#fff;padding:10px 12px;text-align:left;font-size:9.5px;font-weight:700;letter-spacing:.7px;text-transform:uppercase;color:#a4a8ae;border-bottom:1px solid var(--bd);white-space:nowrap}'
      +'#p-invoices .inv-tbl tbody tr:hover{background:#fafaf8}'
      +'</style>'

      +'<div class="card" style="background:transparent;border:none;box-shadow:none;padding:0;margin:0">'

      /* Header */
      +'<div class="inv-hdr">'
      +'<div class="card-title">🧾 Facturatie</div>'
      +'<div style="display:flex;gap:7px">'
      +'<button class="db-btn" onclick="quickInvoiceFromCurrentQuote()">＋ Factuur uit offerte</button>'
      +'<button class="db-btn" onclick="loadInvoiceDashboard()">↻ Vernieuwen</button>'
      +'</div></div>'

      /* KPIs */
      +'<div class="inv-kpi-row">'
      +'<div class="inv-kpi"><div class="inv-kpi-lbl">Totaal</div><div class="inv-kpi-val" id="inv-k-total">—</div></div>'
      +'<div class="inv-kpi"><div class="inv-kpi-lbl">Concept</div><div class="inv-kpi-val" id="inv-k-draft" style="color:#999">—</div></div>'
      +'<div class="inv-kpi"><div class="inv-kpi-lbl">Verstuurd</div><div class="inv-kpi-val" id="inv-k-sent" style="color:#1565C0">—</div></div>'
      +'<div class="inv-kpi"><div class="inv-kpi-lbl">Betaald</div><div class="inv-kpi-val" id="inv-k-paid" style="color:#2E7D32">—</div></div>'
      +'<div class="inv-kpi"><div class="inv-kpi-lbl">Vervallen</div><div class="inv-kpi-val" id="inv-k-overdue" style="color:#E65100">—</div></div>'
      +'<div class="inv-kpi"><div class="inv-kpi-lbl">Openstaand</div><div class="inv-kpi-val" id="inv-k-open-amt" style="color:var(--red)">—</div></div>'
      +'</div>'

      /* Filters */
      +'<div class="inv-filters">'
      +'<input id="inv-search" placeholder="Zoek op nummer, klant, project…" oninput="invApplyFilters()">'
      +'<select id="inv-status-filter" onchange="invApplyFilters()">'
      +'<option value="">Alle statussen</option>'
      +'<option value="draft">Concept</option>'
      +'<option value="sent">Verstuurd</option>'
      +'<option value="paid">Betaald</option>'
      +'<option value="overdue">Vervallen</option>'
      +'<option value="credited">Gecrediteerd</option>'
      +'<option value="cancelled">Geannuleerd</option>'
      +'</select></div>'

      /* Tabel */
      +'<div class="inv-tbl-wrap"><table class="inv-tbl">'
      +'<thead><tr>'
      +'<th style="width:13%">Nummer</th>'
      +'<th style="width:22%">Klant / project</th>'
      +'<th style="width:11%">Status</th>'
      +'<th style="width:13%;text-align:right">Bedrag</th>'
      +'<th style="width:10%">Datum</th>'
      +'<th style="width:11%">Vervaldatum</th>'
      +'<th style="width:20%">Acties</th>'
      +'</tr></thead>'
      +'<tbody id="inv-tbody"><tr><td colspan="7" class="db-empty">Klik ↻ om te laden</td></tr></tbody>'
      +'</table></div>'

      +'</div>'; // /card

    // Voeg panel toe vóór de footer
    var footer=document.querySelector("div[style*='footer-year']");
    var ref=footer||document.getElementById("supa-modal")||document.body.lastChild;
    ref.parentNode.insertBefore(panel, ref);

    /* ─── Menuknop in Geavanceerd ─── */
    var advMenu=document.getElementById("adv-menu");
    if(advMenu){
      var btn=document.createElement("button");
      btn.className="am-item";
      btn.innerHTML='<span>🧾</span>Facturatie';
      btn.onclick=function(){ global.goPanel("p-invoices"); global.loadInvoiceDashboard(); };
      // Voeg in vóór laatste item
      advMenu.appendChild(btn);
    }
  }

  // Injecteer zodra DOM klaar is
  if(document.readyState==="loading"){
    document.addEventListener("DOMContentLoaded", inject);
  } else {
    inject();
  }

})(typeof window!=="undefined"?window:this);
