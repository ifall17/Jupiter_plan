# 🪐 Jupiter_Plan — Instructions Copilot
# Fichier : copilot-instructions.md
# Copilot lit ce fichier avant de générer du code. Ces règles sont non négociables.
# Sécurité : TIER 3 REGULATED (fintech, données financières sensibles)

---

## 1. CE QU'EST CE PROJET

SaaS FP&A multi-tenant pour PME d'Afrique de l'Ouest.
- Chaque client = une `Organization` isolée
- Devise : FCFA (XOF), plan comptable SYSCOHADA
- Utilisateurs cibles : DAF, CEO, Contrôleur de gestion, Comptable, Expert-comptable
- **Tier sécurité : TIER 3 REGULATED** — données financières, multi-tenant, réglementations ECOWAS

### Stack technique
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

### Séparation NestJS / Python — CRITIQUE
```
NestJS    → Auth, CRUD, orchestration, queues, WebSocket, cron
Python    → Calculs KPIs, snapshots IS/BS/CF, moteur scénarios, import Excel/Sage

Flux de calcul :
NestJS reçoit la requête
  → publie un job dans BullMQ (calc-queue)
  → Python consomme le job
  → Python calcule avec Decimal (précision exacte)
  → Python écrit le résultat dans PostgreSQL
  → NestJS notifie le frontend via Socket.io
```

---

## 2. RÔLES & PERMISSIONS

### Les 5 rôles
```
SUPER_ADMIN  → Paramétrage, droits, accès total
FPA          → Modélisation, budget, forecast, rapports
CONTRIBUTEUR → Saisie données de son département uniquement
LECTEUR      → Dashboard consolidé, lecture seule (DG, associés, CA, investisseurs)
AUDITEUR     → Portail séparé, états financiers, accès temporaire
```

### Matrice des permissions

| Action | SUPER_ADMIN | FPA | CONTRIBUTEUR | LECTEUR |
|--------|-------------|-----|--------------|---------|
| Dashboard exécutif | ✅ | ✅ | ❌ | ✅ |
| Créer / modifier budget | ✅ | ✅ | ⚠️ son dept | ❌ |
| Approuver budget | ✅ | ✅ | ❌ | ❌ |
| Créer scénario | ✅ | ✅ | ❌ | ❌ |
| Voir scénarios | ✅ | ✅ | ❌ | ✅ lecture seule |
| Importer transactions | ✅ | ✅ | ⚠️ son dept | ❌ |
| Clôturer une période | ✅ | ✅ | ❌ | ❌ |
| Inviter utilisateurs | ✅ | ❌ | ❌ | ❌ |
| Générer accès auditeur | ✅ | ✅ | ❌ | ❌ |
| Voir KPIs & alertes | ✅ | ✅ | ⚠️ son dept | ✅ |
| Exporter PDF / Excel | ✅ | ✅ | ❌ | ✅ |
| Paramétrage organisation | ✅ | ❌ | ❌ | ❌ |

⚠️ = accès limité au département assigné via `user_department_scope`

### Règles de scoping [SBD-05 · SBD-06]
```
SUPER_ADMIN  → toute l'organisation
FPA          → toute l'organisation
CONTRIBUTEUR → son département uniquement (table user_department_scope)
LECTEUR      → toute l'organisation, lecture seule
AUDITEUR     → portail séparé audit.jupiter-plan.com, périodes autorisées uniquement
```

**Default DENY — SBD-05 :** toute permission non explicitement accordée est refusée.
Si une vérification de permission échoue (exception), la réponse est toujours `false` — jamais `true`.

```typescript
// ✅ Fail secure [SBD-21]
function checkPermission(user: JwtPayload, action: string): boolean {
  try {
    return permissionService.check(user, action);
  } catch {
    return false; // deny on any failure — jamais true
  }
}
```

---

## 3. RÈGLES MÉTIER CRITIQUES

### RÈGLE 1 — Workflow Budget
```
CONTRIBUTEUR saisit les lignes de son département
        ↓ statut → DRAFT
CONTRIBUTEUR soumet pour validation
        ↓ statut → SUBMITTED
FPA consolide et vérifie
        ↓
    ✅ Approuvé → statut APPROVED
    ❌ Rejeté   → statut REJECTED + commentaire obligatoire
                  CONTRIBUTEUR corrige → statut SUBMITTED
        ↓
FPA verrouille le budget final
        ↓ statut → LOCKED (aucune modification possible)
```
- Budget LOCKED : jamais modifiable — un reforecast crée une nouvelle version
- Lignes d'un CONTRIBUTEUR invisibles aux autres départements
- Budget consolidé dans les KPIs uniquement après statut APPROVED
- Seul FPA ou SUPER_ADMIN peut verrouiller

