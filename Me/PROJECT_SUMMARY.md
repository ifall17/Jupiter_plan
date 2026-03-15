# 🪐 Jupiter_Plan — Résumé du Projet
# Fichier : PROJECT_SUMMARY.md
# À placer à la racine du monorepo. Mis à jour : mars 2026.

---

## 1. VISION & POSITIONNEMENT

**Jupiter_Plan** est un SaaS de planification et analyse financière (FP&A)
conçu spécifiquement pour les PME d'Afrique de l'Ouest francophone.

**Problème résolu :** Les PME africaines gèrent leur budget sous Excel, sans
visibilité en temps réel, sans workflow de validation, sans conformité SYSCOHADA.

**Positionnement :** Copilote financier des PME africaines — simple, mobile-first,
conforme SYSCOHADA, hébergé à Lagos pour une latence < 30ms.

**Marché cible :**
- PME 10–500 employés, Sénégal · Côte d'Ivoire · Mali · Burkina Faso
- Secteurs : commerce, services, industrie légère, agro-industrie
- Utilisateurs : DAF, CEO, Contrôleur de gestion, Comptable

**Prix cible :** 50 000 – 150 000 FCFA / mois selon le plan

---

## 2. MODULES V1

| Module | Description |
|--------|-------------|
| Budget & Prévisionnel | Plan comptable SYSCOHADA, Budget vs Réel, workflow approbation |
| Tableaux de bord KPIs | Dashboard personnalisable par rôle, alertes, mobile-first |
| Cash Flow & Trésorerie | Plan glissant 13 semaines, Mobile Money (Wave/Orange/MTN) |
| Scénarios & Simulations | 3 scénarios (pessimiste/base/optimiste), sliders, stress test |

---

## 3. STACK TECHNIQUE DÉCIDÉE

| Couche | Technologie | Justification |
|--------|-------------|---------------|
| Backend CRUD | NestJS 10 + TypeScript | Architecture modulaire, injection de dépendances, TypeScript natif |
| Moteur de calcul | Python 3.11 + FastAPI + Pandas | Précision Decimal exacte, calculs matriciels sur 12 périodes |
| ORM | Prisma 5 | Migrations typées, schéma as code, types TypeScript auto-générés |
| Base de données | PostgreSQL 16 | ACID compliance, Row-Level Security, types Decimal |
| Cache / Queue | Redis 7 + BullMQ | Sessions JWT, jobs async, pub/sub WebSocket |
| Temps réel | Socket.io | Progression imports et calculs en temps réel |
| Jobs planifiés | node-cron | Recalcul KPIs nuit, alertes hebdo, clôture auto périodes |
| Frontend | React 18 + Vite + TypeScript | Écosystème riche, composants réutilisables |
| CSS | TailwindCSS | Développement UI rapide, design system cohérent |
| State | Zustand + TanStack Query | État auth en mémoire, cache serveur optimisé |
| Forms | React Hook Form + Zod | Validation typée, performance |
| Stockage fichiers | S3-compatible (DigitalOcean Spaces) | Fichiers Excel importés hors web root |
| Infra | Docker + Kubernetes + DigitalOcean Lagos | Latence < 30ms depuis Dakar/Abidjan |
| CDN | Cloudflare | Cache assets, protection DDoS, accélération réseau Afrique |

### Séparation critique NestJS / Python
```
NestJS  → Auth, CRUD, orchestration, queues, WebSocket, cron
Python  → Calculs KPIs, snapshots IS/BS/CF, moteur scénarios, import Excel/Sage

Flux : NestJS → BullMQ → Python calcule → PostgreSQL → Socket.io → Frontend
```

---

## 4. ARCHITECTURE MONOREPO

```
jupiter_plan/
├── apps/
│   ├── api/     → NestJS 10 (port 3001)
│   ├── calc/    → Python FastAPI (port 8000 — réseau interne uniquement)
│   └── web/     → React 18 + Vite (port 5173)
├── packages/
│   └── shared/  → Types, DTOs, Enums partagés api ↔ web
├── .github/
│   └── copilot-instructions.md  ← règles Copilot (lire avant de coder)
├── docker-compose.yml
├── .env.example
├── PROJECT_SUMMARY.md           ← ce fichier
└── .gitignore
```

