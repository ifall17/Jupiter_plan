# Threat Model TIER 3 - Jupiter_Plan

Version: 1.0
Date: 2026-03-09
Owner: Engineering / Security
Scope: SaaS FP&A multi-tenant (NestJS API, React web, Python calc engine, PostgreSQL, Redis, BullMQ)

## 1. System Classification
- Tier: TIER 3 REGULATED (financial data, multi-tenant)
- Data class: sensitive financial records and organizational planning data
- Core principle: fail-secure for all authz/authn decisions

## 2. Critical Assets
- A1: User identities, roles, session tokens, refresh-token material
- A2: Tenant-scoped financial data (budgets, transactions, forecasts, snapshots)
- A3: Audit logs and compliance evidence
- A4: Calculation integrity outputs (KPIs, scenarios)
- A5: Secrets and infrastructure credentials

## 3. Adversaries
- External attacker (credential stuffing, brute-force, token theft)
- Malicious tenant user (horizontal/vertical privilege escalation)
- Insider with infrastructure access
- Supply-chain attacker via dependency compromise

## 4. Trust Boundaries
- B1: Browser <-> API (public boundary)
- B2: API <-> Redis/PostgreSQL (internal data boundary)
- B3: API <-> Calc engine queue/worker boundary
- B4: CI/CD pipeline <-> production deployment boundary

## 5. Primary Threat Scenarios
- T1: Brute-force and session abuse on /auth endpoints
  - Mitigations: throttling, login-attempt counters, fail-secure on anti-abuse dependency failure
- T2: Multi-tenant data leakage across org_id
  - Mitigations: OrgGuard, repository where filters on org_id, not-found semantics
- T3: Privilege escalation by role tampering
  - Mitigations: JWT signature + alg enforcement, roles guard, deny-by-default
- T4: Refresh token replay
  - Mitigations: hashed refresh token storage in Redis + rotation + invalidation on logout/password change
- T5: Data integrity corruption via untrusted input
  - Mitigations: ValidationPipe whitelist/forbidNonWhitelisted + DTO validation
- T6: Supply-chain compromise
  - Mitigations: mandatory CI security gate (build/typecheck/audit high+)

## 6. Mandatory Security Controls for Go-Live
- C1: Strict CORS allowlist from validated WEB_URL only
- C2: Env hard-fail for JWT secrets, Redis password, DB URL, WEB_URL
- C3: Auth anti-bruteforce must fail-secure when Redis unavailable
- C4: Tenant scoping on all profile and entity reads (org_id bound)
- C5: CI security gate passing on every PR

## 7. Residual Risks
- R1: Dependency vulnerabilities reported by npm audit must be triaged and fixed/accepted formally
- R2: Deployment hardening not verifiable from source alone (WAF, TLS ciphers, network policies, secrets manager)
- R3: No formal penetration test evidence attached yet

## 8. Evidence Links
- API strict env validation: apps/api/src/app.module.ts
- Strict CORS runtime validation: apps/api/src/main.ts
- Fail-secure login attempts: apps/api/src/modules/auth/auth.service.ts
- Tenant-scoped auth me repository query: apps/api/src/modules/auth/auth.repository.ts
- Security CI gate: .github/workflows/security-ci.yml
