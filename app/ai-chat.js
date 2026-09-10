/* ═══════════════════════════════════════════════════════════════════════
   ai-chat.js — AI chatbot component voor VisiOffer
   ───────────────────────────────────────────────────────────────────────
   Drop-in: voeg <script src="ai-chat.js"></script> ná tenant-config.js
   en ná de Supabase-client in index.html.

   Gedrag:
     • plan = "pro" of "enterprise" → volledige chatbox
     • ander plan                   → upsell-teaser met lock-icoon
     • Gespreksgeschiedenis in-memory (per sessie)
     • Rate-limit feedback vanuit de Worker
   ═══════════════════════════════════════════════════════════════════════ */
(function (global) {
  "use strict";

  var TC = global.TC;
  if (!TC) return;

  /* ── Config ─────────────────────────────────────────────────────── */
  var WORKER_URL = "https://quotestudio.stijn-borloo-968.workers.dev/chat";
  var PRO_PLANS  = { pro: 1, enterprise: 1 };
  var MAX_MSG_LEN = 2000;

  var CSS_ID  = "ai-chat-css";
  var FAB_ID  = "ai-chat-fab";
  var BOX_ID  = "ai-chat-box";

  /* ── State ──────────────────────────────────────────────────────── */
  var history = [];        /* [{role,content}, ...] voor context */
  var isOpen  = false;
  var isSending = false;

  /* ── Hulp: Supabase access token ────────────────────────────────── */
  function getToken() {
    try {
      /* Supabase v2 slaat de sessie op in localStorage */
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf("sb-") === 0 && k.indexOf("-auth-token") > 0) {
          var d = JSON.parse(localStorage.getItem(k));
          if (d && d.access_token) return d.access_token;
          /* v2.x formaat: genest onder currentSession of session */
          if (d && d.currentSession && d.currentSession.access_token) return d.currentSession.access_token;
        }
      }
    } catch (e) {}
    return null;
  }

  /* ── Context detectie ───────────────────────────────────────────── */
  function detectContext() {
    var hash = location.hash || "";
    if (hash.indexOf("admin") > -1 || hash.indexOf("beheer") > -1) return "admin";
    if (hash.indexOf("quote") > -1 || hash.indexOf("offerte") > -1) return "quote";
    return "app";
  }

  /* ── Styling ─────────────────────────────────────────────────────── */
  function injectStyles() {
    if (document.getElementById(CSS_ID)) return;
    var s = document.createElement("style");
    s.id = CSS_ID;
    s.textContent = `
/* ── FAB (floating action button) ─────────────────────────── */
#ai-chat-fab {
  position: fixed; bottom: 24px; right: 24px; z-index: 99990;
  width: 56px; height: 56px; border-radius: 50%;
  background: var(--red, #E8404E); color: #fff;
  border: none; cursor: pointer;
  box-shadow: 0 4px 20px rgba(232,64,78,.35);
  display: flex; align-items: center; justify-content: center;
  transition: transform .2s, box-shadow .2s;
  font-size: 24px; line-height: 1;
}
#ai-chat-fab:hover { transform: scale(1.08); box-shadow: 0 6px 28px rgba(232,64,78,.45); }
#ai-chat-fab.has-lock { background: var(--slate-500, #64748b); box-shadow: 0 4px 20px rgba(100,116,139,.3); }
#ai-chat-fab.has-lock:hover { box-shadow: 0 6px 28px rgba(100,116,139,.4); }

/* ── Chatbox ──────────────────────────────────────────────── */
#ai-chat-box {
  position: fixed; bottom: 92px; right: 24px; z-index: 99991;
  width: 380px; max-width: calc(100vw - 32px);
  max-height: min(520px, calc(100vh - 120px));
  background: #fff; border-radius: 16px;
  box-shadow: 0 20px 60px rgba(15,23,42,.18), 0 0 0 1px rgba(15,23,42,.06);
  display: none; flex-direction: column;
  font-family: 'Inter', -apple-system, sans-serif;
  overflow: hidden;
}
#ai-chat-box.open { display: flex; }

.aic-header {
  padding: 16px 18px; display: flex; align-items: center; gap: 10px;
  background: var(--red, #E8404E); color: #fff; flex-shrink: 0;
}
.aic-header-title { font-weight: 600; font-size: 14px; flex: 1; }
.aic-header-usage { font-size: 11px; opacity: .8; }
.aic-header-close {
  background: none; border: none; color: #fff; cursor: pointer;
  font-size: 20px; padding: 0 4px; opacity: .8; line-height: 1;
}
.aic-header-close:hover { opacity: 1; }

.aic-messages {
  flex: 1; overflow-y: auto; padding: 16px;
  display: flex; flex-direction: column; gap: 10px;
  min-height: 200px;
}

.aic-msg {
  max-width: 85%; padding: 10px 14px; border-radius: 14px;
  font-size: 13px; line-height: 1.55; word-break: break-word;
  white-space: pre-wrap;
}
.aic-msg.user {
  align-self: flex-end;
  background: var(--red, #E8404E); color: #fff;
  border-bottom-right-radius: 4px;
}
.aic-msg.bot {
  align-self: flex-start;
  background: #f1f5f9; color: #1e293b;
  border-bottom-left-radius: 4px;
}
.aic-msg.error {
  align-self: center; text-align: center;
  background: #fef2f2; color: #991b1b;
  font-size: 12px; border-radius: 8px;
}
.aic-msg.system {
  align-self: center; text-align: center;
  color: #94a3b8; font-size: 12px; padding: 6px;
}

.aic-typing {
  align-self: flex-start; padding: 12px 18px;
  background: #f1f5f9; border-radius: 14px;
  border-bottom-left-radius: 4px;
  display: none; gap: 5px; align-items: center;
}
.aic-typing.active { display: flex; }
.aic-dot {
  width: 7px; height: 7px; border-radius: 50%;
  background: #94a3b8; animation: aicBounce .6s infinite alternate;
}
.aic-dot:nth-child(2) { animation-delay: .15s; }
.aic-dot:nth-child(3) { animation-delay: .3s; }
@keyframes aicBounce { to { opacity: .3; transform: translateY(-4px); } }

.aic-input-bar {
  display: flex; align-items: end; gap: 8px;
  padding: 12px 14px; border-top: 1px solid #e2e8f0; flex-shrink: 0;
}
.aic-input {
  flex: 1; border: 1px solid #e2e8f0; border-radius: 10px;
  padding: 10px 14px; font-size: 13px; font-family: inherit;
  resize: none; outline: none; max-height: 100px;
  line-height: 1.45; color: #1e293b;
}
.aic-input:focus { border-color: var(--red, #E8404E); }
.aic-input::placeholder { color: #94a3b8; }
.aic-send {
  width: 38px; height: 38px; border-radius: 10px; border: none;
  background: var(--red, #E8404E); color: #fff; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0; transition: opacity .15s;
}
.aic-send:disabled { opacity: .4; cursor: default; }
.aic-send svg { width: 18px; height: 18px; }

/* ── Upsell overlay (in de chatbox) ───────────────────────── */
.aic-upsell {
  padding: 32px 24px; text-align: center; flex: 1;
  display: flex; flex-direction: column; align-items: center;
  justify-content: center; gap: 12px;
}
.aic-upsell-icon { font-size: 40px; }
.aic-upsell-title {
  font-family: 'Space Grotesk', sans-serif;
  font-weight: 700; font-size: 18px; color: #0f172a;
}
.aic-upsell-text { font-size: 13px; color: #64748b; line-height: 1.6; max-width: 280px; }
.aic-upsell-btn {
  display: inline-block; padding: 11px 28px; border-radius: 10px;
  background: var(--red, #E8404E); color: #fff; font-weight: 600;
  font-size: 14px; text-decoration: none; cursor: pointer; border: none;
  margin-top: 4px; transition: background .15s;
}
.aic-upsell-btn:hover { background: var(--red-hover, #d1323f); }

/* ── Dark mode ────────────────────────────────────────────── */
@media(prefers-color-scheme:dark) {
  #ai-chat-box { background: #1e293b; box-shadow: 0 20px 60px rgba(0,0,0,.4), 0 0 0 1px rgba(255,255,255,.06); }
  .aic-msg.bot { background: #334155; color: #e2e8f0; }
  .aic-msg.error { background: #450a0a; color: #fecaca; }
  .aic-input-bar { border-top-color: #334155; }
  .aic-input { background: #0f172a; border-color: #334155; color: #e2e8f0; }
  .aic-typing { background: #334155; }
  .aic-dot { background: #64748b; }
  .aic-upsell-title { color: #f1f5f9; }
  .aic-upsell-text { color: #94a3b8; }
}

/* ── Responsive ───────────────────────────────────────────── */
@media(max-width: 480px) {
  #ai-chat-box {
    bottom: 0; right: 0; left: 0;
    width: 100%; max-width: 100%;
    max-height: calc(100vh - 60px);
    border-radius: 16px 16px 0 0;
  }
  #ai-chat-fab { bottom: 16px; right: 16px; }
}
`;
    document.head.appendChild(s);
  }

  /* ── SVG icons ───────────────────────────────────────────────────── */
  var ICON_CHAT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
  var ICON_SEND = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>';
  var ICON_LOCK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:22px;height:22px"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>';
  var ICON_SPARKLE = '<svg viewBox="0 0 24 24" fill="currentColor" style="width:22px;height:22px"><path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z"/></svg>';
  var ICON_CLOSE = '×';

  /* ── Plan check (super-users mogen altijd) ───────────────────────── */
  function isSuper() {
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf("sb-") === 0 && k.indexOf("-auth-token") > 0) {
          var d = JSON.parse(localStorage.getItem(k));
          var u = d && (d.user || (d.currentSession && d.currentSession.user));
          if (u && u.app_metadata && u.app_metadata.role === "super") return true;
        }
      }
    } catch (e) {}
    return false;
  }

  function isPro() {
    if (isSuper()) return true;
    var plan = (TC.get("plan") || "free").toLowerCase();
    return !!PRO_PLANS[plan];
  }

  /* ── Upgrade URL ────────────────────────────────────────────────── */
  function upgradeUrl() {
    var slug = TC.tenant || "default";
    return "mailto:info@visioffer.be?subject=Upgrade%20naar%20Pro%20—%20" + encodeURIComponent(slug);
  }

  /* ── DOM bouwen ─────────────────────────────────────────────────── */
  function buildFab() {
    if (document.getElementById(FAB_ID)) return;
    var btn = document.createElement("button");
    btn.id = FAB_ID;
    btn.title = isPro() ? "AI-assistent" : "AI-assistent (Pro)";
    btn.className = isPro() ? "" : "has-lock";
    btn.innerHTML = isPro() ? ICON_SPARKLE : ICON_LOCK;
    btn.addEventListener("click", toggleChat);
    document.body.appendChild(btn);
  }

  function buildChatbox() {
    if (document.getElementById(BOX_ID)) return;
    var box = document.createElement("div");
    box.id = BOX_ID;

    if (isPro()) {
      box.innerHTML =
        '<div class="aic-header">' +
          '<span style="font-size:18px">✦</span>' +
          '<span class="aic-header-title">AI-assistent</span>' +
          '<span class="aic-header-usage" id="aic-usage"></span>' +
          '<button class="aic-header-close" id="aic-close">' + ICON_CLOSE + '</button>' +
        '</div>' +
        '<div class="aic-messages" id="aic-messages">' +
          '<div class="aic-msg system">Hoe kan ik je helpen?</div>' +
        '</div>' +
        '<div class="aic-typing" id="aic-typing">' +
          '<div class="aic-dot"></div><div class="aic-dot"></div><div class="aic-dot"></div>' +
        '</div>' +
        '<div class="aic-input-bar">' +
          '<textarea class="aic-input" id="aic-input" placeholder="Stel een vraag…" rows="1"></textarea>' +
          '<button class="aic-send" id="aic-send" title="Verstuur">' + ICON_SEND + '</button>' +
        '</div>';
    } else {
      /* Upsell variant */
      box.innerHTML =
        '<div class="aic-header">' +
          '<span style="font-size:18px">🔒</span>' +
          '<span class="aic-header-title">AI-assistent</span>' +
          '<button class="aic-header-close" id="aic-close">' + ICON_CLOSE + '</button>' +
        '</div>' +
        '<div class="aic-upsell">' +
          '<div class="aic-upsell-icon">✦</div>' +
          '<div class="aic-upsell-title">AI-assistent</div>' +
          '<div class="aic-upsell-text">' +
            'Krijg direct hulp bij het samenstellen van offertes, productadvies op maat van jouw sector, ' +
            'en begeleiding bij elke stap in de app.' +
          '</div>' +
          '<a class="aic-upsell-btn" href="' + upgradeUrl() + '">Upgraden naar Pro</a>' +
        '</div>';
    }

    document.body.appendChild(box);

    /* Event listeners */
    document.getElementById("aic-close").addEventListener("click", toggleChat);

    if (isPro()) {
      var input = document.getElementById("aic-input");
      var sendBtn = document.getElementById("aic-send");

      sendBtn.addEventListener("click", sendMessage);
      input.addEventListener("keydown", function (e) {
        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
      });

      /* Auto-resize textarea */
      input.addEventListener("input", function () {
        this.style.height = "auto";
        this.style.height = Math.min(this.scrollHeight, 100) + "px";
      });
    }
  }

  /* ── Open/dicht ─────────────────────────────────────────────────── */
  function toggleChat() {
    isOpen = !isOpen;
    var box = document.getElementById(BOX_ID);
    if (box) box.classList.toggle("open", isOpen);

    /* FAB-icoon wisselen */
    var fab = document.getElementById(FAB_ID);
    if (fab && isPro()) {
      fab.innerHTML = isOpen ? ICON_CLOSE : ICON_SPARKLE;
      fab.style.fontSize = isOpen ? "28px" : "24px";
    }

    /* Focus op input bij openen */
    if (isOpen && isPro()) {
      var input = document.getElementById("aic-input");
      if (input) setTimeout(function () { input.focus(); }, 100);
    }
  }

  /* ── Bericht toevoegen aan de UI ─────────────────────────────────── */
  function addMessage(role, text) {
    var container = document.getElementById("aic-messages");
    if (!container) return;
    var div = document.createElement("div");
    div.className = "aic-msg " + role;
    div.textContent = text;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
  }

  /* ── Verstuur bericht ───────────────────────────────────────────── */
  async function sendMessage() {
    if (isSending) return;
    var input = document.getElementById("aic-input");
    if (!input) return;

    var msg = input.value.trim();
    if (!msg) return;
    if (msg.length > MAX_MSG_LEN) {
      addMessage("error", "Bericht te lang (max " + MAX_MSG_LEN + " tekens)");
      return;
    }

    var token = getToken();
    if (!token) {
      addMessage("error", "Je bent niet ingelogd. Vernieuw de pagina en probeer opnieuw.");
      return;
    }

    /* Toon bericht van gebruiker */
    addMessage("user", msg);
    input.value = "";
    input.style.height = "auto";

    /* Toon typing indicator */
    isSending = true;
    var sendBtn = document.getElementById("aic-send");
    if (sendBtn) sendBtn.disabled = true;
    var typing = document.getElementById("aic-typing");
    if (typing) typing.classList.add("active");

    try {
      var res = await fetch(WORKER_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + token,
        },
        body: JSON.stringify({
          message: msg,
          context: detectContext(),
          history: history.slice(-10),
        }),
      });

      var data = await res.json();

      if (!res.ok) {
        if (data.error === "upgrade_required") {
          addMessage("error", "AI-assistent is alleen beschikbaar in het Pro-plan.");
        } else if (data.error === "rate_limited") {
          addMessage("error", data.message || "Dagelijks limiet bereikt.");
        } else {
          addMessage("error", data.message || data.error || "Er ging iets mis.");
        }
        return;
      }

      /* Bewaar in history voor context */
      history.push({ role: "user", content: msg });
      history.push({ role: "assistant", content: data.reply });

      /* Toon antwoord */
      addMessage("bot", data.reply);

      /* Update usage indicator */
      if (data.usage) {
        var usageEl = document.getElementById("aic-usage");
        if (usageEl) {
          usageEl.textContent = data.usage.msg_today + "/" + data.usage.daily_limit;
        }
      }
    } catch (e) {
      addMessage("error", "Verbinding mislukt. Controleer je internetverbinding.");
    } finally {
      isSending = false;
      if (sendBtn) sendBtn.disabled = false;
      if (typing) typing.classList.remove("active");
    }
  }

  /* ── Rebuild: hercheck pro-status en herbouw DOM indien nodig ───── */
  function rebuild() {
    if (!isPro()) return;                 /* nog steeds free → niets doen */
    var fab = document.getElementById(FAB_ID);
    if (fab && fab.classList.contains("has-lock")) {
      fab.className = "";
      fab.title = "AI-assistent";
      fab.innerHTML = ICON_SPARKLE;
    }
    var box = document.getElementById(BOX_ID);
    if (box && box.querySelector(".aic-upsell")) {
      box.remove();                       /* verwijder upsell-variant */
      buildChatbox();                     /* bouw pro-variant */
    }
  }

  /* ── Init ────────────────────────────────────────────────────────── */
  function init() {
    /* Niet tonen als trial verlopen of account geblokkeerd */
    if (typeof global.isTrialBlocked === "function" && global.isTrialBlocked()) return;

    injectStyles();
    buildFab();
    buildChatbox();

    /* Auth-state kan later laden dan TC → hercheck na auth-change */
    try {
      var sbKey = "";
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf("sb-") === 0 && k.indexOf("-auth-token") > 0) { sbKey = k; break; }
      }
      if (!sbKey) {
        /* Token bestaat nog niet — poll kort tot het er is */
        var rAttempts = 0;
        var rWait = setInterval(function () {
          rAttempts++;
          if (isSuper()) { clearInterval(rWait); rebuild(); }
          if (rAttempts > 20) clearInterval(rWait);   /* max 10s */
        }, 500);
      }
    } catch (e) {}
  }

  /* Wacht tot TC geladen is */
  function startWhenReady() {
    if (TC.all().plan) { init(); return; }
    var attempts = 0;
    var wait = setInterval(function () {
      attempts++;
      if (TC.all().plan || attempts > 30) {
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

  /* ── Publieke API ───────────────────────────────────────────────── */
  global.aiChat = {
    open:  function () { if (!isOpen) toggleChat(); },
    close: function () { if (isOpen) toggleChat(); },
    toggle: toggleChat,
    isPro: isPro,
  };

})(typeof window !== "undefined" ? window : this);