### RÈGLE 2 — Workflow Import Transactions
```
CONTRIBUTEUR ou FPA uploade un fichier Excel/Sage
        ↓ statut job → PENDING
Python valide le format et les codes SYSCOHADA
        ↓
    ❌ Invalide → statut FAILED + rapport d'erreurs
    ✅ Valide   → aperçu 20 premières lignes
        ↓
Utilisateur confirme l'import
        ↓ statut job → PROCESSING (BullMQ)
Python traite avec Pandas
        ↓ statut job → DONE + { inserted, skipped, errors }
NestJS notifie via Socket.io
KPIs et snapshots recalculés (calc-queue)
```
- CONTRIBUTEUR importe uniquement pour son département
- Transactions importées : `is_validated: false` jusqu'à validation FPA
- Fichier jamais écrit sur disque — traitement en mémoire Pandas [SBD-09]
- Import non annulable après DONE — écritures correctives uniquement
- Toute import génère une ligne dans `audit_logs` [SBD-10]

### RÈGLE 3 — Workflow Scénarios
```
FPA sélectionne un budget APPROVED comme base
        ↓ statut → DRAFT
FPA définit les hypothèses via sliders
NestJS envoie les hypothèses au CalcEngine Python via BullMQ
Python recalcule IS + BS + CF avec Decimal exact
        ↓ statut → CALCULATED
Résultats stockés dans financial_snapshots
FPA compare jusqu'à 4 scénarios simultanément
FPA sauvegarde → statut SAVED
LECTEUR consulte les scénarios SAVED (lecture seule, sans hypothèses)
```
- Scénario DRAFT visible uniquement par FPA et SUPER_ADMIN
- Scénario SAVED visible par LECTEUR — sans les hypothèses détaillées
- Maximum MAX_SCENARIO_COMPARE (4) scénarios comparés simultanément
- Modifier une hypothèse repasse en DRAFT — snapshots précédents conservés
- Scénario non supprimable s'il est référencé dans un rapport exporté

### RÈGLE 4 — Workflow Clôture de Période
```
FPA vérifie que toutes les transactions sont validées
        ↓
    ❌ Transactions en attente → clôture bloquée, liste affichée
    ✅ Toutes validées → FPA lance la clôture
        ↓
NestJS envoie job au CalcEngine Python via BullMQ
Python calcule snapshot financier final (IS + BS + CF)
Snapshot stocké dans financial_snapshots (scenario_id: null)
KPIs calculés et stockés dans kpi_values
        ↓ statut période → CLOSED
Socket.io notifie tous les utilisateurs connectés
Période suivante → CURRENT automatiquement
```
- Période CLOSED : irréversible, ne peut jamais être rouverte
- Bilan déséquilibré → erreur BALANCE_MISMATCH → clôture bloquée
- Seul FPA ou SUPER_ADMIN peut clôturer
- La clôture génère automatiquement une entrée dans audit_logs [SBD-10]

### RÈGLE 5 — Workflow Accès Auditeur
```
FPA ou SUPER_ADMIN crée un accès auditeur
    { email, périodes autorisées, date d'expiration }
        ↓
Système génère un token via secrets.token_hex(32) [SBD-08]
Email envoyé → URL : audit.jupiter-plan.com?token=xxx
        ↓
Auditeur accède au portail séparé
    ❌ Token expiré ou révoqué → accès refusé
    ✅ Token valide → accès accordé
        ↓
Auditeur consulte : IS + BS + Cash Flow Statement
des périodes autorisées uniquement
Chaque consultation loggée { token_hash, action, ip_address, timestamp } [SBD-10]
FPA peut révoquer à tout moment
```
- Token généré avec `secrets.token_hex(32)` — jamais `Math.random()` [SBD-08]
- L'auditeur ne voit jamais : budgets, scénarios, hypothèses, KPIs internes, utilisateurs
- Maximum MAX_AUDIT_SESSIONS (5) accès actifs simultanément par organisation
- Accès révoqué non réactivable — créer un nouveau

---

## 4. STRUCTURE DES DOSSIERS

### apps/api — NestJS
```
apps/api/src/
├── main.ts
├── app.module.ts
├── config/
│   └── configuration.ts
├── prisma/
│   └── prisma.service.ts
├── redis/
│   └── redis.module.ts
├── common/
│   ├── constants/
│   │   └── business.constants.ts      ← toutes les constantes métier
│   ├── dto/
│   │   ├── paginated-response.dto.ts  ← PaginatedResponseDto<T>
│   │   └── api-response.dto.ts        ← ApiResponseDto<T>
│   ├── repositories/
│   │   └── base.repository.ts         ← findOne, findMany, create, update, softDelete
│   ├── filters/
│   │   └── http-exception.filter.ts
│   ├── interceptors/
│   │   ├── logging.interceptor.ts
│   │   └── transform.interceptor.ts
│   ├── decorators/
│   │   ├── current-user.decorator.ts
│   │   └── roles.decorator.ts
│   └── guards/
│       ├── jwt-auth.guard.ts
│       ├── roles.guard.ts
│       ├── org.guard.ts               ← isolation org_id
│       └── dept.guard.ts              ← isolation département CONTRIBUTEUR
├── modules/
│   ├── auth/
│   │   ├── auth.module.ts
│   │   ├── auth.controller.ts
│   │   ├── auth.service.ts
│   │   ├── auth.repository.ts
│   │   ├── strategies/
│   │   │   ├── jwt.strategy.ts
│   │   │   └── local.strategy.ts
│   │   └── dto/
│   │       ├── login.dto.ts
│   │       └── auth-response.dto.ts
│   ├── users/
│   ├── organizations/
│   ├── fiscal-years/
│   ├── budgets/
│   ├── transactions/
│   ├── imports/
│   ├── cash-flow/
│   ├── scenarios/
│   ├── kpis/
│   ├── snapshots/
│   ├── alerts/
│   └── audit/
├── queues/
│   ├── import.queue.ts
│   ├── calc.queue.ts
│   ├── notif.queue.ts
│   └── export.queue.ts
└── websocket/
    └── events.gateway.ts
```

