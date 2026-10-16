# Cadrage — Documents : ce que BEILE produit, ce qu'il reçoit

> Octobre 2026. Note de cadrage, au format de [BIBLIOTHEQUE_NUMERIQUE.md](BIBLIOTHEQUE_NUMERIQUE.md).
> Statut : **validée le 16/10/2026**. Le lot 1 (import des listes d'élèves) est en cours.

## 1. La thèse

Une plateforme nationale ne remplace pas le papier d'un coup : elle doit **l'absorber** (les listes, les cahiers
de notes et les feuilles d'appel qui existent déjà) et le **produire mieux** (des documents officiels que l'on peut
vérifier, et non photocopier). Aujourd'hui BEILE ne fait ni l'un ni l'autre complètement :

- **Ce qui sort** : 24 écrans exportent en CSV (déclaration à l'API, neutralisation des formules, pied de
  provenance) ; le bulletin, le rapport mensuel et les états s'impriment par le navigateur ; diplômes et actes
  du supérieur sont scellés avec un QR vérifiable sur `/verifier`.
- **Ce qui entre** : seuls des systèmes, par messages signés (EducMaster, eRESULTATS, UAC, DBAU).
  **Aucun utilisateur ne peut déposer un fichier.** Une école de 800 élèves doit donc inscrire ses élèves un par
  un : c'est le premier frein au déploiement.

## 2. Trois familles de documents produits

| Famille | Documents | Pour quoi faire | Garantie |
|---|---|---|---|
| **Officiels** | Bulletin trimestriel, certificat de scolarité, attestation de réussite, relevé de notes (supérieur), certificat de travail de l'enseignant | Dossiers d'orientation, de bourse, de concours, de transfert ; fin des certificats payés et attendus au guichet | PDF **scellé** (empreinte HMAC) + QR vérifiable publiquement, comme les diplômes. Un document modifié est déclaré « altéré ». |
| **De travail** | Liste de classe, feuille d'appel vierge, cahier de notes, relevé d'absences à signer, état du personnel | Préparer le papier des écoles non connectées (saisie par l'inspection, D6) ; archives internes | Imprimable, nominatif, export journalisé ; **non scellé** (ce n'est pas une preuve) |
| **De pilotage** | Rapport mensuel, statuts d'emploi, couverture, jeux de données ouverts | Conseils de direction, cabinet, partenaires, chercheurs | Agrégats sous **secret statistique** ; formats ouverts (CSV + dictionnaire) |

Règle : un document officiel ne s'imprime jamais depuis l'écran ; il est **émis** par l'API (un fait au registre :
qui l'a demandé, pour qui, quand), et sa vérification ne rend aucune donnée sans le QR.

## 3. Documents reçus

| Import | Qui | Pour quoi faire | Lot |
|---|---|---|---|
| **Liste des élèves** (classe, NPI ou identité, responsable) | Chef d'établissement | Basculer une école entière en une séance | **1** |
| **Services d'enseignement** (qui enseigne quelle matière dans quelle classe) | Chef d'établissement | Ouvrir les carnets des enseignants sans saisie administrative | 1 bis |
| **Notes depuis un tableur** | Enseignant | Pas de double saisie pour ceux qui tiennent déjà un tableur | 3 |
| **Pièces justificatives** (certificat médical, acte) | Famille, guichet | Justifier une absence sans se déplacer | 4 |
| **Feuilles papier scannées** (appel, PV) | Inspection | Preuve attachée à une saisie faite pour le compte d'une école | 4 |
| **Ressources pédagogiques** | Enseignants, comité éditorial | Bibliothèque numérique | voir sa note |

**Ce qui ne s'importe pas** : les enseignants eux-mêmes. Leur affectation passe par le circuit de la direction
départementale (besoin → proposition centrale → prise de fonction) ; un fichier du chef ne doit pas le contourner.
L'import des services ne référence que des enseignants **déjà affectés** à l'établissement.

## 4. Règles communes aux imports

1. **Le fichier ne quitte pas le navigateur.** Le CSV est lu côté client ; l'API ne reçoit que des champs typés
   (JSON validé par zod, 1 500 lignes au plus). Pas de stockage de fichier, pas de macro, pas d'analyse de format
   binaire côté serveur pour les listes. (Le dépôt de pièces, lot 4, est un autre sujet : stockage hors application,
   liste blanche de types, taille plafonnée, contrôle du contenu réel, antivirus.)
2. **Deux temps : vérifier, puis importer.** La vérification rend un rapport ligne par ligne sans rien écrire.
   L'import **refait toutes les vérifications** côté serveur (une simulation n'engage rien) et n'écrit que les
   lignes valides.
