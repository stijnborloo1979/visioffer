/* ═══════════════════════════════════════════════════════════════════════
   prospect-import.js — URL-based prospect enrichment for VisiOffer
   ───────────────────────────────────────────────────────────────────────
   Drop-in: <script src="prospect-import.js"></script>
   Vereist: _workerUrl (uit index.html), supaInit() voor auth-token.
   Voegt een "🔗 Importeer van website" knop toe boven de klantvelden.
   ═══════════════════════════════════════════════════════════════════════ */

(function () {
  "use strict";

  /* ── Styling (geïnjecteerd 1x) ──────────────────────────────────────── */
  var styleId = "pi-styles";
  if (!document.getElementById(styleId)) {
    var s = document.createElement("style");
    s.id = styleId;
    s.textContent = [
      /* ── Knop ── */
      ".pi-btn{display:flex;align-items:center;gap:8px;width:100%;margin-bottom:12px;",
      "padding:10px 14px;background:var(--slate-50,#f8fafc);",
      "border:1.5px dashed var(--slate-300,#cbd5e1);border-radius:8px;",
      "cursor:pointer;font-size:13px;font-weight:500;",
      "color:var(--slate-600,#475569);transition:all .2s;font-family:inherit}",
      ".pi-btn:hover{border-color:var(--red,#E8404E);color:var(--red,#E8404E);",
      "background:rgba(232,64,78,.04)}",
      ".pi-btn .pi-ico{font-size:16px}",

      /* ── Overlay ── */
      ".pi-overlay{position:fixed;inset:0;background:rgba(15,23,42,.55);",
      "z-index:10000;display:flex;align-items:center;justify-content:center;",
      "padding:16px;animation:piFadeIn .2s}",
      "@keyframes piFadeIn{from{opacity:0}to{opacity:1}}",

      /* ── Modal ── */
      ".pi-modal{background:#fff;border-radius:14px;padding:28px 24px;",
      "max-width:480px;width:100%;box-shadow:0 16px 64px rgba(0,0,0,.25);",
      "max-height:90vh;overflow-y:auto}",
      ".pi-modal h3{font-family:var(--font-display,'Space Grotesk',sans-serif);",
      "font-size:18px;font-weight:700;margin:0 0 18px;color:var(--slate-900,#0f172a)}",

      /* ── Input ── */
      ".pi-input{width:100%;padding:10px 14px;border:1.5px solid var(--slate-200,#e2e8f0);",
      "border-radius:8px;font-size:14px;outline:none;transition:border .2s;",
      "font-family:inherit}",
      ".pi-input:focus{border-color:var(--red,#E8404E)}",

      /* ── Checkbox label ── */
      ".pi-chk{display:flex;align-items:center;gap:8px;font-size:13px;",
      "color:var(--slate-600,#475569);cursor:pointer;margin:12px 0 0}",
      ".pi-chk input{accent-color:var(--red,#E8404E)}",

      /* ── Error ── */
      ".pi-err{color:var(--red,#E8404E);font-size:12px;margin-top:10px;display:none}",

      /* ── Button row ── */
      ".pi-btns{display:flex;gap:10px;justify-content:flex-end;margin-top:20px}",
      ".pi-cancel{padding:8px 20px;border-radius:8px;border:1.5px solid var(--slate-200,#e2e8f0);",
      "background:#fff;color:var(--slate-700,#334155);cursor:pointer;font-weight:500;",
      "font-size:13px;transition:all .2s;font-family:inherit}",
      ".pi-cancel:hover{border-color:var(--slate-400,#94a3b8)}",
      ".pi-go{padding:8px 24px;border-radius:8px;border:none;",
      "background:var(--red,#E8404E);color:#fff;cursor:pointer;font-weight:600;",
      "font-size:13px;transition:all .2s;font-family:inherit}",
      ".pi-go:hover{background:var(--red-hover,#d1323f)}",
      ".pi-go:disabled{opacity:.5;cursor:wait}",

      /* ── Resultaat ── */
      ".pi-result{margin-top:16px;border:1.5px solid var(--slate-200,#e2e8f0);",
      "border-radius:10px;padding:16px;background:var(--slate-50,#f8fafc)}",
      ".pi-result h4{font-size:15px;font-weight:600;margin:0 0 8px;",
      "color:var(--slate-900,#0f172a)}",
      ".pi-detail{font-size:13px;color:var(--slate-600,#475569);line-height:1.9}",

      /* ── Checkboxes resultaat ── */
      ".pi-picks{display:flex;flex-wrap:wrap;gap:6px 14px;margin-top:12px}",
      ".pi-picks label{font-size:12px;display:flex;align-items:center;gap:4px;cursor:pointer}",
      ".pi-picks input{accent-color:var(--red,#E8404E)}",

      /* ── AI-sectie ── */
      ".pi-ai{border-top:1.5px solid var(--slate-200,#e2e8f0);margin-top:14px;padding-top:14px}",
      ".pi-ai-tag{display:inline-block;font-size:11px;font-weight:600;",
      "padding:2px 8px;border-radius:20px;background:rgba(139,92,246,.1);",
      "color:#7c3aed;margin-bottom:10px}",
      ".pi-ai-intro{background:rgba(139,92,246,.06);border-left:3px solid #8b5cf6;",
      "padding:10px 14px;font-size:13px;line-height:1.6;border-radius:0 8px 8px 0;",
      "margin:8px 0;color:var(--slate-700,#334155)}",
      ".pi-hint{font-size:12px;color:var(--slate-500,#64748b);margin:4px 0 0 10px}",

      /* ── Spinner ── */
      ".pi-spin{display:inline-block;width:14px;height:14px;border:2px solid rgba(255,255,255,.3);",
      "border-top-color:#fff;border-radius:50%;animation:piSpin .6s linear infinite;",
      "margin-right:6px;vertical-align:middle}",
      "@keyframes piSpin{to{transform:rotate(360deg)}}",
    ].join("\n");
    document.head.appendChild(s);
  }

  /* ── State ───────────────────────────────────────────────────────────── */
  var _lastResult = null;

  /* ── Helpers ─────────────────────────────────────────────────────────── */
  function esc(s) { return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function $(id) { return document.getElementById(id); }

  /** Haal de Supabase JWT op (als de user ingelogd is). */
  async function getToken() {
    try {
      var c = typeof supaInit === "function" ? supaInit() : null;
      if (!c) return null;
      var s = await c.auth.getSession();
      return (s && s.data && s.data.session && s.data.session.access_token) || null;
    } catch (e) { return null; }
  }

  /** Haal de Worker-URL op (uit de globale _workerUrl variabele). */
  function workerUrl() {
    return (typeof _workerUrl === "string" && _workerUrl) || "";
  }

  /* ── Knop injecteren ─────────────────────────────────────────────────── */
  function injectButton() {
    var cnField = $("c-nm");
    if (!cnField) return;
    var wrapper = cnField.closest(".field");
    if (wrapper) wrapper = wrapper.parentElement;
    if (!wrapper || wrapper.querySelector(".pi-btn")) return;

    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "pi-btn";
    btn.innerHTML = '<span class="pi-ico">🔗</span> Importeer klantgegevens van website…';
    btn.onclick = function (e) { e.preventDefault(); openModal(); };
    wrapper.insertBefore(btn, wrapper.firstChild);
  }

  /* ── Modal openen ────────────────────────────────────────────────────── */
  function openModal() {
    if ($("pi-overlay")) return;

    var overlay = document.createElement("div");
    overlay.id = "pi-overlay";
    overlay.className = "pi-overlay";
    overlay.innerHTML =
      '<div class="pi-modal" id="pi-modal">'
      + '<h3>🔗 Importeer klantgegevens</h3>'
      + '<input class="pi-input" id="pi-url" type="url" placeholder="https://www.bedrijf.be" autocomplete="url">'
      + '<label class="pi-chk"><input type="checkbox" id="pi-ai-chk"> <span>✦ AI-analyse — productsuggesties &amp; intro</span></label>'
      + '<div class="pi-err" id="pi-err"></div>'
      + '<div id="pi-result-box"></div>'
      + '<div class="pi-btns">'
      +   '<button class="pi-cancel" id="pi-cancel-btn">Annuleren</button>'
      +   '<button class="pi-go" id="pi-go-btn">Ophalen ▶</button>'
      + '</div>'
      + '</div>';

    document.body.appendChild(overlay);

    // Events
    $("pi-cancel-btn").onclick = closeModal;
    $("pi-go-btn").onclick = doFetch;
    $("pi-url").addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); doFetch(); }
    });

    // Klik buiten modal = sluiten
    overlay.addEventListener("click", function (e) {
      if (e.target === overlay) closeModal();
    });

    // Focus
    setTimeout(function () { $("pi-url") && $("pi-url").focus(); }, 80);
  }

  function closeModal() {
    var el = $("pi-overlay");
    if (el) el.remove();
    _lastResult = null;
  }

  /* ── Fetch uitvoeren ─────────────────────────────────────────────────── */
  async function doFetch() {
    // Als er al een resultaat staat, is dit de "Overnemen" klik
    if (_lastResult) { applyResult(_lastResult); return; }

    var urlInput = $("pi-url");
    var goBtn = $("pi-go-btn");
    var errEl = $("pi-err");
    var aiChk = $("pi-ai-chk");

    var url = (urlInput.value || "").trim();
    if (!url) { showError("Vul een website-URL in"); urlInput.focus(); return; }
    // Voeg https:// toe als nodig
    if (!/^https?:\/\//i.test(url)) url = "https://" + url;

    var wUrl = workerUrl();
    if (!wUrl) { showError("Worker-URL niet ingesteld. Ga naar Instellingen."); return; }

    var mode = aiChk && aiChk.checked ? "enrich" : "scrape";

    // UI: loading state
    errEl.style.display = "none";
    goBtn.disabled = true;
    goBtn.innerHTML = '<span class="pi-spin"></span>' + (mode === "enrich" ? "Analyseren…" : "Ophalen…");

    try {
      var token = await getToken();
      var headers = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = "Bearer " + token;

      var res = await fetch(wUrl + "/enrich-prospect", {
        method: "POST",
        headers: headers,
        body: JSON.stringify({ url: url, mode: mode }),
      });

      var data = await res.json();
      if (!data.ok) throw new Error(data.error || "Onbekende fout (" + res.status + ")");

      _lastResult = data;
      renderResult(data);

      // Verander knop
      goBtn.innerHTML = "Overnemen ✓";
      goBtn.disabled = false;

    } catch (e) {
      showError(e.message || String(e));
      goBtn.innerHTML = "Ophalen ▶";
      goBtn.disabled = false;
    }
  }

  function showError(msg) {
    var el = $("pi-err");
    if (el) { el.textContent = msg; el.style.display = "block"; }
  }

  /* ── Resultaat renderen ──────────────────────────────────────────────── */
  function renderResult(data) {
    var box = $("pi-result-box");
    if (!box) return;

    var c = data.company || {};
    var contacts = data.contacts || [];
    var meta = data.meta || {};
    var ai = data.ai || null;

    var html = '<div class="pi-result">';
    html += '<h4>✓ ' + esc(c.name || "Bedrijf niet herkend") + '</h4>';
    html += '<div class="pi-detail">';
    if (c.address) html += '📍 ' + esc(c.address) + '<br>';
    if (c.email)   html += '✉ ' + esc(c.email) + '<br>';
    if (c.phone)   html += '📞 ' + esc(c.phone) + '<br>';
    if (c.vat)     html += '🏢 ' + esc(c.vat) + '<br>';
    if (contacts.length) {
      html += '👤 ' + esc(contacts[0].name);
      if (contacts[0].role) html += ' — ' + esc(contacts[0].role);
      if (contacts[0].email) html += ' — ' + esc(contacts[0].email);
      html += '<br>';
    }
    if (meta.description) {
      html += '<div style="margin-top:6px;font-size:12px;color:var(--slate-400,#94a3b8);font-style:italic">'
            + esc(meta.description).slice(0, 200) + '</div>';
    }
    html += '</div>';

    // ── Checkboxes: wat overnemen ──
    html += '<div class="pi-picks">';
    if (c.name)            html += '<label><input type="checkbox" checked data-pi="name"> Klantnaam</label>';
    if (c.address)         html += '<label><input type="checkbox" checked data-pi="address"> Adres</label>';
    if (contacts.length)   html += '<label><input type="checkbox" checked data-pi="contact"> Contact</label>';
    if (c.email || (contacts.length && contacts[0].email))
                           html += '<label><input type="checkbox" checked data-pi="email"> E-mail</label>';
    html += '</div>';

    // ── AI-sectie ──
    if (ai && !data.ai_error) {
      html += '<div class="pi-ai">';
      html += '<span class="pi-ai-tag">✦ AI-analyse</span>';

      if (ai.suggested_sector) {
        var pct = Math.round((ai.confidence || 0) * 100);
        html += '<div style="font-size:13px;margin-bottom:8px">'
              + 'Sector: <strong>' + esc(ai.suggested_sector) + '</strong>'
              + ' <span style="color:var(--slate-400)">(' + pct + '% match)</span>'
              + '</div>';
      }

      if (ai.intro_text) {
        html += '<div class="pi-ai-intro">' + esc(ai.intro_text) + '</div>';
        html += '<label class="pi-picks" style="margin:6px 0 0"><label>'
              + '<input type="checkbox" data-pi="intro"> Gebruik als openingstekst</label></label>';
      }

      if (ai.product_hints && ai.product_hints.length) {
        html += '<div style="font-size:13px;font-weight:500;margin-top:10px">Productsuggesties</div>';
        for (var i = 0; i < ai.product_hints.length; i++) {
          var h = ai.product_hints[i];
          html += '<div class="pi-hint">→ <strong>' + esc(h.category) + '</strong> — ' + esc(h.reason) + '</div>';
        }
      }

      if (ai.talking_points && ai.talking_points.length) {
        html += '<div style="font-size:13px;font-weight:500;margin-top:10px">Gespreksonderwerpen</div>';
        for (var j = 0; j < ai.talking_points.length; j++) {
          html += '<div class="pi-hint">• ' + esc(ai.talking_points[j]) + '</div>';
        }
      }

      html += '</div>';
    } else if (data.ai_error) {
      html += '<div style="font-size:12px;color:var(--slate-400);margin-top:10px;font-style:italic">'
            + '✦ AI-analyse niet beschikbaar: ' + esc(data.ai_error) + '</div>';
    }

    html += '</div>';
    box.innerHTML = html;
  }

  /* ── Resultaat toepassen op de klantvelden ────────────────────────────── */
  function applyResult(data) {
    var c = data.company || {};
    var contacts = data.contacts || [];

    function isChecked(key) {
      var el = document.querySelector('[data-pi="' + key + '"]');
      return el ? el.checked : false;
    }

    function setVal(id, val) {
      var el = $(id);
      if (!el) return;
      // Overschrijf alleen als het veld leeg is, of gebruiker heeft "Overnemen" geklikt
      el.value = val;
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }

    if (isChecked("name") && c.name)       setVal("c-nm", c.name);
    if (isChecked("address") && c.address)  setVal("c-ad", c.address);

    // Contact
    if (isChecked("contact") && contacts.length) {
      setVal("c-ct", contacts[0].name || "");
    }

    // E-mail: voorkeur voor contact-email boven bedrijfs-email
    if (isChecked("email")) {
      var email = (contacts.length && contacts[0].email) || c.email || "";
      if (email) setVal("c-em", email);
    }

    // AI intro → tekstblok
    if (data.ai && data.ai.intro_text && isChecked("intro")) {
      if (typeof window.addTextBlock === "function") {
        window.addTextBlock(data.ai.intro_text);
      } else {
        // Fallback: kopieer naar klembord
        try {
          navigator.clipboard.writeText(data.ai.intro_text);
        } catch (e) {}
      }
    }

    // Trigger render
    if (typeof render === "function") render();
    if (typeof toast === "function") toast("Klantgegevens overgenomen ✓");

    closeModal();
  }

  /* ── Init & observer ─────────────────────────────────────────────────── */
  function init() {
    // Check of de feature beschikbaar is (tenant-config)
    if (typeof TC !== "undefined" && TC.get) {
      var feat = TC.get("features");
      if (feat && feat.prospect_import === false) return;
    }
    injectButton();
  }

  // Directe init
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  // Re-inject na DOM-wijzigingen (SPA tab-switches)
  var _piObserver = new MutationObserver(function () {
    if (!document.querySelector(".pi-btn")) init();
  });
  _piObserver.observe(document.body, { childList: true, subtree: true });

})();