### apps/calc — Python FastAPI
```
apps/calc/
├── main.py
├── config.py
├── database.py
├── redis_client.py
├── routers/
│   ├── __init__.py
│   ├── kpis.py
│   ├── snapshots.py
│   ├── scenarios.py
│   └── closing.py
├── services/
│   ├── __init__.py
│   ├── kpi_calculator.py
│   ├── snapshot_calculator.py
│   ├── scenario_engine.py
│   ├── closing_service.py
│   └── import_processor.py
├── workers/
│   ├── __init__.py
│   ├── calc_worker.py
│   └── import_worker.py
├── models/
│   ├── __init__.py
│   └── schemas.py
├── utils/
│   ├── __init__.py
│   ├── decimal_utils.py
│   └── syscohada.py
├── requirements.txt
├── Dockerfile
└── .env
```

### apps/web — React
```
apps/web/src/
├── main.tsx
├── App.tsx
├── api/
│   ├── client.ts
│   ├── auth.api.ts
│   ├── budget.api.ts
│   ├── transaction.api.ts
│   ├── scenario.api.ts
│   ├── kpi.api.ts
│   ├── cashflow.api.ts
│   └── audit.api.ts
├── stores/
│   ├── auth.store.ts
│   └── org.store.ts
├── components/
│   ├── ui/                            ← composants réutilisables globaux
│   │   ├── Button.tsx
│   │   ├── Input.tsx
│   │   ├── Card.tsx
│   │   ├── Badge.tsx
│   │   ├── Modal.tsx
│   │   └── Toast.tsx
│   └── layout/
│       ├── Topbar.tsx
│       ├── AppLayout.tsx
│       └── ProtectedRoute.tsx
├── features/
│   ├── auth/
│   ├── dashboard/
│   ├── budget/
│   ├── transactions/
│   ├── scenarios/
│   ├── cashflow/
│   ├── kpis/
│   ├── reports/
│   └── settings/
├── hooks/                             ← hooks globaux réutilisables
│   ├── useAuth.ts
│   ├── useOrg.ts
│   ├── useSocket.ts
│   ├── usePagination.ts
│   ├── useFilters.ts
│   └── useDebounce.ts
├── utils/
│   ├── currency.ts
│   └── date.ts
└── types/
    └── index.ts
```

---

## 5. UX & COMPORTEMENT

### Navigation par rôle
```
SUPER_ADMIN  → Dashboard, Budget, Transactions, Scénarios,
               Cash Flow, KPIs, Rapports, Paramètres, Utilisateurs

FPA          → Dashboard, Budget, Transactions, Scénarios,
               Cash Flow, KPIs, Rapports

CONTRIBUTEUR → Budget (son dept), Transactions (son dept)

LECTEUR      → Dashboard, Scénarios (lecture seule), Rapports
```

### Palette couleurs Jupiter_Plan
```
Fond principal    #faf8f4   (ivoire chaud)
Surface           #ffffff
Bordures          #e8e2d9
Texte principal   #1a1a2e
Texte secondaire  #5a5570

Primaire (terra)  #c4622d
Secondaire (gold) #b8963e
Succès (kola)     #2d6a4f
Info (indigo)     #3d5a99

Statuts budget :
  DRAFT       #9990a8
  SUBMITTED   #b8963e
  APPROVED    #2d6a4f
  LOCKED      #1a1a2e
  REJECTED    #c0303f

Sévérité alertes :
  INFO        #3d5a99
  WARN        #b8963e
  CRITICAL    #c0303f
```

### Patterns d'ouverture
```
Page dédiée  → Dashboard, Budget, Scénarios, Cash Flow
Tiroir droit → Formulaires (saisie budget, import, paramètres)
Modal        → Confirmations, approbations, rejets
Toast        → Notifications légères (succès import, alerte KPI)
```

---

## 6. CODES D'ERREUR MÉTIER

