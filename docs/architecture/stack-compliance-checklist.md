# Stack Compliance Checklist (Release)

Objectif: éviter les divergences silencieuses entre stack cible et implémentation réelle.

## Cadence

- Revue à chaque release candidate
- Revue complémentaire si introduction d'une nouvelle brique technique

## Points à vérifier

- Backend: NestJS/Prisma/BullMQ cohérents avec `apps/api/package.json`
- Frontend: React/Vite/Tailwind/RHF/Zod cohérents avec `apps/web/package.json`
- Calc engine: FastAPI/Pandas/OpenPyXL cohérents avec `apps/calc/requirements.txt`
- Temps réel: usage `socket.io-client` côté web et support websocket côté API
- Jobs planifiés: besoin MVP confirmé (implémenté) ou ADR de différé
- Dépendances temporaires/stub: supprimées ou justifiées

## Contrôles automatisés disponibles

- `node scripts/compliance/check-app-code.mjs`
- `node scripts/compliance/check-sbd-mechanical.mjs`
- `node scripts/compliance/check-stack-compliance.mjs`

## Exigences SBD mécaniques suivies automatiquement

- Validation DTO d'entrée
- Marqueurs de scoping organisation sur accès sensibles
- Contrôles MIME/signature import
- Détection de secrets hardcodés

## Sortie attendue de revue

- Aucun écart: validation simple
- Écart identifié: ADR sous `docs/architecture/` + plan de remédiation daté

## Etat valide 2026-03-19

- Temps reel: conforme
	- `socket.io-client` utilise cote web
	- gateway websocket Nest actif cote API avec authentification JWT et room organisationnelle
	- emission metier branchee sur le workflow d'import
- Jobs planifies: differe documente
	- voir `docs/architecture/adr/ADR-0001-scheduler-defer-mvp.md`
- Dependances temporaires/stub: revues
	- `xlsx` retire du runtime API et remplace par `exceljs`
	- `@types/xlsx` absent
	- audit detaille: `docs/security/dependency-audit-2026-03-19.md`
