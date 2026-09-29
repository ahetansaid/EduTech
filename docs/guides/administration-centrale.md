# Guide Administration centrale

**Pour qui :** Cabinet du ministre, directions centrales, pilotage national.  
**Votre espace :** Cockpit national — vous y arrivez directement après la connexion (`/cockpit`).  
**Accès :** https://edu-tech-api-rho.vercel.app/cockpit · centre d'aide en ligne : https://edu-tech-api-rho.vercel.app/aide/administration-centrale

> Voir en un écran la situation du pays, repérer les territoires qui demandent une action et interroger les données en français.

## Sommaire

1. [Premiers pas](#premiers-pas)
2. [Vos écrans](#vos-écrans)
3. [Tâches pas à pas](#tâches-pas-à-pas)
4. [Questions fréquentes](#questions-fréquentes)
5. [Bons réflexes](#bons-réflexes)
6. [En cas de problème](#en-cas-de-problème)

## Premiers pas

### Se connecter

> Chaque connexion est journalisée : c'est ce qui protège vos données et celles des élèves.

1. Ouvrez BEILE dans votre navigateur (téléphone ou ordinateur), puis touchez « Connexion ».
2. Saisissez votre « Identifiant » (de la forme prenom.nom) et votre « Mot de passe ».
3. Touchez « Se connecter ». Votre espace s'ouvre directement.
4. Après 5 essais infructueux, le compte est verrouillé 15 minutes : attendez, puis réessayez calmement.

### Première connexion : choisir son mot de passe

> Le mot de passe remis par l'administrateur est temporaire. Vous seul devez connaître le mot de passe définitif.

1. Connectez-vous avec le mot de passe temporaire : l'écran « Choisissez votre mot de passe » s'ouvre de lui-même.
2. Recopiez le « Mot de passe temporaire ».
3. Choisissez un « Nouveau mot de passe » : 12 caractères au moins, une majuscule, une minuscule et un chiffre. Les quatre voyants passent au vert.
4. Saisissez-le à nouveau dans « Confirmer le nouveau mot de passe », puis touchez « Enregistrer le mot de passe ».

### Relancer la visite guidée

1. La visite démarre seule à votre première arrivée dans un espace.
2. Pour la revoir, touchez le bouton « Guide » (point d'interrogation) en haut de l'écran.
3. Avancez avec « Suivant », revenez avec « Précédent », quittez avec « Passer » ou la croix. Au clavier : flèches ← → et Échap.

### Changer son mot de passe

1. Touchez votre nom ou vos initiales (en bas du menu sur ordinateur, en haut à droite dans les espaces personnels).
2. Choisissez « Changer mon mot de passe ».
3. Saisissez le « Mot de passe actuel », puis le nouveau deux fois, et touchez « Enregistrer le mot de passe ».
4. Vos autres sessions (autres appareils) sont fermées automatiquement.

### Se déconnecter

1. Touchez votre nom ou vos initiales.
2. Choisissez « Se déconnecter ». L'écran de connexion s'affiche.
3. Faites-le toujours sur un appareil partagé (cybercafé, ordinateur de l'école, téléphone prêté).

## Vos écrans

### Poste de pilotage

`/aujourd-hui` — Vos décisions du jour, triées par échéance.

- Rassemble les demandes dont l'étape courante relève de votre rôle et de votre périmètre national.
- Classées par urgence : échéance atteinte ou dépassée en tête, puis cette semaine, puis à surveiller.
- Chaque ligne ouvre « Demandes à traiter » sur la demande concernée.

### Cockpit national

`/cockpit` — La situation du système éducatif, calculée sous votre habilitation.

- Chiffres clés : apprenants, établissements, enseignants, réussite au BEPC, mathématiques ≥ 15/20.
- Carte à couches : priorités, occupation, absentéisme, abandon…
- Flux des faits du jour, actualisé toutes les 15 secondes (faits anonymes).
- Parité filles-garçons, classement territorial, abandon scolaire, zones à examiner.
- « Fiabilité et dispersion des chiffres » : indice de confiance et couverture de chaque indicateur, décomposition de la confiance (complétude, fraîcheur, cohérence, validation) avec un verdict de citabilité, et étendue territoriale du maths ≥ 15/20 (communes masquées exclues du calcul, comme de l'export CSV).

### Où agir ?

`/cockpit/carte` — Descendre du pays jusqu'aux établissements.

- Fil de descente : Bénin, département, commune.
- Facteurs objectivés : croissance, occupation, encadrement, absentéisme, résultats.
- Liste des établissements d'une commune, avec « Relancer » pour ceux qui n'ont pas transmis.

### Ask Education

`/ask` — Poser une question en français, obtenir un chiffre prouvé.

- Réponse avec définition, source, couverture et indice de confiance.
- Refus expliqué et journalisé pour une question sur une personne ou hors périmètre.

### Données et service

`/plateforme/qualite` — Qualité des données, dictionnaire national, interopérabilité, état du service.

- Qui a transmis, depuis quand, avec quelle confiance.
- Définition officielle de chaque indicateur et de ses versions.

### Enseignement supérieur

`/enseignement-superieur` — Le référentiel national des filières, concours, écoles et stages du supérieur.

- « Filières et parcours » : chaque filière par voie (universitaire, technologique, professionnelle, apprentissage), avec le cycle LMD ouvert, le diplôme visé, les ECTS, la capacité annuelle, l'accès par concours et la durée de stage obligatoire.
- « Concours » : les sessions avec leur statut, les places offertes et les coefficients des épreuves ; filtre par statut et export CSV.
- « Écoles et établissements » : le réseau (universités, écoles nationales, instituts), ses tutelles MESRS / MESTFP / Emploi-PME et ses rattachements.
- « Stages » : le cycle de vie d'une convention et les durées obligatoires par filière — aucun suivi nominatif d'apprenant.
- « Formations pro » : l'échelle des diplômes EFTP (CAP → BEP → Bac technique → BT → BTS/CQP) et la passerelle vers la licence professionnelle.
- Le bandeau « indicatif » rappelle que ces listes ne remplacent pas les arrêtés publiés.

### Guichet & délais

`/enseignement-superieur/guichet` — Ce que le parcours administratif coûte réellement aux étudiants.

- Médiane constatée entre le dépôt d'une demande et la mise à disposition de l'acte, par établissement, par acte et par autorité signataire (établissement, DEC, DGES, DBAU).
- Le barème jugé est celui qui courait au jour du dépôt ; deux lignes peuvent donc coexister pour le même acte.
- Aucune ligne nominative : uniquement des comptages et des médianes, bornés aux communes du périmètre de l'agent.
- Sous dix demandes, la ligne est signalée « sous le seuil » — le signalement ne masque rien, il prévient le lecteur.
- « Calendrier des dépôts » : les dates limites déclarées par la DBAU ou le MESRS, avec les pièces exigées à chaque échéance.
- « Effet des allocations » : effectifs par statut de compte, par nature de décision et par autorité — aucun montant, aucun RIB, aucun échéancier.
- « Signer un acte qui ne relève pas de l'établissement » : une autorité nationale scelle, à partir de la référence de l'acte (ACTE-…), ce que le guichet d'établissement ne peut pas signer — un diplôme à la DEC, un duplicata national à la DGES. Aucune liste nominative n'est parcourue ici : la référence vient du guichet de l'établissement ou de l'espace de l'étudiant.
- « Exporter (CSV) » : les lignes affichées, avec la médiane (jamais la moyenne) et la provenance du barème.

### Scolarité du supérieur · agrégats & actes

`/enseignement-superieur/scolarite/pilotage` — Ce que la scolarité du supérieur produit, sans aucun étudiant nommé — et les actes que l'État pose sur un établissement.

- « Capitalisation ECTS — agrégat par voie » : une ligne par voie, jamais par établissement, avec les crédits acquis, attendus et périmés, et le taux. Le moteur est celui du registre des écritures, pas la couche statistique.
- Sous le seuil de publication, la cellule garde son effectif et perd ses valeurs : la règle des petits effectifs s'applique au calcul, pas seulement à l'affichage.
- « Effets enregistrés » : inscriptions par statut, décisions par voie, homologations par statut, jurys par étape, exportables en CSV avec leur provenance.
- « Actes de l'État » (habilitation centrale au périmètre national) : cycle EPES par autorité tutélaire, homologation d'une filière dont le diplôme est celui qu'elle vise, contrôle pédagogique de l'homologation rendue.
- « Règle nationale de validation » : les huit paramètres applicables là où aucune portée plus précise n'a été déclarée.
- Aucune lecture nominative : le dossier administratif d'un établissement se lit par son chef et par l'inspecteur de sa circonscription, pas depuis cette console.

## Tâches pas à pas

### Prioriser ses décisions du jour

1. Touchez « Poste de pilotage » dans le menu, sous « Aujourd'hui ».
2. Traitez les demandes « À traiter aujourd'hui » (échéance atteinte ou dépassée).
3. Touchez une ligne : « Demandes à traiter » s'ouvre sur la demande, où vous rendez la décision motivée.

### Repérer une commune à examiner

> La couleur d'une commune s'explique toujours par des facteurs mesurés.

1. Dans le cockpit, regardez la carte « Priorités » et la liste « Zones à examiner en priorité ».
2. Touchez une commune : le panneau affiche son niveau et le « Pourquoi ? » (facteurs et valeurs).
3. Touchez « Descendre jusqu'aux établissements » pour ouvrir « Où agir ? » sur cette commune.

### Juger si un chiffre est citable

> Une moyenne nationale se cite d'autant plus prudemment qu'un indicateur est peu complet ou très dispersé.

1. Dépliez « Fiabilité et dispersion des chiffres » sous la carte.
2. Lisez l'indice de confiance et la couverture de chaque indicateur ; le repère « le plus fragile » signale celui à ne pas citer seul.
3. Consultez l'étendue territoriale du « Maths ≥ 15/20 » : médiane, écart-type, moitié interquartile.
4. Dépliez « D'où vient la confiance ? » : le verdict nomme la composante la plus faible de chaque indicateur — une complétude basse se rattrape par la relance, une fraîcheur basse par la transmission, une cohérence basse par la vérification des saisies.
5. Notez que les communes masquées (effectif sous le seuil de confidentialité) sont exclues du calcul, pas seulement de l'affichage.
6. Touchez « Exporter (CSV) » pour conserver ce portrait : l'export reprend les mêmes exclusions — une commune masquée ne figure ni dans les statistiques ni dans le fichier.

### Poser une question à Ask Education

1. Touchez « Poser une question » dans le cockpit, ou ouvrez Ask Education dans le menu.
2. Écrivez votre question (400 caractères au plus) ou touchez un exemple.
3. Lisez le chiffre, puis sa définition, sa source et son indice de confiance avant de le citer.

### Préparer une rentrée dans le supérieur

> Le catalogue est qualifié d'indicatif : il sert à repérer les trous de l'offre et à préparer une décision, pas à publier une liste officielle.

1. Ouvrez « Enseignement supérieur » dans le menu.
2. Sur « Filières et parcours », filtrez par voie pour ne regarder qu'une seule file à la fois (universitaire, ou EFTP).
3. Repérez les filières marquées « accès par concours » et leur capacité annuelle : c'est là que l'offre est limitée.
4. Ouvrez « Concours » et filtrez sur le statut « Annoncé » pour la campagne à venir ; les coefficients des épreuves s'affichent par session.
5. Consultez « Écoles et établissements » pour vérifier quelle tutelle couvre telle école, et ce qu'elle dessert.
6. Touchez « Exporter (CSV) » sur l'onglet concerné : le fichier reprend uniquement les lignes affichées, avec sa ligne de provenance.
7. Confrontez ce portrait aux arrêtés publiés du MESRS et du MESTFP avant toute communication : BEILE ne les contient pas encore.

### Voir où le parcours administratif retarde

> « Le diplôme tarde » ne se soigne pas ; « la DEC retarde de 40 jours sur les attestations de succès » oui.

1. Ouvrez « Enseignement supérieur », puis l'onglet « Guichet & délais ».
2. Lisez la tuile « Médiane pondérée » : le nombre de jours médian entre le dépôt d'une demande et la mise à disposition, toutes lignes confondues.
3. Repérez, dans le tableau, les lignes dont la médiane dépasse le barème : c'est l'autorité signataire (établissement, DEC, DGES, DBAU) qui porte le retard, et elle est nommée sur la ligne.
4. Signalez les lignes « sous le seuil » (moins de dix demandes) : leur médiane est instable et peut réidentifier un demandeur dans une petite composante.
5. Touchez « Exporter (CSV) » pour préparer une note : la médiane y figure, jamais la moyenne, et le fichier porte la provenance du barème.

### Sceller un acte qu'aucun guichet d'établissement ne peut signer

> « Prêt à retirer » affirme que l'acte est signé. Un diplôme se signe à la DEC, un duplicata national à la DGES : si la plateforme scellait à leur place, elle publierait une signature qui n'a pas eu lieu — et si personne ne scelle, l'étudiant attend sans autorité identifiable.

1. Ouvrez « Enseignement supérieur », puis l'onglet « Guichet & délais » (habilitation d'administration centrale au périmètre national).
2. Récupérez la référence de l'acte (ACTE-…) : elle est donnée par le guichet de l'établissement, où la ligne attend son autorité signataire, et par l'espace de l'étudiant.
3. Dans la carte « Signer un acte qui ne relève pas de l'établissement », saisissez cette référence.
4. Choisissez « Sceller : prêt à retirer au guichet » — la date de mise à disposition est celle du jour, jamais une date future — ou « Refuser, motif écrit » : le motif, d'au moins 5 caractères, se lit tel quel par l'étudiant.
5. Touchez « Sceller au registre ». La ligne repasse en « Prête » du côté du guichet, qui constatera la remise ; le compteur de délai de l'autorité s'arrête net.
6. Relisez le comparateur : la médiane de l'autorité concernée intègre l'acte sitôt scellé, et c'est ce chiffre qui se cite.
7. Un acte dont l'autorité est « établissement » est refusé par cet écran : le guichet le signe lui-même, et l'écran national n'écrit pas à sa place.

### Déclarer une échéance de dépôt de dossier d'allocation

> Tant que la date n'est pas déclarée, un dossier « hors délai » n'est imputable à personne — et l'étudiant lit « aucune échéance ».

1. Sur « Guichet & délais », descendez jusqu'au « Calendrier des dépôts ».
2. Touchez « Déclarer une échéance » (réservé à une habilitation d'administration centrale au périmètre national).
3. Saisissez l'« Année universitaire » au format AAAA-AAAA, la « Date limite de dépôt » et la nature de la décision (attribution, renouvellement, rétablissement, secours).
4. Renseignez l'« Intitulé tel que publié » : c'est exactement ce texte que l'étudiant lira, sans reformulation de nous.
5. Choisissez les « Pièces exigées » (relevé de notes, attestation de scolarité et de progression, attestation de succès…). Une échéance sans pièce reste informative.
6. Touchez « Déclarer au registre ». Les étudiants concernés voient aussitôt leurs jours restants et la liste de leurs pièces dans « Mes démarches ».

### Statuer un statut d'allocation

> Un statut sans autorité ni référence de texte ne prouve rien devant un contrôleur.

1. Dans le volet « Effet des allocations », touchez « Statuer une allocation » (habilitation centrale nationale).
2. Saisissez l'identifiant de l'étudiant (APP-000000) et l'année universitaire visée.
3. Choisissez la nature de la décision et le statut de compte : un secours se statue « secours », une bourse ne se statue jamais « secours » — l'écran bloque l'incohérence avant l'envoi.
4. Indiquez la « Référence de l'arrêté » : c'est elle qui rend la décision opposable.
5. Confirmez. L'étudiant est notifié sur son espace et son dossier bascule ; aucun montant n'est saisi ni affiché, la liquidation restant à la DBAU.

### Homologuer une filière et la contrôler

> Un diplôme national dont l'homologation n'est pas en cours n'est pas opposable : BEILE refuse de le certifier plutôt que d'affirmer une autorisation qui n'a pas eu lieu.

1. Ouvrez « Enseignement supérieur », puis le volet « Agrégats & actes de l'État » (habilitation d'administration centrale au périmètre national).
2. Dans « Actes de l'État sur un établissement », choisissez l'établissement dans l'annuaire du supérieur.
3. Sélectionnez la filière : le diplôme visé s'affiche, non modifiable — le serveur refuse (422) tout autre diplôme que celui que la filière déclare.
4. Réglez le statut, le quota annuel d'inscriptions (vide = aucun plafond déclaré), les dates d'octroi et d'échéance, puis touchez « Homologuer ».
5. Lisez la puce rendue : « porte ouverte » ou « porte fermée » avec son motif. Une échéance passée ou un contrôle « non conforme » ferment la porte, même sous un statut « homologuée ».
6. Consignez alors le contrôle pédagogique de cette même homologation : conclusion (conforme, avec réserves, non conforme) et ce que la visite a constaté.
7. Vérifiez le compte « Filières homologuées » de la tuile : il intègre l'acte sitôt enregistré.

### Porter la règle nationale de validation

> Là où un établissement n'a rien déclaré, c'est cette ligne qui juge — et chaque acquis cité pourra la défendre paramètre par paramètre.

1. Sur le volet « Agrégats & actes de l'État », descendez jusqu'à « Règle nationale de validation ».
2. Renseignez l'« Identifiant de la ligne à remplacer » (RGL-…) si une règle nationale existe déjà : deux lignes nationales laissent le moteur libre de l'une ou l'autre.
3. Fixez le seuil d'acquisition (1) et, si vous le voulez, la note éliminatoire (2) sous laquelle aucune compensation ne rachète une UE.
4. Choisissez la compensation (3) — « par bloc » reste exclu, les codes d'UE appartiennent au catalogue de chaque établissement — et la pondération (4).
5. Décidez de la session retenue après un repassage (5) et, pour ouvrir la compensation, d'une moyenne minimale de période (6).
6. Réglez la validité d'un acquis en années (7) : ce nombre borne aussi la capitalisation ECTS affichée, un acquis périmé restant compté à part.
7. Autorisez ou non le report des crédits vers un autre établissement homologué (8), puis touchez « Porter la règle nationale ».
8. Les établissements qui ont déclaré une portée plus précise (filière, période) gardent la leur : la portée la plus spécifique gagne.

## Questions fréquentes

**Pourquoi un chiffre du cockpit diffère-t-il d'un rapport papier ?**  
Le cockpit suit la définition du dictionnaire national et la couverture réelle des transmissions. Regardez l'indice de confiance et, dans le dictionnaire, la version de la définition utilisée.

**Puis-je voir un élève en particulier ?**  
Non. Le cockpit ne reçoit que des faits anonymes et des agrégats. C'est voulu : le pilotage n'a pas besoin des personnes.

**À quelle fréquence les données se mettent-elles à jour ?**  
Le flux des faits du jour toutes les 15 secondes ; les indicateurs à chaque ouverture, à partir du registre.

**La liste des filières, écoles et concours est-elle officielle ?**  
Non, et l'écran le dit : elle est indicative. Elle couvre le modèle LMD et la voie EFTP du Bénin pour préparer vos arbitrages. Le jour où les arrêtés du MESRS et du MESTFP seront versés au référentiel, le bandeau disparaîtra et ces listes feront foi.

**Pourquoi aucun élève n'apparaît dans les volets Stages et Vœux ?**  
Par conception. Un stage ou un vœu est une donnée nominative : elle ne se montre qu'à son titulaire, à son enseignant encadrant et à son établissement. Le pilotage ne reçoit que des effectifs.

**Les délais du guichet sont-ils des engagements de l'administration ?**  
Non. Ils sont ceux publiés par l'administration dans le catalogue des services publics (fiches CatIS, avec leur référence citée), et deux barèmes restent marqués « à confirmer par arrêté ». BEILE mesure le délai constaté à partir des dates du registre ; il ne promet rien à la place de l'autorité.

**Pourquoi aucune bourse n'affiche-t-elle de montant ?**  
Parce qu'un montant, un échéancier ou un RIB relèvent de la paie et de la donnée sociale : ils appartiennent à un compartiment sensible, pas au registre de scolarité. BEILE conserve la décision de statut — nature, autorité, date, référence de l'arrêté — et la liquidation se lit à la DBAU.

**Une ligne de délai « sous le seuil de publication » est-elle masquée ?**  
Non, elle est signalée. Les dix demandes et plus ne sont pas une protection absolue, mais une ligne à trois dossiers dans une petite filière se lit comme un annuaire : le badge prévient le lecteur, il ne retire aucun chiffre du calcul ni de l'export.

**Un établissement peut-il modifier une décision d'allocation ?**  
Non. Seule une habilitation d'administration centrale au périmètre national peut statuer, et chaque décision s'ajoute au registre sans effacer la précédente. Un établissement, lui, ne voit que les pièces que ses étudiants retirent chez lui.

**Pourquoi l'écran national refuse-t-il de sceller certains actes ?**  
Parce que « prêt à retirer » vaut signature. Un acte dont l'autorité est « établissement » se signe au guichet de l'établissement ; un acte relevant de la DEC ou de la DGES se scelle à l'écran national. Laisser une habilitation signer à la place de l'autre publierait, via le service de vérification, une signature qui n'a pas eu lieu — et fausserait l'imputation du retard, qui se lit par autorité.

**BEILE fonctionne-t-il sur un téléphone ?**  
Oui. Tous les écrans s'adaptent au téléphone, à la tablette et à l'ordinateur. Les espaces enseignant, famille et apprenant sont pensés d'abord pour le téléphone.

**Pourquoi je ne vois pas certains écrans ?**  
Le menu n'affiche que les écrans permis par votre habilitation (rôle et périmètre). C'est le serveur qui décide de chaque accès.

**Qui voit mes données ?**  
Seules les personnes qui en ont besoin pour leur mission, dans leur périmètre. Chaque consultation est inscrite au journal d'audit, que le délégué à la protection des données contrôle.

**Les chiffres sont-ils fiables ?**  
Chaque indicateur suit la définition du dictionnaire national et porte un indice de confiance. Une donnée incomplète est signalée comme telle, jamais présentée comme complète.

## Bons réflexes

- Citez toujours un chiffre avec sa source et son indice de confiance.
- Une analyse éclaire une décision ; elle ne la remplace pas. Lisez sa source et sa confiance.
- **Votre identifiant est personnel.** Ne le prêtez jamais, même à un collègue ou à un supérieur. Tout ce qui est fait avec votre compte est inscrit à votre nom.
- **Un mot de passe solide et secret.** 12 caractères au moins, avec majuscule, minuscule et chiffre. Ne l'écrivez pas sur un papier visible, ne le dites à personne.
- **Personne ne vous demandera votre mot de passe.** Ni l'administrateur, ni l'assistance, ni le ministère. Un message qui le demande est une tentative de fraude : signalez-le.
- **Déconnectez-vous.** Sur un appareil partagé, touchez toujours « Se déconnecter » en partant. Fermer l'onglet ne suffit pas.
- **Verrouillez votre téléphone.** Un code ou une empreinte sur le téléphone protège les saisies gardées hors connexion.
- **Un doute ? Changez-le.** Si vous pensez que quelqu'un connaît votre mot de passe, changez-le tout de suite et prévenez l'administrateur.

## En cas de problème

- Mot de passe oublié ou compte verrouillé : demandez à l'administrateur de la plateforme un mot de passe temporaire. Il vous le remet en main propre ou par un canal sûr.
- Un écran affiche « hors de votre périmètre » ou « accès refusé » : ce n'est pas une panne. Votre habilitation ne couvre pas cette donnée ; le refus est journalisé. Si vous pensez devoir y accéder, adressez-vous à l'administrateur.
- Un écran reste vide ou affiche une erreur : touchez « Réessayer ». Si le problème persiste, ouvrez une demande d'assistance (menu sous votre nom, puis « Assistance ») en précisant l'écran, l'heure et le message affiché.
- Pas de réseau : l'appel et les notes de l'enseignant sont gardés sur l'appareil et partent seuls au retour de la connexion. Les autres écrans affichent les dernières données connues.

### Demander de l'aide (Assistance)

> Votre demande arrive directement à l'équipe d'administration de BEILE ; vous suivez la réponse au même endroit.

1. Touchez votre nom ou vos initiales, puis « Assistance ».
2. Choisissez la « Catégorie » : Connexion, Accès et droits, Données, Anomalie ou Autre. Réglez l'« Urgence » (Basse, Normale, Haute, Critique).
3. Donnez un « Sujet » court, puis décrivez dans « Description » ce que vous faisiez, ce qui s'est passé et depuis quand.
4. Touchez « Envoyer la demande ». Elle apparaît dans « Mes demandes » avec son statut : Ouverte, En cours, Résolue ou Close.
5. Ouvrez une demande pour lire la réponse, ajouter une précision (« Envoyer ») ou la clore (« Problème réglé, clore »).
6. N'écrivez jamais votre mot de passe dans une demande.

---

*Document généré depuis le centre d'aide de l'application (`apps/web/src/lib/aide.ts`) : ne pas modifier à la main.*