```
AUTH
  AUTH_001  INVALID_CREDENTIALS          Email ou mot de passe incorrect
  AUTH_002  ACCOUNT_LOCKED               Compte bloqué, contacter l'administrateur
  AUTH_003  TOKEN_EXPIRED                Session expirée, reconnectez-vous
  AUTH_004  INSUFFICIENT_PERMISSIONS     Action non autorisée pour votre rôle
  AUTH_005  AUDIT_TOKEN_EXPIRED          Lien d'accès auditeur expiré
  AUTH_006  AUDIT_TOKEN_REVOKED          Lien d'accès auditeur révoqué

ORGANISATION
  ORG_001   ORG_NOT_FOUND                Organisation introuvable
  ORG_002   ORG_INACTIVE                 Organisation désactivée

BUDGET
  BUDGET_001  BUDGET_NOT_FOUND           Budget introuvable
  BUDGET_002  BUDGET_NOT_SUBMITTABLE     Statut invalide pour soumission
  BUDGET_003  BUDGET_NOT_APPROVABLE      Statut invalide pour approbation
  BUDGET_004  BUDGET_LOCKED              Budget verrouillé, aucune modification
  BUDGET_005  BUDGET_DEPT_FORBIDDEN      Département non autorisé pour ce budget
  BUDGET_006  REJECTION_COMMENT_REQUIRED Commentaire obligatoire lors d'un rejet

PÉRIODE
  PERIOD_001  PERIOD_NOT_FOUND           Période introuvable
  PERIOD_002  PERIOD_ALREADY_CLOSED      Période déjà clôturée
  PERIOD_003  PERIOD_HAS_PENDING_TX      Transactions non validées bloquent la clôture
  PERIOD_004  BALANCE_MISMATCH           Bilan déséquilibré, clôture impossible

IMPORT
  IMPORT_001  FILE_TOO_LARGE             Fichier trop volumineux (max 10 Mo)
  IMPORT_002  INVALID_FORMAT             Format non reconnu (Excel ou Sage uniquement)
  IMPORT_003  INVALID_SYSCOHADA_CODE     Code comptable SYSCOHADA invalide
  IMPORT_004  IMPORT_DEPT_FORBIDDEN      Import non autorisé pour ce département
  IMPORT_005  IMPORT_ALREADY_PROCESSING  Import en cours, patienter

SCÉNARIO
  SCENARIO_001  SCENARIO_NOT_FOUND       Scénario introuvable
  SCENARIO_002  SCENARIO_BASE_REQUIRED   Budget APPROVED requis comme base
  SCENARIO_003  SCENARIO_MAX_COMPARE     Maximum 4 scénarios comparables
  SCENARIO_004  SCENARIO_LOCKED          Scénario référencé dans un rapport

CALCUL
  CALC_001  CALC_ENGINE_UNAVAILABLE      Moteur de calcul indisponible
  CALC_002  CALC_TIMEOUT                 Calcul trop long, réessayer
  CALC_003  CALC_DECIMAL_OVERFLOW        Valeur hors limites autorisées

AUDITEUR
  AUDIT_001  AUDIT_ACCESS_MAX_REACHED    Maximum 5 accès auditeurs actifs
  AUDIT_002  AUDIT_PERIOD_FORBIDDEN      Période non incluse dans l'accès
```

**Règle d'exposition des erreurs [SBD-13] :**
```typescript
// ✅ Message générique pour l'utilisateur, détail dans les logs serveur
try {
  await processRequest(data);
} catch (error) {
  logger.error(error.message, error.stack); // logs serveur uniquement
  throw new BadRequestException({ code: 'BUDGET_NOT_FOUND' }); // pas de stack trace
}

// ❌ Ne jamais exposer : stack trace, chemin fichier, version serveur, IP interne
```

---

## 7. SÉCURITÉ — SECUREBYDESIGN TIER 3

> Jupiter_Plan est TIER 3 REGULATED : données financières, multi-tenant, >1000 utilisateurs.
> Tous les 25 contrôles SBD s'appliquent. Aucune exception sans justification documentée.

### SBD-01 · Validation des entrées
```typescript
// ✅ Validation Zod côté frontend + class-validator côté backend
// Jamais de validation côté client uniquement

// Backend NestJS — DTO avec validation explicite
export class CreateBudgetDto {
  @IsString()
  @MaxLength(200)
  @Matches(/^[\w\s\-àâçéèêëîïôûùü]+$/i)
  name: string;

  @IsDecimal()                          // montants : string Decimal
  amount: string;

  @IsUUID()
  fiscal_year_id: string;
}

// Python FastAPI — Pydantic avec contraintes
class ImportRow(BaseModel):
  account_code: str = Field(pattern=r'^\d{6,8}$')  # code SYSCOHADA
  amount: Decimal = Field(ge=0)
  period: int = Field(ge=1, le=12)
```

