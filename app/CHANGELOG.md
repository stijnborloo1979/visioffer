# Changelog

## [0.1.0] — 2026-07-02

### Toegevoegd
- Initiale fork van Ricoh Easy Quotation tool
- `tenant-config.js` — multi-tenant configuratiemodule
- `supabase/migration.sql` — database schema met RLS en Ricoh seed-data
- `docs/saas-plan.md` — volledig transformatieplan
- `docs/migration-guide.md` — stap-voor-stap migratie van 207 hardcoded referenties
- README met quickstart en projectstructuur

### Nog te doen
- Migratie van hardcoded waarden naar TC.get()
- Supabase Auth integratie
- Onboarding wizard voor nieuwe tenants
