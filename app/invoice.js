/* ═══════════════════════════════════════════════════════════════════════
   invoice.js — QuoteStudio Facturatie-module (Quote-to-Cash)
   ───────────────────────────────────────────────────────────────────────
   Laad ná tenant-config.js en vóór invoice-dashboard.js / invoices-panel.js.
   Verwacht: supaInit(), supaConfigured(), TC, esc(), toast(), fE() uit index.html.
   ═══════════════════════════════════════════════════════════════════════ */
(function(global){
  "use strict";

  /* ─── helpers beschikbaar vanuit index.html ─── */
  function _esc(s){ return typeof global.esc==="function"?global.esc(s):String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }
  function _toast(m){ if(typeof global.toast==="function") global.toast(m); else console.log("[invoice]",m); }
  function _fE(n){ return typeof global.fE==="function"?global.fE(n):("€\u00a0"+Number(n||0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g,".")); }
  function _tenantId(){ try{ var u=global.supaInit&&global.supaInit(); if(!u) return ""; var s=u.auth; /* fallback */ return (global.TC&&global.TC.tenant)||"default"; }catch(e){ return "default"; } }

  /* ─── Gestructureerde mededeling (Belgisch OGM-formaat) ─── */
  function _ogm(){
    var r=Math.floor(Math.random()*9000000000)+1000000000;
    var mod=r%97; if(mod===0) mod=97;
    return "+++"+String(r).replace(/(\d{3})(\d{4})(\d{3})/,"$1/$2/$3")+String(mod).padStart(2,"0")+"+++";
  }

  /* ═══════════════════════════════════════════════════════════════
     API — CRUD via Supabase
     ═══════════════════════════════════════════════════════════════ */

  /** Maak factuur vanuit een getekende/gewonnen offerte.
   *  @param {object} quoteSession  — volledige quote-sessiedata
   *  @param {string} quoteDbId     — UUID van de quotes-rij
   *  @returns {object} invoice-rij
   */
  async function createInvoiceFromQuote(quoteSession, quoteDbId){
    var cl=global.supaInit(); if(!cl) throw new Error("Supabase niet beschikbaar");
    var tid=_tenantId();

    // 1. Factuurnummer ophalen (RPC)
    var nr=await cl.rpc("next_invoice_number",{p_tenant:tid});
    if(nr.error) throw new Error(nr.error.message);
    var invNum=nr.data;

    // 2. Bedragen berekenen uit sessiedata
    var s=quoteSession||{};
    var items=[];
    (s.zalen||[]).forEach(function(z){
      (z.items||[]).forEach(function(it){
        if(it.optional) return; // optionele items niet factureren
        items.push({
          description: it.name||"",
          reference:   it.ref||"",
          quantity:    Number(it.qty)||1,
          unit_price:  Number(it.price)||0,
          room_name:   z.name||""
        });
      });
    });

    var subtotal=items.reduce(function(a,it){ return a+(it.quantity*it.unit_price); },0);
    var discPct=Number(s.discount&&s.discount.pct)||0;
    var discAmt=Math.round(subtotal*discPct)/100;
    var net=subtotal-discAmt;
    var taxPct=21; // configureerbaar per tenant later
    var taxAmt=Math.round(net*taxPct)/100;
    var total=net+taxAmt;

    // 3. Gebruiker
    var u=await cl.auth.getUser();
    var email=(u&&u.data&&u.data.user)?u.data.user.email:"";

    // 4. Due date (+30 dagen)
    var due=new Date(); due.setDate(due.getDate()+30);

    // 5. Insert factuur
    var inv={
      quote_id:       quoteDbId||null,
      invoice_number: invNum,
      status:         "draft",
      client_name:    s.clientCo||s.client||"",
      client_address: s.clientAddr||"",
      client_email:   s.clientEmail||"",
      client_vat:     s.clientVat||"",
      contact_name:   (s.contacts&&s.contacts[0]&&s.contacts[0].name)||"",
      project_name:   s.projectName||"",
      subtotal:       subtotal,
      discount_pct:   discPct,
      discount_amt:   discAmt,
      tax_pct:        taxPct,
      tax_amt:        taxAmt,
      total_incl:     total,
      invoice_date:   new Date().toISOString().slice(0,10),
      due_date:       due.toISOString().slice(0,10),
      payment_ref:    _ogm(),
      user_email:     email,
      notes:          ""
    };

    var res=await cl.from("invoices").insert(inv).select().single();
    if(res.error) throw new Error(res.error.message);
    var invoiceRow=res.data;

    // 6. Insert factuurlijnen
    if(items.length){
      var lines=items.map(function(it,i){
        return {
          invoice_id:  invoiceRow.id,
          sort_order:  i,
          description: it.description,
          reference:   it.reference,
          quantity:    it.quantity,
          unit_price:  it.unit_price,
          room_name:   it.room_name
        };
      });
      var lr=await cl.from("invoice_lines").insert(lines);
      if(lr.error) console.warn("Factuurlijnen fout:",lr.error.message);
    }

    // 7. Audit event
    await cl.from("invoice_events").insert({
      invoice_id: invoiceRow.id,
      event_type: "created",
      user_email: email,
      note: "Factuur aangemaakt vanuit offerte "+invNum
    });

    return invoiceRow;
  }

  /** Factuur ophalen met lijnen */
  async function getInvoice(invoiceId){
    var cl=global.supaInit(); if(!cl) throw new Error("Supabase niet beschikbaar");
    var res=await cl.from("invoices").select("*").eq("id",invoiceId).single();
    if(res.error) throw new Error(res.error.message);
    var inv=res.data;
    var lr=await cl.from("invoice_lines").select("*").eq("invoice_id",invoiceId).order("sort_order");
    inv.lines=lr.data||[];
    return inv;
  }

  /** Alle facturen ophalen */
  async function listInvoices(filters){
    var cl=global.supaInit(); if(!cl) throw new Error("Supabase niet beschikbaar");
    var q=cl.from("invoices").select("*").order("created_at",{ascending:false}).limit(100);
    if(filters&&filters.status) q=q.eq("status",filters.status);
    var res=await q;
    if(res.error) throw new Error(res.error.message);
    return res.data||[];
  }

  /** Status updaten */
  async function updateInvoiceStatus(invoiceId, newStatus, note){
    var cl=global.supaInit(); if(!cl) throw new Error("Supabase niet beschikbaar");
    var upd={status:newStatus, updated_at:new Date().toISOString()};
    if(newStatus==="paid") upd.paid_date=new Date().toISOString().slice(0,10);
    var res=await cl.from("invoices").update(upd).eq("id",invoiceId);
    if(res.error) throw new Error(res.error.message);
    var u=await cl.auth.getUser();
    var email=(u&&u.data&&u.data.user)?u.data.user.email:"";
    await cl.from("invoice_events").insert({
      invoice_id:invoiceId, event_type:newStatus, user_email:email,
      note: note||("Status → "+newStatus)
    });
  }

  /** Factuur verwijderen (enkel draft) */
  async function deleteInvoice(invoiceId){
    var cl=global.supaInit(); if(!cl) throw new Error("Supabase niet beschikbaar");
    // Verwijder lijnen eerst (cascade zou moeten werken, maar veiligheidshalve)
    await cl.from("invoice_lines").delete().eq("invoice_id",invoiceId);
    await cl.from("invoice_events").delete().eq("invoice_id",invoiceId);
    var res=await cl.from("invoices").delete().eq("id",invoiceId);
    if(res.error) throw new Error(res.error.message);
  }

  /* ═══════════════════════════════════════════════════════════════
     PDF GENERATIE — Factuur als HTML → html2pdf
     ═══════════════════════════════════════════════════════════════ */

  function generateInvoiceHTML(inv){
    var lines=inv.lines||[];
    var logoH=TC.logoPdf(Number(TC.get("coverLogoSize"))||34);

    var linesHTML=lines.map(function(l,i){
      return '<tr style="border-bottom:1px solid #eee">'
        +'<td style="padding:8px 10px;font-size:11px">'+(i+1)+'</td>'
        +'<td style="padding:8px 10px;font-size:11px">'+_esc(l.description)+(l.room_name?' <span style="color:#999;font-size:10px">('+_esc(l.room_name)+')</span>':'')+'</td>'
        +'<td style="padding:8px 10px;font-size:11px">'+_esc(l.reference||'')+'</td>'
        +'<td style="padding:8px 10px;font-size:11px;text-align:center">'+Number(l.quantity)+'</td>'
        +'<td style="padding:8px 10px;font-size:11px;text-align:right">'+_fE(l.unit_price)+'</td>'
        +'<td style="padding:8px 10px;font-size:11px;text-align:right;font-weight:600">'+_fE(l.line_total||l.quantity*l.unit_price)+'</td>'
        +'</tr>';
    }).join('');

    var discRow='';
    if(Number(inv.discount_pct)>0){
      discRow='<tr><td colspan="5" style="text-align:right;padding:6px 10px;font-size:11px;color:#c0392b">Korting (-'+inv.discount_pct+'%)</td>'
        +'<td style="text-align:right;padding:6px 10px;font-size:11px;color:#c0392b">-'+_fE(inv.discount_amt)+'</td></tr>';
    }

    return '<!DOCTYPE html><html><head><meta charset="UTF-8">'
      +'<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:Inter,Arial,sans-serif;color:#1e293b;padding:40px}'
      +'table{width:100%;border-collapse:collapse}'
      +'th{background:#f8fafc;border-bottom:2px solid #e2e8f0;padding:8px 10px;font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:#64748b;text-align:left}'
      +'.hdr{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:30px}'
      +'.badge{display:inline-block;padding:4px 12px;border-radius:99px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px}'
      +'</style></head><body>'
      +'<div class="hdr"><div>'+logoH+'</div>'
      +'<div style="text-align:right"><div style="font-size:22px;font-weight:800;letter-spacing:-1px">FACTUUR</div>'
      +'<div style="font-size:13px;margin-top:4px;color:#64748b">'+_esc(inv.invoice_number)+'</div>'
      +'<div class="badge" style="background:#E3F2FD;color:#1565C0;margin-top:8px">'+_esc(inv.status.toUpperCase())+'</div>'
      +'</div></div>'

      +'<div style="display:flex;gap:40px;margin-bottom:30px">'
      +'<div style="flex:1"><div style="font-size:10px;text-transform:uppercase;color:#94a3b8;font-weight:700;margin-bottom:6px">Van</div>'
      +'<div style="font-size:12px;font-weight:600">'+_esc(TC.get("companyName"))+'</div>'
      +'<div style="font-size:11px;color:#64748b;white-space:pre-line">'+_esc(TC.get("address"))+'</div>'
      +(TC.get("vatNumber")?'<div style="font-size:10px;color:#94a3b8;margin-top:4px">'+_esc(TC.get("vatLabel"))+': '+_esc(TC.get("vatNumber"))+'</div>':'')
      +'</div>'
      +'<div style="flex:1"><div style="font-size:10px;text-transform:uppercase;color:#94a3b8;font-weight:700;margin-bottom:6px">Aan</div>'
      +'<div style="font-size:12px;font-weight:600">'+_esc(inv.client_name)+'</div>'
      +'<div style="font-size:11px;color:#64748b;white-space:pre-line">'+_esc(inv.client_address)+'</div>'
      +(inv.client_vat?'<div style="font-size:10px;color:#94a3b8;margin-top:4px">BTW: '+_esc(inv.client_vat)+'</div>':'')
      +'</div>'
      +'<div><div style="font-size:10px;text-transform:uppercase;color:#94a3b8;font-weight:700;margin-bottom:6px">Details</div>'
      +'<div style="font-size:11px"><strong>Datum:</strong> '+_esc(inv.invoice_date)+'</div>'
      +'<div style="font-size:11px"><strong>Vervaldatum:</strong> '+_esc(inv.due_date||"—")+'</div>'
      +(inv.project_name?'<div style="font-size:11px"><strong>Project:</strong> '+_esc(inv.project_name)+'</div>':'')
      +'</div></div>'

      +'<table>'
      +'<thead><tr><th style="width:5%">#</th><th style="width:38%">Omschrijving</th><th style="width:15%">Ref</th><th style="width:8%;text-align:center">Qty</th><th style="width:15%;text-align:right">Eenheidsprijs</th><th style="width:19%;text-align:right">Totaal</th></tr></thead>'
      +'<tbody>'+linesHTML+'</tbody>'
      +'<tfoot>'
      +'<tr><td colspan="5" style="text-align:right;padding:8px 10px;font-size:11px">Subtotaal</td><td style="text-align:right;padding:8px 10px;font-size:11px;font-weight:600">'+_fE(inv.subtotal)+'</td></tr>'
      +discRow
      +'<tr><td colspan="5" style="text-align:right;padding:6px 10px;font-size:11px">BTW '+inv.tax_pct+'%</td><td style="text-align:right;padding:6px 10px;font-size:11px">'+_fE(inv.tax_amt)+'</td></tr>'
      +'<tr style="background:'+TC.get("primaryColor")+'"><td colspan="5" style="text-align:right;padding:10px;font-size:12px;font-weight:700;color:#fff">Totaal incl. BTW</td><td style="text-align:right;padding:10px;font-size:13px;font-weight:800;color:#fff">'+_fE(inv.total_incl)+'</td></tr>'
      +'</tfoot></table>'

      +(inv.payment_ref?'<div style="margin-top:24px;padding:14px 18px;background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0">'
      +'<div style="font-size:10px;text-transform:uppercase;color:#94a3b8;font-weight:700;margin-bottom:4px">Betalingsreferentie</div>'
      +'<div style="font-size:16px;font-weight:700;font-family:monospace;letter-spacing:1px">'+_esc(inv.payment_ref)+'</div>'
      +'</div>':'')

      +(inv.notes?'<div style="margin-top:16px;font-size:11px;color:#64748b"><strong>Opmerkingen:</strong> '+_esc(inv.notes)+'</div>':'')

      +'<div style="margin-top:40px;padding-top:12px;border-top:1px solid #e2e8f0;font-size:9px;color:#94a3b8;text-align:center">'
      +TC.pdfFooter()
      +'</div>'
      +'</body></html>';
  }

  /** Download factuur-PDF via html2pdf */
  async function downloadInvoicePDF(invoiceId){
    _toast("⏳ PDF genereren…");
    var inv=await getInvoice(invoiceId);
    var html=generateInvoiceHTML(inv);

    var container=document.createElement("div");
    container.style.cssText="position:fixed;left:-9999px;top:0;width:794px";
    container.innerHTML=html;
    document.body.appendChild(container);

    try{
      var opt={
        margin:[10,10,10,10],
        filename: (inv.invoice_number||"factuur")+".pdf",
        image:{type:"jpeg",quality:0.95},
        html2canvas:{scale:2,useCORS:true},
        jsPDF:{unit:"mm",format:"a4",orientation:"portrait"}
      };
      await html2pdf().set(opt).from(container).save();
      _toast("✓ PDF gedownload");
    }finally{
      document.body.removeChild(container);
    }
  }


  /* ═══════════════════════════════════════════════════════════════
     Snelle factuur vanuit huidige sessie (één klik)
     ═══════════════════════════════════════════════════════════════ */

  /** Wordt aangeroepen vanuit de UI: factuur genereren vanuit actieve offerte */
  async function quickInvoiceFromCurrentQuote(){
    if(!global.supaConfigured||!global.supaConfigured()){
      _toast("⚠ Supabase niet geconfigureerd"); return;
    }
    // Sessiedata ophalen (zalen, klant, etc.)
    var session=null;
    if(typeof global.buildSessionObject==="function"){
      session=global.buildSessionObject();
    } else {
      // Fallback: reconstrueer uit globale variabelen
      session={
        zalen:       global.zalen||[],
        clientCo:    (document.getElementById("klt-co")||{}).value||"",
        clientAddr:  (document.getElementById("klt-addr")||{}).value||"",
        clientEmail: (document.getElementById("klt-email")||{}).value||"",
        projectName: (document.getElementById("klt-project")||{}).value||"",
        contacts:    global.contacts||[],
        discount:    global.discount||{pct:0}
      };
    }

    if(!(session.zalen&&session.zalen.length)){
      _toast("⚠ Geen items om te factureren"); return;
    }

    // Zoek eventueel bestaande quote-ID
    var quoteDbId=null;
    if(typeof global.ensureQuoteId==="function"){
      // Probeer cloud-ID te vinden
      try{
        var cl=global.supaInit();
        var qid=global.ensureQuoteId();
        if(qid&&cl){
          var qr=await cl.from("quotes").select("id").eq("app_quote_id",qid).maybeSingle();
          if(qr.data) quoteDbId=qr.data.id;
        }
      }catch(e){}
    }

    try{
      var inv=await createInvoiceFromQuote(session, quoteDbId);
      _toast("✓ Factuur "+inv.invoice_number+" aangemaakt");
      // Open facturatie-dashboard
      if(typeof global.goPanel==="function") global.goPanel("p-invoices");
      if(typeof global.loadInvoiceDashboard==="function") setTimeout(global.loadInvoiceDashboard, 100);
    }catch(e){
      _toast("⚠ "+e.message);
    }
  }


  /* ═══════════════════════════════════════════════════════════════
     Exporteer publiek API
     ═══════════════════════════════════════════════════════════════ */
  global.InvoiceModule = {
    createFromQuote:   createInvoiceFromQuote,
    get:               getInvoice,
    list:              listInvoices,
    updateStatus:      updateInvoiceStatus,
    delete:            deleteInvoice,
    downloadPDF:       downloadInvoicePDF,
    generateHTML:      generateInvoiceHTML,
    quickFromCurrent:  quickInvoiceFromCurrentQuote
  };

  // Shortcuts voor onclick
  global.quickInvoiceFromCurrentQuote = quickInvoiceFromCurrentQuote;
  global.downloadInvoicePDF = downloadInvoicePDF;

})(typeof window!=="undefined"?window:this);