### SBD-02 · Upload fichiers sécurisé
```typescript
// ✅ Validation MIME côté serveur — jamais côté client
const ALLOWED_MIME = ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'];
const MAX_SIZE = MAX_IMPORT_SIZE_MB * 1024 * 1024;

if (!ALLOWED_MIME.includes(file.mimetype)) {
  throw new BadRequestException({ code: 'IMPORT_002' });
}
if (file.size > MAX_SIZE) {
  throw new BadRequestException({ code: 'IMPORT_001' });
}
// Nom de fichier généré par le serveur — jamais utiliser file.originalname
const safeFilename = `${randomUUID()}.xlsx`;
// Stockage hors web root — dans S3, jamais dans /public
```

### SBD-03 · Headers HTTP de sécurité
```typescript
// main.ts — NestJS
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      objectSrc: ["'none'"],
    },
  },
  hsts: { maxAge: 31536000, includeSubDomains: true },
}));

app.enableCors({
  origin: [process.env.WEB_URL],   // jamais '*' sur les endpoints authentifiés
  credentials: true,
});
```

### SBD-04 · Authentification
```typescript
// ✅ Argon2id pour le hachage des mots de passe [OWASP A07]
import * as argon2 from 'argon2';
const hash = await argon2.hash(password, { type: argon2.argon2id });
const valid = await argon2.verify(hash, password);

// ❌ Interdit
const hash = md5(password);    // CRITIQUE
const hash = sha1(password);   // CRITIQUE
const hash = bcrypt(password); // acceptable mais Argon2id préféré

// JWT — toujours vérifier alg explicitement
const payload = jwt.verify(token, secret, { algorithms: ['HS256'] });
// JWT sans exp → rejeter
if (!payload.exp) throw new UnauthorizedException();

// Rate limiting sur /auth/login [SBD-11]
// Max 5 tentatives / minute par IP + par compte
@UseGuards(ThrottlerGuard)
@Throttle({ default: { ttl: 60000, limit: 5 } })
@Post('login')
async login(@Body() dto: LoginDto) { ... }
```

### SBD-05 · Autorisation & contrôle d'accès
```typescript
// ✅ Vérification ownership systématique — ne jamais chercher sans org_id
// [OWASP A01] — Broken Access Control

// ❌ VULNÉRABLE — pas de vérification ownership
const budget = await prisma.budget.findUnique({ where: { id } });

// ✅ CORRECT — ownership + org_id toujours
const budget = await prisma.budget.findUnique({
  where: { id, org_id: user.org_id }
});
if (!budget) throw new NotFoundException(); // 404 et non 403 — ne pas révéler l'existence

// Département pour CONTRIBUTEUR
const budget = await prisma.budget.findUnique({
  where: { id, org_id: user.org_id, department_id: user.department_id }
});
```

### SBD-06 · Moindre privilège
```typescript
// ✅ Chaque service DB a uniquement les droits nécessaires
// L'utilisateur PostgreSQL de l'API n'a pas DROP TABLE
// L'utilisateur PostgreSQL du CalcEngine est READ-ONLY sauf financial_snapshots

// ✅ Rôle extrait du JWT uniquement — jamais du body
@Roles(UserRole.FPA, UserRole.SUPER_ADMIN)
@UseGuards(JwtAuthGuard, RolesGuard)
@Post(':id/approve')
approve(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
  return this.budgetService.approve(id, user.org_id, user.id);
}
```

### SBD-07 · Gestion des secrets
```typescript
// ✅ Secrets via ConfigService uniquement — jamais en dur
const secret = this.configService.get<string>('JWT_SECRET');

// ✅ Pre-commit hook obligatoire
// .gitleaks.toml à la racine du projet
// gitleaks protect --staged

// ❌ Interdit
const secret = 'mon-secret';           // CRITIQUE
const apiKey = 'sk-xxxxx';             // CRITIQUE
// .env ne doit jamais être commité — vérifier .gitignore
```

### SBD-08 · Cryptographie
```typescript
// ✅ Token auditeur — cryptographiquement sécurisé
import crypto from 'crypto';
const token = crypto.randomBytes(32).toString('hex'); // 64 chars hex

// ✅ Python — même règle
import secrets
token = secrets.token_hex(32)

// ❌ Interdit pour les tokens de sécurité
Math.random()           // pas cryptographique
Date.now().toString()   // prévisible
```

### SBD-09 · Minimisation des données
```typescript
// ✅ Select explicite — jamais SELECT *
prisma.user.findUnique({
  where: { id },
  select: { id: true, email: true, role: true, org_id: true }
  // password_hash : uniquement dans auth.repository.ts
});

// ✅ Logs : événement uniquement — jamais le contenu des données [SBD-10 conflict]
// Log WHAT happened — never WHAT data was returned
logger.log(`Budget ${id} accessed by ${userId}`);  // ✅
logger.log(`Budget data: ${JSON.stringify(budget)}`); // ❌ données financières dans les logs
```

