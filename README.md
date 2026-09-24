# BEILE — Bénin Education Intelligence & Learning Ecosystem

Système national interopérable de parcours et d'intelligence éducatifs — **prototype de démonstration sur données entièrement fictives**.

## Structure

```text
apps/web             Next.js 16 — six espaces (apprenant, famille, enseignant, établissement, territoire, cockpit national)
apps/api             Hono — API /api/v1, sert le même contrat que l'interface
packages/contracts   Schémas zod et types partagés : le contrat entre web et api
packages/simulation  Moteur de simulation : couche nationale, établissements pilotes, registre d'événements,
                     contrôle d'accès ABAC, couche sémantique, Ask Education, certification
docs/                Infrastructure, sécurité, charte graphique, plan du prototype
```

## Démarrer

```bash
npm install
npm run dev          # interface : http://localhost:3000
npm run dev:api      # API : http://localhost:4000/api/v1/sante
npm run verifier     # contrôle de cohérence du moteur de simulation
```

## API v1

| Méthode | Route | Rôle |
|---|---|---|
| GET | `/api/v1/sante` | État du service |
| GET | `/api/v1/referentiels/departements` · `/communes` | Référentiel territorial |
| GET | `/api/v1/dictionnaire` · `/dictionnaire/:code` | Dictionnaire national des indicateurs |
| POST | `/api/v1/indicateurs` | Calcul d'un indicateur à partir d'une requête structurée (validée par zod) |
| POST | `/api/v1/ask` | Ask Education : traduction contrôlée, jamais de chiffre généré |
| GET | `/api/v1/priorites` | Zones prioritaires et leurs facteurs |
| GET | `/api/v1/certificats/:id/verification?e=` | Vérification publique d'un diplôme |

Garde-fous : en-têtes de sécurité, CORS restreint (`BEILE_ORIGINES_AUTORISEES`), corps limité à 16 Ko, limitation de débit, validation stricte du contrat (champ inconnu = 422), erreurs sans trace technique.

## Fil rouge de la démonstration (≈ 8 minutes)

1. **Cockpit national** — chiffres clés avec indice de confiance, carte des 77 communes, « Pourquoi ? » sur une commune critique.
2. **Ask Education** — une question en français → requête structurée visible → chiffre, carte, provenance ; puis « Montre-moi les notes de Aïcha ZANNOU » → refus motivé.
3. **Où agir ?** — descente Bénin → Borgou → Parakou → établissements ; « Simuler une mesure ».
4. **Enseignant (Idrissou SANNI)** — couper la connexion, faire l'appel en 5e A, rétablir : synchronisation sans doublon.
5. **Famille (Chantal DOSSOU)** — la notification d'absence est arrivée ; **Directrice** — la liste du jour ; **Console territoriale** — le taux d'absence a bougé. *Un fait, quatre restitutions.*
6. **Inscription** — un enfant sans acte de naissance est inscrit, signalé, régularisé : jamais exclu.
7. **Apprenante (Aïcha ZANNOU)** — passeport éducatif continu malgré un transfert Cotonou → Parakou ; diplôme à QR code → **vérification publique** → « Tester la détection de fraude ».
8. **Enseignant-parent** — ouvrir le dossier de sa fille au titre « évaluation » : refus, critère « relation » ; au titre « suivi familial » : accordé. **DPO** — le refus figure au journal d'audit.
9. **État du service** — dernière sauvegarde, dernier test de restauration réussi.

Le sélecteur de profil (en bas de la barre latérale, ou ⌘K) permet de changer d'acteur à tout moment.

## Branches

`feature/*` → `dev` → `staging` → `main`, uniquement par pull request. Voir [docs/INFRASTRUCTURE.md](docs/INFRASTRUCTURE.md) §2.7.

## Documentation

- [Infrastructure](docs/INFRASTRUCTURE.md) — MVP Vercel + Neon, cible souveraine, migration
- [Sécurité](docs/SECURITE.md) — mesures vérifiables et architecture cible
- [Charte graphique](docs/design/CHARTE_GRAPHIQUE.md) — fondée sur les plateformes de l'État
- [Plan du prototype](docs/prototype/PLAN.md) — processus simulés et critères d'acceptation

## Données

Toutes les données sont fictives et générées de façon déterministe. Aucune donnée personnelle réelle n'est utilisée ni hébergée. Limites administratives : geoBoundaries ; photographies : Pexels (crédits dans `apps/web/public/images/CREDITS.md`).
