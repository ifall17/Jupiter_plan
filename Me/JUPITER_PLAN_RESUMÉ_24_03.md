# JUPITER_PLAN — RÉSUMÉ COMPLET POUR CONTINUITÉ IA
> **Version :** Mars 2026 — Résumé final incluant toutes les sessions  
> **Usage :** Donner ce fichier à un IA en début de conversation pour reprendre le contexte intégral  
> **Couvre :** Conception → Architecture → Développement → Débogage → Tests → Enrichissement → Données test

---

## 1. QUI EST L'UTILISATEUR

**Ibrahima** — Responsable FP&A basé à Dakar, Sénégal.

Il conçoit et développe **Jupiter_Plan**, une application SaaS FP&A pour PME d'Afrique de l'Ouest francophone.

### Méthode de travail
- **Claude** = architecte, chef de projet technique, générateur de prompts détaillés
- **GitHub Copilot** = générateur de code effectif (reçoit les prompts de Claude)
- **Ibrahima** = intégrateur, testeur, décideur produit

### Machine de développement
- Windows 11, PowerShell
- Python 3.9 installé (⚠️ 3.11 requis — voir section 17)
- PostgreSQL 16 installé localement (user: `crm_user`, pass: `crm_password`)
- Redis via Docker uniquement (un seul conteneur)
- Chemin projet : `C:\Users\ibras\Desktop\Jupiter_Plan\`

---

## 2. LE PROJET — JUPITER_PLAN

### Vision
SaaS FP&A multi-tenant pour PME africaines.  
Positionnement : **"Copilote financier des PME africaines"**  
Conformité SYSCOHADA native, FCFA (XOF/XAF), mobile-first, hébergé à Lagos (DigitalOcean < 30ms).

### Marché cible
- PME 10–500 employés : Sénégal, Côte d'Ivoire, Mali, Burkina Faso
- Secteurs : commerce, services, industrie légère, agro-industrie
- Prix cible : **50 000 – 150 000 FCFA/mois**

### Modules V1 (tous développés et testés)
| Module | Statut | Description |
|--------|--------|-------------|
| Auth | ✅ | Login, logout, session persistante via cookie HttpOnly |
| Budget | ✅ | Workflow DRAFT→LOCKED, reforecast, référence |
| Transactions | ✅ | Saisie manuelle + import Excel |
| Scénarios | ✅ | BASE/OPTIMISTE/PESSIMISTE + commentaires |
| Cash Flow | ✅ | Plan 13 semaines + analyse + ratios |
| KPIs | ✅ | 4 catégories enrichies + RadarChart |
| Alertes | ✅ | Seuils automatiques, marquer comme lue |
| Rapports | ✅ | PDF + Excel SYSCOHADA via CalcEngine Python |
| Utilisateurs | ✅ | Inviter, rôles, départements, activer/désactiver |
| Paramètres | ✅ | Organisation, profil, mot de passe |
| Dashboard | ✅ | Graphiques Recharts, KPIs temps réel |

### Business Model
```
STARTER          GROWTH           ENTERPRISE
50 000 FCFA/mois 100 000 FCFA/mois 150 000 FCFA/mois
5 utilisateurs   15 utilisateurs   Illimité
Modules de base  Tous les modules  Portail Auditeur + API
Export Excel     Export PDF+Excel  Formation incluse
Support email    Support priorité  Support dédié
```

**Revenus additionnels :** Formation (150K FCFA/client), Consulting FP&A (200K FCFA/jour), Intégrations sur mesure (500K–2M FCFA), Portail Auditeur (25K FCFA/accès)

---

## 3. STACK TECHNOLOGIQUE (DÉCISION FINALE)

| Couche | Technologie | Justification |
|--------|-------------|---------------|
| Backend CRUD | NestJS 10 + TypeScript + Prisma 5 | Architecture modulaire, types auto-générés |
| Moteur de calcul | Python 3.11 + FastAPI + Pandas | Decimal exact, calculs financiers précis |
| Base de données | PostgreSQL 16 | ACID, Decimal natif, Row-Level Security |
| Cache / Queue | Redis 7 + BullMQ | Sessions JWT, jobs async |
| Temps réel | Socket.io | Progression imports et calculs |
| Jobs planifiés | node-cron (NestJS) | Recalcul KPIs nuit |
| Frontend | React 18 + Vite + TypeScript | Écosystème riche |
| CSS | TailwindCSS | Design system cohérent |
| State | Zustand + TanStack Query | Auth mémoire, cache serveur |
| Graphiques | **Recharts** | AreaChart, BarChart, PieChart, RadarChart |
| Forms | React Hook Form + Zod | Validation typée |
| Stockage fichiers | S3-compatible (DigitalOcean Spaces) | Fichiers hors web root |
| Infra | Docker + Kubernetes + DigitalOcean Lagos | < 30ms depuis Dakar |

### Règle fondamentale — Séparation NestJS / Python
```
NestJS  → Auth, CRUD, orchestration, queues, WebSocket, cron
Python  → Calculs KPIs, snapshots IS/BS/CF, scénarios,
          import Excel, génération PDF/Excel SYSCOHADA