### SBD-10 · Logs de sécurité & audit trail
```typescript
// ✅ Format de log structuré obligatoire
{
  timestamp: new Date().toISOString(),  // ISO8601
  event_type: 'budget.approved',
  user_id: 'uuid',                      // pseudonymisé après 30j
  org_id: 'uuid',
  resource: '/api/v1/budgets/:id',
  outcome: 'success',
  ip_address: 'x.x.x.x'
}

// ✅ Audit log pour toute action sensible
await prisma.auditLog.create({
  data: {
    org_id: orgId,
    user_id: userId,
    action: 'BUDGET_APPROVE',
    entity_id: id,
    ip_address: req.ip,
    timestamp: new Date(),
  }
});

// Rétention : 90 jours minimum [SBD-10]
// Pseudonymisation des user_id dans les logs après 30 jours

// ❌ Jamais dans les logs
// JWT ou refresh token
// password_hash
// données financières complètes
// informations personnelles (nom, email complet)
```

### SBD-11 · Rate limiting & protection abus
```typescript
// ✅ Rate limiting sur tous les endpoints sensibles
// /auth/login      → 5 req/min par IP + par compte
// /imports/upload  → 10 req/heure par org
// /api/v1/*        → 100 req/min par token JWT

// Détection brute force
if (failedLoginsPerMinute > 5) {
  await this.alertService.send('BRUTE_FORCE_DETECTED', { ip, userId });
  await this.lockAccount(userId, '15min');
}
```

### SBD-12 · Prévention SSRF
```python
# ✅ Python CalcEngine — bloquer les IPs internes sur tout appel externe
import ipaddress

BLOCKED_NETWORKS = [
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("169.254.0.0/16"),  # cloud metadata AWS/DO
]

def is_safe_url(url: str) -> bool:
    ip = ipaddress.ip_address(socket.gethostbyname(urlparse(url).hostname))
    return not any(ip in net for net in BLOCKED_NETWORKS)
```

### SBD-13 · Gestion des erreurs
```typescript
// ✅ Message générique pour l'utilisateur — détail dans les logs serveur
catch (error) {
  this.logger.error(error.message, error.stack); // logs serveur uniquement
  throw new InternalServerErrorException({ code: 'CALC_001' });
}

// ❌ Ne jamais exposer
// Stack traces
// Chemins de fichiers
// Versions de serveur
// IPs internes
// Messages d'erreur SQL bruts
```

### SBD-14 · Sécurité des dépendances
```yaml
# CI/CD — audit obligatoire avant chaque déploiement
- name: Security audit
  run: |
    npm audit --audit-level=high
    npx snyk test --severity-threshold=high

# Python
- name: Python security
  run: |
    pip-audit
    safety check
```

### SBD-15 · Intégrité CI/CD
```yaml
# ✅ Pinned à un SHA — jamais à un tag
- uses: actions/checkout@f43a0e5ff2bd294095638e18286ca9a3d1956744
# ❌ Tag peut être réassigné silencieusement
- uses: actions/checkout@v3
```

### SBD-20 · Architecture réseau & CORS
```typescript
// ✅ CORS strict
app.enableCors({
  origin: [process.env.WEB_URL],  // ex: https://app.jupiter-plan.com
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
});

// ❌ Jamais sur les endpoints authentifiés
origin: '*'

// CalcEngine Python — jamais exposé publiquement
// Accessible uniquement depuis le réseau interne Docker/K8s
// NestJS est le seul client autorisé
```

### SBD-21 · Fail secure
```typescript
// ✅ En cas d'erreur → toujours refuser, jamais autoriser
function checkPermission(user: JwtPayload, action: string): boolean {
  try {
    return permissionService.check(user, action);
  } catch {
    return false; // deny on any failure
  }
}
```

### SBD-24 · Détection d'incidents
```typescript
// ✅ Alertes automatiques
if (failedLoginsPerMinute > 10) {
  alertService.send('BRUTE_FORCE', { level: 'HIGH', ip });
}
if (dataExportSizeMB > THRESHOLD_MB) {
  alertService.send('UNUSUAL_EXPORT', { level: 'CRITICAL', userId });
}
if (auditTokenAccessPerHour > 50) {
  alertService.send('AUDIT_TOKEN_ABUSE', { level: 'HIGH', tokenHash });
}
```

### SBD-25 · Conformité & vie privée — Marchés Afrique de l'Ouest
```
Réglementations applicables à Jupiter_Plan :
- ECOWAS Supplementary Act on Personal Data (2010)
- Sénégal   : Loi 2008-12 sur la protection des données personnelles, autorité CDPD
- Côte d'Ivoire : Loi 2013-450 sur la protection des données personnelles
- Consentement explicite requis pour la collecte de données personnelles
- Droit à l'effacement : implémenter soft delete + purge planifiée
- Registre des traitements de données requis avant mise en production
```

---

## 8. ANTI-DOUBLONS DE CODE

### Règle des 2 occurrences
```
Si un bloc de code apparaît 2 fois → extraire en fonction dans common/
Si un composant apparaît 2 fois   → déplacer dans components/ui/
Si un type apparaît 2 fois        → déplacer dans packages/shared/
```

