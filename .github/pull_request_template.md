## Résumé

Décrivez brièvement l'objectif métier et les impacts techniques.

## Checklist Qualité & Conformité

- [ ] Aucun `console.*` ni `alert(...)` dans le code applicatif (`apps/web/src`, `apps/api/src`)
- [ ] Aucun `TODO` non ticketé (format obligatoire: `TODO(JP-123)`)
- [ ] Les DTO d'entrée ajoutés/modifiés utilisent `class-validator`
- [ ] Les accès sensibles sont scoppés organisation (`org_id`/`orgId`)
- [ ] Le contrôle MIME/signature upload n'est pas régressé
- [ ] Aucun secret hardcodé n'est introduit

## Revue Stack Compliance (Périodique)

- [ ] Cette PR introduit-elle un écart à la stack déclarée (copilot-instructions)?
- [ ] Si oui: ADR ou note d'architecture créée/mise à jour (docs/architecture)
- [ ] Websocket / Cron: statut confirmé (implémenté ou différé documenté)

## Vérifications Exécutées

- [ ] `npm run compliance:all`
- [ ] Typecheck / Build des apps impactées
- [ ] Tests pertinents pour la zone modifiée
