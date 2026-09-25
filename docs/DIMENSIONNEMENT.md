# Dimensionnement et tenue en charge — mesures

Les chiffres ci-dessous sont **mesurés** (scripts du dépôt, reproductibles), pas estimés. Ils ont été relevés
sur un poste de développement à 4 cœurs, qui fait tourner simultanément PostgreSQL, l'API et le générateur de charge.
Sur un serveur dédié, ils sont donc des **planchers**.

## 1. Principes retenus pour l'échelle nationale

| Principe | Mise en œuvre |
|---|---|
| Registre en ajout seul, lectures sur projections | `ledger.evenements` est la source de vérité. `core.scolarites` (classe et statut courants) et `core.notes` (note effective, correction appliquée) sont tenues à jour **dans la même transaction** que l'écriture (`apps/api/src/ecriture.ts`), et restent reconstructibles à tout moment (`npm run projections -w @beile/db`). |
| Agrégats calculés dans PostgreSQL | Aucune route ne rapatrie le registre brut d'un établissement : moyennes, absences et alertes sont une seule requête SQL par écran (`apps/api/src/lectures.ts`). |
| API sans état | Sessions en base (empreinte SHA-256), cache de session de 30 s par instance : on peut ajouter des instances sans coordination. |
| Cube national en mémoire | Chargé une seule fois à la fois (*single-flight*), puis rafraîchi en arrière-plan toutes les 5 min. Les calculs dérivés (synthèse, carte, territoire, indicateurs) sont mémoïsés par périmètre et par version du cube, avec une borne mémoire. |
| Requêtes indépendantes en parallèle | Le dossier d'un apprenant coûte deux allers-retours à la base, au lieu de six. |
| Limitation de débit à deux niveaux | 1 500 req/min par IP (un établissement entier peut partager une IP publique derrière un NAT) et 300 req/min par utilisateur. La mémoire est bornée, par purge et éviction, sans aucune remise à zéro globale. |
| Mots de passe | scrypt N=2^15, r=8 (paramètres minimaux OWASP). Le coût est volontaire : environ 100 ms de CPU par connexion. Le pool libuv est aligné sur le nombre de cœurs. |

## 2. Mesures

**Équivalence avant/après les projections** : 0 écart sur 293 élèves (moyennes, absences), 49 candidats, 152 notes
(corrections comprises) et sur les alertes de baisse, par rapport au moteur de référence qui relit tout le registre.

| Mesure | Avant | Après |
|---|---|---|
| Tableau de bord d'un établissement (base distante, depuis Porto-Novo) | 7 à 28 s | ≈ 2 s, dont 4 à 5 allers-retours réseau vers us-east-2 |
| Agrégat SQL « bilans » (302 élèves), exécution en base | — | 4 ms |
| `/pilotage/territoire`, 20 requêtes simultanées | 7 945 ms | 267 ms |
| `/pilotage/synthese`, 20 requêtes simultanées | 2 983 ms | 477 ms |
| `/famille/enfants` (deux enfants) | 7,3 s | 1,9 s (base distante) |
| 40 requêtes concurrentes de 4 profils différents (base locale) | 3,9 s | 0,85 s |
| CPU PostgreSQL par requête (parcours mixtes) | — | ≈ 1,5 ms, soit environ 690 req/s par cœur |
| CPU de l'API par requête lourde (liste de 300 élèves) | — | 18 à 30 ms, soit environ 35 à 55 req/s par cœur |
| Connexions (scrypt), débit par machine à 4 cœurs | — | ≈ 10 connexions/s |

## 3. Ordres de grandeur pour le déploiement

- **Lecture** : l'API est le facteur limitant (CPU), pas PostgreSQL. Elle se met à l'échelle horizontalement
  (fonctions Vercel en MVP, instances Node derrière nginx sur l'infrastructure souveraine).
- **Pic de connexion du matin** : 100 000 enseignants qui se connectent en 30 minutes représentent environ 55 connexions/s,
  soit 3 à 6 instances pendant le pic. Les sessions durent ensuite 12 h.
- **Base** : Neon, avec pooler PgBouncer, en MVP. En cible souveraine : PostgreSQL primaire + réplique en lecture
  pour les projections et le cube, sauvegardes PITR.

## 4. Reproduire

```bash
# Base jetable locale (PostGIS), identique à la CI
docker run -d --name beile-pg -e POSTGRES_PASSWORD=… -e POSTGRES_DB=beile -p 127.0.0.1:55432:5432 postgis/postgis:18-3.6
export DATABASE_URL="postgres://postgres:…@127.0.0.1:55432/beile?sslmode=disable" DATABASE_URL_UNPOOLED="$DATABASE_URL"
export BEILE_FICHIER_COMPTES=/chemin/hors/depot/comptes.md
npm run migrer -w @beile/db && npm run peupler -w @beile/db && npm run comptes -w @beile/db && npm run projections -w @beile/db
# (créer le rôle beile_api, cf. .github/workflows/ci.yml), démarrer l'API, puis :
npm run recette:ecritures -w @beile/api
npm run charge -w @beile/api -- --utilisateurs 200 --duree 30
```

La CI exécute exactement ce scénario à chaque push, sur un conteneur PostGIS éphémère : recette avec écritures
multi-utilisateurs, puis test de charge. Elle n'utilise aucune donnée ni aucun secret de production.
