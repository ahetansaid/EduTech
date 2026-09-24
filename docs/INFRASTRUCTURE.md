# BEILE — Infrastructure

> Système national interopérable de parcours et d'intelligence éducatifs.
> Document d'infrastructure technique — version 0.1, septembre 2026.

Ce document décrit **deux infrastructures pour un même code** :

1. **L'infrastructure du challenge (MVP)** : Vercel + Neon et quelques services managés, pour une démonstration rapide et publique.
2. **L'infrastructure cible** : les serveurs du gouvernement béninois, après validation du challenge.

Il fixe aussi les règles de conception qui rendent la migration de l'une à l'autre possible **sans réécriture**.

---

## 1. Principes

| Principe | Traduction technique |
|---|---|
| Un seul code, deux hébergements | Le code métier ne dépend d'aucun service propre à un fournisseur. Seuls des **adaptateurs** changent. |
| Interfaces d'abord | Toute fonction est exposée par l'API versionnée `/api/v1`, documentée en OpenAPI. Le frontend n'est qu'un client de cette API. |
| Sécurité dès la conception | Contrôle d'accès ABAC, RLS PostgreSQL, audit en ajout seul et limitation de débit sont présents dès le MVP. |
| Aucune donnée réelle hors hébergement souverain | Le MVP fonctionne **exclusivement sur des données synthétiques** (voir §2.4). |
| Réversibilité | Formats ouverts (PostgreSQL, S3, OIDC, OpenTelemetry), images Docker, migrations versionnées. |
| Une sauvegarde non restaurée n'est pas une sauvegarde | Le test de restauration est automatisé dès le MVP. |

---

## 2. Infrastructure du challenge (MVP)

### 2.1 Schéma

```
                     Utilisateurs (téléphone, PC, jury)
                                  │ HTTPS
                     ┌────────────▼─────────────┐
                     │  VERCEL                  │  CDN, TLS, protection DDoS de base
                     │  Next.js                 │
                     │  ├─ 6 espaces (PWA)      │  rendu serveur
                     │  └─ /api/v1 (Hono)       │  API versionnée, OpenAPI, ABAC
                     └──┬──────┬──────┬──────┬──┘
                        │      │      │      │
          ┌─────────────┘      │      │      └──────────────┐
          ▼                    ▼      ▼                     ▼
   ┌─────────────┐   ┌──────────┐  ┌──────────────┐  ┌──────────────┐
   │ NEON        │   │ UPSTASH  │  │ CLOUDFLARE R2│  │ API CLAUDE   │
   │ PostgreSQL  │   │ Redis    │  │ (API S3)     │  │ Ask Education│
   │ + PostGIS   │   │ cache,   │  │ documents,   │  │ question +   │
   │             │   │ limite   │  │ diplômes,    │  │ catalogue    │
   │ schémas :   │   │ de débit │  │ sauvegardes  │  │ uniquement   │
   │ core        │   └──────────┘  └──────────────┘  └──────────────┘
   │ ledger      │
   │ analytics   │
   │ audit       │
   └─────────────┘
          ▲
   Tâches planifiées (Vercel Cron / GitHub Actions) :
   rafraîchissement des statistiques, indice de confiance,
   sauvegarde quotidienne, test de restauration
```

### 2.2 Composants

| Composant | Rôle | Justification |
|---|---|---|
| **Vercel** | Héberge l'application Next.js et l'API | Déploiement à chaque push, une URL de prévisualisation par branche, TLS automatique |
| **Neon** (région `eu-central-1`) | PostgreSQL + PostGIS | Une base, quatre schémas séparés. Les **branches** permettent de réinitialiser la démo et de tester les restaurations |
| **Upstash Redis** | Limitation de débit, cache, sessions courtes | Compatible avec l'exécution serverless |
| **Cloudflare R2** | Stockage objet : pièces, diplômes PDF, exports, sauvegardes | Compatible avec l'API S3, donc interchangeable avec MinIO |
| **API Claude** | Traduction d'une question en requête sur la couche sémantique | Ne reçoit jamais de donnée personnelle (voir §4) |
| **GitHub Actions** | Intégration continue, sauvegarde, test de restauration | Traçable et indépendant de l'hébergeur |
| **Sentry** | Erreurs et traces applicatives | Instrumentation au standard OpenTelemetry |