Flux : NestJS → BullMQ → Python calcule (Decimal)
       → écrit DB → NestJS notifie via Socket.io

[SBD-03] JAMAIS de calculs financiers dans NestJS
```

---

## 4. STRUCTURE MONOREPO

```
jupiter_plan/
├── apps/
│   ├── api/          ← NestJS 10 (port 3001)
│   ├── calc/         ← Python FastAPI (port 8000)
│   └── web/          ← React 18 + Vite (port 5173)
├── packages/
│   └── shared/       ← Types, Enums partagés (→ copiés dans web/src/types/)
├── .github/
│   └── copilot-instructions.md
├── docker-compose.yml
├── .env
└── JUPITER_PLAN_CONTEXT.md
```

### apps/api — Modules NestJS
```
src/modules/
├── auth/         → login, refresh (cookie), logout, change-password
├── users/        → CRUD, invite, toggle, rôles, départements
├── organizations → current, update
├── fiscal-years/ → périodes, current
├── periods/      → findAll, current
├── budgets/      → CRUD, submit, approve, reject, lock,
│                   set-reference, variance, parent_budget_id
├── transactions/ → CRUD, validate-batch
├── imports/      → upload (xlsx), preview, confirm, status polling
├── cash-flow/    → plans CRUD, analysis, bank-accounts
├── scenarios/    → CRUD, hypotheses, calculate, save, compare (max 4)
├── kpis/         → values (par période/mode), calculate, seedDefaultKpis
├── alerts/       → findAll (filtre période), markAsRead, markAllAsRead
├── dashboard/    → getData, getMonthly, financial-statements
├── reports/      → generate (délègue CalcEngine)
└── comments/     → CRUD par entity_type + entity_id
```

### apps/calc — Python FastAPI
```
├── main.py
├── routers/
│   ├── kpis.py
│   ├── reports.py      ← génération PDF (fpdf2) + Excel (openpyxl)
│   └── imports.py
├── services/
│   ├── kpi_calculator.py      ← EnrichedKpiCalculator (14 KPIs)
│   └── scenario_engine.py
├── utils/
│   ├── decimal_utils.py       ← to_decimal(), safe_divide()
│   ├── syscohada.py           ← is_valid_syscohada()
│   └── syscohada_mapping.py   ← mapping complet CR+Bilan+CF
└── templates/
    ├── Compte_de_resultat.xlsx ← template SYSCOHADA officiel
    ├── Bilan.xlsx
    └── Flux_de_Tresorerie.xlsx
```

### apps/web — React
```
src/
├── stores/
│   ├── auth.store.ts     ← tokens mémoire + tryRefresh() [SBD-04]
│   └── period.store.ts   ← store global période (mode/quarter/custom/YTD)
├── components/
│   ├── layout/Topbar.tsx ← sélecteur période global dropdown
│   └── comments/CommentSection.tsx
├── features/
│   ├── dashboard/        ← AreaChart + PieChart + BarChart (Recharts)
│   ├── budget/           ← liste + détail + workflow + référence
│   ├── transactions/     ← liste + saisie + import Excel
│   ├── scenarios/        ← CRUD + hypothèses + commentaires
│   ├── cashflow/         ← 3 onglets (plan/analyse/ratios)
│   ├── kpis/             ← 4 catégories + RadarChart + interprétations
│   ├── alerts/
│   ├── reports/          ← 6 types PDF/Excel
│   ├── users/
│   └── settings/
└── api/client.ts         ← withCredentials: true (cookies)
```

---

## 5. SÉCURITÉ — SECUREBYDESIGN TIER 3

Classification : **TIER 3 REGULATED** (fintech, données financières)

### 10 règles non négociables
| # | Règle | Code |
|---|-------|------|
| 1 | `org_id` extrait du JWT uniquement — jamais du body | SBD-05 |
| 2 | Montants en `Decimal` — jamais `float` | SBD-09 |
| 3 | Calculs dans Python CalcEngine uniquement | SBD-03 |
| 4 | Argon2id pour les mots de passe | SBD-04 |
| 5 | Tokens avec `crypto.randomBytes(32)` | SBD-04 |
| 6 | Default DENY — fail secure en cas d'exception | SBD-21 |
| 7 | Zéro secret dans le code source | SBD-07 |
| 8 | Logs : événement uniquement — jamais données | SBD-10 |
| 9 | Traitement > 2s → BullMQ | — |
| 10 | CORS restreint à WEB_URL — jamais `*` | — |

### Session et tokens (frontend)
- **Access token** : mémoire Zustand uniquement
- **Refresh token** : cookie HttpOnly (path: `/api/v1/auth/refresh`)
- **Au chargement** : `tryRefresh()` dans App.tsx → persistence de session
- **`withCredentials: true`** sur toutes les requêtes Axios
- `ProtectedRoute` bloque AVANT tout rendu (zéro flash)
- Isolation cross-tenant : **404 jamais 403**

### Conformité
- ECOWAS Supplementary Act (2010)
- Sénégal Loi 2008-12 CDPD
- Côte d'Ivoire Loi 2013-450

---

## 6. RÔLES & PERMISSIONS

```
SUPER_ADMIN  → Paramétrage, droits, accès total, bypass tous les role checks
FPA          → Modélisation, budget, forecast, rapports, scénarios
CONTRIBUTEUR → Saisie données de son département uniquement (scopé)
LECTEUR      → Dashboard consolidé, lecture seule, pas d'hypothèses
AUDITEUR     → Portail séparé audit.jupiter-plan.com, max 5 actifs/org
```

**Points clés :**
- `CONTRIBUTEUR` scopé par `user_department_scope` (département unique)
- `LECTEUR` ne voit PAS les hypothèses des scénarios
- Menu navigation filtré côté client (UX seulement) — sécurité réelle côté NestJS guards

---

## 7. WORKFLOWS MÉTIER VALIDÉS

### Budget (workflow complet ✅)
```
DRAFT → SUBMITTED → APPROVED → LOCKED
              ↘ REJECTED → correction → SUBMITTED
