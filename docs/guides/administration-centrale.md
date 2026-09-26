# Guide Administration centrale

**Pour qui :** Cabinet du ministre, directions centrales, pilotage national.  
**Votre espace :** Cockpit national — vous y arrivez directement après la connexion (`/cockpit`).  
**Accès :** https://edu-tech-api-rho.vercel.app/cockpit · centre d'aide en ligne : https://edu-tech-api-rho.vercel.app/aide/administration-centrale

> Voir en un écran la situation du pays, repérer les territoires qui demandent une action, mesurer l'effet d'une décision avant de la prendre, et interroger les données en français.

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
- « Fiabilité et dispersion des chiffres » : indice de confiance et couverture de chaque indicateur, et étendue territoriale du maths ≥ 15/20 (communes masquées exclues du calcul, comme de l'export CSV).

### Où agir ?

`/cockpit/carte` — Descendre du pays jusqu'aux établissements.

- Fil de descente : Bénin, département, commune.
- Facteurs objectivés : croissance, occupation, encadrement, absentéisme, résultats.
- Liste des établissements d'une commune, avec « Relancer » pour ceux qui n'ont pas transmis.

### Ask Education

`/ask` — Poser une question en français, obtenir un chiffre prouvé.

- Réponse avec définition, source, couverture et indice de confiance.
- Refus expliqué et journalisé pour une question sur une personne ou hors périmètre.

### Simulation « et si ? »

`/simulation` — Mesurer l'effet d'une décision jusqu'en 2030.

- Établissements à construire, enseignants à affecter, croissance des effectifs.
- Avant / après et hypothèses écrites en clair.

### Données et service

`/plateforme/qualite` — Qualité des données, dictionnaire national, interopérabilité, état du service.

- Qui a transmis, depuis quand, avec quelle confiance.
- Définition officielle de chaque indicateur et de ses versions.

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
4. Notez que les communes masquées (effectif sous le seuil de confidentialité) sont exclues du calcul, pas seulement de l'affichage.
5. Touchez « Exporter (CSV) » pour conserver ce portrait : l'export reprend les mêmes exclusions — une commune masquée ne figure ni dans les statistiques ni dans le fichier.

### Simuler une mesure

1. Dans « Où agir ? », choisissez une commune, puis touchez « Simuler une mesure ».
2. Réglez les curseurs : « Établissements à construire », « Enseignants à affecter », « Croissance des effectifs d'ici 2030 ».
3. Lisez « Avant / après, en toute transparence » et les besoins pour ramener l'occupation à 100 %.
4. « Réinitialiser » revient au scénario de départ.

### Poser une question à Ask Education

1. Touchez « Poser une question » dans le cockpit, ou ouvrez Ask Education dans le menu.
2. Écrivez votre question (400 caractères au plus) ou touchez un exemple.
3. Lisez le chiffre, puis sa définition, sa source et son indice de confiance avant de le citer.

## Questions fréquentes

**Pourquoi un chiffre du cockpit diffère-t-il d'un rapport papier ?**  
Le cockpit suit la définition du dictionnaire national et la couverture réelle des transmissions. Regardez l'indice de confiance et, dans le dictionnaire, la version de la définition utilisée.

**Puis-je voir un élève en particulier ?**  
Non. Le cockpit ne reçoit que des faits anonymes et des agrégats. C'est voulu : le pilotage n'a pas besoin des personnes.

**À quelle fréquence les données se mettent-elles à jour ?**  
Le flux des faits du jour toutes les 15 secondes ; les indicateurs à chaque ouverture, à partir du registre.

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
- Une simulation éclaire une décision ; elle ne la remplace pas. Vérifiez les hypothèses affichées.
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