### Backend
```typescript
// ✅ DTOs génériques dans common/dto/ — jamais redéfinis localement
class PaginatedResponseDto<T> { data: T[]; total: number; page: number; totalPages: number; }
class ApiResponseDto<T> { success: boolean; data?: T; code?: string; message?: string; }

// ✅ Guards dans common/guards/ — jamais recréés dans un module
// JwtAuthGuard, RolesGuard, OrgGuard, DeptGuard

// ✅ BaseRepository dans common/repositories/
// Chaque repository étend BaseRepository
class BudgetRepository extends BaseRepository<Budget> { ... }
```

### Frontend
```typescript
// ✅ Hooks globaux dans hooks/ — jamais réimplémentés dans une feature
import { usePagination } from '@web/hooks/usePagination';
import { useFilters }    from '@web/hooks/useFilters';
import { useDebounce }   from '@web/hooks/useDebounce';

// ✅ Composants UI dans components/ui/ — jamais recréés dans une feature
```

---

## 9. DETTE TECHNIQUE

```
❌ TODO sans ticket GitHub : // ✅ TODO [#142] : fix · ❌ TODO : fix later
❌ console.log en production → NestJS Logger / Python logging
❌ Merger avec erreurs TypeScript → CI bloque si tsc --noEmit échoue
❌ Modifier une migration Prisma existante → toujours créer une nouvelle
❌ Magic strings → utiliser les enums depuis @shared/enums
❌ Copier-coller entre modules → règle des 2 occurrences
❌ Secrets en dur → configService.get() uniquement
❌ npm install sans audit → npm audit --audit-level=high obligatoire
```

### Constantes centralisées
```typescript
// common/constants/business.constants.ts
export const MAX_AUDIT_SESSIONS   = 5;
export const MAX_SCENARIO_COMPARE = 4;
export const MAX_IMPORT_SIZE_MB   = 10;
export const CACHE_TTL_KPI        = 300;
export const JWT_ACCESS_EXPIRY    = '8h';
export const JWT_REFRESH_EXPIRY   = '30d';
export const DEFAULT_PAGE_LIMIT   = 20;
export const DEFAULT_CURRENCY     = 'XOF';
export const LOGIN_RATE_LIMIT     = 5;     // tentatives/minute
export const BRUTE_FORCE_LOCKOUT  = 900;   // secondes (15 min)
```

### Branches & commits
```
feat/[module]-[description]  |  fix/[module]-[description]  |  chore/[description]
feat(budget): add approval workflow
fix(import): handle empty Excel sheets
Jamais commiter directement sur main ou develop
```

---

## 10. MAINTENABILITÉ

### Versioning des APIs
```
✅ /api/v1/budgets   ❌ /api/budgets
Toutes les routes préfixées par /api/v1/
```

### Variables d'environnement
```bash
# .env.example — toute nouvelle variable ajoutée ici OBLIGATOIREMENT
NODE_ENV=development
PORT=3001 | CALC_PORT=8000 | WEB_PORT=5173
DATABASE_URL=postgresql://user:password@localhost:5432/jupiter_plan
REDIS_URL=redis://localhost:6379
JWT_SECRET= | JWT_REFRESH_SECRET=
JWT_ACCESS_EXPIRY=8h | JWT_REFRESH_EXPIRY=30d
CALC_ENGINE_URL=http://localhost:8000 | CALC_TIMEOUT_MS=30000
S3_ENDPOINT= | S3_BUCKET= | S3_ACCESS_KEY= | S3_SECRET_KEY=
MAX_AUDIT_SESSIONS=5 | MAX_IMPORT_SIZE_MB=10 | MAX_SCENARIO_COMPARE=4
LOG_LEVEL=info
WEB_URL=https://app.jupiter-plan.com
```

### Documentation fonctions complexes
```typescript
/**
 * Clôture une période fiscale. Irréversible.
 * @throws PERIOD_HAS_PENDING_TX si transactions non validées
 * @throws BALANCE_MISMATCH si bilan déséquilibré
 */
async closePeriod(periodId: string, orgId: string): Promise<void> { ... }
```

### Monitoring
```typescript
// NestJS — log durée et résultat de chaque job
this.logger.log(`Import job ${job.id} done — inserted: N, skipped: M`);

// Python — log durée de chaque calcul
logger.info(f"KPI calc done in {time.time() - start:.2f}s — org: {org_id}")
```

---

## 11. ARCHITECTURE — NE PAS DÉVIER

```typescript
// controller → HTTP + guards + DTO uniquement
// service    → logique métier UNIQUEMENT
// repository → Prisma UNIQUEMENT

@Post(':id/approve')
approve(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
  return this.budgetService.approve(id, user.org_id, user.id);
}

async approve(id: string, orgId: string, userId: string) {
  const budget = await this.budgetRepository.findOne(id, orgId);
  if (budget.status !== BudgetStatus.SUBMITTED) {
    throw new BadRequestException({ code: 'BUDGET_NOT_SUBMITTABLE' });
  }
  return this.budgetRepository.updateStatus(id, BudgetStatus.APPROVED, userId);
}
```

