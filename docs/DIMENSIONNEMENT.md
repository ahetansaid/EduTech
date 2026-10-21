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
| Tableau de bord d'un établissement, poste de développement interrogeant directement la base distante | 7 à 28 s | ≈ 2 s, dont 4 à 5 allers-retours réseau vers us-east-2 |
| Agrégat SQL « bilans » (302 élèves), exécution en base | — | 4 ms |
| `/pilotage/territoire`, 20 requêtes simultanées | 7 945 ms | 267 ms |
| `/pilotage/synthese`, 20 requêtes simultanées | 2 983 ms | 477 ms |
| `/famille/enfants` (deux enfants) | 7,3 s | 1,9 s (base distante) |
| 40 requêtes concurrentes de 4 profils différents (base locale) | 3,9 s | 0,85 s |
| CPU PostgreSQL par requête (parcours mixtes) | — | ≈ 1,5 ms, soit environ 690 req/s par cœur |
| CPU de l'API par requête lourde (liste de 300 élèves) | — | 18 à 30 ms, soit environ 35 à 55 req/s par cœur |
| Connexions (scrypt), débit par machine à 4 cœurs | — | ≈ 10 connexions/s |

### Production (Vercel `fra1` + Neon Francfort), mesurée depuis Porto-Novo

Connexion gardée ouverte, comme dans un navigateur, médiane de 8 appels :

| Écran | Latence |
|---|---|
| Tableau de bord d'un établissement | 317 ms |
| Liste des élèves (300) | 308 ms |
| Espace famille (deux enfants) | 272 ms |

L'aller-retour API → base ne coûte plus qu'environ 12 ms (API et base dans la même région).
Le reste est le trajet réseau Bénin → point d'entrée Vercel (Le Cap) → Francfort : c'est lui qu'une infrastructure
hébergée au Bénin (ou un point d'entrée ouest-africain) réduirait.

### 1 000 utilisateurs simultanés (19/10/2026, machine CI GitHub à 4 vCPU)

Une seule instance de l'API, PostgreSQL et le générateur de charge sur la **même** machine (donc un plancher).
Chaque utilisateur virtuel a sa vraie session, son adresse, et rejoue le parcours de son rôle (direction,
enseignant, famille, élève, inspection, direction départementale, cabinet). Lancement manuel de la CI
(`workflow_dispatch`, paramètres `utilisateurs`, `duree`, `reflexion`).

| Scénario | Connexions | Débit | Latence p50 / p95 / p99 | Erreurs |
|---|---|---|---|---|
| 100 utilisateurs, un clic par seconde (CI à chaque envoi) | 100/100 en 23 s | 99 req/s | 9 / 42 / 61 ms | 0 |
| **1 000 utilisateurs, un clic toutes les ~10 s (usage réel)** | **1 000/1 000 en 34 s** | **100 req/s** | **13 / 58 / 91 ms** | **0** |
| 1 000 utilisateurs, un clic par seconde (≈ 10 × l'usage réel) | 1 000/1 000 en 25 s | 345 req/s | 1 779 / 3 967 / 4 389 ms | 0 |

Lecture : à 1 000 utilisateurs réels, une instance répond en quelques dizaines de millisecondes. Sous dix fois
cette charge, elle **ralentit sans tomber** (aucune erreur) : c'est le signal d'ajouter des instances, ce que
l'architecture sans état permet. Routes les plus coûteuses sous saturation : carnet de classe, classes de
l'enseignant, liste des élèves, tableau de bord d'établissement.

**Volume national (21/10/2026)** : 2 millions d'événements simulés (1 million d'absences dans 2 000 écoles,
40 000 classes, 600 000 élèves), injectés **dans une transaction annulée** — mesure sans trace en base. Trois
lectures parcouraient toutes les absences du pays ou tout le registre d'un établissement ; trois index partiels
(`durcissement.sql`) les ramènent à quelques millisecondes :

| Lecture | Sans index | Avec index |
|---|---|---|
| Carnet de classe : absences de la classe | 14 209 ms | 0,7 ms |
| Bilans d'un établissement (liste des élèves, tableau de bord) | 115 ms | 3,9 ms |
| Tableau de bord : saisies faites pour le compte de l'école | 9,9 ms | 0,4 ms |

**Avant / après l'allègement des lectures (21/10/2026, `e52a5b3`)** — deux tests lancés **en même temps** sur deux
machines CI identiques (les machines varient d'environ 70 % d'un jour à l'autre : une comparaison n'a de sens que
simultanée). 1 000 utilisateurs, un clic par seconde :

| | Avant (`a1774b7`) | Après (`e52a5b3`) |
|---|---|---|
| Débit | 200 req/s | **305 req/s (+52 %)** |
| Latence p50 / p95 | 3,8 s / 7,6 s | **2,1 s / 4,6 s** |
| Erreurs | 0 | 0 |

**Adresse partagée (box d'école, CGNAT mobile)** : les utilisateurs virtuels ont chacun leur adresse ; dans la
réalité, une école entière arrive par une seule. Mesuré le 19/10 : l'ancien plafond (60 connexions/min par adresse)
refusait 40 % de 100 connexions légitimes d'une même adresse. Corrigé (`ba84815`) : plafond des **échecs** par
adresse (100 par 15 min) et plafond global anti-inondation (300/min) ; mesuré après correctif : 100/100 acceptées,
et un bourrage d'identifiants depuis une adresse est bloqué au 101ᵉ échec (même avec le bon mot de passe ensuite),
sans toucher les autres adresses.

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
