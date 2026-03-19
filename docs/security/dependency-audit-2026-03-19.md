# Dependency Audit - 2026-03-19

## Portee

- apps/api
- apps/web
- apps/calc

## Actions realisees

- activation d'un websocket Nest reel avec authentification JWT au handshake
- cablage d'un flux metier d'emission sur l'import Excel
- remplacement de `xlsx` par `exceljs` dans l'API
- `npm audit fix` applique cote web
- verification de l'absence de `@types/xlsx`

## Resultats Node - API

Etat apres migration `xlsx -> exceljs`:

- `xlsx` supprime du runtime API
- `exceljs` ajoute pour l'import Excel
- `@types/xlsx` non present dans le repo

Constats verifies apres nettoyage (commande: `npm --prefix apps/api audit --audit-level=high`):

- `xlsx`: plus present dans les dependances API
  - statut: corrige par suppression de la dependance
- chaine Nest CLI / Angular Devkit / webpack / glob / tmp
  - nature: majoritairement outillage de developpement et CLI
  - statut: non corrige dans ce sprint car `npm audit fix --force` impose une montee majeure Nest CLI
- `multer` via `@nestjs/platform-express`
  - nature: runtime
  - statut: a suivre lors d'une montee de version Nest compatible; pas de correction non cassante retenue ici

Decision:

- acceptation temporaire documentee des vulnerabilites transitive/tooling restantes tant qu'une montee de major Nest n'est pas planifiee

## Resultats Node - Web

Commande executee:

- `npm audit --audit-level=high`
- puis `npm audit fix`

Etat final:

- la vuln haute `socket.io-parser` est corrigee
- il reste 6 vulnerabilites moderees sur `esbuild` via Vite/Vitest

Analyse:

- impact limite a l'outillage dev server
- correction proposee par npm: `vite@8`, breaking change

Decision:

- differe jusqu'a une fenetre dediee de montee Vite/Vitest

## Resultats Python - Calc

Constats:

- `pip_audit` sur l'environnement actif remonte des vulnerabilites sur `filelock`, `marshmallow`, `nltk`, `setuptools`, `urllib3`
- une partie de ces paquets provient clairement des outils d'audit installes dans le meme `.venv`, et non du runtime metier calc
- `pip_audit -r requirements.txt` et `pip_audit --no-deps -r requirements.txt` ont ete tentes, mais la resolution isolee est restee bloquee sur la creation/mise a jour d'environnement temporaire dans ce contexte Windows
- `safety scan` demande une authentification interactive et n'est donc pas exploitable ici en mode headless

Tri initial:

- `urllib3 1.26.20` merite suivi car present dans l'environnement et potentiellement runtime via la chaine AWS/Boto
- `setuptools` releve de l'environnement de build/outillage
- `nltk` et `marshmallow` semblent lies aux outils d'audit installes, pas au runtime declare de `apps/calc/requirements.txt`

Decision:

- conserver la preuve d'audit partielle
- prevoir une passe dediee sur un venv runtime minimal du calc engine pour isoler strictement les dependances applicatives

## Nettoyage dependances temporaires / depreciees

- `@types/xlsx`: absent, rien a nettoyer
- `xlsx`: retire du runtime API
- websocket packages Nest/Socket.io: conserves car desormais reellement utilises
- cron/scheduler packages: non ajoutes, conforme a l'ADR de differe MVP

## Suivi recommande

1. planifier une montee Vite/Vitest pour supprimer le reliquat `esbuild`
2. planifier une montee Nest pour traiter les transitive runtime/outillage encore ouvertes autour de `multer` et du CLI
3. executer `pip_audit -r requirements.txt` sur un venv calc minimal dedie, sans outils d'audit installes dedans