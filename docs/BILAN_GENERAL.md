# BEILE — Bilan général, audit et reste à faire

> État au **19 octobre 2026** (mise à jour du bilan du 16/10). Document versionné : **aucun mot de passe ni secret
> ici**. Les mots de passe des comptes cités sont dans `COMPTES.local.md` (fichier local, jamais commité).
> Complète [SECURITE.md](SECURITE.md), [SECURITE_COMPTES.md](SECURITE_COMPTES.md), [DEPLOIEMENT.md](DEPLOIEMENT.md)
> et les notes de cadrage [cadrage/BIBLIOTHEQUE_NUMERIQUE.md](cadrage/BIBLIOTHEQUE_NUMERIQUE.md) et
> [cadrage/DOCUMENTS_IMPORT_EXPORT.md](cadrage/DOCUMENTS_IMPORT_EXPORT.md).
>
> **Depuis le 16/10** : correctifs de l'audit général (`1d6e7a4`), note de cadrage des documents importés et
> exportés, et **import des listes d'élèves** par le chef d'établissement (`01babf8`). **En production depuis le
> 19/10/2026** (`main` à `4ab70fd`).
>
> **En production depuis le 21/10/2026** (`main` à `d5f27fd`) : import des **services d'enseignement** (`f75085e`,
> audité de façon indépendante, 5 constats corrigés), test de charge **à 1 000 utilisateurs simultanés**, et
> correctif des **plafonds de connexion** et de la **purge des compteurs** (`ba84815`). Aucune migration.
>
> **En production depuis le 22/10/2026** (`main` à `229aad6`) : **emploi du temps** (note
> [cadrage/EMPLOI_DU_TEMPS.md](cadrage/EMPLOI_DU_TEMPS.md)) — import par fichier (`b065163`, migration 0017) et
> **saisie à l'écran** par l'administration de l'école (`7bbb483`) ; lecture par l'inspection et par l'enseignant.
> Deux audits indépendants, 9 constats corrigés ; limite documentée : pas encore de notion d'année scolaire close.

---

## 1. Où en est la production

| Élément | État |
|---|---|
| Front (Next.js 16) | https://edu-tech-api-rho.vercel.app — branche `main` à `229aad6`, déployée le 22/10/2026 (emploi du temps, saisie à l'écran) |
| API (Hono) | https://beile-api.vercel.app/api/v1 — déployée le 22/10/2026 depuis le même état |
| Base (Neon PostgreSQL) | 18 migrations appliquées (0000 → 0017, table `core.cours` le 22/10) ; 4 index du registre ajoutés le 21/10, utilisés par le carnet de classe (2 ms en production) |
| Sauvegarde avant la dernière mise en production | 71 tables, 22/10/2026 13 h 01 |
| Contrôle après mise en production (22/10) | Routes de l'emploi du temps vivantes (401 sans session) ; directrice : écran, formulaire « Ajouter une séance », ligne fictive refusée sans rien écrire ; enseignant : « Mon emploi du temps » ; en-têtes 5/5 |
| Contrôle après mise en production (21/10) | Route des services vivante (401 sans session), corps de 20 Ko accepté sur l'import ; écran des services en navigateur à 1 280 et 390 px, ligne fictive refusée sans rien écrire ; en-têtes 5/5 ; page protégée → 307 ; écriture sans session → 401 ; connexion inconnue → 401 |
| Intégration continue (`dev`) | Recette **408/408** cas conformes, écritures comprises (commit `ba84815`) |
| Tenue en charge (CI, 4 vCPU, une instance) | **1 000 utilisateurs simultanés** à l'usage réel : 0 erreur, p50 13 ms, p95 58 ms ; sous 10 × cette charge : 0 erreur, p50 1,8 s (détail : [DIMENSIONNEMENT.md](DIMENSIONNEMENT.md)) |
| Contrôle après mise en production (19/10) | Route d'import vivante (401 sans session), corps de 20 Ko accepté sur l'import et refusé ailleurs (413) ; écran d'import en navigateur à 1 280 et 390 px, vérification d'une ligne fictive refusée sans rien inscrire ; en-têtes 5/5 ; page protégée → 307 ; écriture sans session → 401 |

**Volume** : 249 routes d'API, 78 écrans, 320 vérifications dans la recette automatique (certaines sont des
boucles, d'où 405 cas comptés), 30 commits livrés depuis le début des vagues.

