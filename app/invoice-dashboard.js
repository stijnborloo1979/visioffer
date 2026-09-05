/* ═══════════════════════════════════════════════════════════════════════
   invoice-dashboard.js — Factuur-dashboard (KPI's + lijst)
   ───────────────────────────────────────────────────────────────────────
   Verwacht: InvoiceModule (invoice.js), supaInit(), TC, esc(), toast(), fE()
   ═══════════════════════════════════════════════════════════════════════ */
(function(global){
  "use strict";

  function _esc(s){ return typeof global.esc==="function"?global.esc(s):String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }
  function _toast(m){ if(typeof global.toast==="function") global.toast(m); else console.log("[inv-dash]",m); }
  function _fE(n){ return typeof global.fE==="function"?global.fE(n):("€\u00a0"+Number(n||0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g,".")); }

  var _invCache=[];

  /* Status-configuratie */
  var STATUS_CFG = {
    draft:     { label:"Concept",   bg:"#f0f0f0", color:"#555",    dot:"#aaa" },
    sent:      { label:"Verstuurd", bg:"#E3F2FD", color:"#1565C0", dot:"#1976D2" },
    paid:      { label:"Betaald",   bg:"#E8F5E9", color:"#2E7D32", dot:"#388E3C" },
    overdue:   { label:"Vervallen", bg:"#FFF3E0", color:"#E65100", dot:"#F57C00" },
    credited:  { label:"Gecrediteerd", bg:"#F3E5F5", color:"#7B1FA2", dot:"#9C27B0" },
    cancelled: { label:"Geannuleerd",  bg:"#FFEBEE", color:"#C62828", dot:"#D32F2F" }
  };

  function statusBadge(st){
    var c=STATUS_CFG[st]||STATUS_CFG.draft;
    return '<span class="db-badge" style="background:'+c.bg+';color:'+c.color+'">'
      +'<span class="db-dot" style="background:'+c.dot+'"></span>'
      +_esc(c.label)+'</span>';
  }

  /* ═══════ Dashboard laden ═══════ */
  async function loadInvoiceDashboard(){
    var tbody=document.getElementById("inv-tbody");
    if(!tbody) return;
    if(!global.supaConfigured||!global.supaConfigured()){
      tbody.innerHTML='<tr><td colspan="7" class="db-empty">⚠ Supabase niet geconfigureerd</td></tr>';
      return;
    }
    tbody.innerHTML='<tr><td colspan="7" class="db-empty"><span class="spin spin-r"></span> Laden…</td></tr>';

    try{
      _invCache=await global.InvoiceModule.list();
      renderInvKPIs(_invCache);
      renderInvTable(_invCache);
    }catch(e){
      tbody.innerHTML='<tr><td colspan="7" class="db-empty">⚠ '+_esc(e.message)+'</td></tr>';
    }
  }

  function renderInvKPIs(invoices){
    var total=invoices.length;
    var draft=0,sent=0,paid=0,overdue=0,paidAmt=0,openAmt=0;
    invoices.forEach(function(inv){
      if(inv.status==="draft") draft++;
      else if(inv.status==="sent") sent++;
      else if(inv.status==="paid"){ paid++; paidAmt+=Number(inv.total_incl)||0; }
      else if(inv.status==="overdue"){ overdue++; openAmt+=Number(inv.total_incl)||0; }
      if(inv.status==="sent") openAmt+=Number(inv.total_incl)||0;
    });

    var el=function(id){ return document.getElementById(id); };
    if(el("inv-k-total"))   el("inv-k-total").textContent=total;
    if(el("inv-k-draft"))   el("inv-k-draft").textContent=draft;
    if(el("inv-k-sent"))    el("inv-k-sent").textContent=sent;
    if(el("inv-k-paid"))    el("inv-k-paid").textContent=paid+" ("+_fE(paidAmt)+")";
    if(el("inv-k-overdue")) el("inv-k-overdue").textContent=overdue;
    if(el("inv-k-open-amt"))el("inv-k-open-amt").textContent=_fE(openAmt);
  }

  function renderInvTable(invoices){
    var tbody=document.getElementById("inv-tbody");
    if(!tbody) return;

    // Filter
    var sf=document.getElementById("inv-status-filter");
    var stFilter=sf?sf.value:"";
    var search=(document.getElementById("inv-search")||{}).value||"";
    search=search.toLowerCase();

    var filtered=invoices.filter(function(inv){
      if(stFilter&&inv.status!==stFilter) return false;
      if(search){
        var hay=(inv.invoice_number+" "+inv.client_name+" "+inv.project_name).toLowerCase();
        if(hay.indexOf(search)===-1) return false;
      }
      return true;
    });

    if(!filtered.length){
      tbody.innerHTML='<tr><td colspan="7" class="db-empty">Geen facturen gevonden</td></tr>';
      return;
    }

    tbody.innerHTML=filtered.map(function(inv){
      var statusOpts=Object.keys(STATUS_CFG).map(function(k){
        return '<option value="'+k+'"'+(k===inv.status?' selected':'')+'>'+STATUS_CFG[k].label+'</option>';
      }).join('');

      return '<tr style="border-bottom:1px solid #f3f3f1;cursor:pointer" onclick="showInvoiceDetail(\''+inv.id+'\')">'
        +'<td style="padding:11px 12px"><div style="font-weight:600;font-size:12px">'+_esc(inv.invoice_number)+'</div></td>'
        +'<td style="padding:11px 12px"><div style="font-size:12px;font-weight:600">'+_esc(inv.client_name)+'</div>'
        +'<div style="font-size:10px;color:#999">'+_esc(inv.project_name)+'</div></td>'
        +'<td style="padding:11px 12px">'+statusBadge(inv.status)+'</td>'
        +'<td style="padding:11px 12px;text-align:right;font-weight:700;font-size:12px;font-variant-numeric:tabular-nums">'+_fE(inv.total_incl)+'</td>'
        +'<td style="padding:11px 12px;font-size:11px;color:#999">'+_esc(inv.invoice_date)+'</td>'
        +'<td style="padding:11px 12px;font-size:11px;color:'+(inv.status==='overdue'?'#E65100':'#999')+'">'+_esc(inv.due_date||'—')+'</td>'
        +'<td style="padding:11px 12px" onclick="event.stopPropagation()">'
        +'<select onchange="changeInvStatus(\''+inv.id+'\',this.value)" style="font-size:11px;padding:4px 6px;border:1px solid var(--bd);border-radius:4px;background:#fff;font-family:inherit">'+statusOpts+'</select>'
        +' <button class="db-act-btn" onclick="downloadInvoicePDF(\''+inv.id+'\')" title="Download PDF">📄</button>'
        +(inv.status==='draft'?'<button class="db-act-btn" onclick="deleteInv(\''+inv.id+'\')" title="Verwijderen" style="color:#c0392b">✕</button>':'')
        +'</td></tr>';
    }).join('');
  }

  /* ═══════ Acties ═══════ */
  global.changeInvStatus=async function(id,status){
    try{
      await global.InvoiceModule.updateStatus(id,status);
      _toast("✓ Status: "+STATUS_CFG[status].label);
      loadInvoiceDashboard();
    }catch(e){ _toast("⚠ "+e.message); }
  };

  global.deleteInv=async function(id){
    if(!confirm("Factuur definitief verwijderen?")) return;
    try{
      await global.InvoiceModule.delete(id);
      _toast("✓ Verwijderd");
      loadInvoiceDashboard();
    }catch(e){ _toast("⚠ "+e.message); }
  };

  global.showInvoiceDetail=async function(id){
    try{
      var inv=await global.InvoiceModule.get(id);
      var html=global.InvoiceModule.generateHTML(inv);
      // Toon in een modal
      var m=document.getElementById("inv-detail-modal");
      if(!m){
        m=document.createElement("div");
        m.id="inv-detail-modal";
        m.style.cssText="display:none;position:fixed;inset:0;z-index:99000;background:rgba(0,0,0,.5);align-items:center;justify-content:center;padding:16px";
        m.innerHTML='<div style="background:#fff;border-radius:12px;max-width:820px;width:100%;max-height:90vh;overflow:auto;box-shadow:0 20px 60px rgba(0,0,0,.3)">'
          +'<div style="display:flex;justify-content:space-between;align-items:center;padding:12px 16px;border-bottom:1px solid #eee">'
          +'<b style="font-size:14px">Factuur preview</b>'
          +'<div><button onclick="downloadInvoicePDF(window._invDetailId)" style="background:var(--red);color:#fff;border:none;border-radius:6px;padding:6px 14px;font-size:12px;cursor:pointer;margin-right:8px">📄 PDF</button>'
          +'<button onclick="this.closest(\'#inv-detail-modal\').style.display=\'none\'" style="background:none;border:none;font-size:20px;cursor:pointer;color:#999">✕</button></div></div>'
          +'<div id="inv-detail-body" style="padding:20px"></div></div>';
        document.body.appendChild(m);
      }
      global._invDetailId=id;
      document.getElementById("inv-detail-body").innerHTML=html;
      m.style.display="flex";
    }catch(e){ _toast("⚠ "+e.message); }
  };

  global.invApplyFilters=function(){
    renderInvTable(_invCache);
  };

  global.loadInvoiceDashboard=loadInvoiceDashboard;

})(typeof window!=="undefined"?window:this);
