/* ═══════════════════════════════════════════════════════════════════════
   quotestudio-worker.js — Cloudflare Worker: Claude API proxy +
   tenant-bewuste gebruikersadmin + AI chat endpoint
   ───────────────────────────────────────────────────────────────────────
   Secrets (Worker → Settings → Variables):
     SUPABASE_URL          bv. https://dgzkuqvviivoafinrfty.supabase.co
     SERVICE_ROLE_KEY      de service-role key (NOOIT in de client!)
     ANTHROPIC_API_KEY     de Claude API key (sk-ant-...)

   Endpoints (POST, JSON):
     /                     Claude API proxy → api.anthropic.com/v1/messages
     /chat                 AI chatbot — alleen voor Pro/Enterprise tenants
     /list-users           admin: eigen tenant · super: alles
     /invite-user          admin: eigen tenant · super: elke
     /set-role             admin: binnen tenant, geen 'super'
     /delete-user          admin: binnen tenant
     /set-tenant           alleen super
     /create-tenant        alleen super
     /signup               PUBLIEK — alleen voor tenants met allow_signup
   ═══════════════════════════════════════════════════════════════════════ */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-App-Token, X-Tenant-Id",
};

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });

/* ── Claude API proxy (bestaand, ongewijzigd) ────────────────────────── */
async function handleClaudeProxy(env, body) {
  if (!env.ANTHROPIC_API_KEY) {
    return json({ error: "ANTHROPIC_API_KEY niet geconfigureerd op de worker" }, 500);
  }

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => ({}));
  return new Response(JSON.stringify(data), {
    status: res.status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

/* ── Supabase Admin-API helpers (service role) ─────────────────────────── */
async function sbAdmin(env, path, opts = {}) {
  const res = await fetch(env.SUPABASE_URL + path, {
    ...opts,
    headers: {
      apikey: env.SERVICE_ROLE_KEY,
      Authorization: "Bearer " + env.SERVICE_ROLE_KEY,
      "Content-Type": "application/json",
      ...(opts.headers || {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body };
}

/* Wie roept aan? Valideer het Bearer-token en lees rol + tenant. */
async function getCaller(env, request) {
  const auth = request.headers.get("Authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  const res = await fetch(env.SUPABASE_URL + "/auth/v1/user", {
    headers: { apikey: env.SERVICE_ROLE_KEY, Authorization: "Bearer " + token },
  });
  if (!res.ok) return null;
  const u = await res.json();
  const meta = u.app_metadata || {};
  return {
    id: u.id,
    email: u.email,
    role: meta.role || "user",
    tenant: meta.tenant_id || null,
    isSuper: meta.role === "super",
    isAdmin: meta.role === "admin" || meta.role === "super",
  };
}

/* app_metadata van een gebruiker bijwerken (merge, niet vervangen) */
async function patchAppMeta(env, userId, patch) {
  const cur = await sbAdmin(env, "/auth/v1/admin/users/" + userId);
  if (!cur.ok) throw new Error("Gebruiker niet gevonden");
  const merged = { ...(cur.body.app_metadata || {}), ...patch };
  const upd = await sbAdmin(env, "/auth/v1/admin/users/" + userId, {
    method: "PUT",
    body: JSON.stringify({ app_metadata: merged }),
  });
  if (!upd.ok) throw new Error(upd.body.msg || upd.body.error || "Update mislukt");
  return upd.body;
}

/* Eén tenant-rij uit qs_tenants ophalen — uitgebreid met plan + ai_chat_daily_limit */
async function getTenant(env, slug) {
  const r = await sbAdmin(
    env,
    "/rest/v1/qs_tenants?slug=eq." + encodeURIComponent(slug) +
      "&select=slug,allow_signup,plan,ai_chat_daily_limit,company_name,sector&limit=1"
  );
  return r.ok && Array.isArray(r.body) && r.body.length ? r.body[0] : null;
}

/* Alle gebruikers ophalen (gepagineerd) */
async function listAllUsers(env) {
  const users = [];
  let page = 1;
  for (;;) {
    const r = await sbAdmin(env, "/auth/v1/admin/users?page=" + page + "&per_page=200");
    const batch = (r.body && r.body.users) || [];
    users.push(...batch);
    if (batch.length < 200) break;
    page++;
    if (page > 25) break;
  }
  return users;
}

/* ═══════════════════════════════════════════════════════════════════════
   AI CHAT — plan-gated endpoint
   ═══════════════════════════════════════════════════════════════════════ */

/* Plannen die AI-chat mogen gebruiken */
const AI_CHAT_PLANS = new Set(["pro", "enterprise"]);

/* Standaard dagelijks limiet als de tenant geen eigen limiet heeft */
const DEFAULT_DAILY_LIMIT = 100;

/* System prompts per context/sector (uitbreidbaar) */
function buildSystemPrompt(tenant, context) {
  const sector = (tenant.sector || "").toLowerCase();
  const name = tenant.company_name || "VisiOffer";

  let base = `Je bent de AI-assistent van ${name}, ingebouwd in het VisiOffer offerteplatform.
Je helpt gebruikers met het maken van offertes, het configureren van producten, en het navigeren door de app.
Antwoord beknopt, vriendelijk en in het Nederlands (tenzij de gebruiker in het Engels schrijft).
Als je iets niet weet, zeg dat eerlijk — verzin geen features die niet bestaan.

Kernfuncties van de app:
- Visuele offertes maken met zalen/ruimtes en producten
- PDF-export van offertes
- Klanten uitnodigen om offertes interactief te bekijken
- Producten en categorieën beheren
- Teamleden uitnodigen en rollen toekennen
- Branding en huisstijl instellen
- Facturen genereren`;

  /* Sector-specifieke toevoegingen */
  const sectorHints = {
    av: `\n\nDit is een AV/audiovisueel bedrijf. Producten zijn typisch schermen, projectoren, speakers, camera's, besturingssystemen, meubels voor vergaderzalen. "Zalen" zijn vergaderruimtes.`,
    solar: `\n\nDit is een solarbedrijf. Producten zijn zonnepanelen, omvormers, batterijen, montagesystemen. "Installaties" verwijzen naar dak- of grondopstellingen.`,
    security: `\n\nDit is een beveiligingsbedrijf. Producten zijn camera's, sensoren, alarmsystemen, toegangscontrole. "Zones" zijn beveiligde gebieden.`,
    hvac: `\n\nDit is een HVAC-bedrijf. Producten zijn airconditioning, verwarmingsinstallaties, ventilatie, warmtepompen.`,
    events: `\n\nDit is een evenementenbedrijf. Producten zijn podiumelementen, belichting, geluidsinstallaties, decoratie, meubilair.`,
    interior: `\n\nDit is een interieurbedrijf. Producten zijn meubels, verlichting, vloerbekleding, wandafwerking, textiel.`,
  };
  if (sectorHints[sector]) base += sectorHints[sector];

  /* Context-specifieke toevoegingen */
  if (context === "admin") {
    base += `\n\nDe gebruiker is een beheerder. Help ook met tenant-configuratie, teamleden beheren, branding instellen, en facturatie.`;
  } else if (context === "quote") {
    base += `\n\nDe gebruiker is bezig met een offerte. Help met productcombinaties, prijzen, kortingen, en het structureren van de offerte.`;
  } else if (context === "public") {
    base += `\n\nDe gebruiker is een klant die een ontvangen offerte bekijkt. Help met vragen over producten, prijzen en opties in de offerte. Geef geen interne informatie over marges of inkoopprijzen.`;
  }

  return base;
}

async function handleChat(env, body, caller) {
  /* ── Auth check ────────────────────────────────────────────────── */
  if (!caller) return json({ error: "Niet ingelogd" }, 401);
  if (!caller.tenant) return json({ error: "Geen tenant gekoppeld" }, 403);

  /* ── Plan check ────────────────────────────────────────────────── */
  const tenant = await getTenant(env, caller.tenant);
  if (!tenant) return json({ error: "Tenant niet gevonden" }, 404);

  const plan = (tenant.plan || "free").toLowerCase();
  if (!AI_CHAT_PLANS.has(plan) && !caller.isSuper) {
    return json({
      error: "upgrade_required",
      message: "AI-assistent is beschikbaar in het Pro-plan. Upgrade om deze feature te activeren.",
      plan: plan,
    }, 403);
  }

  /* ── Rate limit check ──────────────────────────────────────────── */
  const limit = tenant.ai_chat_daily_limit || DEFAULT_DAILY_LIMIT;
  const usageRes = await sbAdmin(
    env,
    "/rest/v1/v_chat_usage_today?tenant_id=eq." + encodeURIComponent(caller.tenant) + "&select=msg_today"
  );
  const used = (usageRes.ok && Array.isArray(usageRes.body) && usageRes.body.length)
    ? usageRes.body[0].msg_today
    : 0;

  if (used >= limit) {
    return json({
      error: "rate_limited",
      message: `Dagelijks limiet bereikt (${limit} berichten). Probeer het morgen opnieuw.`,
      used,
      limit,
    }, 429);
  }

  /* ── Bericht validatie ─────────────────────────────────────────── */
  const userMsg = String(body.message || "").trim();
  if (!userMsg) return json({ error: "Leeg bericht" }, 400);
  if (userMsg.length > 2000) return json({ error: "Bericht te lang (max 2000 tekens)" }, 400);

  const context = ["app", "quote", "admin", "public"].includes(body.context)
    ? body.context
    : "app";

  /* ── Gespreksgeschiedenis (max 10 berichten voor context) ─────── */
  const history = Array.isArray(body.history)
    ? body.history.slice(-10).map((m) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: String(m.content || "").slice(0, 2000),
      }))
    : [];

  /* ── Claude API aanroep ────────────────────────────────────────── */
  if (!env.ANTHROPIC_API_KEY) {
    return json({ error: "ANTHROPIC_API_KEY niet geconfigureerd" }, 500);
  }

  const messages = [...history, { role: "user", content: userMsg }];

  const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 800,
      system: buildSystemPrompt(tenant, context),
      messages,
    }),
  });

  const claudeData = await claudeRes.json().catch(() => ({}));

  if (!claudeRes.ok) {
    console.error("Claude API error:", JSON.stringify(claudeData));
    return json({ error: "AI tijdelijk niet beschikbaar" }, 502);
  }

  /* Antwoord extraheren */
  const botMsg =
    (claudeData.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n") || "Geen antwoord ontvangen.";

  /* ── Log opslaan (fire-and-forget) ─────────────────────────────── */
  sbAdmin(env, "/rest/v1/qs_chat_log", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      tenant_id: caller.tenant,
      user_id: caller.id,
      user_msg: userMsg.slice(0, 4000),
      bot_msg: botMsg.slice(0, 4000),
      tokens_in: claudeData.usage?.input_tokens || 0,
      tokens_out: claudeData.usage?.output_tokens || 0,
      context,
    }),
  }).catch(() => {});

  return json({
    reply: botMsg,
    usage: {
      msg_today: used + 1,
      daily_limit: limit,
    },
  });
}

