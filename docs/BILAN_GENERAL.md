# BEILE — Bilan général, audit et reste à faire

> État au **16 octobre 2026**. Document versionné : **aucun mot de passe ni secret ici**. Les mots de passe des
> comptes cités sont dans `COMPTES.local.md` (fichier local, jamais commité).
> Complète [SECURITE.md](SECURITE.md), [SECURITE_COMPTES.md](SECURITE_COMPTES.md), [DEPLOIEMENT.md](DEPLOIEMENT.md)
> et la note de cadrage [cadrage/BIBLIOTHEQUE_NUMERIQUE.md](cadrage/BIBLIOTHEQUE_NUMERIQUE.md).

---

## 1. Où en est la production

| Élément | État |
|---|---|
| Front (Next.js 16) | https://edu-tech-api-rho.vercel.app — branche `main` à `f059aa6`, déployée automatiquement |
| API (Hono) | https://beile-api.vercel.app/api/v1 — déployée le 15/10/2026 depuis le même état |
| Base (Neon PostgreSQL) | 17 migrations appliquées (0000 → 0016), vérifiées en base le 15/10 |
| Sauvegarde avant la dernière mise en production | 70 tables, 15/10/2026 13 h 29 |
| Intégration continue | Recette **402/402** cas conformes, écritures comprises (commit `1d6e7a4`) |
| **En attente de mise en production** | `1d6e7a4` : correctifs de l'audit général (section 4.2). **Aucune migration.** Déploiement sur feu vert. |

**Volume** : 248 routes d'API, 77 écrans, 317 vérifications dans la recette automatique (certaines sont des
boucles, d'où 402 cas comptés), 28 commits livrés depuis le début des vagues.

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
| **Chef d'établissement** (`hortense.guera`) | Tableau de bord, inscription (registre national), élèves, personnel, familles (dont **responsables sans NPI** et rattachement ultérieur du NPI), justificatifs, examens | `/etablissement/*`, `/etablissement/familles` |
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

---

## 3. Modèle de sécurité (rappel)

- **Session** : cookie `beile_session` HttpOnly, Secure, SameSite ; CSRF en double soumission ; inactivité 2 h
  (30 min pour un administrateur) ; second facteur obligatoire aux niveaux 0 à 2 ; élévation juste à temps pour
  l'administration.
- **Accès** : ABAC par rôle **et** périmètre (classe, établissement, circonscription, département, national).
  Chaque accès, accordé ou refusé, est journalisé avec le critère manquant ; le journal est en ajout seul en base.
- **Registre des faits** (`ledger.evenements`) : en ajout seul ; une correction ajoute un fait correctif, elle
  n'efface rien. Les saisies sont **idempotentes** (`idSaisie`) : un rejeu après une réponse perdue ne double rien.
