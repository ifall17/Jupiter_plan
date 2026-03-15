# JUPITER_PLAN — RÉSUMÉ COMPLET POUR CONTINUITÉ IA
# Version : Mars 2026 — Mise à jour après session de débogage
# À donner à un IA en début de conversation pour reprendre le contexte

---

## 1. QUI EST L'UTILISATEUR

Ibrahima (basé à Dakar, Sénégal) est un responsable FP&A qui conçoit
et développe une application SaaS de planification financière appelée
**Jupiter_Plan**, ciblant les PME d'Afrique de l'Ouest francophone.

Il utilise **GitHub Copilot** pour générer le code à partir de prompts
détaillés fournis par Claude. Claude joue le rôle d'architecte et
de chef de projet technique — Copilot génère le code effectif.

---

## 2. LE PROJET — JUPITER_PLAN

### Vision
SaaS FP&A multi-tenant pour PME africaines. Positionnement :
"Copilote financier des PME africaines". Conformité SYSCOHADA native,
FCFA (XOF/XAF), mobile-first, hébergé à Lagos (DigitalOcean).

### Marché cible
- PME 10–500 employés : Sénégal, Côte d'Ivoire, Mali, Burkina Faso
- Secteurs : commerce, services, industrie légère, agro-industrie
- Prix cible : 50 000 – 150 000 FCFA/mois

### Modules V1
- Budget & Prévisionnel (plan SYSCOHADA, workflow approbation)
- Tableaux de bord KPIs (alertes, mobile-first, par rôle)
- Cash Flow & Trésorerie (plan glissant 13 semaines)
- Scénarios & Simulations (pessimiste/base/optimiste, stress test)

---

## 3. STACK TECHNOLOGIQUE (DÉCISION FINALE)

| Couche | Technologie |
|--------|-------------|
| Backend CRUD | NestJS 10 + TypeScript + Prisma 5 + PostgreSQL 16 |
| Moteur de calcul | Python 3.11 + FastAPI + Pandas + NumPy |
| Cache / Queue | Redis 7 + BullMQ |
| Temps réel | Socket.io |
| Jobs planifiés | node-cron (dans NestJS) |
| Frontend | React 18 + Vite + TypeScript + TailwindCSS |
| State | Zustand + TanStack Query |
| Forms | React Hook Form + Zod |
| Stockage fichiers | S3-compatible (DigitalOcean Spaces) |
| Infra | Docker + Kubernetes + DigitalOcean Lagos |

### Séparation critique NestJS / Python
- NestJS → Auth, CRUD, orchestration, queues, WebSocket, cron
- Python → Calculs KPIs, snapshots IS/BS/CF, moteur scénarios, import Excel
- Flux : NestJS → BullMQ (calc-queue) → Python calcule avec Decimal
         → écrit en DB → NestJS notifie via Socket.io

---

## 4. STRUCTURE MONOREPO

```
jupiter_plan/                          ← racine du projet
├── apps/
│   ├── api/                           ← NestJS 10 (port 3001)
│   ├── calc/                          ← Python FastAPI (port 8000)
│   └── web/                           ← React 18 + Vite (port 5173)
├── packages/
│   └── shared/                        ← Types, DTOs, Enums partagés
├── .github/
│   └── copilot-instructions.md        ← Fichier contexte Copilot
├── docker-compose.yml
├── .env                               ← CRÉÉ — variables docker-compose
└── PROJECT_SUMMARY.md
```

---

## 5. SÉCURITÉ — SECUREBYDESIGN TIER 3

Classification : TIER 3 REGULATED (fintech, données financières)

### 10 règles non négociables
1. org_id extrait du JWT uniquement — jamais du body/query
2. Montants en Decimal — jamais float
3. Calculs dans Python CalcEngine — jamais dans NestJS
4. Argon2id pour les mots de passe
5. Tokens avec crypto.randomBytes(32) — jamais Math.random()
6. Default DENY — fail secure en cas d'exception
7. Zéro secret dans le code source
8. Logs : événement uniquement — jamais contenu des données
9. Traitement > 2s → BullMQ — jamais dans la requête HTTP
10. CORS restreint à WEB_URL — jamais origin: '*'

### Règles frontend spécifiques [SBD-04]
- Tokens JWT stockés en mémoire Zustand UNIQUEMENT
- JAMAIS dans localStorage ni sessionStorage
- ProtectedRoute bloque AVANT tout rendu (zéro flash)
- Isolation cross-tenant : 404 jamais 403

### Conformité
- ECOWAS Supplementary Act (2010)
- Sénégal Loi 2008-12 CDPD
- Côte d'Ivoire Loi 2013-450