```
- Budget vide (0 lignes) → non verrouillable
- Budget LOCKED → jamais modifiable (même SUPER_ADMIN)
- `is_reference` : un seul budget de référence par exercice
- `parent_budget_id` : généalogie reforecast (V1 → V2 → V3)
- Commentaire obligatoire en cas de rejet
- Option B future : invitation contributeurs par département

### Import Transactions (✅)
```
Upload xlsx → PENDING → validation SYSCOHADA → aperçu
→ confirmation → PROCESSING → DONE/FAILED
```
- Traitement en mémoire — jamais sur disque [SBD-09]
- Rejet si > 50% lignes invalides
- En dev : NestJS traite avec `xlsx` directement
- En prod : CalcEngine Python avec openpyxl + Decimal

### Scénarios (✅)
```
Budget APPROVED → hypothèses → BullMQ → Python IS+BS+CF
→ CALCULATED → SAVED
```
- Max **4 scénarios** comparés simultanément
- Commentaires sur scénarios ET hypothèses (CommentSection)
- Base budget jamais modifiée (copie profonde)

### Clôture Période (✅)
```
Transactions validées → snapshot → CLOSED (irréversible)
```
- `BALANCE_MISMATCH` bloque (tolérance 0.01 FCFA)
- Période suivante → OPEN automatiquement

### Cash Flow Plans (✅)
- Saisie manuelle avec 8 types de flux
- Suppression possible
- Analyse automatique (taux couverture, runway, top flux)

---

## 8. SCHÉMA BASE DE DONNÉES (18+ TABLES)

| Couche | Tables | Champs clés |
|--------|--------|-------------|
| Organisation | organizations | name, country, currency |
| Auth | users, user_department_scope, audit_logs | password_hash (Argon2id) |
| Fiscal | fiscal_years, periods | period_number, status |
| Budget | budgets, budget_lines | status, is_reference, parent_budget_id |
| Transactions | transactions, import_jobs | account_code, amount (Decimal), is_validated |
| Trésorerie | bank_accounts, cash_flow_plans | direction (IN/OUT), flow_type |
| Scénarios | scenarios, scenario_hypotheses, financial_snapshots | scenario_id nullable |
| KPIs | kpis, kpi_values, alerts | category, description, threshold_warn/critical |
| Commentaires | comments | entity_type, entity_id, content |

**Règles Decimal :** `Decimal(18,2)` partout — jamais float  
**scenario_id nullable :** null = données réelles, valeur = simulation

---

## 9. SÉLECTEUR DE PÉRIODE GLOBAL

**Store Zustand (`period.store.ts`) :**
```typescript
type PeriodMode = 'single' | 'ytd' | 'quarter' | 'custom'

