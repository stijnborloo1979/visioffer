/* ═══════════════════════════════════════════════════════════════════════
   trial-banner.js — Trial countdown banner + expiry gate
   ───────────────────────────────────────────────────────────────────────
   Drop-in: voeg <script src="trial-banner.js"></script> ná tenant-config.js
   in index.html.

   Gedrag:
     • status = "trial" + dagen > 3  → subtiele groene banner met countdown
     • status = "trial" + dagen ≤ 3  → oranje/rode banner met urgentie
     • status = "trial" + verlopen   → fullscreen upgrade-overlay, app read-only
     • status = "suspended"          → fullscreen betalings-overlay
     • status = "active"/"free"      → niets tonen
   ═══════════════════════════════════════════════════════════════════════ */
(function (global) {
  "use strict";

  var TC = global.TC;
  if (!TC) return;

  var BANNER_ID  = "trial-banner";
  var OVERLAY_ID = "trial-overlay";
  var CHECK_INTERVAL = 60000; /* elke minuut checken */

  /* ── Styling ─────────────────────────────────────────────────────── */
  function injectStyles() {
    if (document.getElementById("trial-banner-css")) return;
    var s = document.createElement("style");
    s.id = "trial-banner-css";
    s.textContent = [
      "#trial-banner{display:none;align-items:center;justify-content:center;gap:10px;padding:9px 18px;font-family:Inter,-apple-system,sans-serif;font-size:13px;font-weight:500;z-index:99998;border-bottom:1px solid rgba(0,0,0,.08);transition:background .3s}",
      "#trial-banner.tb-ok{display:flex;background:#ecfdf5;color:#065f46}",
      "#trial-banner.tb-warn{display:flex;background:#fffbeb;color:#92400e}",
      "#trial-banner.tb-danger{display:flex;background:#fef2f2;color:#991b1b}",
      "#trial-banner a{color:inherit;font-weight:700;text-decoration:underline;text-underline-offset:2px}",
      "#trial-banner .tb-days{font-weight:700;font-variant-numeric:tabular-nums}",
      "#trial-banner .tb-close{background:none;border:none;cursor:pointer;font-size:16px;color:inherit;opacity:.5;padding:2px 6px;margin-left:auto}",
      "#trial-banner .tb-close:hover{opacity:1}",

      /* Fullscreen overlay voor verlopen trials */
      "#trial-overlay{display:none;position:fixed;inset:0;z-index:100002;background:rgba(15,23,42,.7);backdrop-filter:blur(6px);align-items:center;justify-content:center;padding:24px;font-family:Inter,-apple-system,sans-serif}",
      "#trial-overlay.active{display:flex}",
      ".to-box{background:#fff;border-radius:16px;max-width:440px;width:100%;padding:40px 36px;text-align:center;box-shadow:0 30px 80px rgba(0,0,0,.25)}",
      ".to-icon{font-size:48px;margin-bottom:16px}",
      ".to-title{font-size:22px;font-weight:700;color:#0f172a;margin:0 0 8px}",
      ".to-text{font-size:14px;color:#64748b;line-height:1.7;margin:0 0 24px}",
      ".to-btn{display:inline-block;padding:12px 32px;border-radius:8px;font-size:15px;font-weight:700;cursor:pointer;border:none;text-decoration:none;transition:all .15s}",
      ".to-btn-primary{background:#2563eb;color:#fff;margin-bottom:10px}",
      ".to-btn-primary:hover{background:#1d4ed8}",
      ".to-btn-secondary{background:transparent;color:#64748b;font-size:13px;font-weight:500}",
      ".to-btn-secondary:hover{color:#334155}",

      /* Dark mode */
      "@media(prefers-color-scheme:dark){",
        "#trial-banner.tb-ok{background:#064e3b;color:#a7f3d0}",
        "#trial-banner.tb-warn{background:#78350f;color:#fde68a}",
        "#trial-banner.tb-danger{background:#7f1d1d;color:#fecaca}",
        ".to-box{background:#1e293b;box-shadow:0 30px 80px rgba(0,0,0,.5)}",
        ".to-title{color:#f1f5f9}",
        ".to-text{color:#94a3b8}",
      "}"
    ].join("\n");
    document.head.appendChild(s);
  }

  /* ── Banner element ──────────────────────────────────────────────── */
  function ensureBanner() {
    if (document.getElementById(BANNER_ID)) return document.getElementById(BANNER_ID);
    var b = document.createElement("div");
    b.id = BANNER_ID;
    /* Probeer de banner bovenaan de body te plaatsen */
    if (document.body.firstChild) {
      document.body.insertBefore(b, document.body.firstChild);
    } else {
      document.body.appendChild(b);
    }
    return b;
  }

  /* ── Overlay element ─────────────────────────────────────────────── */
  function ensureOverlay() {
    if (document.getElementById(OVERLAY_ID)) return document.getElementById(OVERLAY_ID);
    var o = document.createElement("div");
    o.id = OVERLAY_ID;
    document.body.appendChild(o);
    return o;
  }

  /* ── Berekeningen ────────────────────────────────────────────────── */
  function getTrialInfo() {
    var t = TC.all();
    var status = t.status || "active";
    var endsAt = t.trialEndsAt ? new Date(t.trialEndsAt) : null;
    var now = new Date();
    var daysLeft = endsAt ? Math.ceil((endsAt - now) / (1000 * 60 * 60 * 24)) : null;
    var isExpired = status === "trial" && endsAt && endsAt < now;

    return {
      status: status,
      endsAt: endsAt,
      daysLeft: daysLeft,
      isExpired: isExpired,
      isTrial: status === "trial",
      isSuspended: status === "suspended",
      isCancelled: status === "cancelled"
    };
  }

  /* ── Upgrade URL (placeholder — wordt later Stripe Checkout) ───── */
  function upgradeUrl() {
    var slug = TC.tenant || "default";
    /* Later: return "https://visioffer.be/upgrade?tenant=" + slug; */
    return "mailto:info@visioffer.be?subject=Upgrade%20" + encodeURIComponent(slug);
  }

  /* ── Banner renderen ─────────────────────────────────────────────── */
  function renderBanner() {
    var info = getTrialInfo();
    var banner = ensureBanner();
    var overlay = ensureOverlay();

    /* Reset */
    banner.className = "";
    banner.innerHTML = "";
    overlay.className = "";
    overlay.innerHTML = "";

    /* Actieve of vrije tenants — niets tonen */
    if (info.status === "active" || info.status === "free") {
      banner.style.display = "none";
      return;
    }

    /* Cancelled */
    if (info.isCancelled) {
      showOverlay(overlay, "🚫", "Account gedeactiveerd",
        "Dit account is geannuleerd. Je data blijft bewaard. Neem contact op om te heractiveren.",
        "Neem contact op", upgradeUrl());
      return;
    }

    /* Suspended (betalingsprobleem) */
    if (info.isSuspended) {
      showOverlay(overlay, "⚠️", "Betaling mislukt",
        "Je abonnement is gepauzeerd wegens een betalingsprobleem. Werk je betaalgegevens bij om door te gaan.",
        "Betaling bijwerken", upgradeUrl());
      return;
    }

    /* Trial verlopen */
    if (info.isExpired) {
      showOverlay(overlay, "⏰", "Je proefperiode is afgelopen",
        "Je 14 dagen gratis proefperiode is voorbij. Al je offertes en data zijn bewaard. Upgrade om verder te werken.",
        "Plan kiezen", upgradeUrl());
      return;
    }

    /* Trial actief — toon banner */
    if (info.isTrial && info.daysLeft !== null) {
      var level;
      if (info.daysLeft <= 1) level = "tb-danger";
      else if (info.daysLeft <= 3) level = "tb-warn";
      else level = "tb-ok";

      var dayWord = info.daysLeft === 1 ? "dag" : "dagen";
      var msg = info.daysLeft <= 0
        ? "Je proefperiode verloopt vandaag."
        : "Nog <span class=\"tb-days\">" + info.daysLeft + "</span> " + dayWord + " in je proefperiode.";

      banner.className = level;
      banner.innerHTML = '<span>' + msg + '</span> ' +
        '<a href="' + upgradeUrl() + '">Upgraden</a>' +
        '<button class="tb-close" title="Sluiten" onclick="this.parentNode.style.display=\'none\'">&times;</button>';
    }
  }

  function showOverlay(el, icon, title, text, btnText, btnUrl) {
    el.className = "active";
    el.innerHTML =
      '<div class="to-box">' +
        '<div class="to-icon">' + icon + '</div>' +
        '<h2 class="to-title">' + title + '</h2>' +
        '<p class="to-text">' + text + '</p>' +
        '<a class="to-btn to-btn-primary" href="' + btnUrl + '">' + btnText + '</a><br>' +
        '<button class="to-btn to-btn-secondary" onclick="this.closest(\'#trial-overlay\').className=\'\'">Toch even rondkijken</button>' +
      '</div>';
  }

  /* ── Gate: blokkeer opslaan als trial verlopen ───────────────────── */
  function isBlocked() {
    var info = getTrialInfo();
    return info.isExpired || info.isSuspended || info.isCancelled;
  }

  /* Publieke API zodat andere scripts kunnen checken */
  global.trialInfo = getTrialInfo;
  global.isTrialBlocked = isBlocked;

  /* ── Init ────────────────────────────────────────────────────────── */
  function init() {
    injectStyles();
    renderBanner();
    /* Hercheck periodiek (bijv. als de dag verspringt) */
    setInterval(renderBanner, CHECK_INTERVAL);
  }

  /* Wacht tot TC geladen is (na Supabase fetch) */
  function startWhenReady() {
    /* Als TC.load al gedraaid heeft, start direct */
    if (TC.all().status) {
      init();
      return;
    }
    /* Anders: wacht even tot na de Supabase load */
    var attempts = 0;
    var wait = setInterval(function () {
      attempts++;
      if (TC.all().status || attempts > 30) {
        clearInterval(wait);
        init();
      }
    }, 500);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startWhenReady);
  } else {
    startWhenReady();
  }

})(typeof window !== "undefined" ? window : this);