---

## 5. RÔLES & PERMISSIONS

### Les 5 rôles
```
SUPER_ADMIN  → Paramétrage, droits, accès total
FPA          → Modélisation, budget, forecast, rapports
CONTRIBUTEUR → Saisie données de son département uniquement
LECTEUR      → Dashboard consolidé, lecture seule (DG, associés, CA)
AUDITEUR     → Portail séparé audit.jupiter-plan.com, accès temporaire
```

### Points clés
- `org_id` extrait du JWT uniquement — jamais du body
- CONTRIBUTEUR scopé par département via `user_department_scope`
- AUDITEUR : token hashé, date d'expiration, portail séparé, max 5 actifs
- Default DENY — toute permission non accordée est refusée

---

## 6. SCHÉMA DE BASE DE DONNÉES

**Outil :** Prisma 5 — fichier `apps/api/prisma/schema.prisma`
**Base :** PostgreSQL 16

### 18 tables, 7 couches

| Couche | Tables |
|--------|--------|
| Organisation | organizations |
| Auth | users, audit_logs |
| Fiscal | fiscal_years, periods |
| Budget | budgets, budget_lines, transactions, import_jobs |
| Trésorerie | bank_accounts, cash_flow_plans |
| Scénarios | scenarios, scenario_hypotheses, financial_snapshots |
| KPIs & Alertes | kpis, kpi_values, alerts |

### Décisions clés
- Montants en `Decimal(18,2)` — jamais float
- `scenario_id` nullable dans snapshots et KPI values (null = données réelles)
- `@@unique([org_id, code])` sur kpis
- `onDelete: Cascade` sur ScenarioHypothesis
- Row-Level Security PostgreSQL pour isolation multi-tenant

---

## 7. WORKFLOWS MÉTIER

### Workflow Budget
```
DRAFT → SUBMITTED → APPROVED → LOCKED
                 ↘ REJECTED → (correction) → SUBMITTED
```
- LOCKED : irréversible — reforecast = nouvelle version
- Consolidé dans les KPIs uniquement après APPROVED

### Workflow Import Transactions
```
PENDING → (validation Python) → PROCESSING → DONE
                              ↘ FAILED + rapport d'erreurs
```
- Traitement en mémoire Pandas — fichier jamais sur disque
- Notification temps réel via Socket.io

### Workflow Scénarios
```
DRAFT → (hypothèses) → CALCULATED → SAVED
```
- Python CalcEngine recalcule IS + BS + CF
- Max 4 scénarios comparés simultanément
- LECTEUR voit SAVED sans les hypothèses

### Workflow Clôture de Période
```
(vérification) → (calcul Python) → CLOSED
```
- Irréversible — période CLOSED ne peut jamais être rouverte
- BALANCE_MISMATCH bloque la clôture

### Workflow Accès Auditeur
```
(création accès) → (email token) → (portail séparé) → (logs IP)
```
- Token `crypto.randomBytes(32)` — jamais JWT classique
- Accès révocable à tout moment

---

## 8. SÉCURITÉ — SECUREBYDESIGN TIER 3

Jupiter_Plan est classé **TIER 3 REGULATED** (fintech, données financières,
réglementations ECOWAS).

### 10 règles non négociables
1. `org_id` extrait du JWT uniquement
2. Montants en `Decimal` — jamais `float`
3. Calculs dans Python CalcEngine — jamais dans NestJS
4. Argon2id pour les mots de passe
5. Tokens avec `crypto.randomBytes(32)` — jamais `Math.random()`
6. Default DENY — fail secure en cas d'exception
7. Zéro secret dans le code source
8. Logs : événement uniquement — jamais contenu des données
9. Traitement > 2s → BullMQ — jamais dans la requête HTTP
10. CORS restreint à WEB_URL — jamais `origin: '*'`

### Conformité réglementaire
- ECOWAS Supplementary Act on Personal Data (2010)
- Sénégal : Loi 2008-12, autorité CDPD
- Côte d'Ivoire : Loi 2013-450
- Registre des traitements requis avant production