interface PeriodStore {
  currentPeriod:   Period | null
  currentPeriodId: string
  mode:            PeriodMode
  quarterNumber:   number | null  // 1, 2, 3, 4
  customFrom:      string | null  // period_id début
  customTo:        string | null  // period_id fin
}
```

**Topbar — sélecteur dropdown :**
```
📊 Période courante (YTD) → Jan → mois actuel
── Trimestres ──
T1 — Jan → Mar | T2 — Avr → Jun
T3 — Jul → Sep | T4 — Oct → Déc
── Plage personnalisée ──
📅 Définir une plage... (modal De/À)
── Mois ──
P01 Janvier ... P12 Décembre  [badge EN COURS]
```

**Toutes les pages lisent `usePeriodStore()`** — aucun sélecteur local dupliqué  
**Exception :** Transactions garde un filtre local pour zoomer dans une vue YTD

**Fonction `getPeriodParams()` utilisée dans toutes les pages :**
```typescript
function getPeriodParams() {
  switch (mode) {
    case 'ytd':     return { ytd: true }
    case 'quarter': return { quarter: quarterNumber }
    case 'custom':  return { from_period: customFrom, to_period: customTo }
    default:        return { period_id: currentPeriodId }
  }
}
```

---

## 10. KPIs ENRICHIS — 4 CATÉGORIES

### Structure page KPIs
```
Onglet Tous        → 5 KPIs principaux + RadarChart (Recharts)
Onglet Rentabilité → 4 cards (sans radar)
Onglet Activité    → 2 cards (sans radar)
Onglet Efficience  → 2 cards (sans radar)
Onglet Liquidité   → 2 cards (sans radar)
```

### Catalogue complet des KPIs

| Catégorie | Code | Libellé | Formule | Seuil Warn | Seuil Critical |
|-----------|------|---------|---------|------------|----------------|
| PROFITABILITY | CA | Chiffre d'Affaires | Σ REVENUE | — | — |
| PROFITABILITY | GROSS_MARGIN | Marge Brute | (CA-Achats601)/CA×100 | 30% | 15% |
| PROFITABILITY | OPERATING_MARGIN | Marge Opérationnelle | Résultat expl/CA×100 | 10% | 5% |
| PROFITABILITY | ROA | Return on Assets | Net/Actif×100 | 5% | 2% |
| ACTIVITY | DSO | Délai Clients | (Créances/CA)×365 | 60j | 90j |
| ACTIVITY | DPO | Délai Fournisseurs | (Dettes/Achats)×365 | — | — |
| EFFICIENCY | ROA | Return on Assets | Net/Actif×100 | 5% | 2% |
| EFFICIENCY | ROCE | Return on Capital Employed | EBIT/Capital×100 | 10% | 5% |
| LIQUIDITY | QUICK_RATIO | Quick Ratio | (Actif CT-Stocks)/Passif CT | 1.0x | 0.5x |
| LIQUIDITY | CURRENT_RATIO | Current Ratio | Actif CT/Passif CT | 1.5x | 1.0x |
| LIQUIDITY | RUNWAY | Runway Trésorerie | Cash/Burn hebdo | 8 sem | 4 sem |
| LIQUIDITY | BFR | Besoin Fonds Roulement | Créances+Stocks-Dettes | — | — |

### Cards avec enrichissement
- Barre de progression vers le seuil d'alerte
- Interprétation contextuelle (✅ ⚠️ 🔴)
- Description de la formule
- Badge statut (OK/WARN/CRITICAL)

---

## 11. DASHBOARD — GRAPHIQUES RECHARTS

**3 graphiques + tableau variance :**

```jsx
// 1. Évolution mensuelle — AreaChart avec dégradés
<AreaChart data={monthly}>
  <Area dataKey="revenue"  stroke="#2d6a4f" fill="url(#colorRevenue)" />
  <Area dataKey="expenses" stroke="#c4622d" fill="url(#colorExpenses)" />
  <Line dataKey="ebitda"   stroke="#b8963e" strokeDasharray="5 3" />
</AreaChart>

// 2. Répartition charges — PieChart donut
<PieChart>
  <Pie innerRadius={55} outerRadius={85}
       dataKey="value" nameKey="name" paddingAngle={3} />
</PieChart>

// 3. Budget vs Réel par département — BarChart groupé
<BarChart data={budgetVsActual}>
  <Bar dataKey="budget" fill="#e8e2d9" radius={[4,4,0,0]} />
  <Bar dataKey="actual" fill="#c4622d" radius={[4,4,0,0]} />
</BarChart>

// 4. Tableau variance Budget vs Réel
// Variance = ((réel - budget) / budget) × 100
// Affichage : +5.53% en kola, -4.9% en terra
```

**Endpoint backend** : `GET /api/v1/dashboard/monthly`  
→ Retourne : `{ monthly[], expensesByDept[], budgetVsActualByDept[] }`

---

## 12. CASH FLOW — 3 ONGLETS

```
Onglet 1 : Plan Glissant
  → Tableau 13 semaines (S1→S13) avec scroll horizontal
  → 4 lignes : Entrées / Sorties / Solde net / Solde cumulé
  → Liste flux planifiés avec bouton Supprimer

Onglet 2 : Analyse
  → 3 KPIs cards : Trésorerie nette, Taux couverture, Runway
  → BarChart flux par type (IN vs OUT)
  → AreaChart trésorerie nette 13 semaines + ReferenceLine y=0
  → Top 5 entrées / Top 5 sorties

Onglet 3 : Ratios
  → 6 ratios avec seuils good/warn/critical :
    Coverage, Burn Rate, Cash Conversion Cycle,
    Inflow Concentration, Runway, CF Opérationnel
