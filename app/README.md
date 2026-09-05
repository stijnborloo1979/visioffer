# QuoteStudio SaaS

Multi-tenant offertetool — gebouwd als white-label SaaS op basis van de Ricoh Easy Quotation tool.

## Wat is dit?

Een professionele offertetool waarmee bedrijven in elke sector (AV-integratie, security, zonnepanelen, interieur, …) in minuten een verzorgde offerte kunnen maken — compleet met AI-import, productfoto's, digitale ondertekening en een live dashboard.

### Kernfeatures

- **AI-import** — maak een screenshot van een bestaande offerte of kitlist, en de tool extraheert automatisch alle producten, prijzen en zones
- **Zone-gebaseerd** — groepeer items per vergaderzaal, verdieping, gebouw of elke andere indeling die past bij je sector
- **AI-beschrijvingen** — genereer professionele productbeschrijvingen met één klik
- **Fotobibliotheek** — koppel productfoto's automatisch op basis van referentiecodes
- **PDF-offerte** — professionele A4-offerte met cover, prijstabel, voorwaarden en contactpagina
- **As-a-Service** — bied huur/leasing aan naast aankoop, met configureerbare looptijden en percentages
- **Digitale ondertekening** — genereer een link, stuur naar de klant, ontvang een handtekening
- **Dashboard** — alle offertes met status, conversieratio en teamoverzicht
- **Meertalig** — Nederlands, Frans, Engels (+ Duits in voorbereiding)
- **PWA** — werkt offline, installeerbaar op desktop en mobiel

### Multi-tenant (SaaS)

Elk bedrijf krijgt zijn eigen:
- Branding (logo, kleuren, bedrijfsnaam)
- Voorwaarden en juridische teksten
- Zone-terminologie ("Vergaderzaal", "Verdieping", "Locatie", …)
- Productcatalogus en fotobibliotheek
- Gebruikersbeheer met rollen
- As-a-Service configuratie

Tenant-isolatie via Supabase Row Level Security — één codebase, één database, volledige scheiding.

---

## Projectstructuur

```
quotestudio-saas/
├── index.html            ← Hoofdapplicatie (SPA)
├── sign.html             ← Publieke ondertekenpagina voor klanten
├── tenant-config.js      ← Multi-tenant configuratiemodule (TC)
├── manifest.json         ← PWA manifest
├── sw.js                 ← Service worker (offline support)
├── supabase/
│   └── migration.sql     ← Database schema + RLS + seed data
├── docs/
│   ├── saas-plan.md      ← Volledig transformatieplan
│   └── migration-guide.md← Stap-voor-stap migratie van hardcoded → dynamisch
├── assets/               ← Gedeelde assets (favicons, default covers)
├── .gitignore
└── README.md
```

---

## Quickstart

### 1. Clone de repo

```bash
git clone https://github.com/JOUW-USERNAME/quotestudio-saas.git
cd quotestudio-saas
```

### 2. Supabase opzetten

1. Maak een nieuw project aan op [supabase.com](https://supabase.com)
2. Open de SQL Editor en plak de inhoud van `supabase/migration.sql`
3. Voer uit — dit maakt alle tabellen, RLS policies en de Ricoh seed-data aan
4. Ga naar Storage en maak een bucket `tenant-assets` aan (public)

### 3. Configureer de app

Open `index.html` en pas de Supabase credentials aan:

```javascript
var SUPA_DEFAULT_URL  = "https://JOUW-PROJECT.supabase.co";
var SUPA_DEFAULT_ANON = "JOUW-ANON-KEY";
```

### 4. Lokaal draaien

Geen build nodig — open `index.html` in de browser, of serveer met:

```bash
npx serve .
# of
python3 -m http.server 8080
```

### 5. Deployen

**Netlify (aanbevolen):**
1. Push naar GitHub
2. Ga naar [netlify.com](https://netlify.com) → New site → Import from Git
3. Kies de repo, publish directory = `/` (root)
4. Elke push naar `main` deployt automatisch

**GitHub Pages:**
1. Ga naar repo Settings → Pages
2. Source: Deploy from branch → `main` → `/ (root)`

---

## Tenant-config systeem (TC)

De `tenant-config.js` module is het hart van de multi-tenant architectuur. Het vervangt alle hardcoded waarden door een dynamisch config-object.

```javascript
// Haal een waarde op (met template-interpolatie)
TC.get("companyName")     // → "RICOH Belgium NV" of tenant-naam
TC.get("primaryColor")    // → "#BE1622" of tenant-kleur
TC.get("zoneLabel")       // → "Vergaderzaal" of tenant-specifiek

// Logo renderen
TC.logo()                 // → <img> of <svg> tag
TC.logoPdf()              // → logo voor PDF-generatie

// Theme toepassen (CSS variabelen)
TC.applyTheme()

// Laden vanuit Supabase
await TC.loadFromSupabase(supabaseClient, tenantId)
```

Zie `docs/migration-guide.md` voor de volledige lijst van 207 referenties die gemigreerd moeten worden.

---

## Branch-strategie

| Branch | Doel |
|--------|------|
| `main` | Stabiele, deploybare versie |
| `develop` | Actieve ontwikkeling |
| `feature/tenant-config` | Migratie stap 1-4: kleurvariabelen + logo |
| `feature/dynamic-branding` | Migratie stap 5-8: teksten + signing page |
| `feature/auth-flow` | Supabase Auth + tenant-routing |
| `feature/onboarding` | Onboarding wizard voor nieuwe tenants |

---

## Roadmap

- [x] Werkende offertetool (fork van Ricoh)
- [x] Tenant-config module (TC)
- [x] Database schema met RLS
- [ ] Migratie: hardcoded → TC.get() (207 referenties)
- [ ] Auth flow met Supabase Auth
- [ ] Onboarding wizard
- [ ] Productcatalogus per tenant
- [ ] Stripe-integratie
- [ ] Custom domains per tenant

---

## Licentie

Proprietary — alle rechten voorbehouden.
