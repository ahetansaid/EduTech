# Guide Inspecteur

**Pour qui :** Inspecteurs et conseillers pédagogiques de circonscription.  
**Votre espace :** Console territoriale — vous y arrivez directement après la connexion (`/territoire`).  
**Accès :** https://edu-tech-api-rho.vercel.app/territoire · centre d'aide en ligne : https://edu-tech-api-rho.vercel.app/aide/inspecteur

> Voir les établissements de votre circonscription, repérer ceux qui demandent une visite (saturation, classes surchargées, remontées absentes, infrastructures) et relancer les retardataires.

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

- Rassemble les demandes dont l'étape courante relève de votre rôle et de votre circonscription.
- Classées par urgence : échéance atteinte ou dépassée en tête, puis cette semaine, puis à surveiller.
- Chaque ligne ouvre « Demandes à traiter » sur la demande concernée.

### Console territoriale

`/territoire` — Votre circonscription en un écran.

- Six chiffres de la circonscription, avec le repère national.
- Carte : votre circonscription et ses établissements (points).
- Absences du jour en direct.
- Points d'attention et tableau des établissements (effectifs, encadrement, eau, électricité, transmission).
- « Statistiques de la circonscription » : dispersion de l'occupation et de l'encadrement, comparateur classé d'établissements, couverture en infrastructures — le tout exportable en CSV.

### Ask Education

`/ask` — Poser une question chiffrée sur votre circonscription.

- Le périmètre de votre habilitation s'applique à chaque réponse.

### Demandes à traiter

`/demandes` — La file des circuits en attente de votre décision.

- Accompagnements à valider et demandes relevant de votre rôle et de votre circonscription.
- « Statuer » pour rendre une décision motivée ; l'étape suivante du circuit est alors déclenchée.

## Tâches pas à pas

### Prioriser ses décisions du jour

1. Touchez « Poste de pilotage » dans le menu, sous « Aujourd'hui ».
2. Traitez les demandes « À traiter aujourd'hui » (échéance atteinte ou dépassée).
3. Touchez une ligne : « Demandes à traiter » s'ouvre sur la demande, où vous rendez la décision motivée.

### Préparer une visite d'établissement

1. Lisez « Points d'attention de la circonscription » : saturés, classes surchargées, sans transmission, sans point d'eau.
2. Dans « Établissements de la circonscription », repérez l'établissement concerné et ses infrastructures.
3. Touchez « Voir sur la carte » pour situer l'établissement et sa commune.

### Situer un établissement par rapport aux autres

> Une occupation de 95 % n'a pas le même sens si la moitié de la circonscription tourne à 120 % : le comparateur montre l'écart, pas seulement la valeur.

1. Sur la console, dépliez « Statistiques de la circonscription ».
2. Lisez les quatre repères : occupation médiane, établissements saturés, élèves/enseignant médian, classes surchargées.
3. Choisissez le critère du comparateur (Occupation ou Élèves / ens.) : le trait vertical est la médiane du territoire, les barres en surbrillance dépassent le seuil d'alerte.
4. Regardez la couverture en infrastructures pour préparer votre visite.
5. Touchez « Exporter (CSV) » pour emporter ce portrait (résumé, bandes, comparateur, infrastructures) avant une visite ou une relance.

### Relancer un établissement

1. Dans le tableau des établissements, touchez « Relancer » en face de l'établissement en retard.
2. La relance est envoyée et tracée ; son suivi est visible dans la qualité des données.

### Statuer sur une demande

> Un circuit ne peut avancer que si l'étape qui vous incombe reçoit une décision motivée.

1. Ouvrez « Demandes à traiter » : seules les demandes de votre rôle et de votre périmètre s'affichent.
2. Touchez « Statuer » sur la demande concernée.
3. Choisissez le sens (avis favorable ou défavorable) et rédigez la motivation.
4. Validez : la décision est journalisée et le circuit passe à l'étape suivante.

## Questions fréquentes

**Puis-je ouvrir le dossier d'un élève ?**  
Non. Votre rôle porte sur les établissements et les agrégats. Les dossiers individuels relèvent de l'établissement.

**Pourquoi un établissement a-t-il un indice de confiance bas ?**  
Il n'a pas transmis ses données de l'année, ou partiellement. Une relance règle souvent le problème.

**BEILE fonctionne-t-il sur un téléphone ?**  
Oui. Tous les écrans s'adaptent au téléphone, à la tablette et à l'ordinateur. Les espaces enseignant, famille et apprenant sont pensés d'abord pour le téléphone.

**Pourquoi je ne vois pas certains écrans ?**  
Le menu n'affiche que les écrans permis par votre habilitation (rôle et périmètre). C'est le serveur qui décide de chaque accès.

**Qui voit mes données ?**  
Seules les personnes qui en ont besoin pour leur mission, dans leur périmètre. Chaque consultation est inscrite au journal d'audit, que le délégué à la protection des données contrôle.

**Les chiffres sont-ils fiables ?**  
Chaque indicateur suit la définition du dictionnaire national et porte un indice de confiance. Une donnée incomplète est signalée comme telle, jamais présentée comme complète.

## Bons réflexes

- Consultez les absences du jour avant une visite : elles disent souvent plus qu'un rapport.
- Signalez à l'administrateur toute habilitation qui ne correspond pas à votre circonscription.
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