```

---

## 13. MAPPING SYSCOHADA COMPLET

**Fichier** : `apps/calc/utils/syscohada_mapping.py`

### Compte de Résultat — lignes + agrégats en cascade
```python
CR_MAPPING = {
    # Produits
    'TA': ('Ventes marchandises',     ['701'], '+'),
    'TB': ('Produits fabriqués',      ['702'], '+'),
    'TC': ('Travaux, services',       ['703','706'], '+'),
    'TD': ('Produits accessoires',    ['704','705','707','708'], '+'),
    'TG': ("Subventions exploit.",    ['71','74'], '+'),
    'TH': ('Autres produits',         ['75'], '+'),
    'TK': ('Revenus financiers',      ['762','771','772','773','776','778'], '+'),
    'TN': ('Produits cessions immo',  ['82'], '+'),
    # Charges
    'RA': ('Achats marchandises',     ['601'], '-'),
    'RC': ('Achats matières prem.',   ['602'], '-'),
    'RE': ('Autres achats',           ['604','605'], '-'),
    'RG': ('Transports',              ['625'], '-'),
    'RH': ('Services extérieurs',     ['621','622','623','624','626','627','628'], '-'),
    'RI': ('Impôts et taxes',         ['63'], '-'),
    'RJ': ('Autres charges',          ['65'], '-'),
    # ⚠️ RK inclut 621xxx (salaires) ET 641xxx
    'RK': ('Charges de personnel',   ['621','622','641','642','643','644','645','646'], '-'),
    'RL': ('Dotations amort.',        ['681','691'], '-'),
    'RM': ('Frais financiers',        ['661','662','663','671','672','673','674','676','677'], '-'),
    'RS': ('Impôts sur résultat',     ['89'], '-'),
}

# Agrégats en cascade (ordre obligatoire)
CR_AGGREGATS = {
    'XA': lambda r: r['TA'] - r['RA'] - r.get('RB',0),
    'XB': lambda r: r['XA'] + r.get('TB',0) + r.get('TC',0) + r.get('TD',0),
    'XC': lambda r: r['XB'] + somme_produits - somme_charges_intermediaires,
    'XD': lambda r: r['XC'] - r['RK'],                    # EBE
    'XE': lambda r: r['XD'] + r.get('TJ',0) - r['RL'],   # Résultat exploitation
    'XF': lambda r: r.get('TK',0) - r.get('RM',0),       # Résultat financier
    'XG': lambda r: r['XE'] + r['XF'],                    # Résultat AO
    'XH': lambda r: r.get('TN',0) - r.get('RO',0),       # Résultat HAO
    'XI': lambda r: r['XG'] + r['XH'] - r.get('RQ',0) - r.get('RS',0),  # Net
}
```

### Bilan Actif — 17 lignes
```python
BILAN_ACTIF_MAPPING = {
    # ⚠️ AM inclut 215xxx ET 218xxx
    'AM': ('Matériel, mobilier',   ['215','218','244','245','246','247','248'], 'ACTIF_IMMO'),
    'BB': ('Stocks',               ['31','32','33','34','35','36','37','38'], 'ACTIF_CIRC'),
    'BI': ('Clients',              ['411','412','413','416','417','418'], 'ACTIF_CIRC'),
    'BS': ('Banques, caisses',     ['521','531','571','572','581'], 'TRESORERIE'),
    ...
}
# Agrégats : AZ (Actif immobilisé), BK (Actif circulant), BT (Trésorerie), BZ (Total)
```

### Bilan Passif — 12 lignes
```python
BILAN_PASSIF_MAPPING = {
    'CA': ('Capital social',  ['101','102','103','104','105','106'], 'CAPITAUX'),
    'CI': ('Résultat net',    [],  'CAPITAUX'),  # ← calculé depuis CR (= XI)
    'DA': ('Emprunts',        ['161','162','163','164','165','166','167','168'], 'DETTES_FIN'),
    'EC': ('Fournisseurs',    ['401','402','403','404','405','406','407','408'], 'PASSIF_CIRC'),
    'ED': ('Dettes fiscales', ['431','432','433','434','441','442','443','444'], 'PASSIF_CIRC'),
    ...
}
# Agrégats : CP (Capitaux propres), DF (Dettes fin.), DG (Ressources stables),
#            EK (Passif circulant), BZ_P (Total Passif)
```

### Flux de Trésorerie
```python
CF_CALCUL = {
    'FA':  CAFG = Résultat net + Dotations - Reprises,
    'ZB':  Flux opérationnel = CAFG - variation BFR,
    'ZC':  Flux investissement = -décaissements immo,
    'ZD':  Flux capitaux propres,
    'ZE':  Flux capitaux étrangers,
    'ZF':  Flux financement = ZD + ZE,
    'ZG':  Variation trésorerie = ZB + ZC + ZF,
    'ZH':  Trésorerie fin = ZG + ZA (solde N-1),
}
```

**Vérification équilibre :** `|Actif - Passif| ≤ 0.01 FCFA`

---

## 14. GÉNÉRATION DE RAPPORTS

### Architecture
```
Frontend → POST /api/v1/reports/generate
                 ↓