3. **Rejouable sans doublon.** Un élève déjà inscrit dans la classe est reconnu (« déjà inscrit ») ; on peut
   corriger le fichier et le réimporter en entier. Écriture sous verrou par établissement : deux imports simultanés
   ne créent pas deux fois le même élève.
4. **Périmètre.** Le chef n'importe que dans les classes de son établissement ; un élève scolarisé ailleurs n'est
   pas « pris » : la ligne renvoie vers le transfert.
5. **Pas d'oracle sur le registre national.** Une ligne avec NPI doit porter le nom et le prénom ; un NPI inconnu
   et un NPI dont l'identité ne concorde pas donnent **le même** message. Le fichier ne permet donc pas de découvrir
   à qui appartient un NPI. Quota : 20 vérifications ou imports par heure et par compte.
6. **Traçabilité.** Chaque inscription est un fait `INSCRIPTION` au registre, marqué de l'identifiant de l'import ;
   le journal d'audit garde l'opération (nombre de lignes, inscrites, refusées). Le rapport d'erreurs téléchargé
   est un export nominatif journalisé.
7. **Enfant sans acte.** Accepté (nom, prénoms, sexe, date de naissance), avec demande de régularisation
   d'identité — comme l'inscription unitaire.
8. **Âge.** Entre 2 et 30 ans, avec ou sans NPI : un adulte du registre (parent, enseignant) ne devient pas
   « élève » par un fichier.
9. **Taille.** Le corps de requête de cette seule route est porté à 640 Ko (16 Ko partout ailleurs) : 1 500 lignes
   aux champs pleins pèsent environ 370 Ko.

## 5. Lot 1 — import des listes d'élèves (en cours)

- **Modèle** téléchargeable : `classe ; niveau ; npi ; nom ; prenoms ; sexe ; date_naissance ; responsable`.
  Séparateur `;` ou `,`, encodage UTF-8 ou Windows-1252 (CSV d'Excel en français), dates `JJ/MM/AAAA` ou
  `AAAA-MM-JJ`.
- **Classes** : reconnues par leur libellé (« 6e A ») pour l'année choisie. Une classe absente est **créée** si la
  ligne donne son niveau et que le chef l'accepte (capacité 60 par défaut, modifiable ensuite).
- **Capacité** : respectée ; les lignes en surnombre sont refusées avec le motif.
- **Écran** : `/etablissement/import` — choisir l'année, déposer le fichier, lire le rapport, importer les lignes
  valides, télécharger les lignes refusées pour les corriger.

**Comment tester** (compte `hortense.guera`) : fichier de 10 lignes mêlant NPI valides, un NPI au nom faux, un
élève déjà inscrit, un enfant sans acte, une classe nouvelle avec niveau, une classe inconnue sans niveau, une ligne
en double. Attendu : rapport exact ligne par ligne ; import → seules les lignes valides au registre ; second import
du même fichier → tout « déjà inscrit », **aucune** nouvelle ligne. Négatifs : enseignant → 403 ; chef d'un autre
établissement → 403 ; 1 501 lignes ou champ inattendu → 422 ; 21ᵉ appel dans l'heure → 429.

## 6. Lots suivants

| Lot | Contenu | Dépend de |
|---|---|---|
| 1 bis | Import des services d'enseignement | — |
| 2 | Bulletin et certificat de scolarité en **PDF scellé** vérifiable (réutilise le scellé des actes) | Choix de la bibliothèque PDF côté serveur |
| 3 | Import de notes depuis un tableur (même moteur vérifier/importer, idempotence par `idSaisie`) | Grille des coefficients pour les moyennes |
| 4 | Pièces justificatives et scans | Décision de stockage (commune avec la bibliothèque), avis du DPO (données de santé) |
| 5 | Format `.xlsx` en entrée | Bibliothèque de lecture auditée (pas de `xlsx` npm non maintenu) |

## 7. Décisions à prendre

1. **Modèle officiel** des bulletins et certificats : en-tête, mentions légales, signature (qui signe : le chef ?
   le système au nom du chef ?).
2. **Stockage des pièces** (lot 4) et durée de conservation des certificats médicaux.
3. **Capacité par défaut** des classes créées par import (60 proposé).