---

## 6. RÔLES & PERMISSIONS

```
SUPER_ADMIN  → Paramétrage, droits, accès total
FPA          → Modélisation, budget, forecast, rapports
CONTRIBUTEUR → Saisie données de son département uniquement
LECTEUR      → Dashboard consolidé, lecture seule
AUDITEUR     → Portail séparé audit.jupiter-plan.com, accès temporaire
```

Points clés :
- CONTRIBUTEUR scopé par département via user_department_scope
- LECTEUR ne voit pas les hypothèses des scénarios
- AUDITEUR : max 5 actifs/org, token hashé, portail séparé
- SUPER_ADMIN a accès à tous les routes (bypass role checks)

---

## 7. WORKFLOWS MÉTIER (5 RÈGLES VALIDÉES)

### Budget
DRAFT → SUBMITTED → APPROVED/REJECTED → LOCKED
- Budget LOCKED : jamais modifiable (même SUPER_ADMIN)
- Commentaire obligatoire en cas de rejet
- LOCKED consolide dans les KPIs

### Import Transactions
Upload → PENDING → Python valide SYSCOHADA → aperçu → confirmation
→ PROCESSING → DONE
- Traitement en mémoire — jamais sur disque [SBD-09]
- Fichier S3 supprimé après traitement (succès ou échec)
- Max 10Mo, Excel uniquement (MIME vérifié)
- Rejet si > 50% de lignes SYSCOHADA invalides

### Scénarios
Budget APPROVED → hypothèses → BullMQ → Python calcule IS+BS+CF
→ CALCULATED → SAVED
- Max 4 scénarios comparés simultanément
- Base jamais modifiée (copie profonde)

### Clôture Période
Transactions validées → snapshot final → CLOSED (irréversible)
- BALANCE_MISMATCH bloque (tolérance 0.01 FCFA)
- Période suivante automatiquement OPEN après clôture

### Accès Auditeur
Token secrets.token_hex(32) + expiration → portail séparé
→ log IP. Max 5 actifs/org.

---

## 8. SCHÉMA BASE DE DONNÉES — 18 TABLES

| Couche | Tables |
|--------|--------|
| Organisation | organizations |
| Auth | users, user_department_scope, audit_logs, audit_access |
| Fiscal | fiscal_years, periods |
| Budget | budgets, budget_lines, transactions, import_jobs |
| Trésorerie | bank_accounts, cash_flow_plans |
| Scénarios | scenarios, scenario_hypotheses, financial_snapshots |
| KPIs & Alertes | kpis, kpi_values, alerts |

Décisions clés :
- Montants en Decimal(18,2) partout
- scenario_id nullable (null = données réelles)
- @@unique([org_id, code]) sur kpis
- onDelete: Cascade sur ScenarioHypothesis
- Row-Level Security PostgreSQL

---

## 9. CONSTANTES MÉTIER

```typescript
MAX_AUDIT_SESSIONS   = 5
MAX_SCENARIO_COMPARE = 4
MAX_IMPORT_SIZE_MB   = 10
CACHE_TTL_KPI        = 300
JWT_ACCESS_EXPIRY    = '8h'
JWT_REFRESH_EXPIRY   = '30d'
DEFAULT_PAGE_LIMIT   = 20
DEFAULT_CURRENCY     = 'XOF'
LOGIN_RATE_LIMIT     = 5
BRUTE_FORCE_LOCKOUT  = 900
```

---

## 10. ÉTAT D'AVANCEMENT DES PROMPTS COPILOT

### Phase 1 — Fondations ✅ COMPLÈTE
- ✅ Étape 1  → Structure monorepo
- ✅ Étape 2  → Docker Compose
- ✅ Étape 3  → Prisma + seed (18 tables)
- ✅ Étape 4  → Module Auth (login/refresh/logout/me)
- ✅ Étape 5  → Module Users (CRUD, invite, toggle)
- ✅ Étape 6  → Config globale API (Helmet, CORS, guards)
- ✅ Étape 7  → Frontend setup React
- ✅ Étape 8  → Topbar + AppLayout + ProtectedRoute + NavMenu

### Phase 2 — Modules métier ✅ COMPLÈTE
- ✅ Étape 9  → Module Budget (CRUD + workflow DRAFT→LOCKED)
- ✅ Étape 10 → Module Transactions + Import Excel
- ✅ Étape 11 → CalcEngine Python (KPIs, snapshots, scénarios)
- ✅ Étape 12 → Module Cash Flow + Bank Accounts
- ✅ Étape 13 → Module Scénarios
- ✅ Étape 14 → Dashboard KPIs + Alertes (cache Redis)