**Cas CI instable expliqué et corrigé** : « essais de date plafonnés par candidat » échouait au hasard. Cause : la
purge paresseuse d'un plafond à la minute effaçait les compteurs à fenêtre longue de tous les autres plafonds
(ce plafond-là, mais aussi les échecs de connexion par adresse et les imports par heure). Chaque plafond ne purge
plus que ses propres lignes (`ba84815`).

### Données : réelles ou simulées

| Donnée | Nature |
|---|---|
| Référentiel des établissements (annuaire public) | **Réelle et sourcée** (2 116 établissements, chaque fiche cite sa source) |
| Découpage territorial (départements, communes) | Réel |
| Calendrier scolaire officiel | Réel (bornes de trimestre) |
| Registre national des personnes (NPI, filiation) | **Simulé** (`registre_simule`) : à remplacer par l'interface officielle de l'ANIP |
| Élèves, notes, absences, personnels des écoles pilotes | Jeu de démonstration cohérent |
| SMS sortants | **Non envoyés** : préparés et journalisés (`BEILE_AVIS_SMS=journal`) faute de fournisseur choisi |

---

## 2. Ce qui est livré, par profil

Comptes de démonstration indiqués entre parenthèses (identifiant seulement). Connexion :
https://edu-tech-api-rho.vercel.app/connexion. Les comptes 🔐 demandent un second facteur ; pour les comptes de
démonstration, le code s'affiche au-dessus du formulaire.

| Profil | Fonctionnalités | Écrans |
|---|---|---|
| **Apprenant** (`aicha.zannou`) | Passeport éducatif, bulletins par trimestre (trimestre tiré du calendrier officiel), preuves et diplômes, cursus, offres et vœux d'orientation, démarches, droits sur ses données, notifications | `/apprenant`, `/apprenant/bulletins`, `/apprenant/cursus`, `/apprenant/orientation`, `/apprenant/preuves`, `/apprenant/droits` |
| **Famille** (`chantal.dossou`) | Enfants dans plusieurs établissements, notes, absences, justificatifs, notifications ; **responsable sans NPI** possible (attesté par l'école, activé par SMS, borné à son enfant) | `/famille`, `/famille/documents`, `/famille/notifications` |
| **Enseignant** (`idrissou.sanni`) | Appel (hors connexion), notes avec **nature de l'évaluation** (interrogation, devoir, composition — sans pondération pour l'instant), corrections motivées, carnet, passeport professionnel et **statut d'emploi** (APE, ACE, AME, vacataire) | `/enseignant`, `/enseignant/classe/[id]`, `/enseignant/carriere` |
| **Chef d'établissement** (`hortense.guera`) | Tableau de bord, inscription (registre national), élèves, personnel, familles (dont **responsables sans NPI** et rattachement ultérieur du NPI), justificatifs, examens, **import d'une liste d'élèves** (CSV), **import des services d'enseignement** (qui enseigne quoi, où ; professeur principal) | `/etablissement/*`, `/etablissement/familles`, `/etablissement/import`, `/etablissement/import-services` |
| **Inspecteur** (`nestor.orou`) 🔐 | Poste de pilotage territorial, alertes, **saisie pour le compte d'une école non connectée** (feuille d'appel papier), **visites à venir**, demandes avec escalade | `/territoire`, `/alertes`, `/saisie-ecoles`, `/visites`, `/demandes` |
| **Direction départementale** (`bertrand.chabi`) 🔐 | Console du département, **rapport mensuel** tiré du registre, **statuts d'emploi** des enseignants du territoire, **suivi des alertes** (prise en charge → clôture), escalade des demandes | `/rapport`, `/personnels`, `/alertes`, `/demandes` |
| **Cabinet / pilotage national** (`felicite.akakpo`) 🔐 | Cockpit national, carte, analyses, jeux de données sous **secret statistique** | `/cockpit`, `/cockpit/carte`, `/ask`, `/jeux-de-donnees` |
| **Chercheur** (`landry.kouton`) 🔐 | Jeux de données agrégés, dictionnaire, analyses | `/jeux-de-donnees`, `/donnees` |
| **DPO** (`laure.zannou`) 🔐 | Journal d'audit, registre des traitements, demandes de droits, alertes de sécurité | `/audit`, `/audit/traitements`, `/securite` |
| **Supérieur** (`prosper.ahouandjinou`, `sena.hounkpatin`, `etudiant.ifri`) | Maquettes, UE, inscriptions, contrats pédagogiques, notes d'UE, jurys, diplômes scellés, guichet des actes, bourses | `/enseignement-superieur/*` |
| **Administrateur plateforme** (`admin.beile`) 🔐 | Comptes et accès, délégation en cascade | `/administration`, `/delegation` |
| **Public** (sans compte) | Annuaire réel des établissements, résultats d'examens, vérification de diplômes et d'actes, calendrier, chiffres publics | `/etablissements`, `/resultats`, `/verifier`, `/calendrier`, `/donnees` |

