# Deployment Context TIER 3 - Jupiter_Plan

Version: 1.0
Date: 2026-03-09

## 1. Intended Topology (Target)
- Public entry: HTTPS load balancer / ingress (TLS 1.2+ minimum, TLS 1.3 preferred)
- Application: `apps/web` and `apps/api` in isolated workloads
- Internal services: PostgreSQL, Redis, calc engine only reachable on private network
- Queue: BullMQ over Redis with auth

## 2. Network Segmentation Requirements
- API exposed only through ingress
- PostgreSQL and Redis never exposed publicly in production
- Calc engine not internet-exposed, only callable by trusted backend/queue worker
- Deny-all default network policies between namespaces/services, then explicit allow rules

## 3. Identity and Secrets
- JWT secrets and Redis password managed via secret manager (not plaintext files)
- Key rotation policy documented for JWT secrets and database credentials
- No static credentials in code or container images

## 4. Runtime Hardening
- Containers run as non-root where possible
- Read-only root filesystem for web/api containers if feasible
- Image scanning required in CI/CD
- Health checks and resource limits configured

## 5. Logging and Monitoring
- Centralized immutable logs for auth and security events
- Alerts for brute-force spikes, repeated 401/403 anomalies, unusual data export activity
- Retention policy aligned with compliance obligations

## 6. Backup and DR
- Automated encrypted backups for PostgreSQL
- Periodic restore tests with evidence
- Defined RPO/RTO and incident runbooks

## 7. Preconditions for Production Approval
- All critical CI gates green
- Dependency vulnerabilities (high/critical) remediated or risk-accepted formally
- Threat model signed by engineering and security owner
- Pen test completed for external attack surface