/* ── Endpoint-handlers ─────────────────────────────────────────────────── */
const handlers = {
  /* AI Chat — plan-gated */
  chat: handleChat,

  /* Gebruikers oplijsten — admin ziet enkel zijn eigen tenant */
  async "list-users"(env, body, caller) {
    if (!caller || !caller.isAdmin) return json({ error: "Alleen voor beheerders" }, 403);
    let users = await listAllUsers(env);
    if (!caller.isSuper) {
      users = users.filter(
        (u) => (u.app_metadata || {}).tenant_id === caller.tenant
      );
    }
    return json({
      users: users.map((u) => ({
        id: u.id,
        email: u.email,
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at,
        confirmed: !!u.email_confirmed_at,
        app_metadata: {
          role: (u.app_metadata || {}).role || "user",
          tenant_id: (u.app_metadata || {}).tenant_id || null,
        },
      })),
    });
  },

  /* Uitnodigen — de nieuwe gebruiker krijgt meteen de tenant gestempeld */
  async "invite-user"(env, body, caller) {
    if (!caller || !caller.isAdmin) return json({ error: "Alleen voor beheerders" }, 403);
    const email = String(body.email || "").trim().toLowerCase();
    if (!email.includes("@")) return json({ error: "Ongeldig e-mailadres" }, 400);

    let tenant = caller.tenant;
    if (caller.isSuper && body.tenant_slug) tenant = String(body.tenant_slug);
    if (!tenant) return json({ error: "Geen tenant bepaald voor deze uitnodiging" }, 400);
    if (!(await getTenant(env, tenant)))
      return json({ error: "Tenant '" + tenant + "' bestaat niet in qs_tenants" }, 400);

    const inv = await sbAdmin(env, "/auth/v1/invite", {
      method: "POST",
      body: JSON.stringify({ email }),
    });
    if (!inv.ok)
      return json({ error: inv.body.msg || inv.body.error_description || "Uitnodiging mislukt" }, 400);

    await patchAppMeta(env, inv.body.id, { tenant_id: tenant, role: "user" });
    return json({ ok: true, user_id: inv.body.id, tenant_id: tenant });
  },

  /* Rol wijzigen */
  async "set-role"(env, body, caller) {
    if (!caller || !caller.isAdmin) return json({ error: "Alleen voor beheerders" }, 403);
    const role = String(body.role || "");
    if (!["user", "sales", "admin", "super"].includes(role))
      return json({ error: "Ongeldige rol" }, 400);
    if (role === "super" && !caller.isSuper)
      return json({ error: "Alleen een super-admin kan die rol toekennen" }, 403);

    const target = await sbAdmin(env, "/auth/v1/admin/users/" + body.user_id);
    if (!target.ok) return json({ error: "Gebruiker niet gevonden" }, 404);
    const tMeta = target.body.app_metadata || {};
    if (!caller.isSuper && tMeta.tenant_id !== caller.tenant)
      return json({ error: "Gebruiker hoort niet bij jouw tenant" }, 403);

    await patchAppMeta(env, body.user_id, { role });
    return json({ ok: true });
  },

  /* Verwijderen */
  async "delete-user"(env, body, caller) {
    if (!caller || !caller.isAdmin) return json({ error: "Alleen voor beheerders" }, 403);
    const target = await sbAdmin(env, "/auth/v1/admin/users/" + body.user_id);
    if (!target.ok) return json({ error: "Gebruiker niet gevonden" }, 404);
    const tMeta = target.body.app_metadata || {};
    if (!caller.isSuper && tMeta.tenant_id !== caller.tenant)
      return json({ error: "Gebruiker hoort niet bij jouw tenant" }, 403);
    if ((tMeta.role || "") === "super")
      return json({ error: "Een super-admin kan niet verwijderd worden via dit endpoint" }, 403);

    const del = await sbAdmin(env, "/auth/v1/admin/users/" + body.user_id, { method: "DELETE" });
    if (!del.ok) return json({ error: del.body.msg || "Verwijderen mislukt" }, 400);
    return json({ ok: true });
  },

  /* Gebruiker aan een (andere) tenant toewijzen — alleen super */
  async "set-tenant"(env, body, caller) {
    if (!caller || !caller.isSuper) return json({ error: "Alleen voor super-admin" }, 403);
    const slug = String(body.tenant_slug || "").trim();
    if (!slug) return json({ error: "tenant_slug ontbreekt" }, 400);
    if (!(await getTenant(env, slug)))
      return json({ error: "Tenant '" + slug + "' bestaat niet in qs_tenants" }, 400);
    await patchAppMeta(env, body.user_id, { tenant_id: slug });
    return json({ ok: true });
  },

  /* Nieuwe tenant registreren — alleen super */
  async "create-tenant"(env, body, caller) {
    if (!caller || !caller.isSuper) return json({ error: "Alleen voor super-admin" }, 403);
    const slug = String(body.slug || "").trim().toLowerCase();
    if (!/^[a-z0-9-]{2,40}$/.test(slug))
      return json({ error: "Slug: 2-40 tekens, kleine letters/cijfers/-" }, 400);
    const row = {
      slug,
      company_name: body.name || slug,
      allow_signup: !!body.allow_signup,
    };
    const ins = await sbAdmin(env, "/rest/v1/qs_tenants", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify(row),
    });
    if (!ins.ok) return json({ error: JSON.stringify(ins.body) }, 400);
    return json({ ok: true, tenant: ins.body[0] || row });
  },

  /* Self-service registratie — PUBLIEK */
  async signup(env, body) {
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    const slug = String(body.tenant_slug || "").trim();
    if (!email.includes("@")) return json({ error: "Ongeldig e-mailadres" }, 400);
    if (password.length < 8) return json({ error: "Wachtwoord: minstens 8 tekens" }, 400);
    const tenant = await getTenant(env, slug);
    if (!tenant) return json({ error: "Onbekende tenant" }, 400);
    if (!tenant.allow_signup)
      return json({ error: "Deze omgeving werkt enkel op uitnodiging" }, 403);

    const crt = await sbAdmin(env, "/auth/v1/admin/users", {
      method: "POST",
      body: JSON.stringify({
        email,
        password,
        email_confirm: false,
        app_metadata: { tenant_id: slug, role: "user" },
        user_metadata: { password_set: true },
      }),
    });
    if (!crt.ok)
      return json({ error: crt.body.msg || crt.body.error_description || "Registratie mislukt" }, 400);

    await sbAdmin(env, "/auth/v1/admin/generate_link", {
      method: "POST",
      body: JSON.stringify({ type: "signup", email, password }),
    }).catch(() => {});
    return json({ ok: true, user_id: crt.body.id });
  },
};

/* ── Main fetch handler ────────────────────────────────────────────────── */
export default {
  async fetch(request, env) {
    /* CORS preflight */
    if (request.method === "OPTIONS") return new Response(null, { headers: CORS });
    if (request.method !== "POST") return json({ error: "POST verwacht" }, 405);

    const path = new URL(request.url).pathname.replace(/^\/+|\/+$/g, "");

    /* ── Root path = Claude API proxy ──────────────────────────────────── */
    if (path === "" || path === "v1/messages") {
      let body = {};
      try { body = await request.json(); } catch (e) {}
      return handleClaudeProxy(env, body);
    }

    /* ── Admin endpoints ───────────────────────────────────────────────── */
    const handler = handlers[path];
    if (!handler) return json({ error: "Onbekend endpoint: /" + path }, 404);

    let body = {};
    try { body = await request.json(); } catch (e) {}

    try {
      const caller = path === "signup" ? null : await getCaller(env, request);
      return await handler(env, body, caller);
    } catch (e) {
      return json({ error: e.message || String(e) }, 500);
    }
  },
};