**Transverse** : mode **économie de données** (aucun rafraîchissement en arrière-plan, automatique en 2G ;
réglage dans `/mon-compte`), file hors connexion rattachée au compte, exports CSV journalisés et protégés contre
l'injection de formules, avis SMS aux familles (absence, diplôme) préparés sans envoi.

## 2 bis. Import des listes d’élèves (lot 1 des documents, `01babf8`, en production depuis le 19/10)

Premier lot de la note [DOCUMENTS_IMPORT_EXPORT.md](cadrage/DOCUMENTS_IMPORT_EXPORT.md) : une école bascule ses
élèves en une séance au lieu de les inscrire un par un.

- **Écran** `/etablissement/import` (chef d'établissement) : modèle CSV téléchargeable ; le fichier est lu **dans
  le navigateur** (UTF-8 ou Windows-1252 d'Excel, séparateur `;` `,` ou tabulation, en-têtes tolérants, dates
  JJ/MM/AAAA) ; l'API ne reçoit que des lignes typées.
- **Deux temps** : « Vérifier » rend un verdict par ligne sans rien écrire ; « Importer » refait toutes les
  vérifications et n'inscrit que les lignes valides. Les lignes refusées s'exportent pour correction.
- **Règles** : classe reconnue par son libellé, ou créée si le niveau est donné et le chef l'accepte ; capacité
  respectée ; élève scolarisé ailleurs → renvoi au transfert ; enfant sans acte → régularisation d'identité ;
  rejouable sans doublon.
- **Sécurité** : même motif pour un NPI inconnu ou d'une autre personne (pas d'oracle sur le registre) ; âge
  2–30 ans, y compris avec NPI ; verrou par établissement contre les imports simultanés ; 20 appels par heure et
  par compte ; corps de requête à 640 Ko pour cette seule route ; chaque inscription est un fait au registre marqué
  de l'identifiant d'import ; opération journalisée.
- **Ce qui ne s'importe pas** : les enseignants, dont l'affectation passe par le circuit de la direction
  départementale.
- **Preuves** : test d'API 28/28 (nominal, rejeu, oracle, adulte, concurrence 201/409, 1 500 lignes, 403, 422,
  429) ; lecture CSV 15/15 ; parcours navigateur 12/12 à 1 280 et 390 px ; recette CI 3 cas.

---

## 3. Modèle de sécurité (rappel)

- **Session** : cookie `beile_session` HttpOnly, Secure, SameSite ; CSRF en double soumission ; inactivité 2 h
  (30 min pour un administrateur) ; second facteur obligatoire aux niveaux 0 à 2 ; élévation juste à temps pour
  l'administration.
- **Accès** : ABAC par rôle **et** périmètre (classe, établissement, circonscription, département, national).
  Chaque accès, accordé ou refusé, est journalisé avec le critère manquant ; le journal est en ajout seul en base.
- **Registre des faits** (`ledger.evenements`) : en ajout seul ; une correction ajoute un fait correctif, elle
  n'efface rien. Les saisies sont **idempotentes** (`idSaisie`) : un rejeu après une réponse perdue ne double
  rien, et la clé n'engage que **son auteur** — deux émetteurs qui se donnent la même clé n'écrivent ni ne
  lisent pas les faits l'un de l'autre (§4.2, B1).