### 2.3 Organisation des données dans PostgreSQL

| Schéma | Contenu | Règle |
|---|---|---|
| `core` | Référentiels et données opérationnelles : établissements, personnes, classes, affectations, évaluations | État courant, protégé par le RLS |
| `ledger` | Registre des événements éducatifs : inscription, évaluation, absence, passage, transfert, certification… | **Ajout seul** : pas d'`UPDATE` ni de `DELETE` ; une correction est un nouvel événement |
| `analytics` | Vues matérialisées agrégées, dimensions, faits | Aucune donnée nominative ; alimente le cockpit, la carte et Ask Education |
| `audit` | Journal des accès (**autorisés et refusés**) et des actions d'administration | Ajout seul, rôle SQL dédié |

### 2.4 Données synthétiques

Le document de cadrage (§2.3) écarte l'hébergement de données scolaires réelles chez un opérateur privé. Le MVP utilise donc un **générateur de données synthétiques** :

- les 12 départements et 77 communes, avec leurs limites administratives réelles (GeoJSON de source ouverte) ;
- des établissements géolocalisés et des effectifs cohérents avec les ordres de grandeur publiés ;
- des années scolaires complètes : inscriptions, évaluations, absences, transferts, abandons, examens ;
- des identités **fictives**, marquées comme telles.

Ce choix est présenté au jury comme une application concrète de la protection des données dès la conception.

### 2.5 Sécurité dès le MVP

| Niveau | Mesure |
|---|---|
| Périmètre | TLS partout, HSTS, protections Vercel |
| Application | En-têtes de sécurité (CSP, X-Frame-Options, Referrer-Policy), validation `zod` de toutes les entrées, protection CSRF, limitation de débit par IP et par compte |
| Identité | Better Auth auto-hébergé (aucune identité confiée à un tiers), second facteur TOTP obligatoire pour les comptes administrateur, départementaux et nationaux, sessions courtes |
| Autorisation | Moteur ABAC à quatre critères (**rôle, périmètre, relation, finalité**), avec le RLS PostgreSQL en seconde barrière |
| Données | Chiffrement au repos (Neon, R2) et en transit, sauvegardes chiffrées |
| Secrets | Variables d'environnement Vercel et GitHub, jamais dans le dépôt |
| Audit | Tout accès sensible et tout refus journalisés : demandeur, ressource, finalité, décision |
| Dépendances | `npm audit` bloquant en CI, mises à jour suivies |

### 2.6 Sauvegarde et restauration

| Mécanisme | Fréquence | Emplacement |
|---|---|---|
| Restauration à un instant donné (PITR) de Neon | Continue (fenêtre selon le plan Neon) | Neon |
| `pg_dump` chiffré | Quotidienne | Cloudflare R2 (autre fournisseur) |
| Test de restauration automatisé | Quotidien | Branche Neon éphémère : restauration du dump, contrôles de cohérence (comptages, intégrité du ledger), puis suppression |

Le résultat du dernier test de restauration est visible dans la console d'administration.

### 2.7 Intégration et déploiement continus

**Trois branches longues, trois environnements.**

| Branche | Rôle | Vercel | Neon |
|---|---|---|---|
| `dev` | Intégration quotidienne ; les branches de fonctionnalité y sont fusionnées | Prévisualisation | Branche `dev` |
| `staging` | Recette : version candidate, figée pour validation et répétition de la démonstration | Environnement *Preview* dédié, domaine `staging.` | Branche `staging` |
| `main` | Production : ce que voit le jury | *Production* | Branche principale |

Flux : `feature/*` → `dev` → `staging` → `main`, uniquement par pull request. `main` et `staging` sont protégées (pas de push direct, CI verte obligatoire). Un correctif urgent part de `main` (`hotfix/*`), puis est reporté dans `staging` et `dev`.

```
push / pull request
      │
      ├─ lint + vérification des types
      ├─ tests unitaires (moteur ABAC, compilateur sémantique, règles métier)
      ├─ npm audit
      ├─ migrations appliquées sur une branche Neon éphémère
      └─ déploiement de prévisualisation Vercel
merge sur main
      └─ migrations de production puis déploiement de production
```

### 2.8 Limites assumées

