/* ═══════════════════════════════════════════════════════════════════════
   super-admin.js — Klant-onboarding panel voor QuoteStudio super-admins
   ───────────────────────────────────────────────────────────────────────
   Drop-in: voeg <script src="super-admin.js"></script> ná tenant-admin.js
   in index.html. Toont een "Klanten" menu-item dat enkel zichtbaar is
   voor super-admins.

   Functionaliteit:
     • Nieuwe tenant aanmaken (slug, bedrijfsnaam, kleur)
     • Admin-user uitnodigen en koppelen aan de tenant
     • Overzicht van alle tenants met stats
     • Memberships beheren

   Fix: als een tenant al bestaat, slaat de creatie over en gaat direct
        door naar de user invite + membership stap.
   ═══════════════════════════════════════════════════════════════════════ */
(function (global) {
  "use strict";

  var TC = global.TC;
  if (!TC) { console.warn("[super-admin] TC ontbreekt."); return; }

  /* ── Worker URL ──────────────────────────────────────────────────── */
  function workerUrl() {
    return global._workerUrl || "";
  }
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function toast(m) {
    if (typeof global.toast === "function") global.toast(m);
    else console.log("[super-admin]", m);
  }

  /* ── Supabase + Worker helpers ──────────────────────────────────── */
  function supa() { return typeof global.supaInit === "function" ? global.supaInit() : null; }

  async function authToken() {
    var c = supa(); if (!c) return null;
    var s = await c.auth.getSession();
    return (s && s.data && s.data.session) ? s.data.session.access_token : null;
  }

  async function workerCall(endpoint, body) {
    var url = workerUrl();
    if (!url) throw new Error("Worker URL niet ingesteld (localStorage qs_worker_url).");
    var token = await authToken();
    if (!token) throw new Error("Niet ingelogd.");
    var res = await fetch(url.replace(/\/+$/, "") + "/" + endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token },
      body: JSON.stringify(body || {})
    });
    var data = await res.json().catch(function () { return {}; });
    if (!res.ok || data.error) throw new Error(data.error || "Fout " + res.status);
    return data;
  }

  /* ── Data loaders ───────────────────────────────────────────────── */
  var _tenants = [];
  var _users = [];

  async function loadTenants() {
    var c = supa(); if (!c) return [];
    var r = await c.rpc("all_tenants");
    _tenants = (r && r.data) || [];
    return _tenants;
  }

  async function loadUsers() {
    try {
      var data = await workerCall("list-users");
      _users = data.users || [];
    } catch (e) {
      _users = [];
      console.warn("[super-admin] users laden mislukt:", e.message);
    }
    return _users;
  }

  async function loadMembers() {
    var c = supa(); if (!c) return [];
    var r = await c.from("qs_tenant_members").select("user_id, tenant_slug, role");
    return (r && r.data) || [];
  }

  /* ── Modal HTML ─────────────────────────────────────────────────── */
  var CSS = [
    "#sa-modal{display:none;position:fixed;inset:0;z-index:100001;background:rgba(15,23,42,.55);align-items:flex-start;justify-content:center;padding:24px 12px;overflow-y:auto;font-family:Inter,Arial,sans-serif}",
    "#sa-box{background:#fff;border-radius:14px;width:100%;max-width:560px;margin:auto;box-shadow:0 25px 60px rgba(0,0,0,.18);overflow:hidden}",
    "#sa-head{padding:18px 20px;border-bottom:1px solid #e5e7eb;display:flex;align-items:center;justify-content:space-between}",
    "#sa-head h2{margin:0;font-size:17px;font-weight:700;color:#1e293b}",
    "#sa-body{padding:16px 20px;max-height:70vh;overflow-y:auto}",
    ".sa-tabs{display:flex;gap:0;border-bottom:2px solid #e5e7eb;margin-bottom:16px}",
    ".sa-tab{padding:8px 16px;font-size:12.5px;font-weight:600;color:#94a3b8;border:none;background:none;cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-2px;font-family:inherit}",
    ".sa-tab.on{color:var(--red,#2563eb);border-bottom-color:var(--red,#2563eb)}",
    ".sa-card{border:1px solid #e5e7eb;border-radius:8px;padding:14px;margin-bottom:10px;background:#fff}",
    ".sa-card:hover{border-color:#cbd5e1}",
    ".sa-row{display:flex;align-items:center;gap:10px}",
    ".sa-badge{font-size:9px;font-weight:700;padding:2px 7px;border-radius:3px;text-transform:uppercase;letter-spacing:.03em}",
    ".sa-field{margin-bottom:10px}",
    ".sa-field label{display:block;font-size:11px;font-weight:600;color:#64748b;margin-bottom:3px}",
    ".sa-field input,.sa-field select{width:100%;padding:7px 10px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;font-family:inherit;box-sizing:border-box;outline:none}",
    ".sa-field input:focus,.sa-field select:focus{border-color:var(--red,#2563eb);box-shadow:0 0 0 3px rgba(37,99,235,.1)}",
    ".sa-btn{padding:8px 16px;border:none;border-radius:6px;font-size:12.5px;font-weight:600;cursor:pointer;font-family:inherit;transition:opacity .15s}",
    ".sa-btn:disabled{opacity:.5;cursor:default}",
    ".sa-btn-p{background:var(--red,#2563eb);color:#fff}",
    ".sa-btn-p:hover:not(:disabled){opacity:.88}",
    ".sa-btn-s{background:#f1f5f9;color:#334155}",
    ".sa-btn-s:hover:not(:disabled){background:#e2e8f0}",
    ".sa-btn-d{background:#fef2f2;color:#dc2626}",
    ".sa-btn-d:hover:not(:disabled){background:#fee2e2}",
    ".sa-empty{color:#94a3b8;font-size:12px;text-align:center;padding:20px}",
    ".sa-err{background:#fef2f2;color:#dc2626;font-size:12px;padding:8px 12px;border-radius:6px;margin-top:8px}",
    ".sa-ok{background:#f0fdf4;color:#166534;font-size:12px;padding:8px 12px;border-radius:6px;margin-top:8px}",
    ".sa-stat{font-size:11px;color:#94a3b8;margin-top:2px}",
    ".sa-close{background:none;border:none;font-size:22px;color:#94a3b8;cursor:pointer;padding:0 4px;line-height:1}",
    ".sa-close:hover{color:#334155}"
  ].join("\n");

  function buildModal() {
    if (document.getElementById("sa-modal")) return;

    var style = document.createElement("style");
    style.textContent = CSS;
    document.head.appendChild(style);

    var wrap = document.createElement("div");
    wrap.id = "sa-modal";
    wrap.innerHTML =
      '<div id="sa-box">' +
        '<div id="sa-head"><h2>Klantenbeheer</h2><button class="sa-close" onclick="closeSuperAdmin()">&times;</button></div>' +
        '<div id="sa-body">' +
          '<div class="sa-tabs">' +
            '<button class="sa-tab on" onclick="saTab(\'list\',this)">Overzicht</button>' +
            '<button class="sa-tab" onclick="saTab(\'add\',this)">+ Nieuwe klant</button>' +
            '<button class="sa-tab" onclick="saTab(\'members\',this)">Memberships</button>' +
          '</div>' +
          '<div id="sa-panel-list"></div>' +
          '<div id="sa-panel-add" style="display:none"></div>' +
          '<div id="sa-panel-members" style="display:none"></div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(wrap);
    wrap.addEventListener("click", function (e) { if (e.target === wrap) closeSuperAdmin(); });
  }

  /* ── Tab switching ──────────────────────────────────────────────── */
  global.saTab = function (id, btn) {
    ["list", "add", "members"].forEach(function (t) {
      var p = document.getElementById("sa-panel-" + t);
      if (p) p.style.display = (t === id) ? "" : "none";
    });
    var tabs = document.querySelectorAll(".sa-tab");
    Array.prototype.forEach.call(tabs, function (t) { t.classList.remove("on"); });
    if (btn) btn.classList.add("on");
    if (id === "list") renderList();
    if (id === "add") renderAddForm();
    if (id === "members") renderMembers();
  };

  /* ── Tab 1: Overzicht ───────────────────────────────────────────── */
  async function renderList() {
    var panel = document.getElementById("sa-panel-list");
    if (!panel) return;
    panel.innerHTML = '<div class="sa-empty">Laden\u2026</div>';

    try {
      await Promise.all([loadTenants(), loadUsers()]);
      var members = await loadMembers();

      if (!_tenants.length) {
        panel.innerHTML = '<div class="sa-empty">Nog geen tenants aangemaakt.</div>';
        return;
      }

      panel.innerHTML = _tenants.map(function (t) {
        var tUsers = _users.filter(function (u) {
          return (u.app_metadata && u.app_metadata.tenant_id === t.slug);
        });
        var mCount = members.filter(function (m) { return m.tenant_slug === t.slug; }).length;

        return '<div class="sa-card">' +
          '<div class="sa-row">' +
            '<div style="flex:1">' +
              '<div style="font-size:13.5px;font-weight:700;color:#1e293b">' + esc(t.company_name || t.slug) + '</div>' +
              '<div class="sa-stat">' +
                '<span class="sa-badge" style="background:#eef2ff;color:#3730a3">' + esc(t.slug) + '</span> \u00b7 ' +
                tUsers.length + ' user' + (tUsers.length !== 1 ? 's' : '') + ' \u00b7 ' +
                mCount + ' membership' + (mCount !== 1 ? 's' : '') +
              '</div>' +
            '</div>' +
            '<button class="sa-btn sa-btn-s" onclick="saOnboard(\'' + esc(t.slug) + '\')">+ User</button>' +
          '</div>' +
        '</div>';
      }).join("");
    } catch (e) {
      panel.innerHTML = '<div class="sa-err">' + esc(e.message) + '</div>';
    }
  }

  /* ── Tab 2: Nieuwe klant ────────────────────────────────────────── */
  function renderAddForm() {
    var panel = document.getElementById("sa-panel-add");
    if (!panel) return;
    panel.innerHTML =
      '<div class="sa-field"><label>Tenant-slug (uniek, kleine letters)</label>' +
        '<input id="sa-slug" placeholder="bv. acme-av" pattern="[a-z0-9-]+" /></div>' +
      '<div class="sa-field"><label>Bedrijfsnaam</label>' +
        '<input id="sa-name" placeholder="bv. Acme AV Solutions" /></div>' +
      '<div class="sa-field"><label>Merkkleur</label>' +
        '<div style="display:flex;gap:8px;align-items:center">' +
          '<input type="color" id="sa-color" value="#2563eb" style="width:40px;height:34px;padding:2px;border:1px solid #d1d5db;border-radius:4px;cursor:pointer" />' +
          '<input id="sa-color-hex" value="#2563eb" style="flex:1" oninput="document.getElementById(\'sa-color\').value=this.value" />' +
        '</div></div>' +
      '<div class="sa-field"><label>Eerste admin uitnodigen (e-mail)</label>' +
        '<input id="sa-email" type="email" placeholder="admin@klant.be" /></div>' +
      '<div style="display:flex;gap:8px;margin-top:14px">' +
        '<button class="sa-btn sa-btn-p" id="sa-create-btn" onclick="saCreateTenant()">Klant aanmaken</button>' +
      '</div>' +
      '<div id="sa-create-status"></div>';
  }

  /* ─── CORE FIX: als tenant al bestaat, sla creatie over en ga door
       naar user invite. Zo kun je vanuit "+ Nieuwe klant" ook gewoon
       een user aan een bestaande tenant toevoegen. ─────────────────── */
  global.saCreateTenant = async function () {
    var slug = (document.getElementById("sa-slug").value || "").trim().toLowerCase();
    var name = (document.getElementById("sa-name").value || "").trim();
    var color = (document.getElementById("sa-color").value || "#2563eb").trim();
    var email = (document.getElementById("sa-email").value || "").trim().toLowerCase();
    var status = document.getElementById("sa-create-status");
    var btn = document.getElementById("sa-create-btn");

    if (!slug || !/^[a-z0-9-]{2,40}$/.test(slug)) {
      status.innerHTML = '<div class="sa-err">Slug: 2\u201340 tekens, kleine letters/cijfers/-</div>';
      return;
    }

    btn.disabled = true;
    btn.textContent = "Bezig\u2026";
    status.innerHTML = "";

    var steps = [];
    try {
      var c = supa();
      if (!c) throw new Error("Supabase niet beschikbaar.");

      /* ── Stap 1: Tenant aanmaken of overslaan ──────────────────── */
      var existing = await c.from("qs_tenants").select("slug").eq("slug", slug).maybeSingle();
      if (existing && existing.data) {
        /* TENANT BESTAAT AL — geen fout, gewoon doorgaan */
        steps.push("\u2139 Tenant '" + slug + "' bestaat al \u2014 user wordt toegevoegd");
      } else {
        /* Nieuwe tenant aanmaken */
        if (!name) {
          status.innerHTML = '<div class="sa-err">Bedrijfsnaam is verplicht voor een nieuwe tenant.</div>';
          btn.disabled = false; btn.textContent = "Klant aanmaken";
          return;
        }
        var ins = await c.from("qs_tenants").insert({
          slug: slug,
          company_name: name,
          company_name_short: name,
          primary_color: color,
          allow_signup: false
        });
        if (ins.error) throw new Error(ins.error.message);
        steps.push("\u2713 Tenant '" + slug + "' aangemaakt");
      }

      /* ── Stap 2: Admin uitnodigen (optioneel) ──────────────────── */
      if (email && email.includes("@")) {
        try {
          await workerCall("invite-user", { email: email, tenant_slug: slug });
          steps.push("\u2713 Uitnodiging verstuurd naar " + email);

          /* Stap 3: Membership + admin rol */
          var usersData = await workerCall("list-users");
          var invited = (usersData.users || []).find(function (u) { return u.email === email; });
          if (invited) {
            await workerCall("set-role", { user_id: invited.id, role: "admin" });
            steps.push("\u2713 " + email + " \u2192 admin");

            await c.from("qs_tenant_members").upsert({
              user_id: invited.id,
              tenant_slug: slug,
              role: "admin"
            }, { onConflict: "user_id,tenant_slug" });
            steps.push("\u2713 Membership gekoppeld");
          }
        } catch (e) {
          steps.push("\u26a0 Uitnodiging: " + e.message);
        }
      } else if (!email) {
        steps.push("\u2139 Geen e-mail opgegeven \u2014 user later handmatig toevoegen");
      }

      /* Registreer in TC zodat de dropdown bijwerkt */
      TC.register(slug, { slug: slug, companyName: name || slug, companyNameShort: name || slug, primaryColor: color });

      status.innerHTML = '<div class="sa-ok">' + steps.join("<br>") + '</div>';
      toast("\u2713 Klant " + (name || slug) + " verwerkt");

      /* Reset form */
      document.getElementById("sa-slug").value = "";
      document.getElementById("sa-name").value = "";
      document.getElementById("sa-email").value = "";
      var sf = document.getElementById("sa-slug");
      if (sf) sf.disabled = false;

    } catch (e) {
      steps.push("\u2717 " + e.message);
      status.innerHTML = '<div class="sa-err">' + steps.join("<br>") + '</div>';
    } finally {
      btn.disabled = false;
      btn.textContent = "Klant aanmaken";
    }
  };

  /* ── Quick onboard (vanuit overzicht) ───────────────────────────── */
  global.saOnboard = function (slug) {
    saTab("add", document.querySelectorAll(".sa-tab")[1]);
    setTimeout(function () {
      var sf = document.getElementById("sa-slug");
      if (sf) { sf.value = slug; sf.disabled = true; }
      var nf = document.getElementById("sa-name");
      var tenant = _tenants.find(function (t) { return t.slug === slug; });
      if (nf && tenant) nf.value = tenant.company_name || slug;
      var ef = document.getElementById("sa-email");
      if (ef) ef.focus();
      var status = document.getElementById("sa-create-status");
      if (status) status.innerHTML = "";
      var btn = document.getElementById("sa-create-btn");
      if (btn) btn.textContent = "User uitnodigen";
    }, 50);
  };

  /* ── Tab 3: Memberships ─────────────────────────────────────────── */
  async function renderMembers() {
    var panel = document.getElementById("sa-panel-members");
    if (!panel) return;
    panel.innerHTML = '<div class="sa-empty">Laden\u2026</div>';

    try {
      var members = await loadMembers();
      await loadUsers();

      if (!members.length) {
        panel.innerHTML = '<div class="sa-empty">Geen memberships gevonden.</div>';
        return;
      }

      var grouped = {};
      members.forEach(function (m) {
        if (!grouped[m.tenant_slug]) grouped[m.tenant_slug] = [];
        var u = _users.find(function (u) { return u.id === m.user_id; });
        grouped[m.tenant_slug].push({
          user_id: m.user_id,
          email: u ? u.email : m.user_id.slice(0, 8) + "\u2026",
          role: m.role,
          tenant_slug: m.tenant_slug
        });
      });

      var html = "";
      Object.keys(grouped).sort().forEach(function (slug) {
        html += '<div style="margin-bottom:16px">' +
          '<div style="font-size:12px;font-weight:700;color:#64748b;margin-bottom:6px;text-transform:uppercase;letter-spacing:.04em">' + esc(slug) + '</div>';

        grouped[slug].forEach(function (m) {
          var roleColor = { super: "#7c3aed", admin: "#ea580c", sales: "#059669", user: "#6b7280" };
          html += '<div class="sa-card" style="padding:8px 12px">' +
            '<div class="sa-row">' +
              '<div style="flex:1;font-size:12.5px">' + esc(m.email) + '</div>' +
              '<span class="sa-badge" style="background:' + (roleColor[m.role] || "#6b7280") + '15;color:' + (roleColor[m.role] || "#6b7280") + '">' + esc(m.role) + '</span>' +
              '<button class="sa-btn sa-btn-d" style="padding:3px 8px;font-size:10px" ' +
                'onclick="saRemoveMember(\'' + esc(m.user_id) + '\',\'' + esc(m.tenant_slug) + '\',\'' + esc(m.email) + '\')">\u2715</button>' +
            '</div>' +
          '</div>';
        });

        html += '</div>';
      });

      html += '<div style="border-top:1px solid #e5e7eb;padding-top:12px;margin-top:8px">' +
        '<div style="font-size:12px;font-weight:700;color:#64748b;margin-bottom:8px">Membership toevoegen</div>' +
        '<div style="display:flex;gap:6px;flex-wrap:wrap">' +
          '<select id="sa-mem-user" style="flex:1;min-width:140px;padding:6px 8px;border:1px solid #d1d5db;border-radius:5px;font-size:12px;font-family:inherit"></select>' +
          '<select id="sa-mem-tenant" style="flex:1;min-width:100px;padding:6px 8px;border:1px solid #d1d5db;border-radius:5px;font-size:12px;font-family:inherit"></select>' +
          '<select id="sa-mem-role" style="width:80px;padding:6px 8px;border:1px solid #d1d5db;border-radius:5px;font-size:12px;font-family:inherit">' +
            '<option value="user">user</option><option value="sales">sales</option><option value="admin">admin</option><option value="super">super</option>' +
          '</select>' +
          '<button class="sa-btn sa-btn-p" onclick="saAddMember()">+</button>' +
        '</div>' +
      '</div>';

      panel.innerHTML = html;

      var userSel = document.getElementById("sa-mem-user");
      var tenantSel = document.getElementById("sa-mem-tenant");
      if (userSel) {
        userSel.innerHTML = _users.map(function (u) {
          return '<option value="' + esc(u.id) + '">' + esc(u.email) + '</option>';
        }).join("");
      }
      if (tenantSel) {
        tenantSel.innerHTML = _tenants.map(function (t) {
          return '<option value="' + esc(t.slug) + '">' + esc(t.slug) + '</option>';
        }).join("");
      }

    } catch (e) {
      panel.innerHTML = '<div class="sa-err">' + esc(e.message) + '</div>';
    }
  }

  global.saAddMember = async function () {
    var uid = (document.getElementById("sa-mem-user") || {}).value;
    var slug = (document.getElementById("sa-mem-tenant") || {}).value;
    var role = (document.getElementById("sa-mem-role") || {}).value || "user";
    if (!uid || !slug) { toast("\u26a0 Selecteer een user en tenant."); return; }

    try {
      var c = supa(); if (!c) throw new Error("Supabase niet beschikbaar.");
      var r = await c.from("qs_tenant_members").upsert(
        { user_id: uid, tenant_slug: slug, role: role },
        { onConflict: "user_id,tenant_slug" }
      );
      if (r.error) throw new Error(r.error.message);

      try { await workerCall("set-tenant", { user_id: uid, tenant_slug: slug }); } catch (e) {}

      toast("\u2713 Membership toegevoegd");
      renderMembers();
    } catch (e) { toast("\u26a0 " + e.message); }
  };

  global.saRemoveMember = async function (uid, slug, email) {
    if (!confirm("Membership verwijderen?\n" + email + " \u2192 " + slug)) return;
    try {
      var c = supa(); if (!c) throw new Error("Supabase niet beschikbaar.");
      var r = await c.from("qs_tenant_members").delete()
        .eq("user_id", uid).eq("tenant_slug", slug);
      if (r.error) throw new Error(r.error.message);
      toast("\u2713 Membership verwijderd");
      renderMembers();
    } catch (e) { toast("\u26a0 " + e.message); }
  };

  /* ── Open / Close ───────────────────────────────────────────────── */
  global.openSuperAdmin = function () {
    if (!global._isSuper && !(global.isSuper && global.isSuper())) {
      toast("\u26a0 Alleen voor super-admins.");
      return;
    }
    buildModal();
    renderAddForm();
    renderList();
    document.getElementById("sa-modal").style.display = "flex";
  };

  global.closeSuperAdmin = function () {
    var m = document.getElementById("sa-modal");
    if (m) m.style.display = "none";
    var sf = document.getElementById("sa-slug");
    if (sf) sf.disabled = false;
  };

  /* ── Menu-item in het instellingen-dropdown ─────────────────────── */
  function injectMenuItem() {
    var menu = document.getElementById("settings-menu");
    if (!menu) return false;
    if (menu.querySelector("[data-sa-menu]")) return true;

    var block = document.createElement("div");
    block.setAttribute("data-sa-menu", "");
    block.className = "admin-only";
    block.innerHTML =
      '<button type="button" class="sm-item" ' +
        'onclick="openSuperAdmin();(window.closeSettings||function(){})()">' +
        '<span class="sm-icon">&#x1F3E2;</span>Klantenbeheer</button>';

    var ref = menu.querySelector("[data-tc-menu]");
    if (ref && ref.nextSibling) {
      menu.insertBefore(block, ref.nextSibling);
    } else {
      var firstLabel = menu.querySelector(".sm-label");
      if (firstLabel) menu.insertBefore(block, firstLabel.nextSibling);
      else menu.insertBefore(block, menu.firstChild);
    }
    return true;
  }

  function ensureEntry() {
    if (!global._isSuper && !(global.isSuper && global.isSuper())) return;
    injectMenuItem();
  }

  function start() {
    ensureEntry();
    try { setInterval(ensureEntry, 2000); } catch (e) {}
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }

})(typeof window !== "undefined" ? window : this);
