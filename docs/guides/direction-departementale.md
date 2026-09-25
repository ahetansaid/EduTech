# Guide Direction départementale

**Pour qui :** Directeurs départementaux et leurs équipes.  
**Votre espace :** Console territoriale — vous y arrivez directement après la connexion (`/territoire`).  
**Accès :** https://edu-tech-api-rho.vercel.app/territoire · centre d'aide en ligne : https://edu-tech-api-rho.vercel.app/aide/direction-departementale

> Connaître la situation de votre département avec les mêmes chiffres que la direction centrale, suivre les absences du jour, et obtenir des établissements des données complètes.

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

### Console territoriale

`/territoire` — Votre département en un écran.

- Six chiffres : apprenants, occupation, élèves par enseignant, maths ≥ 15/20, absentéisme, abandon (avec le repère national).
- Carte des niveaux de priorité par commune.
- Absences du jour en direct (toutes les 30 secondes).
- Classement des communes et établissements n'ayant pas transmis.

### Où agir ?

`/cockpit/carte` — Descendre jusqu'aux établissements d'une commune.

- Facteurs de priorité, capacité d'accueil, liste des établissements.

### Simulation « et si ? »

`/simulation` — Mesurer l'effet d'une construction ou d'une affectation.

- Limitée aux communes de votre département.

### Ask Education, qualité, dictionnaire

`/ask` — Interroger les données et vérifier leur complétude.

- Qualité des données : complétude par commune, suivi des relances.

## Tâches pas à pas

### Relancer les établissements qui n'ont pas transmis

> Un établissement silencieux fait baisser l'indice de confiance de tout le département.

1. Dans la console, descendez jusqu'à « Établissements n'ayant pas transmis ».
2. Touchez « Relancer » en face de la commune concernée.
3. Vérifiez la liste, puis touchez « Envoyer les relances ». Le suivi apparaît dans « Qualité des données ».

### Comparer les communes

1. Dans « Classement des communes », choisissez l'indicateur (occupation, élèves par enseignant, maths, absentéisme).
2. Le trait vertical marque la valeur du département.
3. Touchez une commune pour ouvrir sa fiche dans « Où agir ? ».

## Questions fréquentes

**Pourquoi ne vois-je pas les autres départements ?**  
Votre habilitation couvre votre département. Une commune hors périmètre est refusée par le serveur et le refus est journalisé.

**Le taux d'absence est-il fiable dès le matin ?**  
Il repose sur les appels déjà faits. « Dernière saisie à … » indique l'heure du dernier appel reçu.

**BEILE fonctionne-t-il sur un téléphone ?**  
Oui. Tous les écrans s'adaptent au téléphone, à la tablette et à l'ordinateur. Les espaces enseignant, famille et apprenant sont pensés d'abord pour le téléphone.

**Pourquoi je ne vois pas certains écrans ?**  
Le menu n'affiche que les écrans permis par votre habilitation (rôle et périmètre). C'est le serveur qui décide de chaque accès.

**Qui voit mes données ?**  
Seules les personnes qui en ont besoin pour leur mission, dans leur périmètre. Chaque consultation est inscrite au journal d'audit, que le délégué à la protection des données contrôle.

**Les chiffres sont-ils fiables ?**  
Chaque indicateur suit la définition du dictionnaire national et porte un indice de confiance. Une donnée incomplète est signalée comme telle, jamais présentée comme complète.

## Bons réflexes

- Relancez tôt dans l'année : un indice de confiance bas fragilise toutes vos analyses.
- Appuyez vos arbitrages sur la carte « Où agir ? » plutôt que sur une seule valeur.
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