- Hébergement non souverain : **aucune donnée réelle**.
- Démarrages à froid ponctuels et durée maximale par requête des fonctions serverless.
- Pas de haute disponibilité multi-site : ce n'est pas l'objet du MVP.

---

## 3. Infrastructure cible (serveurs du gouvernement)

### 3.1 Schéma

```
                         INTERNET
                            │
                 Anti-DDoS + pare-feu applicatif (WAF)
                            │
                  Répartiteur de charge (2 instances)
                            │
            ┌───────────────┼───────────────┐
            ▼               ▼               ▼
        App nœud 1      App nœud 2      Worker(s)       conteneurs Docker (K3s ou Swarm),
            │               │               │           même image que sur Vercel
            └───────────────┼───────────────┘
                            │
      ┌──────────┬──────────┼──────────┬─────────────┬──────────────┐
      ▼          ▼          ▼          ▼             ▼              ▼
  PgBouncer    Redis      MinIO     Keycloak      Vault       Entrepôt analytique
      │        (HA)     (fichiers)  (OIDC, MFA)  (secrets)    (selon la volumétrie)
      ▼                                 │
  PostgreSQL primaire ──réplication──► réplique (Patroni)
      │                                 │
      │                    Plateforme nationale d'interopérabilité
      │                    ── ANIP (identité), EducMaster, examens
      ▼
  pgBackRest ──► site secondaire (copie chiffrée hors site)

  Supervision : Prometheus + Grafana, Loki, OpenTelemetry
  Administration : bastion uniquement, réseau segmenté
```

### 3.2 Composants

| Composant | Rôle |
|---|---|
| Anti-DDoS / WAF | Filtrage du trafic en amont |
| Répartiteur de charge | Répartition sur au moins deux nœuds, sans point unique de défaillance |
| Nœuds applicatifs | Conteneurs Next.js/Hono identiques à ceux du MVP |
| Workers | Traitements différés : notifications, rafraîchissements analytiques, imports |
| PostgreSQL + Patroni | Base primaire avec réplication et bascule automatique |
| PgBouncer | Mutualisation des connexions |
| Redis | Cache, limitation de débit, files d'attente |
| MinIO | Stockage objet souverain compatible S3 |
| Keycloak | Fournisseur d'identité OIDC, MFA, fédération avec l'identité nationale |
| Vault | Secrets et rotation des clés |
| Entrepôt analytique | Introduit quand la volumétrie l'exige (ClickHouse ou équivalent) |
| pgBackRest | Sauvegardes complètes et incrémentales vers le site secondaire |
| Prometheus, Grafana, Loki, OpenTelemetry | Métriques, tableaux de bord, journaux, traces |

### 3.3 Continuité : objectifs par niveau de criticité

Les valeurs ci-dessous sont des **cibles de travail**, à valider selon le budget et l'infrastructure effectivement disponible.

| Niveau | Exemples | RPO cible | RTO cible |
|---|---|---|---|
| 4 — hautement sensible | Identité, certifications, ledger | quelques minutes | < 1 h |
| 3 — personnel | Dossiers apprenants, évaluations | < 15 min | < 4 h |
| 2 — professionnel | Référentiels, affectations | < 1 h | < 8 h |
| 1 — public | Statistiques agrégées publiées | < 24 h | < 24 h |

Politique **3-2-1** : trois copies, deux supports, une copie hors site. Restauration éprouvée avant la mise en production, puis à intervalle régulier.

---

## 4. Ask Education : garanties d'architecture

```
Question en langage courant
        │
        ▼
LLM (appel d'outils, schéma JSON strict)
  reçoit : la question + le catalogue du dictionnaire national
  ne reçoit jamais : de données
        │  { indicateur, filtres, dimensions, période }
        ▼
Validation zod ──échec──► « Je ne peux pas répondre, parce que… »
        │
        ▼
Contrôle ABAC (périmètre de l'utilisateur) ──refus──► réponse motivée + audit
        │
        ▼
Compilateur sémantique → SQL paramétré (schéma analytics)
        │
        ▼
PostgreSQL calcule
        │
        ▼
Résultat + source + période + définition + couverture + indice de confiance
        + suppression des petits effectifs
```