- **Statistiques** : secret statistique sur les petites cellules (effectif rendu `null`, pas seulement masqué à
  l'écran).
- **Sorties tabulaires** : un fichier ne sort qu'après sa **déclaration** au journal d'audit (`POST /audit/exports`,
  plafond par compte) ; la déclaration échouée, aucun fichier n'est produit et l'écran n'annonce aucun succès.
  Cellules, en-têtes de colonnes et pied de provenance passent par le garde anti-formule, testé sur la **tête
  réelle** de la cellule (blancs initiaux retirés), sauf une valeur déjà numérique au format français.
- **En-têtes** : HSTS, CSP avec nonce, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`.

---

## 4. Audit général du 16 octobre 2026

Périmètre : dépendances, en-têtes et comportement de la production, autorisations de l'API, front (stockage
local, exports, file hors connexion). Chaque constat a été vérifié dans le code avant d'être retenu.

### 4.1 Contrôles en production — tous conformes

| Contrôle | Résultat |
|---|---|
| Dépendances de production (`npm audit --omit=dev`) | **0 vulnérabilité** |
| En-têtes de sécurité (HSTS, CSP nonce, XFO, nosniff, Referrer-Policy) | Présents |
| Cookie de session | HttpOnly, Secure, SameSite |
| Écriture sans jeton CSRF | 403 |
| CORS depuis une origine étrangère | Fermé |
| Écran protégé sans session | 307 vers `/connexion` |
| Élève lisant le dossier d'un autre élève | 403 |

### 4.2 Corrigé et testé (commit `1d6e7a4`, en attente de mise en production)

| Constat | Gravité | Correctif | Preuve |
|---|---|---|---|
| **M2** — Rattachement du NPI d'un responsable sans NPI : le registre n'était comparé qu'au **nom saisi par le chef** | Moyenne | La filiation doit être inscrite au registre national pour **chaque** enfant lié ; sinon 422, refus journalisé | Test local : bon nom mais filiation absente → 422 ; filiation présente → 200 |
| Notes **doublées** après une réponse perdue (2G, passerelle 504) : la clé d'idempotence naissait après le premier envoi | Élevée (intégrité) | Clé créée **avant** le premier envoi et réutilisée par la file | Recette CI : « Correction rejouée : renvoyée, pas réécrite » |
| Corrections de notes non idempotentes | Moyenne | `idSaisie` accepté sur `/evenements/corrections` | Test local : 1 seule correction au registre après rejeu |
| File hors connexion comptant les saisies d'un **autre compte** (faux message « saisies conservées ») | Moyenne | Comptage limité au compte connecté | Revue de code |
| Brouillons de notes lisibles par le compte suivant sur un appareil partagé | Moyenne | Brouillons rangés par compte et **effacés** à l'expiration de session | Revue de code |
| Fiche publique d'établissement : plantage sur une source « https:// » seule | Basse | Source mal formée écartée | Revue de code |
| NPI dans le nom du fichier d'export du passeport | Basse | Identifiant interne à la place | Revue de code |
| Commentaire de l'export surévaluant la journalisation | Basse | Reformulé : la déclaration d'export vient du navigateur ; la lecture des données, elle, est journalisée par l'API | — |
| **B3** — Décision d'une demande écrite sans condition d'état (deux décideurs simultanés) | Basse | Transaction : le passe d'étape est conditionné à l'étape et au statut lus, la décision d'historique s'écrite dans la même transaction ; le second ne trouve plus la demande et reçoit 409 | Revue de code ; course jouée en recette d'écriture (CI) — commit `a376f5a` |
| **B1** — Clé d'idempotence cherchée **sans auteur** : deux émetteurs portant la même clé lisaient les faits l'un de l'autre | Basse | `dejaSaisi` accepte un `auteurId` — la valeur exacte que l'écriture pose en `auteur_id` (le matricule de l'enseignant, le profil de l'agent, le compte du partenaire). Posé sur les trois routes d'interopérabilité (absences, PV de diplôme, allocations) **et** sur les huit routes internes où la clé vient du client : appels et notes (enseignant, tutelle), correction de note, notes d'UE, validations, délibérations, demande d'acte | Revue de code ; `frais`/`visites` hors cause — leur clé incorpore déjà le profil. **Ce que la correction ne peut pas faire** : l'index d'unicité du registre (`durcissement.sql:92`) est posé sur (clé, type, apprenant) sans l'auteur, donc une collision entre émetteurs n'est plus revendue comme sienne mais remontée par la base en 409 « saisie déjà enregistrée » → voir §5.2, tâche 10 |
| **B2** — Un compte de la vigie pouvait clore une alerte le concernant | Basse | La route `/securite/alertes/:id/traiter` relit l'alerte et refuse l'auto-qualification ; le refus est journalisé **sans** critère manquant inventé (le contrat n'en connaît que quatre ; l'explication est dans l'action) ; l'alerte reste ouverte et sort dans l'export de notification d'incident | Revue de code ; cas à jouer en recette d'écriture (CI) |
| **B4** — Notification « Export prêt » même quand la trace d'export avait échoué | Basse | `exporterCsv` rend désormais `true`/`false` : faux = aucun fichier produit. Les deux écrans qui annoncent un succès (`audit`, `enseignant/carriere`) testent cette valeur, et leur bouton se désole pendant l'aller-retour (deux clics = deux traces et deux fichiers) | Revue de code ; la notification « critique » du noyau d'export reste le seul message de refus |
| **B6** — NPI conservé dans l'état client de l'écran d'inscription après l'inscription | Basse | L'écran de succès ne reçoit qu'une copie `nom`/`prenoms` ; `enfant`, `sansActe` et la requête sont vidés à l'écriture réussie **et** la cache React Query de la recherche au registre national (`cles.registre`, jusqu'à 8 NPI pendant 5 min de `gcTime`) est purgée au succès comme au recommencement | Revue de code |
| **B7** — Filtre du proxy excluant `api`, `images`, `icons` **sans barre finale** | Basse | Motifs ancrés `api/`, `images/`, `icons/` : les chemins qui *ressemblent* à ces dossiers passent désormais par le proxy (nonce + renvoi) | Sonde locale sur `next dev` : `/iconsX`, `/apiX`, `/imagesX` sans session → **307** `/connexion?retour=…` (ils échappaient au filtre avant) ; `/favicon.ico` reste public (200) |
| **B8** — Injection CSV : le garde de formule testait la chaîne **brute** | Basse | La tête de cellule est testée après retrait des blancs initiaux (espace, tabulation, insécable U+00A0, U+202F, sauts de ligne U+2028/U+2029, espaces nuls U+200B–U+200D, BOM) : «␠=1+1 » est neutralisé. Un nombre au format français reste une valeur, pas une formule. Les **en-têtes** de colonnes et le **pied de provenance** passent par le même garde — un en-tête de jeu de données vient du référentiel, pas de l'écran ; U+2028/U+2029 sont désormais échappés entre guillemets | Revue de code : le contournement par espace initial, relevé par l'audit, est fermé |

### 4.3 Ouvert — à décider ou à traiter

| Réf. | Constat | Gravité | Proposition |
|---|---|---|---|
| **H1** | `GET /auth/mfa/demonstration` affiche le code du second facteur des comptes de démonstration, **y compris en production**, et des comptes privilégiés sont marqués « démonstration » (`admin.beile`, `laure.zannou`, `felicite.akakpo`) : leur mot de passe seul suffit | Haute | Choix délibéré pour le jury. **Après le jury** : refuser la route en production et ne jamais marquer « démonstration » un compte privilégié |
| **M1** | Un compte d'usager (parent, apprenant, responsable provisoire) créé par un chef reste sous son contrôle à l'activation (il choisit le téléphone, ou reçoit le mot de passe temporaire en délégation sans téléphone) ; le périmètre famille couvre tous les enfants du NPI | Moyenne | Canal d'activation indépendant du chef ; prévenir les autres responsables de l'enfant ; alerte vigie sur les créations suivies d'une activation immédiate |
| **M3** | Tout chef du supérieur peut inscrire n'importe quel titulaire du BEPC/BAC (énumération, détournement de l'inscription en cours) | Moyenne | Exiger un vœu admis ou une décision d'orientation vers cet établissement |
| **M4** | La scolarité K-12 n'est jamais close : parents et ancien lycée lisent les données du supérieur d'un étudiant majeur (allocations, actes, UE, licence) | Moyenne | Clore à la certification du BAC ou à la première `INSCRIPTION_SUPERIEURE` ; filtrer les faits du supérieur pour `suivi_familial` et la gestion K-12 |
| B5 | Données personnelles dans des adresses GET (`/registre/personnes?nom=`, `/admin/referentiels/npi/:npi`) : elles finissent dans les journaux d'accès | Basse | Passer en POST |
| B9 | Saisies hors connexion **orphelines** (sans compte, antérieures au rattachement) jamais envoyées ni retirées | Basse | Purge au démarrage avec avertissement — **à arbitrer** : effacer des saisies locales non envoyées est irréversible |
| D1 | Outils de développement : 5 vulnérabilités hautes et 4 moyennes (`braces`/`micromatch` via `eslint-config-next`, ancien `esbuild` via `drizzle-kit`) | Hors production | Monter `drizzle-kit` et `eslint-config-next` à la prochaine fenêtre |

---

## 5. Reste à faire — et comment le tester

> **Environnements de test**
> - **Production** : front et API ci-dessus. Lecture et contrôles seulement ; aucune donnée modifiée sans feu vert.
> - **Recette locale** : PostgreSQL Docker (`beile-pg-recette`), API sur `localhost:4007`, puis depuis `apps/api` :
>   `BEILE_API=http://localhost:4007/api/v1 npm run recette` (lecture) ou `npm run recette:ecritures`.
>   La recette locale suppose une base fraîchement semée : une base déjà utilisée par d'autres tests donne de faux
>   échecs (élève déplacé de classe, référentiel réel non chargé).
> - **CI** : chaque poussée sur `dev` rejoue la recette complète sur une base neuve. C'est elle qui fait foi.
>
> Chaque test ci-dessous a son **cas négatif** : un succès ne compte que si le refus attendu est aussi observé.

### 5.1 Immédiat (sur feu vert)

| # | Tâche | Comment tester |
|---|---|---|
| A | **Fait le 21/10** — `f75085e` → `ba84815` en production (services d'enseignement, plafonds de connexion, purge des compteurs) ; recette fonctionnelle à rejouer par l'équipe | ① CI verte (408/408). ② `curl -s -o /dev/null -w "%{http_code}" -X POST https://beile-api.vercel.app/api/v1/etablissements/ETB-PAR-PILOTE-CEG/import/services` → **401**. ③ `hortense.guera` → `/etablissement/import-services` : déposer une ligne `classe;matiere;enseignant` avec un enseignant d'une autre école → « introuvable parmi le personnel affecté » ; la vérification n'écrit rien. ④ Connexions : 5 mauvais mots de passe sur un compte de test → 423 (verrou inchangé). |
| B | **Services d'enseignement** (après A) | `hortense.guera` attribue une matière libre à `idrissou.sanni` dans une classe où il n'enseigne pas : avant l'import, `idrissou.sanni` ouvre `/enseignant/classe/<id>` → refus ; après → le carnet s'ouvre ; puis « remplacer » sans cette ligne → la perte du service est **annoncée avant** l'import, et après, le carnet est de nouveau refusé. Chaque mouvement figure au registre (`SERVICE_ENSEIGNEMENT`) et chaque refus au journal du DPO. |
| 0 | **Import des listes** (`01babf8`, **en production depuis le 19/10**) | `hortense.guera` → `/etablissement/import` : télécharger le modèle, y mettre 5 lignes (un élève avec NPI, un enfant sans acte, un NPI au nom faux, une ligne sans prénom, un élève déjà inscrit) → « Vérifier » : 2 à inscrire, 1 déjà inscrit, 2 refusées ; le NPI faux dit « NPI et identité ne concordent pas au registre national ». « Importer » → 2 inscrits, visibles dans `/etablissement/eleves`. Redéposer le même fichier → tout « déjà inscrit », bouton Importer désactivé. Négatifs : `idrissou.sanni` sur la route → 403 ; un adulte du registre → refusé (âge). |
| 1 | **Fait le 19/10** — `1d6e7a4` et `01babf8` en production ; recette fonctionnelle à rejouer par l’équipe | ① CI verte sur `01babf8` (405/405). ② Après déploiement : `curl -s -o /dev/null -w "%{http_code}" -X POST https://beile-api.vercel.app/api/v1/evenements/corrections` → **401** (route vivante, session exigée). ③ `idrissou.sanni` : corriger une note, puis rejouer la même requête (outil réseau du navigateur, « Rejouer ») → la note n'apparaît **qu'une fois** corrigée au carnet. ④ `hortense.guera` → `/etablissement/familles` : rattacher un NPI dont le registre n'inscrit pas la filiation → **refus** avec le message « Le registre national n'inscrit pas ce NPI comme parent… ». ⑤ Ouvrir une fiche `/etablissements/[id]` : elle s'affiche. |
| 2 | **Vérifier les brouillons par compte** | Sur un même navigateur : `idrissou.sanni` commence une saisie de notes sans l'envoyer, se déconnecte ; `hortense.guera` se connecte → aucun brouillon proposé. Contrôle : `idrissou.sanni` reconnecté, avant toute expiration de session → son brouillon revient. Puis laisser la session expirer (ou supprimer le cookie) → au retour, le brouillon a disparu (`localStorage`, clés `beile.brouillon-notes.*`). |
| 3 | **File hors connexion d'un seul compte** | Outils du navigateur → réseau « Hors ligne ». `idrissou.sanni` fait l'appel → « en attente ». Se déconnecter, se connecter avec un autre compte enseignant → **aucun** message « saisies conservées » ; revenir à `idrissou.sanni`, repasser en ligne → l'appel part et le compteur tombe à 0. |

### 5.2 Après le jury — sécurité

| # | Tâche | Comment tester |
|---|---|---|
| 4 | **H1** : fermer `GET /auth/mfa/demonstration` en production ; retirer le marqueur « démonstration » des comptes privilégiés | `curl -s -o /dev/null -w "%{http_code}" https://beile-api.vercel.app/api/v1/auth/mfa/demonstration` → **403/404** en production. Contrôle : la même route répond toujours en recette locale. Connexion de `admin.beile` avec le seul mot de passe → l'écran du second facteur **ne montre plus** de code. Recette : cas dédié « route de démonstration refusée en production ». |
| 5 | **M4** : clore la scolarité K-12 à l'entrée dans le supérieur | Recette : `chantal.dossou` (ou le parent de l'étudiant de démonstration) demande `/apprenants/<id>?finalite=suivi_familial` d'un étudiant inscrit au supérieur → **403** (ou faits du supérieur absents). Contrôle : le même parent lit toujours le dossier d'un enfant au collège → 200. L'ancien lycée → 403 sur les UE et allocations. |
| 6 | **M3** : inscription au supérieur sur vœu admis ou décision d'orientation | `prosper.ahouandjinou` inscrit un bachelier **sans** vœu admis vers l'IFRI → **422** ; avec un vœu admis → 201. Contrôle d'énumération : la réponse pour un NPI inexistant et pour un NPI sans vœu est identique. |
| 7 | **M1** : activation des comptes d'usagers indépendante du chef | Le chef crée un compte parent : la réponse ne contient **aucun** secret et l'activation passe par le téléphone **du registre** (ou un canal tiers), pas par un téléphone choisi par le chef. Les autres responsables de l'enfant reçoivent un avis (visible dans `core.messages_sortants` en recette). Vigie : création suivie d'une activation en moins de N minutes → alerte. |
| 8 | B5 et B9 (les points B1, B2, B3, B4, B6, B7, B8 sont fermés en code — voir §4.2) | B5 : vérifier dans les journaux de l'hébergeur qu'aucune adresse ne contient de nom ou de NPI, puis passer les deux routes en POST. B9 : après arbitrage, une saisie orpheline (sans compte) doit être either envoyée au rattachement ou purgeée avec avertissement lisible, jamais stockée sans fin. B2 et B3 restent à **jouer** en recette d'écriture (branche CI `--ecritures`) : auto-qualification d'une alerte qui vous vise → refus journalisé ; deux décisions simultanées sur la même étape → un seul 200, l'autre 409. |
| 10 | **Index d'idempotence à élargir à l'auteur** (conséquence de B1) — **action sur la base, à arbitrer** | `ledger.evenements` porte `evenements_id_saisie_idx` sur `(donnees->>'idSaisie', type, apprenant_id) WHERE donnees ? 'idSaisie'` : la clé n'y est pas bornée à celui qui l'a posée. Le code vérifie donc plus étroitement que la base ne contraint — une collision entre deux émetteurs de la même clé se ferme en 409 par la base, et le lot rejeté reste rejouable (`statut <> 'accepte'`). Réglage propre : reconstruire l'index avec `auteur_id` (`CREATE UNIQUE INDEX CONCURRENTLY` hors transaction, puis drop de l'ancien) — cela touche la production, donc feu vert explicite demandé, et recette d'écriture à l'appui : deux partenaires avec `LOT-<même numéro>` sur le même élève → deux écritures acceptées, chacune idempotent pour son auteur. |
| 9 | D1 : dépendances de développement | `npm audit` à la racine → 0 haute ; `npm run build` des deux applications et CI verte. |