NestJS
  → Vérifie JWT + org_id
  → Collecte données Prisma (transactions, CF plans, KPIs)
  → POST http://localhost:8000/reports/generate
                 ↓
Python CalcEngine
  → compute_financial_statements() avec Decimal
  → fill_syscohada_template() avec openpyxl
    → remplit les REF (TA, XB, XD, XI...) dans le template
  → generate_pdf() avec fpdf2
  → retourne fichier binaire
                 ↓
NestJS → retourne le fichier (arraybuffer)
                 ↓
Frontend → téléchargement automatique
```

### 6 types de rapports disponibles
| Type | Format | Template |
|------|--------|----------|
| pl | Excel + PDF | Compte_de_resultat.xlsx SYSCOHADA |
| balance_sheet | Excel + PDF | Bilan.xlsx SYSCOHADA |
| cash_flow | Excel + PDF | Flux_de_Tresorerie.xlsx SYSCOHADA |
| budget_variance | Excel + PDF | Généré dynamiquement |
| transactions | Excel + PDF | Généré dynamiquement |
| kpis | Excel + PDF | Généré dynamiquement |

**PDF :** fpdf2 avec couleurs finpilot_v3 (terra/kola/gold), pied de page confidentiel  
**Excel :** openpyxl, montants `#,##0`, en-têtes formatés, freeze_panes

---

## 15. DESIGN SYSTEM — FINPILOT V3

```css
:root {
  --ink:        #1a1a2e;  /* texte principal */
  --terra:      #c4622d;  /* couleur principale / accent */
  --terra-lt:   #f0e8e2;
  --gold:       #b8963e;  /* secondaire / warning */
  --gold-lt:    #f5edd8;
  --kola:       #2d6a4f;  /* succès / positif */
  --kola-lt:    #dff0e8;
  --indigo:     #3d5a99;  /* info */
  --indigo-lt:  #e2e8f5;
  --page:       #faf8f4;  /* fond ivoire chaud */
  --surface:    #ffffff;
  --surface2:   #f4f1ec;
  --border:     #e8e2d9;
  --text-md:    #5a5570;
  --text-lo:    #9990a8;
  --font-serif: 'DM Serif Display', Georgia, serif;
  --font-body:  'Outfit', 'Segoe UI', sans-serif;
  --shadow-sm:  0 1px 3px rgba(26,26,46,0.06);
  --shadow-md:  0 4px 16px rgba(26,26,46,0.08);
}
```

**Règles UI :**
- KPI cards : bande colorée latérale gauche 4px
- Alertes : CRITICAL=terra, WARN=gold, OK=kola, INFO=indigo
- Montants : `formatFCFA()` → "50 000 000 FCFA"
- Dates : `formatDate()` en français → "12 mars 2026"
- Timezone : Africa/Dakar (UTC+0)
- `data-testid` obligatoire sur tous les éléments testables (Playwright)
- Motif géométrique West African en fond (repeating-linear-gradient)

---

## 16. ENVIRONNEMENT DE DÉVELOPPEMENT

### Démarrage (procédure validée)
```bash
# Terminal 1 — Redis
docker run -d --name jupiter_redis -p 6379:6379 redis:7-alpine

# Terminal 2 — NestJS API
cd apps/api && npm run start:dev          # port 3001

# Terminal 3 — CalcEngine Python (optionnel en dev)
cd apps/calc && uvicorn main:app --reload --port 8000

# Terminal 4 — Frontend
cd apps/web && npm run dev                # port 5173

# Ouvrir : http://localhost:5173
# Login  : admin@diallo.sn / TestPassword123!
```

### apps/api/.env (configuré)
```env
DATABASE_URL=postgresql://crm_user:crm_password@localhost:5432/jupiter_plan
REDIS_URL=redis://localhost:6379
NODE_ENV=development
PORT=3001
JWT_SECRET=jupiter-plan-jwt-secret-dev-minimum-32-chars
JWT_REFRESH_SECRET=jupiter-plan-refresh-secret-dev-minimum-32
JWT_ACCESS_EXPIRY=8h
JWT_REFRESH_EXPIRY=30d
CALC_ENGINE_URL=http://localhost:8000
WEB_URL=http://localhost:5173
MAX_IMPORT_SIZE_MB=10
MAX_SCENARIO_COMPARE=4
LOG_LEVEL=info
```

### apps/calc/.env (configuré)
```env
DATABASE_URL=postgresql://crm_user:crm_password@localhost:5432/jupiter_plan
REDIS_URL=redis://localhost:6379
CALC_PORT=8000
NODE_ENV=development
NESTJS_INTERNAL_URL=http://localhost:3001
LOG_LEVEL=info
```

### vite.config.ts (proxy configuré)
```typescript
server: {
  proxy: {
    '/api': { target: 'http://localhost:3001', changeOrigin: true }
  }
}
```

---

## 17. PROBLÈMES RÉSOLUS

