# ADR-0001 - Differe Scheduler MVP

## Statut

Accepte - 2026-03-19

## Contexte

La stack cible mentionne des jobs planifies dans NestJS. Lors de la revue Sprint 3, aucun besoin MVP effectivement cable n'a ete trouve dans le code applicatif:

- pas de job periodique deja present a industrialiser
- pas de workflow metier stable de cloture automatique en production
- pas d'evenement metier qualifie avec frequence, fenetre d'execution et idempotence documentees

Les traitements asynchrones existants reposent deja sur BullMQ pour les files metier ponctuelles. Ajouter un scheduler maintenant introduirait une brique supplementaire sans contrat metier verifiable.

## Decision

Le scheduler NestJS est differe hors MVP.

Le projet conserve pour l'instant:

- BullMQ pour les traitements asynchrones declenches par action utilisateur
- aucune dependance `@nestjs/schedule` ni `node-cron` tant qu'un cas d'usage metier n'est pas qualifie

## Raisons

- eviter un cron vide ou artificiel uniquement pour satisfaire une checklist
- reduire le risque d'effets de bord sur des donnees financieres sensibles
- forcer la qualification du besoin avant d'ajouter de l'orchestration recurrente

## Consequences

- la divergence stack est documentee et explicite
- tout besoin futur de job planifie devra definir:
  - frequence
  - idempotence
  - observabilite
  - strategie de reprise
  - impact organisationnel et securite

## Conditions de levee du differe

Introduire un scheduler uniquement lorsqu'un ou plusieurs usages sont qualifies, par exemple:

- recalcul KPI planifie avec fenetre metier definie
- cloture automatique de periode avec garde-fous et audit
- notifications hebdomadaires avec critere d'envoi stable

Dans ce cas:

- ajouter `@nestjs/schedule`
- documenter le job dans une nouvelle ADR ou mettre a jour celle-ci
- couvrir le job par tests et journalisation d'audit si applicable