### Phase 2.5 — Tests & Validation ✅ PROMPTS GÉNÉRÉS
- ✅ Étape 15   → Tests intégration NestJS
- ✅ Étape 15.1 → Docker Compose test (ports 5433/6380)
- ✅ Étape 16   → Tests E2E API (Supertest)
- ✅ Étape 17   → Tests Python CalcEngine (pytest)
- ✅ Étape 18   → Tests Frontend (Vitest + RTL)
- ✅ Étape 18.5 → Tests Playwright (vrai navigateur)
- ⏳ Étape 19   → Smoke tests complets (PROCHAINE ÉTAPE)

### Phase 3 — Production ⏳ PENDING
- ⏳ Étape 20 → Module Rapports PDF/Excel async
- ⏳ Étape 21 → Portail Auditeur séparé
- ⏳ Étape 22 → Monitoring + alertes infra
- ⏳ Étape 23 → CI/CD + Kubernetes

---

## 11. SESSION DE DÉBOGAGE — PROBLÈMES RENCONTRÉS ET SOLUTIONS

### Problème 1 — script start:dev manquant (NestJS)
**Erreur :** `npm ERR! Missing script: "start:dev"`
**Cause :** Copilot a généré les scripts de test mais pas les scripts
de démarrage NestJS dans apps/api/package.json
**Solution :** Ajouter dans package.json :
```json
"start":       "node dist/main",
"start:dev":   "nest start --watch",
"start:debug": "nest start --debug --watch",
"start:prod":  "node dist/main",
"prebuild":    "rimraf dist"
```
Et créer nest-cli.json à la racine de apps/api/

### Problème 2 — Frontend 404 sur localhost:5173
**Erreur :** `GET http://localhost:5173/ net::ERR_HTTP_RESPONSE_CODE_FAILURE 404`
**Cause :** Fichier index.html manquant à la racine de apps/web/
**Solution :** Créer apps/web/index.html :
```html
<!DOCTYPE html>
<html lang="fr">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Jupiter_Plan</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

### Problème 3 — CalcEngine : DATABASE_URL is required
**Erreur :** `RuntimeError: DATABASE_URL is required`
**Cause :** Fichier .env manquant dans apps/calc/
**Solution :** Créer apps/calc/.env avec :
```
DATABASE_URL=postgresql://jupiter_user:jupiter_password_dev@localhost:5432/jupiter_plan
REDIS_URL=redis://:redis_password_dev@localhost:6379
NESTJS_INTERNAL_URL=http://localhost:3001
CALC_PORT=8000
```
Note : en dev local utiliser localhost, dans Docker utiliser
les noms de services (postgres, redis)

### Problème 4 — Docker Compose : .env manquant à la racine
**Erreur :** `env file .env not found`
**Cause :** Le fichier .env n'existait pas à la racine du monorepo
**Solution :** Créer C:\Users\ibras\Desktop\Jupiter_Plan\.env avec :
```
POSTGRES_DB=jupiter_plan
POSTGRES_USER=jupiter_user
POSTGRES_PASSWORD=jupiter_password_dev
REDIS_PASSWORD=redis_password_dev
DATABASE_URL=postgresql://jupiter_user:jupiter_password_dev@postgres:5432/jupiter_plan
REDIS_URL=redis://:redis_password_dev@redis:6379
JWT_SECRET=jupiter-plan-jwt-secret-dev-minimum-32-chars
JWT_REFRESH_SECRET=jupiter-plan-refresh-secret-dev-minimum-32
WEB_URL=http://localhost:5173
CALC_ENGINE_URL=http://calc:8000
NODE_ENV=development
PORT=3001
```

### Problème 5 — Docker build web : @shared/enums introuvable
**Erreur :** `Cannot find module '@shared/enums' or its corresponding type declarations`
**Cause :** Le Dockerfile de apps/web copie uniquement apps/web/
mais pas packages/shared/ qui contient les enums partagés.
Docker ne voit pas les fichiers en dehors de son contexte de build.

**Fichiers concernés (14 fichiers) :**
- src/App.tsx
- src/components/layout/NavMenu.tsx + NavMenu.test.tsx
- src/components/layout/ProtectedRoute.tsx + ProtectedRoute.test.tsx
- src/components/layout/Topbar.tsx + Topbar.test.tsx
- src/features/BudgetPage.test.tsx
- src/hooks/useAuth.ts + useAuth.test.tsx
- src/stores/auth.store.ts + auth.store.test.ts
- src/types/index.ts

**Solution A (rapide) :** Copier les enums dans apps/web/src/types/enums.ts
et remplacer tous les imports '@shared/enums' par le chemin relatif.

**Solution B (propre, à faire plus tard) :** Modifier docker-compose.yml
pour que le contexte de build soit la racine du monorepo :
```yaml
web:
  build:
    context: .                        # racine jupiter_plan/
    dockerfile: apps/web/Dockerfile   # Dockerfile modifié
