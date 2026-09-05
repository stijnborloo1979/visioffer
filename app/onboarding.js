/* ═══════════════════════════════════════════════════════════════════════
   onboarding.js — Guided tour + setup checklist voor VisiOffer
   ───────────────────────────────────────────────────────────────────────
   Drop-in: voeg <script src="onboarding.js"></script> als laatste script
   in index.html. Detecteert automatisch eerste login per tenant.

   Visuele stijl: VisiOffer marketing website (rood accent, Space Grotesk,
   donkere overlay, moderne tooltips).
   ═══════════════════════════════════════════════════════════════════════ */
(function (global) {
  "use strict";

  var TC = global.TC;

  /* ── Tour stappen ────────────────────────────────────────────────── */
  var STEPS = [
    {
      id: "welcome",
      type: "modal",
      title: "Welkom bij VisiOffer",
      text: "We begeleiden je in 5 stappen door de app zodat je direct aan de slag kunt.",
      icon: "🎉"
    },
    {
      id: "settings",
      target: "#settings-btn",
      title: "Je huisstijl instellen",
      text: "Klik hier om je logo, kleuren en bedrijfsnaam aan te passen. Je offertes nemen automatisch je stijl over.",
      position: "bottom-left"
    },
    {
      id: "klant",
      target: "#sstep-1",
      title: "Klantgegevens invullen",
      text: "Begin hier met de naam en contactgegevens van je klant. Dit verschijnt bovenaan de offerte.",
      position: "bottom"
    },
    {
      id: "zalen",
      target: "#sstep-2",
      title: "Ruimtes en producten",
      text: "Voeg ruimtes toe en sleep producten erin. Je kunt ook foto's en 360°-beelden toevoegen.",
      position: "bottom"
    },
    {
      id: "acties",
      target: "#acties-btn",
      title: "AI, PDF en meer",
      text: "Gebruik AI om productbeschrijvingen te genereren, exporteer als PDF, of deel een live preview-link.",
      position: "bottom-left"
    },
    {
      id: "opslaan",
      target: "#quick-save-btn",
      title: "Opslaan en delen",
      text: "Sla je offerte op in de cloud. Je klant kan hem online bekijken, opties aanvinken en digitaal ondertekenen.",
      position: "bottom-left"
    }
  ];

  /* ── Checklist taken ─────────────────────────────────────────────── */
  var TASKS = [
    { id: "account",  label: "Account aangemaakt",         check: function () { return true; } },
    { id: "login",    label: "Ingelogd",                   check: function () { return true; } },
    { id: "branding", label: "Logo en kleuren instellen",  check: function () { var t = TC && TC.all(); return t && t.logo && t.logo.length > 5; } },
    { id: "quote",    label: "Eerste offerte opslaan",     check: function () { try { var q = localStorage.getItem("qs_v3"); return q && JSON.parse(q).zalen && JSON.parse(q).zalen.length > 0; } catch (e) { return false; } } },
    { id: "share",    label: "Offerte delen met een klant", check: function () { try { return !!localStorage.getItem("qs_shared_once"); } catch (e) { return false; } } }
  ];

  /* ── Helpers ─────────────────────────────────────────────────────── */
  function tenantKey(suffix) {
    var t = (TC && TC.tenant) || "default";
    return "vo_onboarding_" + t + "_" + suffix;
  }
  function isTourDone()  { try { return localStorage.getItem(tenantKey("tour")) === "done"; } catch (e) { return false; } }
  function setTourDone() { try { localStorage.setItem(tenantKey("tour"), "done"); } catch (e) {} }
  function isNewUser()   { return !isTourDone() && TC && TC.locked; }

  /* ── Stylesheet ──────────────────────────────────────────────────── */
  function injectStyles() {
    if (document.getElementById("vo-tour-css")) return;
    var s = document.createElement("style");
    s.id = "vo-tour-css";
    s.textContent = [
      "@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&display=swap');",

      "#vo-overlay{position:fixed;inset:0;z-index:200000;pointer-events:none}",
      "#vo-backdrop{position:fixed;inset:0;z-index:199999;background:rgba(15,23,42,.72);backdrop-filter:blur(4px);opacity:0;transition:opacity .35s;pointer-events:all}",
      "#vo-backdrop.on{opacity:1}",

      "#vo-spotlight{position:fixed;z-index:200001;border-radius:10px;box-shadow:0 0 0 9999px rgba(15,23,42,.72);transition:all .4s cubic-bezier(.4,0,.2,1);pointer-events:none}",

      "#vo-tooltip{position:fixed;z-index:200002;width:340px;background:#fff;border-radius:16px;padding:0;box-shadow:0 20px 60px rgba(15,23,42,.25),0 0 0 1px rgba(15,23,42,.06);opacity:0;transform:translateY(12px);transition:opacity .3s,transform .3s;pointer-events:all;overflow:hidden}",
      "#vo-tooltip.on{opacity:1;transform:translateY(0)}",
      ".vo-tt-accent{height:4px;background:linear-gradient(90deg,#E8404E,#7c3aed)}",
      ".vo-tt-body{padding:24px 24px 20px}",
      ".vo-tt-title{font-family:'Space Grotesk',sans-serif;font-size:18px;font-weight:700;color:#0f172a;margin-bottom:6px;letter-spacing:-.02em}",
      ".vo-tt-text{font-size:14px;color:#64748b;line-height:1.65;margin-bottom:20px}",
      ".vo-tt-footer{display:flex;align-items:center;justify-content:space-between}",
      ".vo-tt-dots{display:flex;gap:6px}",
      ".vo-tt-dot{width:8px;height:8px;border-radius:50%;background:#e2e8f0;transition:all .2s}",
      ".vo-tt-dot.active{background:#E8404E;width:20px;border-radius:4px}",
      ".vo-tt-dot.done{background:#94a3b8}",
      ".vo-tt-actions{display:flex;gap:8px}",

      ".vo-btn{padding:9px 20px;border-radius:9px;font-size:13px;font-weight:600;cursor:pointer;font-family:'Inter',sans-serif;border:none;transition:all .2s}",
      ".vo-btn-ghost{background:transparent;color:#64748b}",
      ".vo-btn-ghost:hover{color:#0f172a;background:#f1f5f9}",
      ".vo-btn-primary{background:#E8404E;color:#fff;box-shadow:0 4px 14px rgba(232,64,78,.3)}",
      ".vo-btn-primary:hover{background:#d1323f;transform:translateY(-1px);box-shadow:0 6px 20px rgba(232,64,78,.35)}",

      "#vo-welcome{position:fixed;inset:0;z-index:200003;display:flex;align-items:center;justify-content:center;pointer-events:all}",
      ".vo-welcome-card{background:#fff;border-radius:20px;padding:48px 44px;max-width:420px;width:90%;text-align:center;box-shadow:0 30px 80px rgba(15,23,42,.3);position:relative;overflow:hidden}",
      ".vo-welcome-accent{position:absolute;top:0;left:0;right:0;height:4px;background:linear-gradient(90deg,#E8404E,#7c3aed)}",
      ".vo-welcome-icon{font-size:52px;margin-bottom:16px;display:block}",
      ".vo-welcome-title{font-family:'Space Grotesk',sans-serif;font-size:26px;font-weight:700;color:#0f172a;margin-bottom:8px;letter-spacing:-.03em}",
      ".vo-welcome-sub{font-size:15px;color:#64748b;line-height:1.65;margin-bottom:28px}",
      ".vo-welcome-company{display:inline-block;background:linear-gradient(135deg,#E8404E,#7c3aed);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;font-weight:700}",

      "#vo-checklist{position:fixed;bottom:20px;right:20px;z-index:99997;width:280px;background:#fff;border-radius:14px;box-shadow:0 12px 40px rgba(15,23,42,.15),0 0 0 1px rgba(15,23,42,.06);overflow:hidden;transition:all .3s;pointer-events:all}",
      "#vo-checklist.collapsed{width:auto;border-radius:50px}",
      ".vo-cl-accent{height:3px;background:linear-gradient(90deg,#E8404E,#7c3aed)}",
      ".vo-cl-header{padding:14px 16px 10px;display:flex;align-items:center;justify-content:space-between;cursor:pointer}",
      ".vo-cl-header:hover{background:#f8fafc}",
      ".vo-cl-title{font-family:'Space Grotesk',sans-serif;font-size:14px;font-weight:700;color:#0f172a}",
      ".vo-cl-count{font-size:12px;color:#94a3b8;font-weight:500}",
      ".vo-cl-progress{height:3px;margin:0 16px 10px;background:#f1f5f9;border-radius:2px;overflow:hidden}",
      ".vo-cl-bar{height:100%;background:linear-gradient(90deg,#E8404E,#7c3aed);border-radius:2px;transition:width .5s cubic-bezier(.4,0,.2,1)}",
      ".vo-cl-items{padding:0 16px 14px}",
      ".vo-cl-item{display:flex;align-items:center;gap:10px;padding:7px 0;font-size:13px;color:#334155}",
      ".vo-cl-item.done{color:#94a3b8;text-decoration:line-through}",
      ".vo-cl-check{width:20px;height:20px;border-radius:50%;border:2px solid #e2e8f0;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:11px;transition:all .2s}",
      ".vo-cl-item.done .vo-cl-check{background:#E8404E;border-color:#E8404E;color:#fff}",
      ".vo-cl-toggle{background:none;border:none;cursor:pointer;font-size:16px;color:#94a3b8;padding:2px;transition:transform .2s}",
      ".vo-cl-toggle.up{transform:rotate(180deg)}",

      ".vo-cl-fab{display:none;align-items:center;gap:8px;padding:12px 18px;cursor:pointer;font-size:13px;font-weight:600;color:#0f172a}",
      ".vo-cl-fab-dot{width:10px;height:10px;border-radius:50%;background:#E8404E;animation:vo-pulse 2s infinite}",
      "#vo-checklist.collapsed .vo-cl-accent,#vo-checklist.collapsed .vo-cl-header,#vo-checklist.collapsed .vo-cl-progress,#vo-checklist.collapsed .vo-cl-items{display:none}",
      "#vo-checklist.collapsed .vo-cl-fab{display:flex}",

      "@keyframes vo-pulse{0%,100%{box-shadow:0 0 0 0 rgba(232,64,78,.4)}50%{box-shadow:0 0 0 6px transparent}}",
      "@media(max-width:480px){#vo-tooltip{width:calc(100vw - 32px);left:16px!important;right:16px!important}#vo-checklist{width:calc(100vw - 32px);right:16px;bottom:16px}}"
    ].join("\n");
    document.head.appendChild(s);
  }

  /* ── Tour engine ─────────────────────────────────────────────────── */
  var _step = 0;
  var _els = {};

  function createOverlay() {
    if (document.getElementById("vo-overlay")) return;
    var overlay = document.createElement("div"); overlay.id = "vo-overlay";
    var backdrop = document.createElement("div"); backdrop.id = "vo-backdrop";
    var spotlight = document.createElement("div"); spotlight.id = "vo-spotlight";
    var tooltip = document.createElement("div"); tooltip.id = "vo-tooltip";
    tooltip.innerHTML = '<div class="vo-tt-accent"></div><div class="vo-tt-body">' +
      '<div class="vo-tt-title" id="vo-tt-title"></div>' +
      '<div class="vo-tt-text" id="vo-tt-text"></div>' +
      '<div class="vo-tt-footer">' +
        '<div class="vo-tt-dots" id="vo-tt-dots"></div>' +
        '<div class="vo-tt-actions">' +
          '<button class="vo-btn vo-btn-ghost" id="vo-skip">Overslaan</button>' +
          '<button class="vo-btn vo-btn-primary" id="vo-next">Volgende</button>' +
        '</div>' +
      '</div></div>';
    document.body.appendChild(backdrop);
    document.body.appendChild(spotlight);
    document.body.appendChild(overlay);
    overlay.appendChild(tooltip);

    _els.backdrop = backdrop;
    _els.spotlight = spotlight;
    _els.tooltip = tooltip;
    _els.title = document.getElementById("vo-tt-title");
    _els.text = document.getElementById("vo-tt-text");
    _els.dots = document.getElementById("vo-tt-dots");

    document.getElementById("vo-skip").onclick = endTour;
    document.getElementById("vo-next").onclick = function () { goStep(_step + 1); };
    backdrop.onclick = function () {}; /* blokkeer klikken */
  }

  function goStep(n) {
    if (n >= STEPS.length) { endTour(); return; }
    _step = n;
    var step = STEPS[n];

    /* Welkom-modal */
    if (step.type === "modal") {
      showWelcome(step);
      return;
    }

    /* Verwijder welkom als die er nog is */
    var wm = document.getElementById("vo-welcome");
    if (wm) wm.remove();

    /* Vind target element */
    var target = document.querySelector(step.target);
    if (!target) { goStep(n + 1); return; }

    /* Spotlight positioneren */
    var rect = target.getBoundingClientRect();
    var pad = 8;
    _els.spotlight.style.top = (rect.top - pad) + "px";
    _els.spotlight.style.left = (rect.left - pad) + "px";
    _els.spotlight.style.width = (rect.width + pad * 2) + "px";
    _els.spotlight.style.height = (rect.height + pad * 2) + "px";

    _els.backdrop.className = "on";

    /* Tooltip content */
    _els.title.textContent = step.title;
    _els.text.textContent = step.text;

    /* Dots */
    var dotsHtml = "";
    for (var i = 0; i < STEPS.length; i++) {
      var cls = i < n ? "vo-tt-dot done" : i === n ? "vo-tt-dot active" : "vo-tt-dot";
      dotsHtml += '<div class="' + cls + '"></div>';
    }
    _els.dots.innerHTML = dotsHtml;

    /* Knoptekst */
    var nextBtn = document.getElementById("vo-next");
    nextBtn.textContent = n === STEPS.length - 1 ? "Aan de slag" : "Volgende";

    /* Tooltip positioneren */
    positionTooltip(rect, step.position || "bottom");

    setTimeout(function () { _els.tooltip.className = "on"; }, 50);
  }

  function positionTooltip(rect, pos) {
    var tt = _els.tooltip;
    var gap = 14;
    tt.className = ""; /* reset voor reflow */

    if (pos === "bottom" || pos === "bottom-left") {
      tt.style.top = (rect.bottom + gap) + "px";
      tt.style.left = pos === "bottom-left"
        ? Math.max(16, rect.right - 340) + "px"
        : Math.max(16, rect.left + rect.width / 2 - 170) + "px";
      tt.style.right = "auto";
    } else if (pos === "top") {
      tt.style.top = (rect.top - gap - 220) + "px";
      tt.style.left = Math.max(16, rect.left + rect.width / 2 - 170) + "px";
      tt.style.right = "auto";
    }

    /* Clamp rechts */
    var ttLeft = parseInt(tt.style.left);
    if (ttLeft + 340 > window.innerWidth - 16) {
      tt.style.left = (window.innerWidth - 356) + "px";
    }
  }

  function showWelcome(step) {
    _els.backdrop.className = "on";
    _els.spotlight.style.width = "0";
    _els.spotlight.style.height = "0";
    _els.tooltip.className = "";

    var companyName = (TC && TC.all() && TC.all().companyNameShort) || "VisiOffer";

    var wm = document.createElement("div");
    wm.id = "vo-welcome";
    wm.innerHTML =
      '<div class="vo-welcome-card">' +
        '<div class="vo-welcome-accent"></div>' +
        '<span class="vo-welcome-icon">' + (step.icon || "🎉") + '</span>' +
        '<div class="vo-welcome-title">' + step.title + '</div>' +
        '<div class="vo-welcome-sub">' +
          'Welkom bij <span class="vo-welcome-company">' + esc(companyName) + '</span>.<br>' +
          step.text +
        '</div>' +
        '<div style="display:flex;gap:10px;justify-content:center">' +
          '<button class="vo-btn vo-btn-ghost" id="vo-w-skip">Overslaan</button>' +
          '<button class="vo-btn vo-btn-primary" id="vo-w-start">Rondleiding starten</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(wm);

    document.getElementById("vo-w-skip").onclick = endTour;
    document.getElementById("vo-w-start").onclick = function () { goStep(1); };
  }

  function endTour() {
    setTourDone();
    var wm = document.getElementById("vo-welcome");
    if (wm) wm.remove();
    if (_els.backdrop) { _els.backdrop.className = ""; setTimeout(function () { _els.backdrop.remove(); }, 400); }
    if (_els.spotlight) _els.spotlight.remove();
    if (_els.tooltip) _els.tooltip.remove();
    var ov = document.getElementById("vo-overlay");
    if (ov) ov.remove();
    _els = {};
    showChecklist();
  }

  /* ── Checklist ───────────────────────────────────────────────────── */
  function showChecklist() {
    if (document.getElementById("vo-checklist")) return;
    /* Alleen voor gelockde (niet-super) users */
    if (!TC || !TC.locked) return;
    /* Niet tonen als alles af is */
    var done = TASKS.filter(function (t) { return t.check(); }).length;
    if (done >= TASKS.length) return;

    var cl = document.createElement("div");
    cl.id = "vo-checklist";
    var itemsHtml = TASKS.map(function (t) {
      var isDone = t.check();
      return '<div class="vo-cl-item' + (isDone ? " done" : "") + '">' +
        '<div class="vo-cl-check">' + (isDone ? "✓" : "") + '</div>' +
        '<span>' + esc(t.label) + '</span></div>';
    }).join("");

    cl.innerHTML =
      '<div class="vo-cl-accent"></div>' +
      '<div class="vo-cl-header" onclick="voToggleChecklist()">' +
        '<span class="vo-cl-title">Aan de slag</span>' +
        '<span class="vo-cl-count">' + done + '/' + TASKS.length + '</span>' +
      '</div>' +
      '<div class="vo-cl-progress"><div class="vo-cl-bar" style="width:' + Math.round(done / TASKS.length * 100) + '%"></div></div>' +
      '<div class="vo-cl-items">' + itemsHtml + '</div>' +
      '<div class="vo-cl-fab" onclick="voToggleChecklist()"><div class="vo-cl-fab-dot"></div> Aan de slag ' + done + '/' + TASKS.length + '</div>';

    document.body.appendChild(cl);

    /* Periodiek checklist updaten */
    setInterval(updateChecklist, 5000);
  }

  function updateChecklist() {
    var cl = document.getElementById("vo-checklist");
    if (!cl) return;
    var done = 0;
    TASKS.forEach(function (t, i) {
      var isDone = t.check();
      if (isDone) done++;
      var items = cl.querySelectorAll(".vo-cl-item");
      if (items[i]) {
        items[i].className = "vo-cl-item" + (isDone ? " done" : "");
        items[i].querySelector(".vo-cl-check").textContent = isDone ? "✓" : "";
      }
    });
    var count = cl.querySelector(".vo-cl-count");
    if (count) count.textContent = done + "/" + TASKS.length;
    var bar = cl.querySelector(".vo-cl-bar");
    if (bar) bar.style.width = Math.round(done / TASKS.length * 100) + "%";
    var fab = cl.querySelector(".vo-cl-fab");
    if (fab) fab.innerHTML = '<div class="vo-cl-fab-dot"></div> Aan de slag ' + done + '/' + TASKS.length;

    /* Alles af? Checklist verwijderen na kort delay */
    if (done >= TASKS.length) {
      setTimeout(function () {
        var c = document.getElementById("vo-checklist");
        if (c) { c.style.opacity = "0"; c.style.transform = "translateY(20px)"; setTimeout(function () { c.remove(); }, 400); }
      }, 2000);
    }
  }

  global.voToggleChecklist = function () {
    var cl = document.getElementById("vo-checklist");
    if (cl) cl.classList.toggle("collapsed");
  };

  /* ── Escape helper ───────────────────────────────────────────────── */
  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  /* ── Start tour ──────────────────────────────────────────────────── */
  function startTour() {
    injectStyles();
    createOverlay();
    _step = 0;
    goStep(0);
  }

  /* ── Publieke API ────────────────────────────────────────────────── */
  global.startOnboardingTour = function () {
    injectStyles();
    createOverlay();
    _step = 0;
    goStep(0);
  };

  /* ── Init: wacht tot app geladen is ──────────────────────────────── */
  function init() {
    injectStyles();
    if (isNewUser()) {
      /* Wacht even tot de UI klaar is */
      setTimeout(startTour, 1200);
    } else {
      showChecklist();
    }
  }

  /* Wacht tot de app gestart is (startApp is async) */
  function waitForApp() {
    var attempts = 0;
    var wait = setInterval(function () {
      attempts++;
      var appReady = document.querySelector(".topbar") || document.getElementById("sstep-1");
      if (appReady || attempts > 40) {
        clearInterval(wait);
        if (appReady) init();
      }
    }, 500);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", waitForApp);
  } else {
    waitForApp();
  }

})(typeof window !== "undefined" ? window : this);