---

## 12. BASE DE DONNÉES — RÈGLES PRISMA

```typescript
// ✅ Pagination obligatoire — DEFAULT_PAGE_LIMIT = 20
// ✅ Transaction pour opérations multi-tables
// ✅ Requêtes indépendantes en parallèle avec Promise.all
// ✅ include Prisma — jamais de boucle avec await (N+1)
// ✅ Jamais modifier une migration existante dans prisma/migrations/
// ✅ org_id toujours premier filtre de chaque requête
```

---

## 13. SCALABILITÉ

```typescript
// BullMQ — tout traitement > 2 secondes
@Post('upload') @HttpCode(202)
async upload(@Body() dto: UploadDto) {
  const job = await this.importQueue.add('process-excel', dto);
  return { job_id: job.id, status: 'PENDING' };
}

// Cache Redis avec TTL
await redis.setex(`kpis:${orgId}:${periodId}`, CACHE_TTL_KPI, JSON.stringify(result));

// TanStack Query — jamais useEffect + fetch manuel
const { data } = useQuery({
  queryKey: ['budget', budgetId, orgId],
  queryFn: () => budgetApi.findOne(budgetId),
  staleTime: 5 * 60 * 1000,
});
```

---

## 14. TESTS

```typescript
// Structure AAA : Arrange → Act → Assert
it('should throw BUDGET_NOT_SUBMITTABLE when status is not SUBMITTED', async () => {
  // Arrange
  jest.spyOn(repository, 'findOne').mockResolvedValue({ id: 'b1', status: BudgetStatus.DRAFT } as Budget);
  // Act
  const act = () => service.approve('b1', 'org1', 'u1');
  // Assert
  await expect(act).rejects.toThrow('BUDGET_NOT_SUBMITTABLE');
});

// Nommage : should [résultat] when [condition]
// Tester : logique services + cas d'erreur + validations DTOs + contrôles sécurité
```

---

## 15. NOMMAGE & FORMAT

```
Fonctions/variables → camelCase  | Classes/interfaces → PascalCase
Constantes → UPPER_SNAKE         | Fichiers backend → kebab-case
Fichiers frontend → PascalCase   | Tables DB → snake_case
Clés Redis → colon:case          | Routes API → /api/v1/kebab-case
```

---

## 16. CHECKLIST — AVANT DE VALIDER DU CODE

**Fonctionnel**
- [ ] `org_id` extrait du JWT, jamais du body/params
- [ ] Montants en `Decimal`, jamais `number`/`float`
- [ ] Calculs complexes dans Python CalcEngine, pas dans NestJS
- [ ] `findMany` avec pagination (`skip` + `take`)
- [ ] `select` Prisma explicite sur les tables sensibles
- [ ] Codes d'erreur métier explicites
- [ ] Tests unitaires pour la logique du service
- [ ] Zéro `console.log` (NestJS Logger)
- [ ] Traitement > 2s → BullMQ

**Sécurité [SecureByDesign TIER 3]**
- [ ] Inputs validés server-side (type, format, longueur, encoding) [SBD-01]
- [ ] Upload : MIME vérifié server-side, nom généré par serveur [SBD-01]
- [ ] Argon2id pour hachage mots de passe [SBD-04]
- [ ] JWT : `exp` présent, `alg` vérifié explicitement [SBD-04]
- [ ] Rate limiting sur /auth/login (5/min) [SBD-04 · SBD-11]
- [ ] Ownership vérifié sur chaque requête (org_id + user scope) [SBD-05]
- [ ] Default DENY — fail secure en cas d'exception [SBD-05 · SBD-21]
- [ ] Zéro secret dans le code source [SBD-07]
- [ ] Tokens générés avec crypto.randomBytes() ou secrets.token_hex() [SBD-08]
- [ ] `select` Prisma — jamais password_hash hors auth.repository [SBD-09]
- [ ] Logs : événement uniquement, jamais contenu des données [SBD-09 · SBD-10]
- [ ] Audit log créé pour approve / import / export / clôture [SBD-10]
- [ ] CORS restreint à WEB_URL uniquement [SBD-20]
- [ ] Headers Helmet (CSP, HSTS, X-Frame-Options) [SBD-03]
- [ ] Erreurs génériques pour l'utilisateur, détail dans les logs [SBD-13]
- [ ] npm audit --audit-level=high passé [SBD-14]
- [ ] Conformité ECOWAS / loi locale vérifiée si données PII [SBD-25]

---

*Ce fichier fait autorité. En cas de doute, appliquer la règle la plus stricte.*
*SecureByDesign v1.1.0 — TIER 3 REGULATED*
*Jupiter_Plan v1.0 — mars 2026*
