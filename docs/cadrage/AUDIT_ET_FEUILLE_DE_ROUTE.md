# Audit des fonctionnalités et feuille de route (interopérabilité, fonctions avancées)

> Novembre 2026. Audit du 02/11/2026 (inventaire de 273 routes d'API et de 85 écrans), premier lot de correctifs le 03/11/2026.
> Production à la date de l'audit : main `35dae32`.

## 1. État des lieux

| Domaine | Routes | Couverture par la recette | Simulé ou incomplet |
|---|---|---|---|
| Comptes, second facteur, vigie | 28 | Connexion et élévation testées ; enrôlement du second facteur ajouté le 03/11 | Envoi SMS et courriel non branché : récupération de compte fermée en production |
| Administration, délégation | 36 | Bonne ; activation, sessions et verrou ajoutés le 03/11 | — |
| Scolarité de la maternelle au lycée | 46 | Le cœur le mieux couvert | Abandon, décision sur un justificatif, arbitrage d'un transfert par l'inspection non testés |
| Familles | 6 | Correcte | Justification d'absence par la famille non testée |
| Frais | 7 | Auditée trois fois | Recours sur refus de réclamation à construire |
| Examens | 10 | Correcte | Ouverture d'un centre non testée |
| Supérieur (LMD) | 70 | **29 routes hors recette** (scénario séparé seulement) | L'absence d'homologation ne bloque pas l'inscription ; certification : ticket #57 |
| Pilotage | 23 | Testé | **Cube des indicateurs généré, pas calculé depuis le registre** ; `/ask` et `/analyse` sur `@beile/simulation` |
| Inspection et tutelle | 11 | Surtout des refus | 3 routes non testées |
| Droits RGPD, DPO | 7 | Dépôt et instruction ajoutés le 03/11 | — |
| Interopérabilité | 5 | Dépend de `BEILE_PARTENAIRES` | Quatre connecteurs **entrants** signés (HMAC), aucun émetteur réel, aucun flux sortant |
| Services publics | 16 | Testés | — |

**Ce que la plateforme est aujourd'hui** : un prototype fonctionnel complet sur données fictives. Le registre des
personnes est simulé (`registre_simule`), les indicateurs sont générés, les SMS sont consignés dans un journal.

## 2. Correctifs du 03/11/2026 (lot P1)

- **Comptes à identifiant composé** (`CPT-directeur-ifri`) : l'administrateur ne pouvait ni réinitialiser leur mot de
  passe ni les désactiver. Une règle unique `ID_COMPTE` sert désormais toutes les routes. L'activation d'un compte
  inexistant répond 404, au lieu d'un succès silencieux. La désactivation d'un compte privilégié est signalée à la vigie.
- **Écran d'interopérabilité** : le registre de l'ANIP est présenté comme simulé, le portail des services publics
  comme « à construire », le flux sortant vers eRESULTATS comme absent. Un connecteur n'est « en exploitation »
  qu'après un lot signé reçu : les événements du jeu de démonstration ne comptent plus.
- **Pannes d'API** : la vigie n'affiche plus « Aucune alerte » quand elle est illisible. « Mon compte » ne plante
  plus. Les jeux de données et les droits (famille, apprenant) disent quand une lecture a échoué.
- **Gardes d'espace** : le menu et la garde appliquent la même règle, qui tient compte du rôle et du cycle. Le chef
  d'établissement a accès au poste de pilotage, le chercheur aux écrans du supérieur prévus pour lui.
- **Libellés** des dix types d'alerte qui s'affichaient sous leur code technique. Suppression de code mort (`useAskMutation`).
- **Recette** : 41 cas ajoutés, couvrant le second facteur, l'administration d'un compte, la qualification d'une
  alerte et l'exercice des droits.

**Reste à décider** : mentions « République du Bénin / Ministère » en production (mandat ou retrait).

## 3. Feuille de route de l'interopérabilité

### A. Fondations, sans partenaire

| # | Chantier | Raison |
|---|---|---|
| A1 | Interface `RegistreNational` : réalisation simulée (actuelle) et client ANIP | Le code lit `registre_simule` en direct : basculer vers l'ANIP serait une réécriture |
| A2 | Interface `Notificateur` (SMS, courriel, puis USSD) avec un fournisseur réel | Débloque la récupération de compte et les notifications aux familles |
| A3 | Contrats OpenAPI versionnés (`/interop/v1`), générés depuis les schémas zod | Un partenaire se branche sur un contrat, pas sur du code |
| A4 | Rotation des clés HMAC (clé active et clé suivante), puis mTLS ou plateforme nationale | La clé partagée actuelle est unique et sans date d'expiration |
| A5 | Journal d'échanges par partenaire (reçu, rejeté, rejoué) et accusé de réception signé | Permet de trancher un litige (« PV jamais reçu ») |
| A6 | Écran d'interopérabilité alimenté par A5 | Fin des déclarations écrites dans le code |

### B. Lignes par partenaire

| Ligne | Sens | Contenu | Prérequis |
|---|---|---|---|
| ANIP | Lecture | État civil, NPI, filiation | Convention, avis de l'autorité de protection des données, A1 |
| Plateforme nationale d'interopérabilité (ASIN) | Les deux | Faire passer tous les flux par la plateforme nationale | Protocole et procédure d'adhésion à confirmer auprès de l'ASIN |
| Examens (DEC, eRESULTATS) | Sortie puis entrée | Candidatures pré-remplies depuis le dossier ; retour des PV | Flux sortant à construire |
| EducMaster | Entrée, puis synchronisation | Écoles déjà équipées, sans double saisie | Étendre le connecteur des absences aux élèves et aux notes |
| Universités | Les deux | PV de diplôme (existe) ; dossier du bachelier (à construire) | — |
| DBAU | Les deux | Allocations (existe) ; éligibilité calculée depuis le parcours (à construire) | — |
| service-public.bj | Sortie | Attestations et vérification de diplôme | A3, A4 |
| Fonction publique (GRH) | Lecture | Carrière et affectation des enseignants | Interlocuteur à identifier |
| INStaT, données ouvertes | Sortie | Agrégats sans compte, avec seuils de petits effectifs | Cube calculé depuis le registre |
| Mobile money | — | **Déconseillé pour l'instant** : les frais ne portent volontairement aucun montant | Décision politique d'abord |

**Ordre proposé** : A1 à A6, puis le flux sortant des examens, puis l'ANIP et la plateforme nationale dès qu'une
convention le permet.

## 4. Fonctionnalités avancées

**Avancées** (de 1 à 3 mois chacune, sans IA) :
1. Alerte précoce de décrochage par élève : règle explicable (absences, chute des notes, transfert, redoublement).
2. Mode hors ligne pour les écoles peu connectées : saisie différée, l'idempotence `ID_SAISIE` existe déjà.
3. Diplômes vérifiables sans réseau : signature cryptographique dans le QR.
4. Carte scolaire : capacités, effectifs, projections.
5. Affectation post-bac transparente : algorithme publié, décision expliquée au candidat.
6. Notifications aux familles par SMS et USSD (après A2).

**Très avancées** (6 mois et plus) :
1. Registre infalsifiable : chaînage des empreintes et racine de Merkle publiée chaque jour.
2. Détection de fraude aux examens : anomalies par centre, écart entre notes de classe et résultats.
3. Statistiques publiques protégées par la confidentialité différentielle.
4. Assistant de pilotage en langue naturelle sur des vues agrégées réelles, avec citation des sources.
5. Simulateur de politiques (ouverture de classes, cantines).
6. Évaluations diagnostiques standardisées et remédiation.
7. Portefeuille scolaire portable, partagé avec le consentement de l'élève.

**À exclure** : biométrie des mineurs, notation automatique des élèves, profilage des familles.

**Préalable commun** : une grande part de ces fonctions n'a de valeur que sur des données réelles. Brancher le
registre et calculer le cube depuis le registre reste la priorité.