| # | Erreur | Cause | Solution |
|---|--------|-------|---------|
| P1 | `Missing script: start:dev` | Scripts NestJS absents | Ajouter `start:dev`, `prebuild`, `nest-cli.json` |
| P2 | `404 http://localhost:5173/` | `index.html` manquant | Créer `apps/web/index.html` avec div#root |
| P3 | `RuntimeError: DATABASE_URL is required` | `.env` absent dans calc | Créer `apps/calc/.env` |
| P4 | `env file .env not found` | `.env` absent à la racine | Créer `.env` racine avec variables Docker |
| P5 | `Cannot find module @shared/enums` | Docker ne voit pas packages/shared | Copier enums dans `apps/web/src/types/enums.ts` |
| P6 | `POST localhost:5173/api → 500` | Proxy Vite non configuré | Ajouter proxy dans `vite.config.ts` |
| P7 | Session perdue au refresh | Tokens en mémoire seulement | Cookie HttpOnly + `tryRefresh()` dans App.tsx |
| P8 | Menu dropdown superposé | CSS position manquant | `position: absolute`, `z-index: 200`, `useEffect` clic extérieur |
| P9 | Budget lines non cliquables | Pas de onClick ni route | `onClick → navigate(/budget/:id)` + BudgetDetailPage |
| P10 | Import Excel → `file is required` | FormData mal envoyé | `new FormData()`, `Content-Type: undefined`, `withCredentials: true` |
| P11 | Import → `Cannot read Workbook` | CalcEngine absent | NestJS traite xlsx directement avec `npm install xlsx` |
| P12 | KPI calculate → 404 | Module KPIs non importé | Créer KpisModule + importer dans AppModule |
| P13 | Select global n'affecte pas les pages | Pas de store global | Créer `period.store.ts` + connecter toutes les pages |
| P14 | Variance budget = `-5000000%` | Calcul différence brute | `((réel - budget) / budget) × 100` |
| P15 | Rapport généré dans NestJS | Violation SBD-03 | Déléguer au CalcEngine Python via HTTP |

---

## 18. ÉTAT D'AVANCEMENT ROADMAP

### Phase 1 — Fondations ✅ COMPLÈTE
Étapes 1-8 : monorepo, Docker, Prisma, Auth, Users, Config, Frontend, Layout

### Phase 2 — Modules métier ✅ COMPLÈTE
Étapes 9-14 : Budget, Transactions, CalcEngine, Cash Flow, Scénarios, Dashboard

### Phase 2.5 — Tests (prompts générés) ✅
- ✅ Étape 15 → Tests intégration NestJS
- ✅ Étape 15.1 → Docker Compose test (ports 5433/6380)
- ✅ Étape 16 → Tests E2E API (Supertest)
- ✅ Étape 17 → Tests Python CalcEngine (pytest)
- ✅ Étape 18 → Tests Frontend (Vitest + RTL)
- ✅ Étape 18.5 → Tests Playwright (vrai navigateur)
- ⏳ **Étape 19 → Smoke tests complets** (PROCHAINE)

### Phase 2.6 — Tests interfaces ✅ TOUS VALIDÉS
Auth, Budget, Transactions, Scénarios, Cash Flow, KPIs, Alertes, Rapports, Utilisateurs, Paramètres

### Phase 2.7 — Enrichissements ✅
- ✅ Dashboard → graphiques Recharts (AreaChart, PieChart, BarChart)
- ✅ KPIs enrichis → 4 catégories + RadarChart + interprétations
- ✅ Cash Flow → 3 onglets (plan/analyse/ratios)
- ✅ Mapping SYSCOHADA complet (CR + Bilan + CF)
- ✅ Commentaires sur scénarios et hypothèses
- ✅ Sélecteur période global (YTD/T1-T4/plage)
- ✅ Budget référence + reforecast

### Phase 3 — Production ⏳ PENDING
- ⏳ Étape 20 → Module Rapports async (BullMQ)
- ⏳ Étape 21 → Portail Auditeur séparé
- ⏳ Étape 22 → Monitoring + alertes infra
- ⏳ Étape 23 → CI/CD + Kubernetes DigitalOcean Lagos

---

## 19. DONNÉES DE DÉMONSTRATION (SEED)

### Organisation seed
- **Nom :** Diallo & Frères SARL
- **Pays :** Sénégal (SN) | **Devise :** XOF (FCFA)
- **Exercice :** FY2026 (P01 Janvier → P12 Décembre)

### Utilisateurs seed
| Prénom | Email | Rôle | Département |
|--------|-------|------|-------------|
| Mamadou Diallo | admin@diallo.sn | SUPER_ADMIN | — |
| Aminata Sow | fpa@diallo.sn | FPA | — |
| Ibrahima Fall | contrib@diallo.sn | CONTRIBUTEUR | VENTES |
| Fatou Ndiaye | lecteur@diallo.sn | LECTEUR | — |

### Budget seed (Budget FY2026 V1 — APPROVED)
10 lignes, total budgété : **1 195 000 000 FCFA**

