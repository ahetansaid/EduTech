# Guide Chef d'établissement

**Pour qui :** Directrices et directeurs d'école, proviseurs, principaux.  
**Votre espace :** Mon établissement — vous y arrivez directement après la connexion (`/etablissement`).  
**Accès :** https://edu-tech-api-rho.vercel.app/etablissement · centre d'aide en ligne : https://edu-tech-api-rho.vercel.app/aide/chef-etablissement

> Voir en temps réel ce que vos équipes saisissent, agir sur les alertes, inscrire les apprenants sans créer de doublon et délivrer des diplômes vérifiables.

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

`/aujourd-hui` — Vos tâches du jour, triées par urgence réelle.

- Rassemble ce qui attend votre main : classes surchargées, justificatifs à statuer, élèves en baisse, identités à régulariser, absents du jour, demandes en circuit.
- Trois niveaux : « À traiter aujourd'hui » (échéance atteinte ou bloquante), « Cette semaine », « À surveiller ».
- Chaque ligne renvoie vers l'écran où agir ; rien n'est affiché d'un périmètre qui ne vous appartient.

### Tableau de bord

`/etablissement` — Votre établissement d'un coup d'œil.

- Apprenants, occupation, enseignants, moyenne du trimestre, absents aujourd'hui.
- « Ce que le système vous signale » : alertes et actions proposées.
- « Élèves en baisse en mathématiques » et proposition d'accompagnement.
- Absences du jour en direct, classes, demandes en circuit.
- « Comparatif des classes » : chaque division replacée face à la moyenne, l'occupation ou l'absentéisme de l'établissement.
- Dans le tableau des classes : « Gérer » (capacité, professeur principal) et « Passage » (conseil de fin d'année).

### Inscrire un apprenant

`/etablissement/inscription` — Quatre étapes : Registre national, Identité et filiation, Classe, Confirmation.

- Recherche au registre national des personnes : aucune identité créée en double.
- Enfant sans acte d'état civil : inscription avec procédure de régularisation.

### Apprenants

`/etablissement/eleves` — La liste des élèves et leur dossier.

- Filtres « Tous », « À risque », « En baisse », « Identité à régulariser ».
- Panneau « Vigilance décrochage » : score explicable (moyenne, absences, maths), seuils réglables.
- Panneau « Statistiques de la promotion » : dispersion des moyennes (médiane, écart-type, bandes), répartition des absences, comparatif filles/garçons — calculés sur les élèves déjà affichés, exportables en CSV.
- Dossier : « Évolution longitudinale » (courbe de la moyenne générale et matrice matière × trimestre, calculées sur l'historique des notes du dossier), moyennes du trimestre, parcours, diplômes ; « Transférer » ou « Déclarer un abandon ».
- « Exporter » : CSV des lignes affichées, avec le score et le niveau de risque ; la date de naissance devient une classe d'âge et le fichier porte une ligne de provenance.
- « Imprimer » : état nominatif, feuille d'appel ou PV de conseil, sur la sélection affichée.

### Examens et certification

`/etablissement/examens` — Candidatures, délibération, diplômes vérifiables (CEP, BEPC, BAC).

- Choisissez l'examen : les candidats viennent du niveau correspondant (CEP → CM2, BEPC → 3e, BAC → Terminale).
- La note affichée est la moyenne annuelle de l'apprenant : une base provisoire tant que le centre d'examen n'a pas transmis les notes officielles.
- Délibération définitive ; chaque admis reçoit un diplôme au QR code vérifiable par un tiers.

## Tâches pas à pas

### Ouvrir sa journée au poste de pilotage

> Le poste ne crée aucune donnée : il rassemble, en urgence réelle, ce que vos écrans signalent déjà.

1. Dans le menu, sous « Aujourd'hui », touchez « Poste de pilotage ».
2. Traitez d'abord « À traiter aujourd'hui » : classes surchargées et demandes dont l'échéance est atteinte ou dépassée.
3. Passez à « Cette semaine » : justificatifs à statuer, élèves en baisse à accompagner.
4. Gardez « À surveiller » pour le fil de l'eau : absents du jour, identités en régularisation, formation obligatoire.
5. Touchez une ligne pour ouvrir directement l'écran où agir.

### Inscrire un nouvel apprenant

> Interroger le registre national évite les doublons et rattache automatiquement les parents.

1. Touchez « Inscrire un apprenant ».
2. Étape « Registre national » : saisissez le nom et les prénoms, puis « Interroger le registre ».
3. Touchez « Sélectionner » en face du bon enfant. S'il n'existe pas : « Inscrire avec procédure de régularisation ».
4. Vérifiez l'identité et les responsables légaux, puis « Choisir la classe ».
5. Choisissez une classe qui a de la place, puis « Vérifier ».
6. Relisez le récapitulatif et touchez « Confirmer l'inscription ».

### Proposer un accompagnement

1. Dans « Élèves en baisse en mathématiques », cochez les élèves concernés.
2. Touchez « Proposer un accompagnement » et précisez l'objet (5 à 200 caractères).
3. Touchez « Transmettre ». La demande apparaît dans « Demandes en circuit ».

### Repérer un décrochage qui se profile

> Le score additionne des signaux que vous connaissez déjà ; il ne remplace pas votre jugement, il vous montre où regarder en premier.

1. Ouvrez « Apprenants » et dépliez le panneau « Vigilance décrochage ».
2. Chaque élève affiche son score sur 100 et les trois contributions : moyenne, absences, tendance en maths.
3. Réglez la sensibilité des seuils (basse, normale, sensible) selon votre marge de manœuvre.
4. Touchez « Dossier » pour ouvrir l'élève, ou filtrez sur « À risque » pour n'afficher que les concernés.
5. Enchaînez avec « Proposer un accompagnement » pour les élèves que vous décidez de suivre.

### Lire les statistiques de la promotion

> Une moyenne classe ne dit rien de la dispersion : deux classes à 11/20 n'ont pas le même décrochage.

1. Sous la liste des apprenants, dépliez « Statistiques de la promotion ».
2. Comparez moyenne, médiane et écart-type : un écart-type élevé signale une promotion hétérogène.
3. Regardez les bandes de moyennes et d'absences plutôt qu'un seul pourcentage.
4. Lisez la ligne « Filles et garçons » pour repérer un écart à creuser.
5. Recoupez avec le panneau « Vigilance décrochage » avant de décider un accompagnement.
6. Touchez « Exporter (CSV) » en bas du panneau pour conserver ce portrait (moyennes, bandes, comparatif, vigilance) : les mêmes chiffres que l'écran, dans un fichier daté portant sa provenance.

### Suivre l'évolution d'un élève trimestre après trimestre

> Un élève à 11/20 ce trimestre n'a pas le même profil selon qu'il monte ou qu'il glisse depuis trois trimestres.

1. Ouvrez « Apprenants », puis le dossier de l'élève.
2. Repérez la carte « Évolution longitudinale » : la courbe suit la moyenne générale, le tableau détaille matière par matière et trimestre par trimestre.
3. Lisez la puce « Progression » pour mesurer l'écart depuis le premier trimestre noté.
4. Un « — » dans le tableau signifie que la matière n'a pas été évaluée sur la période, jamais une donnée estimée.
5. Croisez avec l'onglet « Parcours » (inscriptions, passages, diplômes) pour situer le chiffre dans l'histoire de l'élève.

### Ajuster une classe (capacité, professeur principal)

> La capacité décide de l'accueil : l'abaisser sous l'effectif crée une alerte de surcharge, sans retirer d'élève.

1. Dans le tableau des classes, touchez « Gérer » sur la classe concernée.
2. Réglez la « Capacité (places) » (nombre entier entre 1 et 2000).
3. Désignez le « Professeur principal » : la liste ne propose que les enseignants rattachés à l'établissement.
4. Touchez « Enregistrer ». Le tableau est recalculé immédiatement.

### Situer une classe par rapport à l'établissement

> Une moyenne de 11 n'a pas le même sens si l'établissement est à 9 ou à 13 : le comparatif montre l'écart, pas seulement la valeur.

1. Sur le tableau de bord, repérez « Comparatif des classes » sous la liste des classes.
2. Choisissez l'indicateur : Moyenne, Occupation ou Absents du jour.
3. La barre verticale est la valeur de votre établissement ; les classes en retrait apparaissent en surbrillance.
4. Lisez les trois repères : référence, nombre de classes en retrait, écart le plus marqué.
5. Ouvrez « Gérer » sur une classe en tension d'accueil pour ajuster sa capacité.

### Faire tenir un conseil de passage

> Le conseil décide du passage de chaque élève ; l'application respecte les capacités et ouvre une division si nécessaire.

1. Dans le tableau des classes, touchez « Passage » sur la classe (hors niveau terminal).
2. Indiquez l'« Année scolaire de réinscription » au format AAAA-AAAA.
3. Pour chaque élève, touchez le statut pour basculer entre « Admis » (passage au niveau supérieur) et « Maintien » (réinscription dans la classe).
4. Relisez le compteur « admis · maintenus », puis « Enregistrer ».
5. Les admis changent de niveau, les maintenus sont réinscrits ; une nouvelle division est créée si une classe dépasse sa capacité.

### Transférer un élève ou déclarer un abandon

1. Ouvrez « Apprenants », puis le dossier de l'élève.
2. Touchez « Transférer », cherchez la classe d'accueil, cochez la confirmation, puis « Confirmer le transfert ».
3. Ou touchez « Déclarer un abandon », indiquez le motif, puis « Confirmer l'abandon ».

### Imprimer un état (nominatif, appel, conseil)

> Certains actes restent signés sur papier : l'état reprend exactement la liste affichée à l'écran, rien de plus.

1. Filtrez d'abord la liste (par classe via la recherche ou le sélecteur) pour cibler l'état voulu.
2. Touchez « Imprimer » en haut de « Apprenants ».
3. Choisissez le type dans la barre d'outils : État nominatif, Feuille d'appel ou PV de conseil.
4. Touchez « Imprimer / PDF » ; dans la fenêtre du navigateur, sélectionnez « Enregistrer en PDF » pour archiver.

### Délibérer un examen national

> La délibération est définitive : toute correction ultérieure — notamment l'arrivée des notes officielles du centre — passe par un événement correctif journalisé.

1. Ouvrez « Examens et certification » et choisissez l'examen (CEP, BEPC ou BAC).
2. Relisez la liste des candidats et leurs moyennes annuelles.
3. Touchez « Délibérer et délivrer les diplômes » : les candidats sans moyenne ne sont pas jugés.
4. Pour confirmer, saisissez DÉLIBÉRER, puis « Délibérer définitivement ».
5. Les diplômes apparaissent dans « Diplômes délivrés » ; « Attestation » affiche le QR code.

## Questions fréquentes

**L'enfant n'a pas d'acte de naissance. Puis-je l'inscrire ?**  
Oui. Touchez « Inscrire avec procédure de régularisation ». L'identité reste déclarative et apparaît dans « Identité à régulariser » jusqu'à l'enregistrement à l'état civil.

**Pourquoi une classe n'est-elle pas proposée ?**  
Elle est complète. Une classe pleine ne peut plus recevoir d'inscription.

**L'enfant est « Déjà inscrit·e » ailleurs.**  
Il faut passer par un transfert, depuis l'établissement d'origine ou via le dossier de l'élève.

**BEILE fonctionne-t-il sur un téléphone ?**  
Oui. Tous les écrans s'adaptent au téléphone, à la tablette et à l'ordinateur. Les espaces enseignant, famille et apprenant sont pensés d'abord pour le téléphone.

**Pourquoi je ne vois pas certains écrans ?**  
Le menu n'affiche que les écrans permis par votre habilitation (rôle et périmètre). C'est le serveur qui décide de chaque accès.

**Qui voit mes données ?**  
Seules les personnes qui en ont besoin pour leur mission, dans leur périmètre. Chaque consultation est inscrite au journal d'audit, que le délégué à la protection des données contrôle.

**Les chiffres sont-ils fiables ?**  
Chaque indicateur suit la définition du dictionnaire national et porte un indice de confiance. Une donnée incomplète est signalée comme telle, jamais présentée comme complète.

## Bons réflexes

- Consultez les absences du jour chaque matin : la famille est déjà prévenue, vous pouvez agir vite.
- Ne délibérez qu'après avoir relu la liste des candidats : l'opération est irréversible.
- La note de délibération est provisoire (moyenne annuelle) : elle ne vaut note officielle qu'une fois les résultats du centre transmis.
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
