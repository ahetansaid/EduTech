# BEILE — Bénin Education Intelligence & Learning Ecosystem

Système national interopérable de parcours et d'intelligence éducatifs.

## Structure

```text
apps/web            Next.js — six espaces (apprenant, famille, établissement, territoire, cockpit, partenaires)
apps/api            Hono — API /api/v1, branchée après validation du prototype
packages/contracts  Schémas zod et types partagés : le contrat entre web et api
docs/               Infrastructure, charte graphique, plan du prototype
```

## Démarrer

```bash
npm install
npm run dev        # apps/web sur http://localhost:3000
npm run dev:api    # apps/api sur http://localhost:4000/api/v1/sante
```

## Branches

`feature/*` → `dev` → `staging` → `main`, uniquement par pull request.
Voir [docs/INFRASTRUCTURE.md](docs/INFRASTRUCTURE.md) §2.7.

## Données

Le prototype fonctionne **exclusivement sur des données fictives** générées de façon déterministe.
Aucune donnée personnelle réelle n'est hébergée hors infrastructure souveraine.