---

## 20. FICHIER DE TEST PME — SARL INDUSTRIE SÉNÉGAL

**Fichier généré :** `jupiter_plan_test_complet.xlsx`

### Caractéristiques de la PME test
- **Secteur :** Industrie légère (transformation alimentaire)
- **Taille :** Moyenne PME (200M–1Md FCFA CA)
- **CA annuel :** 520 000 000 FCFA
- **Charges :** 430 716 668 FCFA
- **EBITDA :** 89 283 332 FCFA (17.2%)
- **Résultat net estimé :** 67 283 332 FCFA
- **Trésorerie nette :** 213 000 000 FCFA

### Structure du fichier (7 feuilles)
| Feuille | Contenu |
|---------|---------|
| 1_BUDGET | 17 lignes budgétaires (codes SYSCOHADA) |
| 2_TRANSACTIONS | 156 transactions sur 12 mois (format import) |
| 3_CASH_FLOW | 16 flux de trésorerie planifiés |
| 4_SCENARIOS | Hypothèses BASE / OPTIMISTE / PESSIMISTE |
| 5_SORTIES_ATTENDUES | KPIs et états financiers attendus |
| 6_ALERTES_ATTENDUES | Seuils et alertes qui doivent se déclencher |
| 7_GUIDE_TEST | 15 étapes de test avec résultats attendus |

### Sorties attendues après test
```
XB (CA)          = 520 000 000 FCFA
XD (EBE)         = 89 283 332 FCFA   (marge 17.2%)
XI (Résultat net)= 67 283 332 FCFA
Bilan équilibré  = ✅ Actif = Passif (écart < 0.01 FCFA)
Current Ratio    = ~1.8x
Quick Ratio      = ~1.3x
DSO              = ~42 jours
Runway           = ~13 semaines
```

---

## 21. CONSTANTES MÉTIER

```typescript
MAX_AUDIT_SESSIONS   = 5
MAX_SCENARIO_COMPARE = 4
MAX_IMPORT_SIZE_MB   = 10
CACHE_TTL_KPI        = 300  // secondes
JWT_ACCESS_EXPIRY    = '8h'
JWT_REFRESH_EXPIRY   = '30d'
DEFAULT_PAGE_LIMIT   = 20
DEFAULT_CURRENCY     = 'XOF'
LOGIN_RATE_LIMIT     = 5    // tentatives
BRUTE_FORCE_LOCKOUT  = 900  // secondes (15 min)
BALANCE_TOLERANCE    = 0.01 // FCFA
```

---

## 22. CONVENTIONS DU PROJET

```
org_id      → toujours depuis le JWT [SBD-05]
Montants    → Decimal(18,2), affichage formatFCFA()
Dates       → Africa/Dakar (UTC+0), formatDate() en français
Erreurs API → codes métier (ex: BUDGET_NOT_SUBMITTABLE, BUDGET_LOCKED)
Routes API  → /api/v1/kebab-case
data-testid → sur tous les éléments testés (Playwright)
Tests       → structure AAA : Arrange / Act / Assert
Logs        → NestJS Logger / Python logging — jamais console.log
Commits     → feat(module): description
Branches    → feat/module-description
Float       → JAMAIS pour les montants financiers
```

---

## 23. NOTE COMPATIBILITÉ PYTHON 3.9

Ibrahima a Python **3.9** installé (requis : 3.11).  
Copilot doit générer du code compatible Python 3.9 :

```python
# ❌ Python 3.10+        # ✅ Python 3.9
list[str]               List[str]
str | None              Optional[str]
str | int               Union[str, int]
dict[str, int]          Dict[str, int]
```

---

## 24. PROCHAINES ÉTAPES

```
IMMÉDIAT
  → Tester l'application avec jupiter_plan_test_complet.xlsx
    (suivre les 15 étapes du guide de test)
  → Vérifier que les états financiers SYSCOHADA
    sont corrects après import des transactions

COURT TERME
  → Étape 19 : Smoke tests complets
  → Option B budget : invitation contributeurs par département
    (tableau de suivi, notifications, vue contributeur scopée)

MOYEN TERME (Phase 3 — Production)
  → Étape 20 : Rapports async BullMQ
  → Étape 21 : Portail Auditeur séparé (audit.jupiter-plan.com)
  → Étape 22 : Monitoring Datadog + alertes infra
  → Étape 23 : CI/CD GitHub Actions + Kubernetes DigitalOcean Lagos

LONG TERME
  → App mobile React Native (CEO dashboard)
  → Intégration Sage / logiciels comptables locaux
  → Expansion UEMOA : Côte d'Ivoire, Mali, Burkina Faso
  → API pour banques et fintechs partenaires
```

---

*Jupiter_Plan — Résumé complet de continuité IA*  
*Généré le 24 mars 2026*  
*Toutes les décisions d'architecture, corrections de bugs,*  
*enrichissements fonctionnels et données de test inclus.*