---

## 9. DÉCISIONS D'ARCHITECTURE JUSTIFIÉES

| Décision | Raison |
|----------|--------|
| PostgreSQL vs MongoDB | ACID compliance obligatoire pour les données financières |
| Python pour les calculs | Précision Decimal exacte — float JS = bug financier garanti |
| DigitalOcean Lagos vs AWS Europe | 20–35ms vs 180–220ms depuis Dakar/Abidjan |
| BullMQ pour les imports | Import 5000 lignes = 8–15s — bloquer HTTP est inacceptable |
| Monorepo npm workspaces | Types partagés entre api et web — zéro duplication |
| Prisma vs SQL brut | Migrations typées, types TypeScript auto-générés, sécurité |

---

## 10. FICHIERS GÉNÉRÉS

| Fichier | Description |
|---------|-------------|
| `.github/copilot-instructions.md` | Règles Copilot complètes — lire avant de coder |
| `apps/api/prisma/schema.prisma` | Schéma base de données complet (18 tables) |
| `PROJECT_SUMMARY.md` | Ce fichier — résumé du projet |

### Livrables de conception (référence)
| Fichier | Description |
|---------|-------------|
| `fpa_class_diagram_v3.mermaid` | Diagramme de classes V3 (40 classes) |
| `sequence_diagrams_fpa_v1.md` | Diagrammes de séquence (3 flux) |
| `openapi_fpa_v1.yaml` | Spécification OpenAPI 3.0 (28 endpoints) |
| `erd_finpilot.html` | Schéma ERD interactif (18 tables) |
| `stack_technologique_fpa.html` | Document de décision stack |
| `finpilot_v3.html` | Maquettes UI (thème ivoire, identité West African) |

---

## 11. ROADMAP DE DÉVELOPPEMENT

### Phase 1 — Fondations (en cours)
- [x] Structure monorepo
- [ ] Docker Compose (étape 2)
- [ ] Prisma + seed (étape 3)
- [ ] Module Auth NestJS (étape 4)
- [ ] Module Users NestJS (étape 5)
- [ ] Config globale API (étape 6)
- [ ] Frontend setup React (étape 7)
- [ ] Topbar + AppLayout + ProtectedRoute (étape 8)

### Phase 2 — Modules métier
- [ ] Module Budget (CRUD + workflow approbation)
- [ ] Module Transactions + Import Excel
- [ ] CalcEngine Python (KPIs + snapshots)
- [ ] Module Cash Flow
- [ ] Module Scénarios
- [ ] Dashboard KPIs + alertes

### Phase 3 — Production
- [ ] Module Rapports (PDF/Excel async)
- [ ] Portail Auditeur séparé
- [ ] Kubernetes + auto-scaling
- [ ] Monitoring Datadog
- [ ] Conformité ECOWAS / CDPD
- [ ] App mobile React Native (CEO dashboard)

---

## 12. CONVENTIONS RAPIDES

```
org_id           → toujours depuis le JWT
Montants         → Decimal(18,2), affichage formatFCFA()
Dates            → Africa/Dakar (UTC+0), affichage formatDate() en français
Erreurs          → codes métier (ex: BUDGET_NOT_SUBMITTABLE)
Routes API       → /api/v1/kebab-case
Branches git     → feat/module-description
Commits          → feat(module): description
Tests            → should [résultat] when [condition], structure AAA
Logs             → NestJS Logger / Python logging — jamais console.log
```

---

## 13. CONTACTS & RESSOURCES

```
Référence sécurité  → SecureByDesign v1.1.0 (TIER 3 REGULATED)
Plan comptable      → SYSCOHADA / OHADA
Autorité données SN → CDPD (Commission des Données à Caractère Personnel)
Datacenter          → DigitalOcean Lagos (af-south-1)
CDN                 → Cloudflare (réseau Afrique)
```

---

*Jupiter_Plan v1.0 — mars 2026*
*Document de référence — mettre à jour à chaque décision d'architecture majeure*