### 5.3 Décisions métier attendues (bloquantes pour la suite)

| Décision | Ce qui en dépend | Comment on testera une fois tranché |
|---|---|---|
| **Grille des coefficients** (par matière, par série, par nature d'évaluation) | Moyennes pondérées et bulletins officiels ; aujourd'hui la nature est enregistrée sans pondération | Bulletin d'un élève de référence calculé à la main par un enseignant = bulletin BEILE au centième ; changer un coefficient ne réécrit aucune note au registre |
| **Fournisseur SMS et budget** | Envoi réel des avis (absence, diplôme), activation et récupération par code en production (canaux fermés aujourd'hui) | Passer `BEILE_AVIS_SMS` du mode `journal` au fournisseur ; un SMS reçu sur un téléphone de test ; plafond par numéro et par jour vérifié (le 11ᵉ avis est refusé) ; aucun code dans les journaux |
| **Opérateur USSD** | Consultation des notes et absences sans smartphone | Session USSD de bout en bout sur un numéro de test ; refus pour un numéro non rattaché |
| **Bibliothèque numérique** (voir la note de cadrage, § 8) : droits, stockage, valideurs, stock d'annales, programme officiel | Démarrage de la phase 1 | Défini dans la note : critères par phase |
| **Portails cloisonnés** (public, usagers, gestion, national) | Prêts dans le code, servis aujourd'hui depuis une seule adresse ; demande DNS et hébergement | Chaque portail sur son nom : un compte de gestion refusé sur le portail des usagers et inversement |
| **Modèle officiel des bulletins et certificats** (en-tête, mentions légales, qui signe) et **stockage des pièces justificatives** | Lots 2 et 4 des documents | Un certificat émis se vérifie par QR ; modifié d'un octet, il est déclaré « altéré » ; une pièce n'est lisible que par le chef de l'établissement |
| **Registre national réel (ANIP)** | Remplacement de `registre_simule` | Recherche, filiation et décès lus à la source ; plafond de 200 recherches par jour et par chef conservé |

### 5.4 Technique restant

| Tâche | Comment tester |
|---|---|
| **Pagination côté serveur** des grandes listes (élèves d'un département, journal d'audit, personnels) | Liste de plus de 1 000 lignes : la première page arrive en moins de 1 s en 3G simulée ; page 2 sans doublon ni trou ; un filtre ne fait pas fuir de lignes hors périmètre |
| ~~Test de charge après les vagues 1 à 3~~ **Fait le 19/10** : 1 000 utilisateurs simultanés, 0 erreur (voir 1.) | Relancer à la demande : Actions › « Intégration continue » › *Run workflow* (utilisateurs, durée, réflexion) |
| **Charge en conditions réelles** : la mesure est faite sur une instance unique, avec une base locale | Sur un déploiement de préproduction (jamais la production) : 1 000 utilisateurs, base Neon, fonctions Vercel ; mêmes seuils (0 erreur, p95 < 1,5 s), et observer le nombre d'instances et de connexions à la base |
| ~~Index du registre à l'échelle nationale~~ **Fait le 21/10** : carnet 14 209 → 0,7 ms sur 2 millions d'événements simulés | Rejouer `echelle-index` (transaction annulée) après toute nouvelle requête sur `ledger.evenements` : aucun parcours de toutes les absences du pays |
| **Carnet et tableau de bord sous forte charge** (routes les plus coûteuses mesurées) | Sous 10 × l'usage réel, p50 > 3 s sur `/classes/:id`, `/moi/classes`, `/etablissements/:id/eleves` : mettre en cache par classe ou précalculer ; refaire le test « 1 000 utilisateurs, un clic par seconde » et viser p95 < 1,5 s |
| Parcours navigateur automatisés pour les nouveaux écrans (`/saisie-ecoles`, `/rapport`, `/personnels`, `/visites`, `/etablissement/familles`) | Exécution sans erreur en 1 280 px et 390 px, sans défilement horizontal |
| **Lots suivants des documents** (note de cadrage, § 6 ; 1 bis livré) : 2 bulletin et certificat de scolarité en PDF scellé ; 3 notes depuis un tableur ; 4 pièces justificatives ; 5 `.xlsx` | Chaque lot avec son test : rejeu sans doublon, périmètre (403 hors établissement), document scellé déclaré « altéré » après une modification d'un octet |

---

## 6. Rappel : comment vérifier soi-même la sécurité de la production

```bash
API=https://beile-api.vercel.app/api/v1
FRONT=https://edu-tech-api-rho.vercel.app
curl -sI $FRONT | grep -iE "strict-transport|content-security|x-frame|x-content-type|referrer"   # 5 en-têtes
curl -s -o /dev/null -w "%{http_code}\n" $FRONT/enseignant                                       # 307 → /connexion
curl -s -o /dev/null -w "%{http_code}\n" -X POST $API/evenements/absences                        # 401 sans session
curl -s -o /dev/null -w "%{http_code}\n" -H "Origin: https://exemple.invalid" -X OPTIONS $API/auth/connexion  # aucun Access-Control-Allow-Origin
```

Avec une session (navigateur) : toute écriture sans l'en-tête `X-CSRF-Token` → 403 ; `aicha.zannou` demandant le
dossier d'un autre élève → 403, et le refus apparaît dans le journal du DPO (`laure.zannou` → `/audit`).
