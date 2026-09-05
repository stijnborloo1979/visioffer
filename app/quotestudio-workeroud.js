/* ═══════════════════════════════════════════════════════════════════════
   quotestudio-worker.js — Cloudflare Worker: tenant-bewuste gebruikersadmin
   ───────────────────────────────────────────────────────────────────────
   VOLLEDIGE VERVANGING van de bestaande worker (quoteassist.stijn-borloo
   .workers.dev). Alle endpoints stempelen nu app_metadata.tenant_id —
   het enige, onvervalsbare tenant-anker waarop de RLS in Supabase draait.

   Secrets (Worker → Settings → Variables):
     SUPABASE_URL          bv. https://dgzkuqvviivoafinrfty.supabase.co
     SERVICE_ROLE_KEY      de service-role key (NOOIT in de client!)

   Rollenmodel (app_metadata.role):
     super  → alles, over alle tenants heen (Stijn)
     admin  → tenant-admin: beheert enkel gebruikers van de eigen tenant
     sales / user → geen admin-rechten

   Endpoints (POST, JSON):
     /list-users     {}                          admin: eigen tenant · super: alles
     /invite-user    {email, tenant_slug?}       admin: eigen tenant · super: elke
     /set-role       {user_id, role}             admin: binnen tenant, geen 'super'
     /delete-user    {user_id}                   admin: binnen tenant
     /set-tenant     {user_id, tenant_slug}      alleen super
     /create-tenant  {slug, name?, allow_signup?} alleen super
     /signup         {email, password, tenant_slug}  PUBLIEK — alleen voor
                     tenants met allow_signup=true in qs_tenants
   ═══════════════════════════════════════════════════════════════════════ */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });

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

/* Eén tenant-rij uit qs_tenants ophalen */
async function getTenant(env, slug) {
  const r = await sbAdmin(
    env,
    "/rest/v1/qs_tenants?slug=eq." + encodeURIComponent(slug) + "&select=slug,allow_signup&limit=1"
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
    if (page > 25) break; // veiligheidsklep
  }
  return users;
}

/* ── Endpoint-handlers ─────────────────────────────────────────────────── */
const handlers = {
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

    /* Tenant bepalen: admin → altijd zijn eigen; super → meegegeven slug */
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

    /* app_metadata kan niet via /invite — dus meteen erna stempelen */
    await patchAppMeta(env, inv.body.id, { tenant_id: tenant, role: "user" });
    return json({ ok: true, user_id: inv.body.id, tenant_id: tenant });
  },

  /* Rol wijzigen — tenant-admin kan geen 'super' uitdelen en blijft
     binnen zijn eigen tenant */
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

  /* Verwijderen — zelfde tenant-grens */
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

  /* Self-service registratie — PUBLIEK endpoint.
     Werkt alleen voor tenants die dit expliciet toestaan (allow_signup). */
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
        email_confirm: false, // gebruiker moet e-mail bevestigen
        app_metadata: { tenant_id: slug, role: "user" },
        user_metadata: { password_set: true },
      }),
    });
    if (!crt.ok)
      return json({ error: crt.body.msg || crt.body.error_description || "Registratie mislukt" }, 400);

    /* Bevestigingsmail laten sturen */
    await sbAdmin(env, "/auth/v1/admin/generate_link", {
      method: "POST",
      body: JSON.stringify({ type: "signup", email, password }),
    }).catch(() => {});
    return json({ ok: true, user_id: crt.body.id });
  },
};

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { headers: CORS });
    if (request.method !== "POST") return json({ error: "POST verwacht" }, 405);

    const path = new URL(request.url).pathname.replace(/^\/+|\/+$/g, "");
    const handler = handlers[path];
    if (!handler) return json({ error: "Onbekend endpoint: /" + path }, 404);

    let body = {};
    try { body = await request.json(); } catch (e) {}

    try {
      /* /signup is publiek; al de rest vereist een geldige sessie */
      const caller = path === "signup" ? null : await getCaller(env, request);
      return await handler(env, body, caller);
    } catch (e) {
      return json({ error: e.message || String(e) }, 500);
    }
  },
};