- **Statistiques** : secret statistique sur les petites cellules (effectif rendu `null`, pas seulement masqué à
  l'écran).
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

### 4.3 Ouvert — à décider ou à traiter

| Réf. | Constat | Gravité | Proposition |
|---|---|---|---|
| **H1** | `GET /auth/mfa/demonstration` affiche le code du second facteur des comptes de démonstration, **y compris en production**, et des comptes privilégiés sont marqués « démonstration » (`admin.beile`, `laure.zannou`, `felicite.akakpo`) : leur mot de passe seul suffit | Haute | Choix délibéré pour le jury. **Après le jury** : refuser la route en production et ne jamais marquer « démonstration » un compte privilégié |
| **M1** | Un compte d'usager (parent, apprenant, responsable provisoire) créé par un chef reste sous son contrôle à l'activation (il choisit le téléphone, ou reçoit le mot de passe temporaire en délégation sans téléphone) ; le périmètre famille couvre tous les enfants du NPI | Moyenne | Canal d'activation indépendant du chef ; prévenir les autres responsables de l'enfant ; alerte vigie sur les créations suivies d'une activation immédiate |
| **M3** | Tout chef du supérieur peut inscrire n'importe quel titulaire du BEPC/BAC (énumération, détournement de l'inscription en cours) | Moyenne | Exiger un vœu admis ou une décision d'orientation vers cet établissement |
| **M4** | La scolarité K-12 n'est jamais close : parents et ancien lycée lisent les données du supérieur d'un étudiant majeur (allocations, actes, UE, licence) | Moyenne | Clore à la certification du BAC ou à la première `INSCRIPTION_SUPERIEURE` ; filtrer les faits du supérieur pour `suivi_familial` et la gestion K-12 |
| B1 | `dejaSaisi` cherche par (`idSaisie`, type) sans l'auteur : une clé `LOT-<lot>` d'EducMaster pourrait être préemptée | Basse | Ajouter l'auteur (ou la source) à la recherche et à l'index partiel |
| B2 | Un administrateur peut clore une alerte vigie qui le concerne | Basse | Interdire la qualification de ses propres alertes (DPO seul) |
| B3 | `/demandes/:id/decision` sans mise à jour conditionnelle (deux décideurs simultanés) | Basse | `update … where statut = 'en_attente'` et 409 sinon |
| B4 | Front : exports des écrans `carriere` et `audit` non attendus (notifications contradictoires si l'export échoue) | Basse | `await exporterCsv(...)` |
| B5 | Données personnelles dans des adresses GET (`/registre/personnes?nom=`, `/admin/referentiels/npi/:npi`) : elles finissent dans les journaux d'accès | Basse | Passer en POST |
| B6 | NPI conservé dans l'état client de l'écran d'inscription après usage | Basse | Effacer après l'inscription |
| B7 | Le filtre du proxy exclut `api`, `images`, `icons` sans barre finale (`/apiX` contourne le proxy) | Basse | Motif `api/` |
| B8 | CSV : les nombres négatifs sont préfixés d'une apostrophe | Basse | Ne neutraliser que les chaînes |
| B9 | Saisies hors connexion **orphelines** (sans compte, antérieures au rattachement) jamais envoyées ni retirées | Basse | Purge au démarrage avec avertissement |
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
| 1 | **Mettre en production `1d6e7a4`** (sans migration) : sauvegarde, fusion `dev` → `main` (front), déploiement de l'API | ① CI verte sur `1d6e7a4`. ② Après déploiement : `curl -s -o /dev/null -w "%{http_code}" -X POST https://beile-api.vercel.app/api/v1/evenements/corrections` → **401** (route vivante, session exigée). ③ `idrissou.sanni` : corriger une note, puis rejouer la même requête (outil réseau du navigateur, « Rejouer ») → la note n'apparaît **qu'une fois** corrigée au carnet. ④ `hortense.guera` → `/etablissement/familles` : rattacher un NPI dont le registre n'inscrit pas la filiation → **refus** avec le message « Le registre national n'inscrit pas ce NPI comme parent… ». ⑤ Ouvrir une fiche `/etablissements/[id]` : elle s'affiche. |
| 2 | **Vérifier les brouillons par compte** | Sur un même navigateur : `idrissou.sanni` commence une saisie de notes sans l'envoyer, se déconnecte ; `hortense.guera` se connecte → aucun brouillon proposé. Contrôle : `idrissou.sanni` reconnecté, avant toute expiration de session → son brouillon revient. Puis laisser la session expirer (ou supprimer le cookie) → au retour, le brouillon a disparu (`localStorage`, clés `beile.brouillon-notes.*`). |
| 3 | **File hors connexion d'un seul compte** | Outils du navigateur → réseau « Hors ligne ». `idrissou.sanni` fait l'appel → « en attente ». Se déconnecter, se connecter avec un autre compte enseignant → **aucun** message « saisies conservées » ; revenir à `idrissou.sanni`, repasser en ligne → l'appel part et le compteur tombe à 0. |

### 5.2 Après le jury — sécurité

| # | Tâche | Comment tester |
|---|---|---|
| 4 | **H1** : fermer `GET /auth/mfa/demonstration` en production ; retirer le marqueur « démonstration » des comptes privilégiés | `curl -s -o /dev/null -w "%{http_code}" https://beile-api.vercel.app/api/v1/auth/mfa/demonstration` → **403/404** en production. Contrôle : la même route répond toujours en recette locale. Connexion de `admin.beile` avec le seul mot de passe → l'écran du second facteur **ne montre plus** de code. Recette : cas dédié « route de démonstration refusée en production ». |
| 5 | **M4** : clore la scolarité K-12 à l'entrée dans le supérieur | Recette : `chantal.dossou` (ou le parent de l'étudiant de démonstration) demande `/apprenants/<id>?finalite=suivi_familial` d'un étudiant inscrit au supérieur → **403** (ou faits du supérieur absents). Contrôle : le même parent lit toujours le dossier d'un enfant au collège → 200. L'ancien lycée → 403 sur les UE et allocations. |
| 6 | **M3** : inscription au supérieur sur vœu admis ou décision d'orientation | `prosper.ahouandjinou` inscrit un bachelier **sans** vœu admis vers l'IFRI → **422** ; avec un vœu admis → 201. Contrôle d'énumération : la réponse pour un NPI inexistant et pour un NPI sans vœu est identique. |
| 7 | **M1** : activation des comptes d'usagers indépendante du chef | Le chef crée un compte parent : la réponse ne contient **aucun** secret et l'activation passe par le téléphone **du registre** (ou un canal tiers), pas par un téléphone choisi par le chef. Les autres responsables de l'enfant reçoivent un avis (visible dans `core.messages_sortants` en recette). Vigie : création suivie d'une activation en moins de N minutes → alerte. |
| 8 | B1 à B9 | Un test par point dans la recette ; pour B7 (risque latent : aucune page actuelle ne commence par ces préfixes, `/apiX` répond 404 aujourd'hui), créer en recette une page protégée `/iconsX` → sans session, elle doit rediriger vers `/connexion` (307) comme toute page protégée. Pour B5 : vérifier dans les journaux de l'hébergeur qu'aucune adresse ne contient de nom ou de NPI. |
| 9 | D1 : dépendances de développement | `npm audit` à la racine → 0 haute ; `npm run build` des deux applications et CI verte. |

### 5.3 Décisions métier attendues (bloquantes pour la suite)

| Décision | Ce qui en dépend | Comment on testera une fois tranché |
|---|---|---|
| **Grille des coefficients** (par matière, par série, par nature d'évaluation) | Moyennes pondérées et bulletins officiels ; aujourd'hui la nature est enregistrée sans pondération | Bulletin d'un élève de référence calculé à la main par un enseignant = bulletin BEILE au centième ; changer un coefficient ne réécrit aucune note au registre |
| **Fournisseur SMS et budget** | Envoi réel des avis (absence, diplôme), activation et récupération par code en production (canaux fermés aujourd'hui) | Passer `BEILE_AVIS_SMS` du mode `journal` au fournisseur ; un SMS reçu sur un téléphone de test ; plafond par numéro et par jour vérifié (le 11ᵉ avis est refusé) ; aucun code dans les journaux |
| **Opérateur USSD** | Consultation des notes et absences sans smartphone | Session USSD de bout en bout sur un numéro de test ; refus pour un numéro non rattaché |
| **Bibliothèque numérique** (voir la note de cadrage, § 8) : droits, stockage, valideurs, stock d'annales, programme officiel | Démarrage de la phase 1 | Défini dans la note : critères par phase |
| **Portails cloisonnés** (public, usagers, gestion, national) | Prêts dans le code, servis aujourd'hui depuis une seule adresse ; demande DNS et hébergement | Chaque portail sur son nom : un compte de gestion refusé sur le portail des usagers et inversement |
| **Registre national réel (ANIP)** | Remplacement de `registre_simule` | Recherche, filiation et décès lus à la source ; plafond de 200 recherches par jour et par chef conservé |

### 5.4 Technique restant

| Tâche | Comment tester |
|---|---|
| **Pagination côté serveur** des grandes listes (élèves d'un département, journal d'audit, personnels) | Liste de plus de 1 000 lignes : la première page arrive en moins de 1 s en 3G simulée ; page 2 sans doublon ni trou ; un filtre ne fait pas fuir de lignes hors périmètre |
| Test de charge après les vagues 1 à 3 (le dernier date d'avant) | 100 utilisateurs simultanés sur un parcours mixte : 0 erreur, 95ᵉ centile sous 1,5 s |
| Parcours navigateur automatisés pour les nouveaux écrans (`/saisie-ecoles`, `/rapport`, `/personnels`, `/visites`, `/etablissement/familles`) | Exécution sans erreur en 1 280 px et 390 px, sans défilement horizontal |

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
