# Prototype BEILE — périmètre, simulations et critères de validation

> Source fonctionnelle : *Document projet BEILE v3* (cadrage stratégique et technique, sept. 2026).
> Remplace la version de travail : le document de cadrage est désormais intégré.

## 1. Ce que le prototype doit prouver

Le jury est technique et connaît le domaine. Il ne sera pas convaincu par des écrans, mais par **des mécanismes qui fonctionnent sous ses yeux**. Le prototype démontre sept affirmations du document de cadrage, chacune vérifiable en direct :

| # | Affirmation | Preuve en démonstration |
|---|---|---|
| 1 | **Un fait saisi une fois est restitué à tous les niveaux** | Une absence saisie par l'enseignant apparaît instantanément : notification au parent, ligne chez le directeur, taux chez l'inspecteur, carte au cockpit |
| 2 | **L'identité s'ancre sur le registre national** | L'inscription interroge le registre national simulé ; un enfant sans acte d'état civil est **inscrit quand même**, signalé, et une régularisation est déclenchée |
| 3 | **L'accès dépend du rôle, du périmètre, de la relation et de la finalité** | L'enseignant-parent voit son enfant au titre du lien familial et ses classes au titre de la relation pédagogique, sans confusion. Une tentative hors périmètre est refusée, motivée et journalisée |
| 4 | **Le parcours est reconstruit à partir d'événements** | Le passeport éducatif d'un apprenant transféré en cours d'année se reconstitue sans ressaisie ; la ligne de temps affiche chaque événement horodaté |
| 5 | **Une preuve se vérifie en quelques secondes, sans compte** | Un diplôme porte un QR code ; la page publique de vérification confirme son authenticité ; un document falsifié est détecté |
| 6 | **L'IA n'invente jamais un chiffre** | « Ask Education » affiche la requête structurée qu'il a produite, la définition appliquée, la source, la couverture et l'indice de confiance, et **refuse** une question hors droits ou mal posée |
| 7 | **Le pilotage est territorial et explicable** | La carte des 12 départements et des 77 communes montre les zones prioritaires ; chaque couleur est explicable par ses facteurs ; descente département → commune → établissement → classe |

## 2. Structure du dépôt

```text
apps/
  web/                 Next.js — interface du prototype, puis application
  api/                 Hono — API et logique métier (branchée après validation du prototype)
packages/
  contracts/           Schémas zod et types partagés : le contrat entre web et api
docs/
  design/              Charte graphique
  prototype/           Ce plan, parcours et critères d'acceptation
  INFRASTRUCTURE.md
```

**Principe clé.** Les écrans ne parlent qu'à une interface `BeileClient`, définie par `packages/contracts`. Dans le prototype, elle est implémentée par un **moteur de simulation** qui tourne dans le navigateur. Plus tard, elle sera implémentée par un client HTTP vers `apps/api`. **Aucun écran n'est réécrit lors du branchement.**

## 3. Le moteur de simulation

Ce n'est pas un jeu de données figé : c'est un **petit système vivant**.

- **Données générées de façon déterministe** (graine fixe) : 12 départements, 77 communes, établissements géolocalisés, classes, enseignants, apprenants, familles, trois années scolaires d'historique. Ordres de grandeur cohérents avec les publications du MEMP, sans aucune donnée réelle.
- **Registre d'événements** (ledger) : inscription, évaluation, absence, passage, transfert, abandon, reprise, examen, certification. L'état courant et les indicateurs sont **calculés à partir des événements**.
- **Moteur d'autorisation ABAC** : chaque lecture passe par la décision `(rôle, périmètre, relation, finalité)`. Les refus sont journalisés.
- **Journal d'audit** consultable par le profil « Délégué à la protection des données ».
- **Couche sémantique** : dictionnaire des indicateurs (définition, formule, source, fréquence, unité), compilée en calculs sur les événements.
- **Persistance locale** (navigateur), avec un bouton « Réinitialiser la démonstration ».
- Bandeau permanent **« Données de démonstration — entièrement fictives »**.

## 4. Profils de démonstration

Un sélecteur de profil permet de changer d'acteur en un clic pendant la présentation. Tous les noms sont fictifs.

| Profil | Personne fictive | Périmètre | Produit |
|---|---|---|---|
| Apprenant | Élève de 5e | Soi-même | Espace apprenant |
| Parent | Mère de deux enfants dans deux établissements | Ses enfants (lien vérifié au registre) | Espace famille |
| Enseignant **et** parent | Professeur de mathématiques dont l'enfant est dans son établissement | Ses classes + son enfant | Espace enseignant |
| Chef d'établissement | Directeur d'un CEG | Son établissement | Espace établissement |
| Inspecteur | Inspecteur de circonscription | Établissements de sa circonscription | Console territoriale |
| Directeur départemental | Direction départementale du Borgou | Département | Console territoriale |
| Administration centrale | Cabinet du ministre | National | Cockpit national |
| Chercheur | Laboratoire universitaire | Données agrégées anonymisées | Portail de données |
| Tiers vérificateur | Employeur, sans compte | Vérification d'une preuve | Page publique |
| Délégué à la protection des données | DPO | Journal d'audit | Console d'audit |

## 5. Inventaire des processus simulés

Les 15 processus du document de cadrage (§6). Pour chacun : acteur, scénario de démonstration, règles simulées, cas d'erreur, critère d'acceptation.

### Pilotage

