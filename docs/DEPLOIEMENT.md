# BEILE — Déploiement et intégration continue

> Complète [INFRASTRUCTURE.md](INFRASTRUCTURE.md). Version 0.1 — septembre 2026.

## 1. Architecture de déploiement du MVP

Un seul projet Vercel sert l'interface **et** l'API : l'application Hono de `apps/api` est montée dans Next.js sous `/api/v1` (`apps/web/src/app/api/[[...route]]/route.ts`). Une seule origine, donc aucune ouverture CORS en production.

Sur l'infrastructure souveraine, `apps/api` tourne seule (Node, conteneur) : **même code**, seule la façon de la servir change. Les deux modes passent la même recette.

```
Navigateur ──HTTPS──► Vercel (Next.js)
                        ├─ pages (6 espaces)
                        └─ /api/v1/*  ──► application Hono (apps/api)
                                            └─ PostgreSQL Neon (rôle beile_api, sans BYPASSRLS)
```

## 2. Neon

| Élément | Valeur |
|---|---|
| Projet | à recréer en **eu-central-1 (Francfort)** pour la latence depuis le Bénin (actuel : us-east-2) |
| Rôle propriétaire (`neondb_owner`) | **migrations uniquement** — possède `BYPASSRLS` |
| Rôle de l'API (`beile_api`) | membre de `beile_app` : lecture et ajout seuls sur le registre, l'audit et les décisions ; compartiment sensible fermé |
| Branches | `main` (production), `staging`, `dev`, et des branches `ci-*` éphémères créées et supprimées par la CI |

Mise en place d'une base neuve :

```bash
npm run migrer -w @beile/db      # PostGIS, schéma, déclencheurs d'ajout seul, rôle beile_app
npm run peupler -w @beile/db     # données FICTIVES (refusé si la base n'est pas vide)
npm run role-api -w @beile/db    # crée beile_api, écrit DATABASE_URL_API dans .env
npm run verifier -w @beile/db    # contrôle : ajout seul, droits, RLS (tout est annulé)
```

## 3. Vercel

1. **Import** du dépôt GitHub `ahetansaid/EduTech`.
2. **Root Directory** : `apps/web` (Vercel installe les dépendances de l'espace de travail npm à la racine).
3. **Framework** : Next.js (détecté).
4. **Variables d'environnement** (Settings → Environment Variables), par environnement :

| Variable | Production (`main`) | Preview (`staging`, `dev`) | Remarque |
|---|---|---|---|
| `NEXT_PUBLIC_BEILE_API` | `/api/v1` | `/api/v1` | API sur la même origine |
| `DATABASE_URL_API` | URL **pooler** de `beile_api`, branche Neon `main` | idem, branche `staging` / `dev` | jamais `neondb_owner` (refusé au démarrage) |
| `BEILE_JWT_SECRET` | 64 octets aléatoires | valeur **différente** | 48 caractères minimum (vérifié) |
| `BEILE_MODE_DEMO` | `true` | `true` | connexion par profil fictif |
| `BEILE_ORIGINES_AUTORISEES` | domaine de production | domaines de prévisualisation | utile seulement si l'API est appelée depuis une autre origine |
| `BEILE_DONNEES_REELLES` | **absent** | absent | à `true`, interdit le mode démonstration (sécurité) |

5. **Région des fonctions** : `apps/web/vercel.json` fixe `cle1` (Cleveland), au plus près de la base Neon actuelle (us-east-2, Ohio). Après migration de Neon à Francfort, passer à `fra1`.
6. **Branches** : `main` → Production ; `staging` → domaine de prévisualisation fixe (`staging.…`) ; `dev` et `feature/*` → prévisualisations.

> Générer un secret : `node -e "console.log(require('crypto').randomBytes(64).toString('base64url'))"`

## 4. Intégration continue (GitHub Actions)

Fichier : `.github/workflows/ci.yml`.

| Tâche | Déclenchement | Contenu |
|---|---|---|
| **Qualité** | chaque push et pull request | typage des 5 paquets, lint, build de production **sans aucune variable** (mode simulation), `npm audit --audit-level=high`, cohérence du moteur de simulation |
| **Recette** | si la variable `NEON_PROJECT_ID` est définie | crée une branche Neon `ci-<run>` (copie isolée de la base), migre, crée le rôle restreint, vérifie la base, démarre l'API, joue la **recette complète**, supprime la branche (même en cas d'échec) |

À configurer dans GitHub (Settings → Secrets and variables → Actions) :
- secret `NEON_API_KEY` : clé d'API Neon (compte → API keys) ;
- variable `NEON_PROJECT_ID` : identifiant du projet Neon.

Protection des branches (Settings → Branches) : `main` et `staging` — pull request obligatoire, tâche **Qualité** requise, pas de push direct.

## 5. Recette

```bash
npm run dev:api                          # API autonome sur :4000
npm run recette -w @beile/api            # 34 cas, dont 14 refus attendus
BEILE_API=http://localhost:3000/api/v1 npm run recette -w @beile/api   # API servie par Next.js
```

> La recette **écrit réellement** au registre (absences, notes, inscriptions fictives) : le registre est en ajout seul, ces écritures ne peuvent pas être effacées. C'est pourquoi la CI la joue sur une branche Neon jetable, jamais sur `main`.

## 6. Avant d'ouvrir à des utilisateurs réels

- Recréer le projet Neon en eu-central-1 et **changer le mot de passe** de `neondb_owner` (il a circulé en clair).
- Remplacer l'authentification de démonstration par l'OIDC (Keycloak fédéré à l'identité nationale) et mettre `BEILE_DONNEES_REELLES=true`.
- Limitation de débit partagée (Redis) au lieu de la mémoire du processus.
- Politiques RLS de besoin d'en connaître sur le compartiment `sensible`.
- Dossier APDP, test d'intrusion, test de restauration (voir [SECURITE.md](SECURITE.md) §4).
