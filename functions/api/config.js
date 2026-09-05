/* ═══════════════════════════════════════════════════════════════════════
   /api/config — Cloudflare Pages Function
   ───────────────────────────────────────────────────────────────────────
   Levert environment-specifieke configuratie (Supabase URL, anon key,
   worker URL) zonder dat die hardcoded in de broncode hoeven te staan.

   De waarden komen uit Cloudflare Pages Environment Variables:
     SUPABASE_URL       bv. https://dgzkuqvviivoafinrfty.supabase.co
     SUPABASE_ANON_KEY  bv. sb_publishable_...
     WORKER_URL         bv. https://quoteassist.stijn-borloo.workers.dev
     QS_WORKER_URL      bv. https://quotestudio.stijn-borloo-968.workers.dev
     APP_ENV            "production" of "staging"

   Stel deze in via:
     Cloudflare Dashboard → Pages → je project → Settings → Environment variables
     → apart voor Production en Preview
   ═══════════════════════════════════════════════════════════════════════ */

const ALLOWED_ORIGINS = [
  "https://visioffer.be",
  "https://www.visioffer.be",
  "https://test.visioffer.be",
  "https://stijnborloo.github.io",
  "https://stijnborloo1979.github.io",
];

function getAllowedOrigin(origin) {
  if (ALLOWED_ORIGINS.includes(origin)) return origin;
  if (/^https:\/\/[a-z0-9-]+\.visioffer\.pages\.dev$/.test(origin)) return origin;
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return origin;
  return ALLOWED_ORIGINS[0];
}

export async function onRequest(context) {
  const { env, request } = context;
  const origin = request.headers.get("Origin") || "";

  const config = {
    supabaseUrl:  env.SUPABASE_URL      || "",
    supabaseAnon: env.SUPABASE_ANON_KEY || "",
    workerUrl:    env.WORKER_URL         || "",
    qsWorkerUrl:  env.QS_WORKER_URL     || "",
    appEnv:       env.APP_ENV            || "production",
  };

  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": getAllowedOrigin(origin),
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": "public, max-age=300",  /* 5 min cache */
    "Vary": "Origin",
    "X-Content-Type-Options": "nosniff",
  };

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }

  return new Response(JSON.stringify(config), { status: 200, headers });
}
