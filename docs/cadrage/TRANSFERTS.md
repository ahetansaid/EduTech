# Cadrage — Changements de classe et transferts entre écoles

> Octobre 2026. Statut : **validée le 22/10/2026** (recommandations retenues), livrée en local le 23/10/2026.

## 1. Constat

- **Changement de classe dans la même école : rien.** Un élève ne changeait de classe qu'au conseil de passage :
  impossible de corriger une erreur d'affectation ou de rééquilibrer deux classes en cours d'année.
- **Transfert entre écoles : une route unilatérale.** Le chef de départ inscrivait l'élève dans une classe d'une autre
  école, sans accord de celle-ci, sans contrôle des places ni motif ; la famille n'était prévenue qu'après coup.
- Le dossier, lui, suivait déjà : notes, absences et diplômes sont rattachés à l'élève au registre.

## 2. Règles

| | Changement de classe | Transfert entre écoles |
|---|---|---|
| Qui | L'administration de l'école (chef et adjoints délégués) | Le départ **demande**, l'accueil **accepte** (choix de la classe) **ou refuse** en motivant |
| Où | Même école, même année, même niveau (le niveau se décide en conseil de passage) | Même niveau, même année, autre école |
| Contrôles | Année ouverte, places restantes, motif (10 à 200 caractères) | Idem ; une seule demande vivante par élève ; **15 jours** pour répondre, puis expiration |
| Registre | Fait `CHANGEMENT_CLASSE` (de → vers, motif) | Circuit `TRANSFERT` (moteur de workflow), puis fait `TRANSFERT` à l'accord, rattaché à la demande |
| Famille | Notifiée (sans le motif : un téléphone se partage) | Notifiée à la demande, au refus (sans le motif de l'école d'accueil), au retrait, au transfert effectif |

- **L'élève reste dans son école** tant que l'accueil n'a pas accepté. Le départ peut **retirer** sa demande tant
  qu'elle n'a pas abouti, **y compris après un refus** (la famille renonce : plus aucune imposition possible) ; une
  nouvelle demande clôt les demandes expirées ou refusées du même élève.
- **Décision de l'inspection** : l'inspection de la circonscription **d'accueil** peut décider le transfert **seulement
  après** un refus de l'école ou l'échéance de 15 jours sans réponse — jamais pendant que l'école réfléchit — et dans les
  **30 jours** qui suivent ce refus ou cette échéance (au-delà, une nouvelle demande est nécessaire). Motif obligatoire ;
  places et année ouverte restent contrôlées ; le fait porte `impose: true`.
- **Demande devenue obsolète** : si l'élève a changé d'année ou de niveau entre-temps (conseil de passage), une demande
  ancienne ne l'y ramène pas : l'accord ou l'imposition est refusé (409).
- **Concurrence** : l'écriture se fait sous verrou de l'élève puis de la classe d'arrivée ; situation et places sont
  relues dans la transaction. Deux acceptations simultanées : une seule passe.
- **Bulletins** : les notes et absences d'un élève sur l'année comptent quelle que soit la classe où elles ont été
  saisies ; le bulletin mentionne les autres classes fréquentées. Le trimestre de référence ne retombe plus au
  trimestre 1 pour une classe qui n'a reçu que des élèves déplacés.
- **Traçabilité** : chaque demande, réponse, retrait, décision et chaque refus (critère `perimetre`, `role`, `annee`,
  `controle`) est journalisé, y compris un identifiant de demande inconnu ; 60 mouvements par heure et par compte au plus.
- **Audit de sécurité** (23/10 puis 26/10) : aucune faille haute ; corrigés : M1 (demande obsolète), M2 (imposition
  sans limite, retrait d'une demande refusée), M3 (imposition avant la réponse de l'école), M4 (liste de l'inspection
  filtrée en base), B1 (motif du refus dans la notification), B3 (404 non journalisés).
- **Ce que la recette ne joue pas ici** : les deux fenêtres nouvelles de l'imposition (après le refus ou l'échéance de
  l'accueil, puis 30 jours au plus) ne sont pas jouées par `apps/api/src/recette.ts` — la recette n'a **aucun compte
  dans l'école d'accueil** du périmètre pilote et ne teste que le 403 de l'école de départ qui voudrait répondre à sa
  place. Écrire un cas vert sur ce chemin reviendrait à faire croire à une preuve. La garde est double pourtant : la
  fenêtre est dans la condition `UPDATE` de la transaction, pas seulement dans la lecture qui précède.

## 3. Écrans

- Dossier de l'élève : « Changer de classe », « Transférer » (classe d'accueil, motif) ; bandeau de la demande en attente.
- Établissement › **Transferts** : demandes reçues (accepter / refuser) et envoyées (suivi / retrait).
- Pilotage › **Transferts d'élèves** (inspection) : à arbitrer (refusées, expirées), en cours et récents.

## 4. Hors périmètre pour l'instant

- Information de la direction départementale d'accueil lors d'un transfert entre deux départements.
- Demande initiée par la famille elle-même (aujourd'hui : par l'école de départ, à la demande de la famille).
- Transfert vers un établissement hors BEILE (sortie du système) : reste une déclaration d'abandon motivée.

## 5. Constat de données

En base locale, des classes dépassent déjà leur capacité (5e A de Parakou : 49 élèves pour 47 places) : l'import de
listes n'impose pas la capacité. Les mouvements la contrôlent ; une classe en surcapacité ne reçoit plus personne.
