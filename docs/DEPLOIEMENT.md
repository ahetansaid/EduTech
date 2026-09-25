# BEILE — Déploiement et intégration continue

> Complète [INFRASTRUCTURE.md](INFRASTRUCTURE.md) et [DIMENSIONNEMENT.md](DIMENSIONNEMENT.md). Version 0.3 — septembre 2026.

## 1. Architecture : front et back séparés

Deux déploiements distincts. Le front Next.js (`apps/web`) **réécrit** `/api/v1/*` vers le back-end Node.js (`apps/api`, Hono).
Pour le navigateur, tout vient d'une **seule origine** : cookies de session « first-party » (HttpOnly, SameSite), aucune origine tierce
dans la CSP, et aucune ouverture CORS nécessaire.

```
Navigateur ──HTTPS──► Front Vercel (Next.js, apps/web)
                        ├─ pages (espaces par rôle), CSP à nonce, redirection vers /connexion sans session
                        └─ /api/v1/*  ──réécriture──► Back Vercel (fonction Node.js, apps/api)
                                                        └─ PostgreSQL Neon (rôle beile_api, sans BYPASSRLS)
```

Sur l'infrastructure souveraine, le même code tourne en processus Node.js (`npm run start -w @beile/api`) derrière nginx,
et le front en `next start` (sortie `standalone`). Même recette, même CI.

## 2. Neon

| Élément | Valeur |
|---|---|
| Projet | `beile-fra`, **eu-central-1 (Francfort)**, PostgreSQL 18 + PostGIS 3.6 (l'ancien projet `beile`, us-east-2, est conservé comme repli) |
| Rôle propriétaire (`neondb_owner`) | **migrations uniquement** — possède `BYPASSRLS` |
| Rôle de l'API (`beile_api`) | membre de `beile_app` : lecture et ajout seuls sur le registre, l'audit et les décisions ; projections en lecture/écriture ; compartiment sensible fermé |

Mise en place ou mise à jour d'une base :

```bash
npm run migrer -w @beile/db       # PostGIS, schéma, déclencheurs d'ajout seul, rôle beile_app, droits
npm run peupler -w @beile/db      # référentiels et jeu initial (refusé si la base n'est pas vide)
npm run role-api -w @beile/db     # crée beile_api, écrit DATABASE_URL_API dans .env
npm run comptes -w @beile/db      # comptes nominatifs, mots de passe générés dans COMPTES.local.md (ignoré par Git)
npm run projections -w @beile/db  # reconstruit core.scolarites et core.notes depuis le registre (idempotent)
npm run verifier -w @beile/db     # contrôle : ajout seul, droits, RLS, avec témoins (tout est annulé)
```

## 3. Vercel — deux projets

### Back-end : projet `beile-api`
1. Import du dépôt ; **Root Directory** : `apps/api` ; Framework : *Other*.
2. `apps/api/vercel.json` lance `npm run build:vercel` : esbuild produit une fonction Node.js 22 unique au format
   *Build Output API* (`.vercel/output/functions/api.func`), qui reçoit toutes les routes.
3. Variables :

| Variable | Valeur |
|---|---|
| `DATABASE_URL_API` | URL **pooler** de `beile_api` (jamais `neondb_owner` : refusé au démarrage) |
| `BEILE_ORIGINES_AUTORISEES` | URL(s) du **front** (ex. `https://beile.vercel.app`) — contrôle d'origine des écritures |
| `BEILE_DB_POOL` | facultatif, 10 par défaut |

4. Région : `fra1` (Francfort), au plus près de la base Neon. Front et API dans la même région.

### Front : projet `beile` (existant `edu-tech-api`)
1. **Root Directory** : `apps/web` ; Framework : Next.js.
2. Variable **`BEILE_API_INTERNE`** = URL du projet back-end (ex. `https://beile-api.vercel.app`). C'est la seule variable du front :
   il ne voit ni la base ni aucun secret.
3. Supprimer les anciennes variables devenues inutiles : `DATABASE_URL_API`, `BEILE_JWT_SECRET`, `BEILE_MODE_DEMO`, `NEXT_PUBLIC_BEILE_API`.
4. Branches : `main` → Production ; `staging` → prévisualisation fixe ; `dev` et `feature/*` → prévisualisations
   (chaque environnement du front pointe vers l'environnement correspondant du back).

## 4. Intégration continue (GitHub Actions)

Fichier : `.github/workflows/ci.yml`. **Aucun secret requis.**

| Tâche | Contenu |
|---|---|
| **Qualité** | typage de tous les paquets, lint, build du front, build de la fonction API, `npm audit --audit-level=high`, cohérence du moteur |
| **Recette de bout en bout** | conteneur PostGIS jetable → migrations → peuplement → rôle `beile_api` → comptes → projections → vérification de la base → API démarrée → **recette complète avec écritures multi-utilisateurs** → **test de charge** (100 utilisateurs, 30 s) |

Protection des branches (Settings → Branches) : `main` et `staging` — pull request obligatoire, tâches **Qualité** et **Recette** requises.

## 5. Recette en local

```bash
npm run dev:api                                   # API sur :4000 (base du .env)
npm run recette -w @beile/api                     # lecture et refus uniquement : sans risque sur une base partagée
npm run recette:ecritures -w @beile/api           # écritures au registre : base JETABLE uniquement
npm run charge -w @beile/api -- --utilisateurs 200 --duree 30
```

> Le registre est en **ajout seul** : une écriture de recette ne peut pas être effacée. Les recettes avec écritures ne se jouent
> que sur une base jetable (CI, conteneur local — cf. DIMENSIONNEMENT.md §4), jamais sur la base de production.

## 6. Avant d'ouvrir à des utilisateurs réels

- Supprimer l'ancien projet Neon `beile` (us-east-2) une fois la bascule validée : c'est lui dont le mot de passe `neondb_owner` a circulé en clair. Le projet `beile-fra` a des identifiants neufs, jamais affichés.
- Fédérer l'authentification à l'identité nationale (OIDC) ; les comptes locaux restent pour l'administration.
- Limitation de débit partagée (Redis) au lieu de la mémoire de chaque instance.
- Politiques RLS de besoin d'en connaître sur le compartiment `sensible`.
- Dossier APDP, test d'intrusion, test de restauration (voir [SECURITE.md](SECURITE.md) §4).