- Le LLM **ne génère jamais de SQL** et **ne produit jamais de chiffre**.
- Toute requête s'exécute dans le périmètre de droits de l'utilisateur.
- Les cellules en dessous du seuil de publication sont masquées.
- Hébergement cible du LLM : API Claude sous convention, ou modèle hébergé localement. **Arbitrage à faire par l'État.** Le code passe par un adaptateur.

---

## 5. Migration du MVP vers la cible

### 5.1 Correspondance des couches

| Couche | Challenge | Gouvernement | Changement dans le code |
|---|---|---|---|
| Application | Vercel | Conteneurs Docker | Aucun (`output: "standalone"`) |
| API | Hono dans Next | Hono dans Next, ou serveur Hono séparé | Aucun |
| Base de données | Neon | PostgreSQL + Patroni + PgBouncer | Chaîne de connexion |
| Fichiers | Cloudflare R2 | MinIO | Variables d'environnement |
| Cache / débit | Upstash Redis | Redis | Adaptateur |
| Tâches différées | Vercel Cron / GitHub Actions | Worker + file d'attente | Adaptateur |
| Authentification | Better Auth (comptes locaux) | Keycloak fédéré à l'identité nationale | Fournisseur OIDC ajouté |
| LLM | API Claude | API sous convention ou modèle local | Adaptateur |
| Sauvegarde | PITR Neon + dump vers R2 | pgBackRest vers le site secondaire | Scripts d'exploitation |
| Supervision | Sentry + journaux Vercel | Prometheus, Grafana, Loki, OpenTelemetry | Aucun (OpenTelemetry dès le départ) |

### 5.2 Interfaces que le code métier est seul à connaître

| Interface | Implémentation MVP | Implémentation cible |
|---|---|---|
| `ObjectStorage` | R2 (S3) | MinIO (S3) |
| `Cache` / `RateLimiter` | Upstash | Redis |
| `JobQueue` | QStash / Vercel Cron | Worker Redis (BullMQ ou équivalent) |
| `LlmTranslator` | API Claude | API sous convention ou modèle local |
| `IdentityProvider` | Better Auth | Keycloak (OIDC) |
| `NationalRegistry` | Simulateur (données synthétiques) | Connecteur ANIP via la plateforme nationale d'interopérabilité |
| `Notifier` | Courriel (fournisseur transactionnel) | Passerelle SMS/courriel souveraine |

### 5.3 Séquence de migration

1. Préparer l'environnement cible : réseau, PostgreSQL, Redis, MinIO, Keycloak, Vault, supervision.
2. Construire l'image Docker à partir du même commit que la production MVP.
3. Appliquer les migrations sur la base cible et charger les référentiels.
4. Configurer les adaptateurs par variables d'environnement.
5. Raccorder les systèmes nationaux un par un, selon la séquence du document de cadrage (§9.3).
6. Tester la sauvegarde et la restauration avant toute ouverture.
7. Ouvrir par vagues, avec coexistence temporaire et bascule réversible.

Aucune donnée synthétique n'est migrée : la cible démarre sur des données réelles, sous le contrôle de l'administration.

---

## 6. Variables d'environnement (MVP)

| Variable | Usage |
|---|---|
| `DATABASE_URL` | Connexion Neon mutualisée (pooled) — application |
| `DATABASE_URL_UNPOOLED` | Connexion directe — migrations |
| `AUTH_SECRET` | Signature des sessions |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Cache et limitation de débit |
| `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | Stockage objet (R2, puis MinIO) |
| `ANTHROPIC_API_KEY` | Ask Education |
| `BACKUP_ENCRYPTION_KEY` | Chiffrement des sauvegardes |
| `SENTRY_DSN` | Supervision |

Aucune de ces valeurs n'est versionnée. Un fichier `.env.example` sans secret documente la liste.

---

## 7. Points ouverts

| Sujet | Décision attendue |
|---|---|
| Titulaire des comptes Vercel, Neon, Cloudflare, Upstash et Anthropic | Drwintech ou compte dédié au challenge |
| Nom de domaine de la démonstration | À choisir |
| Plan Neon | Détermine la fenêtre de restauration à un instant donné |
| LLM dans l'infrastructure cible | API sous convention ou modèle local : arbitrage de l'État |
| Orchestrateur cible | K3s ou Docker Swarm, selon les compétences de l'exploitant gouvernemental |