| Code | Processus | Scénario simulé | Règles et cas limites | Critère d'acceptation |
|---|---|---|---|---|
| P1 | Politiques et référentiels nationaux | L'administration centrale consulte le dictionnaire national et publie une nouvelle version d'un indicateur | Versionnement : un indicateur publié n'est jamais modifié, il est remplacé par une version | Chaque chiffre affiché renvoie à la version de sa définition |
| P2 | Planification et allocation | Simulation « what-if » : ouvrir 3 établissements dans une commune saturée ; affecter 20 enseignants | Hypothèses et limites affichées avec le résultat | Capacité, distance moyenne et ratio recalculés, hypothèses visibles |
| P3 | Pilotage par la donnée | Cockpit national : chiffres clés, alertes, carte « Où agir ? », descente jusqu'à la classe ; Ask Education | Indice de confiance sur chaque chiffre ; petits effectifs masqués ; refus motivé hors droits | Une question posée en langage courant produit un chiffre sourcé, ou un refus expliqué |

### Réalisation

| Code | Processus | Scénario simulé | Règles et cas limites | Critère d'acceptation |
|---|---|---|---|---|
| P4 | Identification et enrôlement | Le directeur recherche un enfant au registre national simulé et crée son identité éducative | Aucune création d'identité civile ; **enfant sans acte : inscrit, signalé, régularisation déclenchée** ; doublon détecté | Un identifiant éducatif stable est attribué ; le cas sans acte est traité sans exclusion |
| P5 | Réseau d'établissements | Consultation et mise à jour d'un établissement : classes, capacités, infrastructures, géolocalisation | Capacité dépassée signalée | L'établissement apparaît sur la carte avec son taux d'occupation |
| P6 | Inscription et réinscription | Inscription en 5e, affectation en classe, génération de l'événement | Classe pleine : alerte ; dossier incomplet : pièce manquante signalée | L'événement apparaît dans le passeport et dans les effectifs |
| P7 | Vie scolaire et suivi | Appel en classe, saisie de notes, génération du bulletin, alerte de décrochage | Absence → notification parent ; baisse sur 3 évaluations → alerte, **validation humaine** avant action ; saisie hors connexion puis synchronisation | Le bulletin est produit sans ressaisie ; l'alerte est proposée, pas imposée |
| P8 | Examens et certification | Ouverture de session CEP/BEPC, candidatures sans ressaisie, résultats, délivrance d'un diplôme vérifiable | Correction de note journalisée avec son auteur ; document altéré détecté à la vérification | Un tiers vérifie le diplôme par QR code, sans compte |
| P9 | Transitions et orientation | Passage de fin d'année, transfert en cours d'année, abandon, reprise, proposition d'orientation | Orientation : critères visibles, décision humaine ; transfert : le parcours suit l'élève | Le passeport d'un élève transféré est complet et continu |

### Support

| Code | Processus | Scénario simulé | Règles et cas limites | Critère d'acceptation |
|---|---|---|---|---|
| P10 | Personnels enseignants | Passeport professionnel : affectations, formations, certifications ; inscription à une formation | Formations obligatoires en attente signalées | La carrière est reconstituée à partir d'événements |
| P11 | Identités, accès, habilitations | Sélecteur de profil ; tentative d'accès hors périmètre ; cas enseignant-parent | Décision ABAC affichée (critère manquant) ; refus journalisé | Chaque refus nomme le critère manquant et apparaît dans l'audit |
| P12 | Interopérabilité | Tableau des raccordements : registre national, EducMaster, examens ; flux, fraîcheur, rejets | Message non conforme rejeté par validation de schéma ; provenance de chaque donnée | La provenance d'une donnée est affichable en un clic |
| P13 | Qualité et gouvernance | Tableau de qualité : complétude, fraîcheur, cohérence, validation par établissement | Établissement retardataire identifié ; indice de confiance recalculé | L'indice baisse visiblement quand des établissements n'ont pas transmis |
| P14 | Sécurité et conformité | Console DPO : journal des accès et refus, registre des traitements, durées de conservation | Journal en ajout seul | Le DPO retrouve qui a consulté quel dossier, pour quelle finalité |
| P15 | Exploitation et continuité | Page d'état : disponibilité, dernière sauvegarde, dernier test de restauration, file de synchronisation | Valeurs simulées, clairement marquées | L'état de santé du système est lisible par un non-technicien |

## 6. Scénario de démonstration (fil rouge, environ 8 minutes)

1. **Cockpit national** (sombre) : chiffres clés avec indice de confiance, carte « Où agir ? », une commune en rouge. *Pourquoi ?* → les facteurs.
2. **Ask Education** : « Proportion d'élèves de 11 à 13 ans ayant au moins 15/20 en mathématiques en 2025-2026, par sexe et par département. » → requête structurée visible, chiffre, carte, source, confiance. Puis une question hors droits → **refus motivé**.
3. Descente vers **un établissement** de la commune rouge → basculement sur le profil **Chef d'établissement** : ses alertes (« 12 élèves en baisse en mathématiques »).
4. **Enseignant** : appel en classe hors connexion → synchronisation → **le parent reçoit la notification** → le taux du directeur et la carte du cockpit bougent. *Un fait, quatre restitutions.*
5. **Inscription** d'un enfant sans acte d'état civil → inscrit, signalé, régularisation déclenchée.
6. **Passeport éducatif** d'un élève transféré → ligne de temps continue → diplôme BEPC → **QR code vérifié par un tiers sans compte** ; version falsifiée → rejetée.
7. **Enseignant-parent** tente d'ouvrir le dossier d'un élève d'une autre classe → **refus, critère « relation » manquant** → la console DPO montre le refus journalisé.
8. Clôture sur la **page d'état** : dernière sauvegarde, dernier test de restauration réussi.

## 7. Critère de sortie du prototype

Chaque profil accomplit chaque processus retenu avec les données de démonstration, comprend les résultats et les erreurs, et le fil rouge se déroule **sans intervention technique**. À ce stade, le branchement de `apps/api` remplace le moteur de simulation sans modifier les écrans.
