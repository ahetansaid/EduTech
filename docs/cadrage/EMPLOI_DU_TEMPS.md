# Cadrage — Emploi du temps et agenda

> Octobre 2026. Note de cadrage, au format de [BIBLIOTHEQUE_NUMERIQUE.md](BIBLIOTHEQUE_NUMERIQUE.md) et
> [DOCUMENTS_IMPORT_EXPORT.md](DOCUMENTS_IMPORT_EXPORT.md). Statut : **validée le 21/10/2026**, lot 1 en cours.

## 1. Constat

BEILE sait **qui enseigne quoi, où** (services d'enseignement), mais pas **quand**. L'appel se fait à la journée,
pas à la séance ; aucun emploi du temps n'existe pour le primaire et le secondaire (le supérieur a seulement un
« créneau » texte sur les offres d'UE). Il existe déjà des éléments datés, épars : calendrier scolaire officiel
(`/calendrier`), visites d'inspection à venir, conseils de classe, échéances du supérieur.

## 2. La thèse

Un agenda personnel « vide » ne serait pas rempli. La donnée qui a de la valeur à chaque niveau est
l'**emploi du temps** ; l'agenda en est la **lecture**, agrégée par profil, avec ce qui est déjà daté.

| Niveau | Ce que l'emploi du temps apporte |
|---|---|
| Élève, famille | La journée de l'enfant : cours, compositions annoncées, réunions, démarches |
| Enseignant | Son planning ; l'appel par séance ; ses heures effectives (décisif pour les vacataires, payés à l'heure) |
| Chef d'établissement | Heures non assurées, remplacements, classes sans enseignant à un créneau |
| Inspection, direction départementale | Heures **effectivement assurées** par école et par matière ; besoins réels en enseignants pour les affectations |
| Administration centrale | Volume horaire enseigné comparé aux horaires réglementaires |

## 3. Ce que BEILE ne fait pas

**Il ne construit pas d'emploi du temps** (solveur de contraintes : salles, enseignants, demi-journées). Les écoles
ont déjà le leur, sur papier ou dans un logiciel ; BEILE le **reçoit**, le contrôle et le rend utile.

## 4. Règles

1. **Cohérent avec les services** : un cours n'existe que si l'enseignant a un service pour cette classe et cette
   matière. Les services passent d'abord (lot 1 bis des documents).
2. **Sans chevauchement** : ni pour une classe, ni pour un enseignant (toutes classes confondues), ni pour une salle.
3. **Remplacer par classe** : une classe du fichier reçoit exactement les cours listés ; une classe dont une ligne
   est refusée est bloquée en entier (même règle que les services).
4. **Plages plausibles** : lundi à samedi, entre 06 h 00 et 20 h 00, une séance de 15 min à 4 h.
5. **Confidentialité** : l'emploi du temps d'un mineur dit où il se trouve et à quelle heure. Lecture réservée à
   l'élève, sa famille, son école et sa tutelle ; jamais publié, jamais exporté en masse. **Avis du DPO requis avant
   l'affichage élève et famille** (lot 2).
6. **Traçabilité** : chaque import est journalisé (classes, nombre de cours, refus) ; chaque refus avec son critère.

## 5. Lots

| Lot | Contenu | Dépend de |
|---|---|---|
| **1** | Modèle `core.cours` ; import CSV par le chef (vérifier → importer) ; vue par classe (chef, inspection en lecture) ; « mon emploi du temps » de l'enseignant | — |
| 2 | Journée et semaine de l'élève et de la famille | Avis du DPO (règle 5) |
| 3 | Appel par séance ; heures assurées / non assurées consolidées pour l'inspection | Décision : généralisation ou établissements pilotes |
| 4 | Agenda unifié en lecture (calendrier, emploi du temps, compositions annoncées, conseils, visites, échéances) | Lots 1 à 3 |
| 5 | Comparaison aux horaires réglementaires par niveau et matière | Source officielle des grilles horaires |

## 6. Lot 1 — comment tester

Compte `hortense.guera`, écran `/etablissement/emploi-du-temps` :
- fichier `classe;jour;debut;fin;matiere;enseignant;salle` : une ligne valide → « à importer » ; une matière sans
  service pour cet enseignant → refusée (« importez d'abord les services ») ; deux cours qui se chevauchent pour la
  même classe, le même enseignant ou la même salle → refusés ; une heure « 25:00 » → refusée ;
- import → la grille de la classe s'affiche ; l'enseignant (`idrissou.sanni`) voit son cours dans « mon emploi du
  temps » ;
- rejeu du même fichier → rien ne change ; négatifs : enseignant → 403 sur l'import ; chef d'un autre établissement
  → 403 ; champ hors contrat → 422.

## 7. Décisions à prendre

1. **Horaires réglementaires officiels** (grilles par niveau et matière) : quelle source fait foi, qui la fournit ?
2. **Appel par séance** : généralisation ou établissements pilotes d'abord ?
3. **Confidentialité de l'emploi du temps des mineurs** : validation par le DPO (règle 5).
4. **Clôture d'une année scolaire** : BEILE n'a pas encore de notion d'année close — une année qui a des classes
   reste modifiable (emploi du temps, services, inscriptions). À partir de quand une année est-elle figée (après les
   conseils de passage ? au 31 juillet ?), et qui peut la rouvrir ?

## 8. Saisie à l'écran (ajouté le 22/10/2026)

L'administration de l'école (détenteurs de l'habilitation « chef d'établissement » sur l'établissement, y compris
les adjoints à qui l'inspection l'a déléguée) peut aussi **ajouter, modifier et supprimer une séance** à l'écran, sans
fichier : mêmes contrôles que l'import (service, chevauchements de classe, d'enseignant et de salle, plages), sous le
même verrou ; chaque écriture et chaque refus sont journalisés (modification : état avant → après) ; 120 écritures
par heure et par compte au plus. L'inspection reste en lecture seule.