```
Et dans le Dockerfile :
```dockerfile
COPY packages/shared/ ./packages/shared/
COPY apps/web/ ./apps/web/
RUN cd apps/web && npm run build
```

### État Docker actuel observé
```
✅ jupiter_redis_test  → port 6380  (Redis test)
⚠️ nervous_faraday     → Redis orphelin sans nom
❌ PostgreSQL           → pas démarré
❌ Redis dev            → port 6379 absent
```
Docker-compose principal pas encore démarré avec succès
à cause des problèmes .env + build web.

---

## 12. PROCHAINES ACTIONS IMMÉDIATES

### À faire maintenant pour débloquer Docker
1. Appliquer Solution A pour @shared/enums (prompt Copilot)
2. Relancer docker-compose build web
3. Relancer docker-compose up -d
4. Vérifier docker ps → 4 conteneurs actifs

### Après Docker opérationnel
1. Lancer prisma migrate dev (apps/api/)
2. Lancer npm run seed (données démo PME sénégalaise)
3. Tester la connexion sur http://localhost:5173
4. Passer à l'étape 19 — Smoke tests complets

---

## 13. FICHIERS GÉNÉRÉS PAR CLAUDE (LIVRABLES)

| Fichier | Description |
|---------|-------------|
| fpa_class_diagram_v3.mermaid | Diagramme de classes V3 |
| sequence_diagrams_fpa_v1.md | Diagrammes de séquence |
| stack_technologique_fpa.html | Stack technologique |
| api_reference_fpa.html | Documentation API interactive |
| openapi_fpa_v1.yaml | Spécification OpenAPI 3.0 |
| maquettes_fpa_ui.html | Maquettes UI V1 |
| finpilot_v3.html | Dashboard V3 thème ivoire |
| erd_finpilot.html | Schéma ERD interactif |
| schema.prisma | Schéma Prisma complet |
| jupiter_plan_copilot_setup.md | Kit prompts Copilot setup |
| copilot-instructions.md | Fichier contexte Copilot (16 sections) |
| PROJECT_SUMMARY.md | Résumé projet (13 sections) |
| .env.example | Variables d'environnement Docker |
| index.html | Point d'entrée Vite (manquait) |

---

## 14. CONVENTIONS DU PROJET

```
org_id           → toujours depuis le JWT [SBD-05]
Montants         → Decimal(18,2), affichage formatFCFA()
Dates            → Africa/Dakar (UTC+0), formatDate() en français
Erreurs API      → codes métier (ex: BUDGET_NOT_SUBMITTABLE)
Routes API       → /api/v1/kebab-case
data-testid      → sur tous les éléments testés (Playwright)
Tests            → structure AAA : Arrange / Act / Assert
Logs             → NestJS Logger / Python logging — jamais console.log
Commits          → feat(module): description
Branches git     → feat/module-description
```

---

## 15. ENVIRONNEMENTS

### Développement local (actuel)
```
Terminal 1 → docker-compose up -d     (PostgreSQL:5432 + Redis:6379)
Terminal 2 → cd apps/api && npm run start:dev   (NestJS port 3001)
Terminal 3 → cd apps/calc && uvicorn main:app --reload --port 8000
Terminal 4 → cd apps/web && npm run dev         (Vite port 5173)
```

### Test (Docker Compose séparé)
```
PostgreSQL test → port 5433 (jamais 5432)
Redis test      → port 6380 (jamais 6379)
DB name         → jupiter_plan_test
Protection      → erreur si DATABASE_URL ne contient pas 'test'
```

### Production (planifié)
```
DigitalOcean Lagos → Kubernetes
CDN Cloudflare     → assets + protection DDoS
Domaine            → jupiter-plan.com
Portail auditeur   → audit.jupiter-plan.com
```

---

## 16. PYTHON — NOTE DE COMPATIBILITÉ

L'utilisateur a Python 3.9 installé (au lieu de 3.11 requis).
Points de vigilance pour Python 3.9 :
- Utiliser List[str] au lieu de list[str] (typing module)
- Utiliser Optional[str] au lieu de str | None
- Utiliser Union[str, int] au lieu de str | int
Copilot doit générer du code compatible Python 3.9 pour ce projet.

---

*Jupiter_Plan — Résumé de continuité IA*
*Généré le 11 mars 2026*
*Prochaine étape : Étape 19 — Smoke tests complets*
