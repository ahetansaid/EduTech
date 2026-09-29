import type { ProfilGuide } from "./guides";

/**
 * Contenu du centre d'aide : un guide par profil, écrit une seule fois.
 * La page /aide l'affiche ; `docs/guides/*.md` est produit à partir du même texte (même vocabulaire,
 * mêmes libellés de boutons). Module de données pur : aucun import à l'exécution.
 */

export interface Tache { titre: string; pourquoi?: string; etapes: string[] }
export interface Ecran { titre: string; chemin: string; icone: string; resume: string; points: string[] }
export interface QuestionReponse { q: string; r: string }

export interface ContenuProfil {
  id: ProfilGuide;
  slug: string;
  nom: string;
  /** Qui utilise ce profil (une ligne). */
  pourQui: string;
  icone: string;
  resume: string;
  objectif: string;
  /** Nom de l'espace et écran d'arrivée après connexion. */
  espace: string;
  arrivee: string;
  ecrans: Ecran[];
  taches: Tache[];
  faq: QuestionReponse[];
  conseils: string[];
  /** Visites guidées proposées (identifiants de `lib/guides.ts`). */
  visites: string[];
}

/* ------------------------------------------------------------------ Commun à tous */

export const SE_CONNECTER: Tache = {
  titre: "Se connecter",
  pourquoi: "Chaque connexion est journalisée : c'est ce qui protège vos données et celles des élèves.",
  etapes: [
    "Ouvrez BEILE dans votre navigateur (téléphone ou ordinateur), puis touchez « Connexion ».",
    "Saisissez votre « Identifiant » (de la forme prenom.nom) et votre « Mot de passe ».",
    "Touchez « Se connecter ». Votre espace s'ouvre directement.",
    "Après 5 essais infructueux, le compte est verrouillé 15 minutes : attendez, puis réessayez calmement.",
  ],
};

export const PREMIERE_CONNEXION: Tache = {
  titre: "Première connexion : choisir son mot de passe",
  pourquoi: "Le mot de passe remis par l'administrateur est temporaire. Vous seul devez connaître le mot de passe définitif.",
  etapes: [
    "Connectez-vous avec le mot de passe temporaire : l'écran « Choisissez votre mot de passe » s'ouvre de lui-même.",
    "Recopiez le « Mot de passe temporaire ».",
    "Choisissez un « Nouveau mot de passe » : 12 caractères au moins, une majuscule, une minuscule et un chiffre. Les quatre voyants passent au vert.",
    "Saisissez-le à nouveau dans « Confirmer le nouveau mot de passe », puis touchez « Enregistrer le mot de passe ».",
  ],
};

export const CHANGER_MOT_DE_PASSE: Tache = {
  titre: "Changer son mot de passe",
  etapes: [
    "Touchez votre nom ou vos initiales (en bas du menu sur ordinateur, en haut à droite dans les espaces personnels).",
    "Choisissez « Changer mon mot de passe ».",
    "Saisissez le « Mot de passe actuel », puis le nouveau deux fois, et touchez « Enregistrer le mot de passe ».",
    "Vos autres sessions (autres appareils) sont fermées automatiquement.",
  ],
};

export const SE_DECONNECTER: Tache = {
  titre: "Se déconnecter",
  etapes: [
    "Touchez votre nom ou vos initiales.",
    "Choisissez « Se déconnecter ». L'écran de connexion s'affiche.",
    "Faites-le toujours sur un appareil partagé (cybercafé, ordinateur de l'école, téléphone prêté).",
  ],
};

export const VISITE_GUIDEE: Tache = {
  titre: "Relancer la visite guidée",
  etapes: [
    "La visite démarre seule à votre première arrivée dans un espace.",
    "Pour la revoir, touchez le bouton « Guide » (point d'interrogation) en haut de l'écran.",
    "Avancez avec « Suivant », revenez avec « Précédent », quittez avec « Passer » ou la croix. Au clavier : flèches ← → et Échap.",
  ],
};

export const DEMANDER_AIDE: Tache = {
  titre: "Demander de l'aide (Assistance)",
  pourquoi: "Votre demande arrive directement à l'équipe d'administration de BEILE ; vous suivez la réponse au même endroit.",
  etapes: [
    "Touchez votre nom ou vos initiales, puis « Assistance ».",
    "Choisissez la « Catégorie » : Connexion, Accès et droits, Données, Anomalie ou Autre. Réglez l'« Urgence » (Basse, Normale, Haute, Critique).",
    "Donnez un « Sujet » court, puis décrivez dans « Description » ce que vous faisiez, ce qui s'est passé et depuis quand.",
    "Touchez « Envoyer la demande ». Elle apparaît dans « Mes demandes » avec son statut : Ouverte, En cours, Résolue ou Close.",
    "Ouvrez une demande pour lire la réponse, ajouter une précision (« Envoyer ») ou la clore (« Problème réglé, clore »).",
    "N'écrivez jamais votre mot de passe dans une demande.",
  ],
};

export const SECURITE: { titre: string; texte: string }[] = [
  { titre: "Votre identifiant est personnel", texte: "Ne le prêtez jamais, même à un collègue ou à un supérieur. Tout ce qui est fait avec votre compte est inscrit à votre nom." },
  { titre: "Un mot de passe solide et secret", texte: "12 caractères au moins, avec majuscule, minuscule et chiffre. Ne l'écrivez pas sur un papier visible, ne le dites à personne." },
  { titre: "Personne ne vous demandera votre mot de passe", texte: "Ni l'administrateur, ni l'assistance, ni le ministère. Un message qui le demande est une tentative de fraude : signalez-le." },
  { titre: "Déconnectez-vous", texte: "Sur un appareil partagé, touchez toujours « Se déconnecter » en partant. Fermer l'onglet ne suffit pas." },
  { titre: "Verrouillez votre téléphone", texte: "Un code ou une empreinte sur le téléphone protège les saisies gardées hors connexion." },
  { titre: "Un doute ? Changez-le", texte: "Si vous pensez que quelqu'un connaît votre mot de passe, changez-le tout de suite et prévenez l'administrateur." },
];

export const EN_CAS_DE_PROBLEME: string[] = [
  "Mot de passe oublié ou compte verrouillé : demandez à l'administrateur de la plateforme un mot de passe temporaire. Il vous le remet en main propre ou par un canal sûr.",
  "Un écran affiche « hors de votre périmètre » ou « accès refusé » : ce n'est pas une panne. Votre habilitation ne couvre pas cette donnée ; le refus est journalisé. Si vous pensez devoir y accéder, adressez-vous à l'administrateur.",
  "Un écran reste vide ou affiche une erreur : touchez « Réessayer ». Si le problème persiste, ouvrez une demande d'assistance (menu sous votre nom, puis « Assistance ») en précisant l'écran, l'heure et le message affiché.",
  "Pas de réseau : l'appel et les notes de l'enseignant sont gardés sur l'appareil et partent seuls au retour de la connexion. Les autres écrans affichent les dernières données connues.",
];

export const FAQ_GENERALE: QuestionReponse[] = [
  { q: "BEILE fonctionne-t-il sur un téléphone ?", r: "Oui. Tous les écrans s'adaptent au téléphone, à la tablette et à l'ordinateur. Les espaces enseignant, famille et apprenant sont pensés d'abord pour le téléphone." },
  { q: "Pourquoi je ne vois pas certains écrans ?", r: "Le menu n'affiche que les écrans permis par votre habilitation (rôle et périmètre). C'est le serveur qui décide de chaque accès." },
  { q: "Qui voit mes données ?", r: "Seules les personnes qui en ont besoin pour leur mission, dans leur périmètre. Chaque consultation est inscrite au journal d'audit, que le délégué à la protection des données contrôle." },
  { q: "Les chiffres sont-ils fiables ?", r: "Chaque indicateur suit la définition du dictionnaire national et porte un indice de confiance. Une donnée incomplète est signalée comme telle, jamais présentée comme complète." },
];

/* ------------------------------------------------------------------ Profils */

export const PROFILS: ContenuProfil[] = [
  {
    id: "administration_centrale",
    slug: "administration-centrale",
    nom: "Administration centrale",
    pourQui: "Cabinet du ministre, directions centrales, pilotage national.",
    icone: "chart",
    resume: "Piloter le système éducatif national : situation, zones prioritaires, analyses.",
    objectif: "Voir en un écran la situation du pays, repérer les territoires qui demandent une action et interroger les données en français.",
    espace: "Cockpit national",
    arrivee: "/cockpit",
    ecrans: [
      { titre: "Poste de pilotage", chemin: "/aujourd-hui", icone: "calendar-check", resume: "Vos décisions du jour, triées par échéance.", points: ["Rassemble les demandes dont l'étape courante relève de votre rôle et de votre périmètre national.", "Classées par urgence : échéance atteinte ou dépassée en tête, puis cette semaine, puis à surveiller.", "Chaque ligne ouvre « Demandes à traiter » sur la demande concernée."] },
      { titre: "Cockpit national", chemin: "/cockpit", icone: "chart", resume: "La situation du système éducatif, calculée sous votre habilitation.", points: ["Chiffres clés : apprenants, établissements, enseignants, réussite au BEPC, mathématiques ≥ 15/20.", "Carte à couches : priorités, occupation, absentéisme, abandon…", "Flux des faits du jour, actualisé toutes les 15 secondes (faits anonymes).", "Parité filles-garçons, classement territorial, abandon scolaire, zones à examiner.", "« Fiabilité et dispersion des chiffres » : indice de confiance et couverture de chaque indicateur, décomposition de la confiance (complétude, fraîcheur, cohérence, validation) avec un verdict de citabilité, et étendue territoriale du maths ≥ 15/20 (communes masquées exclues du calcul, comme de l'export CSV)."] },
      { titre: "Où agir ?", chemin: "/cockpit/carte", icone: "map", resume: "Descendre du pays jusqu'aux établissements.", points: ["Fil de descente : Bénin, département, commune.", "Facteurs objectivés : croissance, occupation, encadrement, absentéisme, résultats.", "Liste des établissements d'une commune, avec « Relancer » pour ceux qui n'ont pas transmis."] },
      { titre: "Ask Education", chemin: "/ask", icone: "sparkles", resume: "Poser une question en français, obtenir un chiffre prouvé.", points: ["Réponse avec définition, source, couverture et indice de confiance.", "Refus expliqué et journalisé pour une question sur une personne ou hors périmètre."] },
      { titre: "Données et service", chemin: "/plateforme/qualite", icone: "database", resume: "Qualité des données, dictionnaire national, interopérabilité, état du service.", points: ["Qui a transmis, depuis quand, avec quelle confiance.", "Définition officielle de chaque indicateur et de ses versions."] },
      { titre: "Enseignement supérieur", chemin: "/enseignement-superieur", icone: "graduation", resume: "Le référentiel national des filières, concours, écoles et stages du supérieur.", points: ["« Filières et parcours » : chaque filière par voie (universitaire, technologique, professionnelle, apprentissage), avec le cycle LMD ouvert, le diplôme visé, les ECTS, la capacité annuelle, l'accès par concours et la durée de stage obligatoire.", "« Concours » : les sessions avec leur statut, les places offertes et les coefficients des épreuves ; filtre par statut et export CSV.", "« Écoles et établissements » : le réseau (universités, écoles nationales, instituts), ses tutelles MESRS / MESTFP / Emploi-PME et ses rattachements.", "« Stages » : le cycle de vie d'une convention et les durées obligatoires par filière — aucun suivi nominatif d'apprenant.", "« Formations pro » : l'échelle des diplômes EFTP (CAP → BEP → Bac technique → BT → BTS/CQP) et la passerelle vers la licence professionnelle.", "Le bandeau « indicatif » rappelle que ces listes ne remplacent pas les arrêtés publiés."] },
      { titre: "Guichet & délais", chemin: "/enseignement-superieur/guichet", icone: "stamp", resume: "Ce que le parcours administratif coûte réellement aux étudiants.", points: ["Médiane constatée entre le dépôt d'une demande et la mise à disposition de l'acte, par établissement, par acte et par autorité signataire (établissement, DEC, DGES, DBAU).", "Le barème jugé est celui qui courait au jour du dépôt ; deux lignes peuvent donc coexister pour le même acte.", "Aucune ligne nominative : uniquement des comptages et des médianes, bornés aux communes du périmètre de l'agent.", "Sous dix demandes, la ligne est signalée « sous le seuil » — le signalement ne masque rien, il prévient le lecteur.", "« Calendrier des dépôts » : les dates limites déclarées par la DBAU ou le MESRS, avec les pièces exigées à chaque échéance.", "« Effet des allocations » : effectifs par statut de compte, par nature de décision et par autorité — aucun montant, aucun RIB, aucun échéancier.", "« Signer un acte qui ne relève pas de l'établissement » : une autorité nationale scelle, à partir de la référence de l'acte (ACTE-…), ce que le guichet d'établissement ne peut pas signer — un diplôme à la DEC, un duplicata national à la DGES. Aucune liste nominative n'est parcourue ici : la référence vient du guichet de l'établissement ou de l'espace de l'étudiant.", "« Exporter (CSV) » : les lignes affichées, avec la médiane (jamais la moyenne) et la provenance du barème."] },
      { titre: "Scolarité du supérieur · agrégats & actes", chemin: "/enseignement-superieur/scolarite/pilotage", icone: "shield", resume: "Ce que la scolarité du supérieur produit, sans aucun étudiant nommé — et les actes que l'État pose sur un établissement.", points: ["« Capitalisation ECTS — agrégat par voie » : une ligne par voie, jamais par établissement, avec les crédits acquis, attendus et périmés, et le taux. Le moteur est celui du registre des écritures, pas la couche statistique.", "Sous le seuil de publication, la cellule garde son effectif et perd ses valeurs : la règle des petits effectifs s'applique au calcul, pas seulement à l'affichage.", "« Effets enregistrés » : inscriptions par statut, décisions par voie, homologations par statut, jurys par étape, exportables en CSV avec leur provenance.", "« Actes de l'État » (habilitation centrale au périmètre national) : cycle EPES par autorité tutélaire, homologation d'une filière dont le diplôme est celui qu'elle vise, contrôle pédagogique de l'homologation rendue.", "« Règle nationale de validation » : les huit paramètres applicables là où aucune portée plus précise n'a été déclarée.", "Aucune lecture nominative : le dossier administratif d'un établissement se lit par son chef et par l'inspecteur de sa circonscription, pas depuis cette console."] },
    ],
    taches: [
      { titre: "Prioriser ses décisions du jour", etapes: ["Touchez « Poste de pilotage » dans le menu, sous « Aujourd'hui ».", "Traitez les demandes « À traiter aujourd'hui » (échéance atteinte ou dépassée).", "Touchez une ligne : « Demandes à traiter » s'ouvre sur la demande, où vous rendez la décision motivée."] },
      { titre: "Repérer une commune à examiner", pourquoi: "La couleur d'une commune s'explique toujours par des facteurs mesurés.", etapes: ["Dans le cockpit, regardez la carte « Priorités » et la liste « Zones à examiner en priorité ».", "Touchez une commune : le panneau affiche son niveau et le « Pourquoi ? » (facteurs et valeurs).", "Touchez « Descendre jusqu'aux établissements » pour ouvrir « Où agir ? » sur cette commune."] },
      { titre: "Juger si un chiffre est citable", pourquoi: "Une moyenne nationale se cite d'autant plus prudemment qu'un indicateur est peu complet ou très dispersé.", etapes: ["Dépliez « Fiabilité et dispersion des chiffres » sous la carte.", "Lisez l'indice de confiance et la couverture de chaque indicateur ; le repère « le plus fragile » signale celui à ne pas citer seul.", "Consultez l'étendue territoriale du « Maths ≥ 15/20 » : médiane, écart-type, moitié interquartile.", "Dépliez « D'où vient la confiance ? » : le verdict nomme la composante la plus faible de chaque indicateur — une complétude basse se rattrape par la relance, une fraîcheur basse par la transmission, une cohérence basse par la vérification des saisies.", "Notez que les communes masquées (effectif sous le seuil de confidentialité) sont exclues du calcul, pas seulement de l'affichage.", "Touchez « Exporter (CSV) » pour conserver ce portrait : l'export reprend les mêmes exclusions — une commune masquée ne figure ni dans les statistiques ni dans le fichier."] },
      { titre: "Poser une question à Ask Education", etapes: ["Touchez « Poser une question » dans le cockpit, ou ouvrez Ask Education dans le menu.", "Écrivez votre question (400 caractères au plus) ou touchez un exemple.", "Lisez le chiffre, puis sa définition, sa source et son indice de confiance avant de le citer."] },
      { titre: "Préparer une rentrée dans le supérieur", pourquoi: "Le catalogue est qualifié d'indicatif : il sert à repérer les trous de l'offre et à préparer une décision, pas à publier une liste officielle.", etapes: ["Ouvrez « Enseignement supérieur » dans le menu.", "Sur « Filières et parcours », filtrez par voie pour ne regarder qu'une seule file à la fois (universitaire, ou EFTP).", "Repérez les filières marquées « accès par concours » et leur capacité annuelle : c'est là que l'offre est limitée.", "Ouvrez « Concours » et filtrez sur le statut « Annoncé » pour la campagne à venir ; les coefficients des épreuves s'affichent par session.", "Consultez « Écoles et établissements » pour vérifier quelle tutelle couvre telle école, et ce qu'elle dessert.", "Touchez « Exporter (CSV) » sur l'onglet concerné : le fichier reprend uniquement les lignes affichées, avec sa ligne de provenance.", "Confrontez ce portrait aux arrêtés publiés du MESRS et du MESTFP avant toute communication : BEILE ne les contient pas encore."] },
      { titre: "Voir où le parcours administratif retarde", pourquoi: "« Le diplôme tarde » ne se soigne pas ; « la DEC retarde de 40 jours sur les attestations de succès » oui.", etapes: ["Ouvrez « Enseignement supérieur », puis l'onglet « Guichet & délais ».", "Lisez la tuile « Médiane pondérée » : le nombre de jours médian entre le dépôt d'une demande et la mise à disposition, toutes lignes confondues.", "Repérez, dans le tableau, les lignes dont la médiane dépasse le barème : c'est l'autorité signataire (établissement, DEC, DGES, DBAU) qui porte le retard, et elle est nommée sur la ligne.", "Signalez les lignes « sous le seuil » (moins de dix demandes) : leur médiane est instable et peut réidentifier un demandeur dans une petite composante.", "Touchez « Exporter (CSV) » pour préparer une note : la médiane y figure, jamais la moyenne, et le fichier porte la provenance du barème."] },
      { titre: "Sceller un acte qu'aucun guichet d'établissement ne peut signer", pourquoi: "« Prêt à retirer » affirme que l'acte est signé. Un diplôme se signe à la DEC, un duplicata national à la DGES : si la plateforme scellait à leur place, elle publierait une signature qui n'a pas eu lieu — et si personne ne scelle, l'étudiant attend sans autorité identifiable.", etapes: ["Ouvrez « Enseignement supérieur », puis l'onglet « Guichet & délais » (habilitation d'administration centrale au périmètre national).", "Récupérez la référence de l'acte (ACTE-…) : elle est donnée par le guichet de l'établissement, où la ligne attend son autorité signataire, et par l'espace de l'étudiant.", "Dans la carte « Signer un acte qui ne relève pas de l'établissement », saisissez cette référence.", "Choisissez « Sceller : prêt à retirer au guichet » — la date de mise à disposition est celle du jour, jamais une date future — ou « Refuser, motif écrit » : le motif, d'au moins 5 caractères, se lit tel quel par l'étudiant.", "Touchez « Sceller au registre ». La ligne repasse en « Prête » du côté du guichet, qui constatera la remise ; le compteur de délai de l'autorité s'arrête net.", "Relisez le comparateur : la médiane de l'autorité concernée intègre l'acte sitôt scellé, et c'est ce chiffre qui se cite.", "Un acte dont l'autorité est « établissement » est refusé par cet écran : le guichet le signe lui-même, et l'écran national n'écrit pas à sa place."] },
      { titre: "Déclarer une échéance de dépôt de dossier d'allocation", pourquoi: "Tant que la date n'est pas déclarée, un dossier « hors délai » n'est imputable à personne — et l'étudiant lit « aucune échéance ».", etapes: ["Sur « Guichet & délais », descendez jusqu'au « Calendrier des dépôts ».", "Touchez « Déclarer une échéance » (réservé à une habilitation d'administration centrale au périmètre national).", "Saisissez l'« Année universitaire » au format AAAA-AAAA, la « Date limite de dépôt » et la nature de la décision (attribution, renouvellement, rétablissement, secours).", "Renseignez l'« Intitulé tel que publié » : c'est exactement ce texte que l'étudiant lira, sans reformulation de nous.", "Choisissez les « Pièces exigées » (relevé de notes, attestation de scolarité et de progression, attestation de succès…). Une échéance sans pièce reste informative.", "Touchez « Déclarer au registre ». Les étudiants concernés voient aussitôt leurs jours restants et la liste de leurs pièces dans « Mes démarches »."] },
      { titre: "Statuer un statut d'allocation", pourquoi: "Un statut sans autorité ni référence de texte ne prouve rien devant un contrôleur.", etapes: ["Dans le volet « Effet des allocations », touchez « Statuer une allocation » (habilitation centrale nationale).", "Saisissez l'identifiant de l'étudiant (APP-000000) et l'année universitaire visée.", "Choisissez la nature de la décision et le statut de compte : un secours se statue « secours », une bourse ne se statue jamais « secours » — l'écran bloque l'incohérence avant l'envoi.", "Indiquez la « Référence de l'arrêté » : c'est elle qui rend la décision opposable.", "Confirmez. L'étudiant est notifié sur son espace et son dossier bascule ; aucun montant n'est saisi ni affiché, la liquidation restant à la DBAU."] },
      { titre: "Homologuer une filière et la contrôler", pourquoi: "Un diplôme national dont l'homologation n'est pas en cours n'est pas opposable : BEILE refuse de le certifier plutôt que d'affirmer une autorisation qui n'a pas eu lieu.", etapes: ["Ouvrez « Enseignement supérieur », puis le volet « Agrégats & actes de l'État » (habilitation d'administration centrale au périmètre national).", "Dans « Actes de l'État sur un établissement », choisissez l'établissement dans l'annuaire du supérieur.", "Sélectionnez la filière : le diplôme visé s'affiche, non modifiable — le serveur refuse (422) tout autre diplôme que celui que la filière déclare.", "Réglez le statut, le quota annuel d'inscriptions (vide = aucun plafond déclaré), les dates d'octroi et d'échéance, puis touchez « Homologuer ».", "Lisez la puce rendue : « porte ouverte » ou « porte fermée » avec son motif. Une échéance passée ou un contrôle « non conforme » ferment la porte, même sous un statut « homologuée ».", "Consignez alors le contrôle pédagogique de cette même homologation : conclusion (conforme, avec réserves, non conforme) et ce que la visite a constaté.", "Vérifiez le compte « Filières homologuées » de la tuile : il intègre l'acte sitôt enregistré."] },
      { titre: "Porter la règle nationale de validation", pourquoi: "Là où un établissement n'a rien déclaré, c'est cette ligne qui juge — et chaque acquis cité pourra la défendre paramètre par paramètre.", etapes: ["Sur le volet « Agrégats & actes de l'État », descendez jusqu'à « Règle nationale de validation ».", "Renseignez l'« Identifiant de la ligne à remplacer » (RGL-…) si une règle nationale existe déjà : deux lignes nationales laissent le moteur libre de l'une ou l'autre.", "Fixez le seuil d'acquisition (1) et, si vous le voulez, la note éliminatoire (2) sous laquelle aucune compensation ne rachète une UE.", "Choisissez la compensation (3) — « par bloc » reste exclu, les codes d'UE appartiennent au catalogue de chaque établissement — et la pondération (4).", "Décidez de la session retenue après un repassage (5) et, pour ouvrir la compensation, d'une moyenne minimale de période (6).", "Réglez la validité d'un acquis en années (7) : ce nombre borne aussi la capitalisation ECTS affichée, un acquis périmé restant compté à part.", "Autorisez ou non le report des crédits vers un autre établissement homologué (8), puis touchez « Porter la règle nationale ».", "Les établissements qui ont déclaré une portée plus précise (filière, période) gardent la leur : la portée la plus spécifique gagne."] },
    ],
    faq: [
      { q: "Pourquoi un chiffre du cockpit diffère-t-il d'un rapport papier ?", r: "Le cockpit suit la définition du dictionnaire national et la couverture réelle des transmissions. Regardez l'indice de confiance et, dans le dictionnaire, la version de la définition utilisée." },
      { q: "Puis-je voir un élève en particulier ?", r: "Non. Le cockpit ne reçoit que des faits anonymes et des agrégats. C'est voulu : le pilotage n'a pas besoin des personnes." },
      { q: "À quelle fréquence les données se mettent-elles à jour ?", r: "Le flux des faits du jour toutes les 15 secondes ; les indicateurs à chaque ouverture, à partir du registre." },
      { q: "La liste des filières, écoles et concours est-elle officielle ?", r: "Non, et l'écran le dit : elle est indicative. Elle couvre le modèle LMD et la voie EFTP du Bénin pour préparer vos arbitrages. Le jour où les arrêtés du MESRS et du MESTFP seront versés au référentiel, le bandeau disparaîtra et ces listes feront foi." },
      { q: "Pourquoi aucun élève n'apparaît dans les volets Stages et Vœux ?", r: "Par conception. Un stage ou un vœu est une donnée nominative : elle ne se montre qu'à son titulaire, à son enseignant encadrant et à son établissement. Le pilotage ne reçoit que des effectifs." },
      { q: "Les délais du guichet sont-ils des engagements de l'administration ?", r: "Non. Ils sont ceux publiés par l'administration dans le catalogue des services publics (fiches CatIS, avec leur référence citée), et deux barèmes restent marqués « à confirmer par arrêté ». BEILE mesure le délai constaté à partir des dates du registre ; il ne promet rien à la place de l'autorité." },
      { q: "Pourquoi aucune bourse n'affiche-t-elle de montant ?", r: "Parce qu'un montant, un échéancier ou un RIB relèvent de la paie et de la donnée sociale : ils appartiennent à un compartiment sensible, pas au registre de scolarité. BEILE conserve la décision de statut — nature, autorité, date, référence de l'arrêté — et la liquidation se lit à la DBAU." },
      { q: "Une ligne de délai « sous le seuil de publication » est-elle masquée ?", r: "Non, elle est signalée. Les dix demandes et plus ne sont pas une protection absolue, mais une ligne à trois dossiers dans une petite filière se lit comme un annuaire : le badge prévient le lecteur, il ne retire aucun chiffre du calcul ni de l'export." },
      { q: "Un établissement peut-il modifier une décision d'allocation ?", r: "Non. Seule une habilitation d'administration centrale au périmètre national peut statuer, et chaque décision s'ajoute au registre sans effacer la précédente. Un établissement, lui, ne voit que les pièces que ses étudiants retirent chez lui." },
      { q: "Pourquoi l'écran national refuse-t-il de sceller certains actes ?", r: "Parce que « prêt à retirer » vaut signature. Un acte dont l'autorité est « établissement » se signe au guichet de l'établissement ; un acte relevant de la DEC ou de la DGES se scelle à l'écran national. Laisser une habilitation signer à la place de l'autre publierait, via le service de vérification, une signature qui n'a pas eu lieu — et fausserait l'imputation du retard, qui se lit par autorité." },
    ],
    conseils: ["Citez toujours un chiffre avec sa source et son indice de confiance.", "Une analyse éclaire une décision ; elle ne la remplace pas. Lisez sa source et sa confiance."],
    visites: ["cockpit", "ou-agir", "ask", "guichet-national", "scolarite-pilotage"],
  },
  {
    id: "direction_departementale",
    slug: "direction-departementale",
    nom: "Direction départementale",
    pourQui: "Directeurs départementaux et leurs équipes.",
    icone: "landmark",
    resume: "Suivre son département, comparer les communes, relancer les établissements en retard.",
    objectif: "Connaître la situation de votre département avec les mêmes chiffres que la direction centrale, suivre les absences du jour, et obtenir des établissements des données complètes.",
    espace: "Console territoriale",
    arrivee: "/territoire",
    ecrans: [
      { titre: "Poste de pilotage", chemin: "/aujourd-hui", icone: "calendar-check", resume: "Vos décisions du jour, triées par échéance.", points: ["Rassemble les demandes dont l'étape courante relève de votre rôle et de votre département.", "Classées par urgence : échéance atteinte ou dépassée en tête, puis cette semaine, puis à surveiller.", "Chaque ligne ouvre « Demandes à traiter » sur la demande concernée."] },
      { titre: "Console territoriale", chemin: "/territoire", icone: "landmark", resume: "Votre département en un écran.", points: ["Six chiffres : apprenants, occupation, élèves par enseignant, maths ≥ 15/20, absentéisme, abandon (avec le repère national).", "Carte des niveaux de priorité par commune.", "Absences du jour en direct (toutes les 30 secondes).", "Classement des communes et établissements n'ayant pas transmis.", "« Statistiques du département » : dispersion de l'occupation et de l'encadrement, comparateur classé d'établissements, position percentile de chaque établissement, couverture en infrastructures — le tout exportable en CSV."] },
      { titre: "Où agir ?", chemin: "/cockpit/carte", icone: "map", resume: "Descendre jusqu'aux établissements d'une commune.", points: ["Facteurs de priorité, capacité d'accueil, liste des établissements."] },
      { titre: "Ask Education, qualité, dictionnaire", chemin: "/ask", icone: "sparkles", resume: "Interroger les données et vérifier leur complétude.", points: ["Qualité des données : complétude par commune, suivi des relances."] },
      { titre: "Enseignement supérieur", chemin: "/enseignement-superieur", icone: "graduation", resume: "L'offre post-bac, en lecture, pour préparer les départs de vos lycées.", points: ["Le même catalogue que l'administration centrale : filières par voie, sessions de concours avec places et coefficients, annuaire des établissements du supérieur et de leurs tutelles.", "Utile pour objectiver où vont réellement les bacheliers de votre département et quelle filière fait défaut à proximité.", "« Formations pro » : l'échelle des diplômes EFTP et la passerelle vers la licence professionnelle.", "Lecture seule et catalogue indicatif : aucune donnée nominative dans ces écrans."] },
    ],
    taches: [
      { titre: "Prioriser ses décisions du jour", etapes: ["Touchez « Poste de pilotage » dans le menu, sous « Aujourd'hui ».", "Traitez les demandes « À traiter aujourd'hui » (échéance atteinte ou dépassée).", "Touchez une ligne : « Demandes à traiter » s'ouvre sur la demande, où vous rendez la décision motivée."] },
      { titre: "Relancer les établissements qui n'ont pas transmis", pourquoi: "Un établissement silencieux fait baisser l'indice de confiance de tout le département.", etapes: ["Dans la console, descendez jusqu'à « Établissements n'ayant pas transmis ».", "Touchez « Relancer » en face de la commune concernée.", "Vérifiez la liste, puis touchez « Envoyer les relances ». Le suivi apparaît dans « Qualité des données »."] },
      { titre: "Comparer les communes", etapes: ["Dans « Classement des communes », choisissez l'indicateur (occupation, élèves par enseignant, maths, absentéisme).", "Le trait vertical marque la valeur du département.", "Touchez une commune pour ouvrir sa fiche dans « Où agir ? »."] },
      { titre: "Mesurer les écarts entre établissements", pourquoi: "La valeur du département masque des situations opposées : ce sont les écarts entre établissements qui décident où envoyer un appui.", etapes: ["Sur la console, dépliez « Statistiques du département ».", "Comparez médiane et moyenne d'occupation, et le nombre d'établissements saturés ou à classes surchargées.", "Utilisez le comparateur classé (Occupation ou Élèves / ens.) pour voir les établissements les plus en tension, repère : la médiane départementale.", "Lisez la couverture en infrastructures pour prioriser les visites.", "Lisez « Où se situe chaque établissement ? » : le percentile d'occupation et d'encadrement transforme une valeur brute en rang défendable dans le département.", "Touchez « Exporter (CSV) » pour emporter ce portrait (résumé, bandes, comparateur, percentiles, infrastructures) vers une note ou un arbitrage."] },
    ],
    faq: [
      { q: "Pourquoi ne vois-je pas les autres départements ?", r: "Votre habilitation couvre votre département. Une commune hors périmètre est refusée par le serveur et le refus est journalisé." },
      { q: "Le taux d'absence est-il fiable dès le matin ?", r: "Il repose sur les appels déjà faits. « Dernière saisie à … » indique l'heure du dernier appel reçu." },
    ],
    conseils: ["Relancez tôt dans l'année : un indice de confiance bas fragilise toutes vos analyses.", "Appuyez vos arbitrages sur la carte « Où agir ? » plutôt que sur une seule valeur."],
    visites: ["territoire", "ou-agir", "ask", "guichet-national", "scolarite-pilotage"],
  },
  {
    id: "inspecteur",
    slug: "inspecteur",
    nom: "Inspecteur",
    pourQui: "Inspecteurs et conseillers pédagogiques de circonscription.",
    icone: "clipboard",
    resume: "Connaître sa circonscription, établissement par établissement, et préparer ses visites.",
    objectif: "Voir les établissements de votre circonscription, repérer ceux qui demandent une visite (saturation, classes surchargées, remontées absentes, infrastructures) et relancer les retardataires.",
    espace: "Console territoriale",
    arrivee: "/territoire",
    ecrans: [
      { titre: "Poste de pilotage", chemin: "/aujourd-hui", icone: "calendar-check", resume: "Vos décisions du jour, triées par échéance.", points: ["Rassemble les demandes dont l'étape courante relève de votre rôle et de votre circonscription.", "Classées par urgence : échéance atteinte ou dépassée en tête, puis cette semaine, puis à surveiller.", "Chaque ligne ouvre « Demandes à traiter » sur la demande concernée."] },
      { titre: "Console territoriale", chemin: "/territoire", icone: "landmark", resume: "Votre circonscription en un écran.", points: ["Six chiffres de la circonscription, avec le repère national.", "Carte : votre circonscription et ses établissements (points).", "Absences du jour en direct.", "Points d'attention et tableau des établissements (effectifs, encadrement, eau, électricité, transmission).", "« Statistiques de la circonscription » : dispersion de l'occupation et de l'encadrement, comparateur classé d'établissements, position percentile de chaque établissement, couverture en infrastructures — le tout exportable en CSV."] },
      { titre: "Ask Education", chemin: "/ask", icone: "sparkles", resume: "Poser une question chiffrée sur votre circonscription.", points: ["Le périmètre de votre habilitation s'applique à chaque réponse."] },
      { titre: "Demandes à traiter", chemin: "/demandes", icone: "inbox", resume: "La file des circuits en attente de votre décision.", points: ["Accompagnements à valider et demandes relevant de votre rôle et de votre circonscription.", "« Statuer » pour rendre une décision motivée ; l'étape suivante du circuit est alors déclenchée."] },
      { titre: "Enseignement supérieur", chemin: "/enseignement-superieur", icone: "graduation", resume: "L'offre post-bac à connaître pour vos conseils de classe et vos visites.", points: ["« Filières et parcours » : série de BAC requise, cycle ouvert, accès par concours, durée de stage obligatoire — les critères à rappeler en conseil d'orientation.", "« Formations pro » : l'échelle CAP → BEP → Bac technique → BT → BTS/CQP et la passerelle vers la licence professionnelle, pour les lycées techniques de votre circonscription.", "« Stages » : les durées obligatoires par filière et le cycle de vie d'une convention, pour juger si un établissement peut les tenir.", "Catalogue indicatif, lecture seule : rien qui concerne un élève identifié."] },
    ],
    taches: [
      { titre: "Prioriser ses décisions du jour", etapes: ["Touchez « Poste de pilotage » dans le menu, sous « Aujourd'hui ».", "Traitez les demandes « À traiter aujourd'hui » (échéance atteinte ou dépassée).", "Touchez une ligne : « Demandes à traiter » s'ouvre sur la demande, où vous rendez la décision motivée."] },
      { titre: "Préparer une visite d'établissement", etapes: ["Lisez « Points d'attention de la circonscription » : saturés, classes surchargées, sans transmission, sans point d'eau.", "Dans « Établissements de la circonscription », repérez l'établissement concerné et ses infrastructures.", "Touchez « Voir sur la carte » pour situer l'établissement et sa commune."] },
      { titre: "Situer un établissement par rapport aux autres", pourquoi: "Une occupation de 95 % n'a pas le même sens si la moitié de la circonscription tourne à 120 % : le comparateur montre l'écart, pas seulement la valeur.", etapes: ["Sur la console, dépliez « Statistiques de la circonscription ».", "Lisez les quatre repères : occupation médiane, établissements saturés, élèves/enseignant médian, classes surchargées.", "Choisissez le critère du comparateur (Occupation ou Élèves / ens.) : le trait vertical est la médiane du territoire, les barres en surbrillance dépassent le seuil d'alerte.", "Regardez la couverture en infrastructures pour préparer votre visite.", "Lisez « Où se situe chaque établissement ? » : le percentile d'occupation (ex. 90ᵉ = plus saturé que 9 établissements sur 10) et d'encadrement situent objectivement la tension.", "Touchez « Exporter (CSV) » pour emporter ce portrait (résumé, bandes, comparateur, percentiles, infrastructures) avant une visite ou une relance."] },
      { titre: "Relancer un établissement", etapes: ["Dans le tableau des établissements, touchez « Relancer » en face de l'établissement en retard.", "La relance est envoyée et tracée ; son suivi est visible dans la qualité des données."] },
      { titre: "Statuer sur une demande", pourquoi: "Un circuit ne peut avancer que si l'étape qui vous incombe reçoit une décision motivée.", etapes: ["Ouvrez « Demandes à traiter » : seules les demandes de votre rôle et de votre périmètre s'affichent.", "Touchez « Statuer » sur la demande concernée.", "Choisissez le sens (avis favorable ou défavorable) et rédigez la motivation.", "Validez : la décision est journalisée et le circuit passe à l'étape suivante."] },
    ],
    faq: [
      { q: "Puis-je ouvrir le dossier d'un élève ?", r: "Non. Votre rôle porte sur les établissements et les agrégats. Les dossiers individuels relèvent de l'établissement." },
      { q: "Pourquoi un établissement a-t-il un indice de confiance bas ?", r: "Il n'a pas transmis ses données de l'année, ou partiellement. Une relance règle souvent le problème." },
    ],
    conseils: ["Consultez les absences du jour avant une visite : elles disent souvent plus qu'un rapport.", "Signalez à l'administrateur toute habilitation qui ne correspond pas à votre circonscription."],
    visites: ["territoire", "ask", "guichet-national", "scolarite-pilotage"],
  },
  {
    id: "chercheur",
    slug: "chercheur",
    nom: "Chercheur",
    pourQui: "Chercheurs et analystes habilités (universités, instituts, partenaires).",
    icone: "sparkles",
    resume: "Interroger des statistiques agrégées, avec leur définition et leur preuve.",
    objectif: "Obtenir des chiffres fiables et citables sur le système éducatif, sans jamais accéder à une donnée personnelle.",
    espace: "Ask Education",
    arrivee: "/ask",
    ecrans: [
      { titre: "Ask Education", chemin: "/ask", icone: "sparkles", resume: "Une question en français, un chiffre prouvé.", points: ["Chiffre, définition, source, couverture et indice de confiance.", "Petits effectifs masqués ; questions sur une personne refusées et journalisées."] },
      { titre: "Dictionnaire national", chemin: "/plateforme/dictionnaire", icone: "database", resume: "La définition officielle de chaque indicateur.", points: ["Formule, source, unité, direction propriétaire et moteur de calcul.", "Deux moteurs publiés : la couche statistique nationale, et le registre des écritures du supérieur (crédits ECTS).", "Historique des versions : un chiffre publié se recalcule avec la définition de son année."] },
    ],
    taches: [
      { titre: "Obtenir un chiffre citable", etapes: ["Posez votre question dans Ask Education, ou touchez un exemple.", "Notez le chiffre, l'indicateur utilisé, la source et l'indice de confiance.", "Ouvrez le Dictionnaire national et relevez la définition et sa version.", "Citez les trois : chiffre, définition (avec version), date de consultation."] },
      { titre: "Comprendre un refus", etapes: ["Lisez le motif affiché sous la question (donnée personnelle, hors périmètre, effectif trop petit…).", "Reformulez en agrégat (par département, par année) plutôt que par personne ou par petit groupe."] },
    ],
    faq: [
      { q: "Pourquoi certaines lignes sont-elles masquées ?", r: "Quand un groupe compte trop peu d'élèves, afficher le chiffre permettrait de reconnaître des personnes. Il est donc masqué." },
      { q: "Pourquoi une question sur les crédits ECTS est-elle refusée ?", r: "Les crédits ECTS ne sortent pas de la couche statistique nationale : ils se calculent à partir des écritures du registre du supérieur (contrats d'UE, décisions de validation). Le dictionnaire en publie la définition et sa version, et le refus vous dit quel service les rend." },
      { q: "Puis-je exporter les données brutes ?", r: "Non. L'accès chercheur porte sur des résultats agrégés. Pour un besoin particulier, adressez une demande à l'administration centrale." },
    ],
    conseils: ["Citez toujours la version de la définition utilisée.", "Ne tentez pas de recouper des résultats pour identifier une personne : c'est interdit et journalisé."],
    visites: ["chercheur", "guichet-national", "scolarite-pilotage"],
  },
  {
    id: "chef_etablissement",
    slug: "chef-etablissement",
    nom: "Chef d'établissement",
    pourQui: "Directrices et directeurs d'école, proviseurs, principaux.",
    icone: "building",
    resume: "Tenir son établissement : inscriptions, absences, suivi des élèves, examens.",
    objectif: "Voir en temps réel ce que vos équipes saisissent, agir sur les alertes, inscrire les apprenants sans créer de doublon et délivrer des diplômes vérifiables.",
    espace: "Mon établissement",
    arrivee: "/etablissement",
    ecrans: [
      { titre: "Poste de pilotage", chemin: "/aujourd-hui", icone: "calendar-check", resume: "Vos tâches du jour, triées par urgence réelle.", points: ["Rassemble ce qui attend votre main : classes surchargées, justificatifs à statuer, élèves en baisse, identités à régulariser, absents du jour, demandes en circuit.", "Trois niveaux : « À traiter aujourd'hui » (échéance atteinte ou bloquante), « Cette semaine », « À surveiller ».", "Chaque ligne renvoie vers l'écran où agir ; rien n'est affiché d'un périmètre qui ne vous appartient."] },
      { titre: "Tableau de bord", chemin: "/etablissement", icone: "building", resume: "Votre établissement d'un coup d'œil.", points: ["Apprenants, occupation, enseignants, moyenne du trimestre, absents aujourd'hui.", "« Ce que le système vous signale » : alertes et actions proposées.", "« Élèves en baisse en mathématiques » et proposition d'accompagnement.", "Absences du jour en direct, classes, demandes en circuit.", "« Comparatif des classes » : chaque division replacée face à la moyenne, l'occupation ou l'absentéisme de l'établissement.", "Dans le tableau des classes : « Gérer » (capacité, professeur principal) et « Passage » (conseil de fin d'année)."] },
      { titre: "Inscrire un apprenant", chemin: "/etablissement/inscription", icone: "user-plus", resume: "Quatre étapes : Registre national, Identité et filiation, Classe, Confirmation.", points: ["Recherche au registre national des personnes : aucune identité créée en double.", "Enfant sans acte d'état civil : inscription avec procédure de régularisation."] },
      { titre: "Apprenants", chemin: "/etablissement/eleves", icone: "users", resume: "La liste des élèves et leur dossier.", points: ["Filtres « Tous », « À risque », « En baisse », « Identité à régulariser ».", "Panneau « Vigilance décrochage » : score explicable (moyenne, absences, maths), seuils réglables.", "Panneau « Statistiques de la promotion » : dispersion des moyennes (médiane, écart-type, bandes), forme de la distribution (quartiles, asymétrie), répartition des absences, comparatif filles/garçons — calculés sur les élèves déjà affichés, exportables en CSV.", "Panneau « Lien absences ↔ réussite » : corrélation (r de Pearson) entre jours d'absence et moyenne, nuage de points et moyenne par palier d'absence — la lecture d'une association, jamais d'une causalité.", "Dossier : « Évolution longitudinale » (courbe de la moyenne générale et matrice matière × trimestre, calculées sur l'historique des notes du dossier), moyennes du trimestre, parcours, diplômes ; « Transférer » ou « Déclarer un abandon ».", "« Exporter » : CSV des lignes affichées, avec le score et le niveau de risque ; la date de naissance devient une classe d'âge et le fichier porte une ligne de provenance.", "« Imprimer » : état nominatif, feuille d'appel ou PV de conseil, sur la sélection affichée."] },
      { titre: "Examens nationaux", chemin: "/etablissement/examens", icone: "award", resume: "Vos candidats au CEP, au BEPC et au BAC, et leurs verdicts officiels.", points: ["Chaque session montre vos élèves inscrits, leur numéro de table et leur centre.", "Le verdict (admis, non admis, absent, exclu) et la mention apparaissent à la publication officielle par l'autorité d'examen : DEC du MEMP pour le CEP, DEC du MESTFP pour le BEPC, Office du Baccalauréat pour le BAC.", "L'établissement ne délibère pas et ne délivre aucun diplôme national : les diplômes de vos élèves, délivrés par l'autorité, se retrouvent ici avec leur attestation à QR code."] },
      { titre: "Guichet de l'étudiant", chemin: "/etablissement/guichet", icone: "stamp", resume: "Les actes demandés par vos étudiants, et le délai que votre guichet met réellement à les délivrer.", points: ["File filtrable : « À préparer », « En cours », « Prêtes », « Remises », « En retard » — le retard est calculé par le serveur contre le délai publié (fiche CatIS).", "Chaque ligne nomme l'étudiant, l'acte, la date de dépôt et l'autorité qui doit signer : établissement, DEC, DGES ou DBAU.", "Prendre en charge → marquer prêt à retirer → constat de remise : trois faits distincts, inscrits en ajout seul.", "La remise exige le mode de retrait (titulaire, géniteur, mandataire, autorité académique, dématérialisé) et la pièce d'identité présentée ; pour un mandataire, la procuration est nommée.", "Un refus se motive (5 caractères minimum) : le texte est transmis à l'étudiant, qui le lit sur son espace.", "« Délais par acte » : nombre de demandes, remises dans le barème et médiane constatée. Sous dix demandes, la ligne est marquée « sous le seuil » — un délai sur trois dossiers réidentifierait son auteur.", "Les demandes relevant d'une autorité nationale (attestation de succès, diplôme, duplicata) ne se ferment pas ici : le bouton « prêt à retirer » y est masqué, l'acte se scelle à l'écran national « Guichet & délais », puis la ligne revient en « Prêtes » et la remise se constate chez vous."] },
      { titre: "Enseignement supérieur", chemin: "/enseignement-superieur", icone: "graduation", resume: "L'après-bac de vos élèves, pour préparer les conseils d'orientation.", points: ["« Filières et parcours » : série de BAC requise, cycle ouvert, matières attendues, accès par concours et durée de stage.", "« Concours » : le calendrier des sessions (inscriptions, écrits, oraux), pour poser les dates limites de vos classes de Terminale.", "« Écoles et établissements » : le réseau, ses tutelles et ses rattachements.", "« Guichet & délais » : ce que le parcours administratif coûte aux étudiants, en médianes par établissement.", "Catalogue indicatif et aucune donnée nominative ici : un vœu se dépose par l'élève lui-même, jamais par l'établissement."] },
      { titre: "Scolarité du supérieur", chemin: "/enseignement-superieur/scolarite", icone: "graduation", resume: "Tenir le cycle LMD de votre établissement : référentiel, étudiants, certifications.", points: ["« Référentiel » : filières (diplôme visé, volume ECTS, composantes ouvertes), périodes, UE et offres, groupes, et la règle de validation sous les huit paramètres.", "« Étudiants & parcours » : inscriptions (aucun montant, aucun RIB), contrat pédagogique signe/abandon/refus, feuille de validation d'une période, acquis hors note et report de crédits.", "« Jury & certification » : jury de capitalisation par étapes, délibération du diplôme, décisions rendues avec moyenne recalculée, équivalences déposées et statuées.", "« Crédits ECTS » : acquis, attendus, périmés et taux par période, calculés depuis le registre des écritures — pas la couche statistique.", "Vous ne voyez que vos étudiants : un chef d'établissement ne lit pas les inscriptions d'un autre, et un établissement privé n'inscrit que sous agrément EPES en cours.", "Le quatrième volet (« Agrégats & actes de l'État ») n'est pas ouvert à votre rôle : il agrège le pays sans nommer personne."] },
    ],
    taches: [
      { titre: "Ouvrir sa journée au poste de pilotage", pourquoi: "Le poste ne crée aucune donnée : il rassemble, en urgence réelle, ce que vos écrans signalent déjà.", etapes: ["Dans le menu, sous « Aujourd'hui », touchez « Poste de pilotage ».", "Traitez d'abord « À traiter aujourd'hui » : classes surchargées et demandes dont l'échéance est atteinte ou dépassée.", "Passez à « Cette semaine » : justificatifs à statuer, élèves en baisse à accompagner.", "Gardez « À surveiller » pour le fil de l'eau : absents du jour, identités en régularisation, formation obligatoire.", "Touchez une ligne pour ouvrir directement l'écran où agir."] },
      { titre: "Inscrire un nouvel apprenant", pourquoi: "Interroger le registre national évite les doublons et rattache automatiquement les parents.", etapes: ["Touchez « Inscrire un apprenant ».", "Étape « Registre national » : saisissez le nom et les prénoms, puis « Interroger le registre ».", "Touchez « Sélectionner » en face du bon enfant. S'il n'existe pas : « Inscrire avec procédure de régularisation ».", "Vérifiez l'identité et les responsables légaux, puis « Choisir la classe ».", "Choisissez une classe qui a de la place, puis « Vérifier ».", "Relisez le récapitulatif et touchez « Confirmer l'inscription »."] },
      { titre: "Proposer un accompagnement", etapes: ["Dans « Élèves en baisse en mathématiques », cochez les élèves concernés.", "Touchez « Proposer un accompagnement » et précisez l'objet (5 à 200 caractères).", "Touchez « Transmettre ». La demande apparaît dans « Demandes en circuit »."] },
      { titre: "Repérer un décrochage qui se profile", pourquoi: "Le score additionne des signaux que vous connaissez déjà ; il ne remplace pas votre jugement, il vous montre où regarder en premier.", etapes: ["Ouvrez « Apprenants » et dépliez le panneau « Vigilance décrochage ».", "Chaque élève affiche son score sur 100 et les trois contributions : moyenne, absences, tendance en maths.", "Réglez la sensibilité des seuils (basse, normale, sensible) selon votre marge de manœuvre.", "Touchez « Dossier » pour ouvrir l'élève, ou filtrez sur « À risque » pour n'afficher que les concernés.", "Enchaînez avec « Proposer un accompagnement » pour les élèves que vous décidez de suivre."] },
      { titre: "Lire les statistiques de la promotion", pourquoi: "Une moyenne classe ne dit rien de la dispersion : deux classes à 11/20 n'ont pas le même décrochage.", etapes: ["Sous la liste des apprenants, dépliez « Statistiques de la promotion ».", "Comparez moyenne, médiane et écart-type : un écart-type élevé signale une promotion hétérogène.", "Lisez la « Forme de la distribution » (quartiles, asymétrie) : une asymétrie marquée vers le bas signale une minorité d'élèves très en difficulté qui tire la moyenne.", "Regardez les bandes de moyennes et d'absences plutôt qu'un seul pourcentage.", "Lisez la ligne « Filles et garçons » pour repérer un écart à creuser.", "Recoupez avec le panneau « Vigilance décrochage » avant de décider un accompagnement.", "Touchez « Exporter (CSV) » en bas du panneau pour conserver ce portrait : les mêmes chiffres que l'écran, dans un fichier daté portant sa provenance."] },
      { titre: "Interpréter le lien absences ↔ réussite", pourquoi: "Savoir si l'absentéisme explique les notes de VOTRE promotion évite de généraliser une intuition.", etapes: ["Sous les statistiques, dépliez « Lien absences ↔ réussite ».", "Le coefficient r va de -1 à +1 : proche de -1, beaucoup d'absences rime avec moyenne basse ; proche de 0, les absences ne prédisent rien ici.", "Le nuage de points montre chaque élève (en rouge ceux sous 10/20) ; la pointillée est la tendance.", "Comparez la moyenne d'un palier d'absence à l'autre : c'est la même information, plus parlante pour une équipe.", "Gardez la prudence affichée : corrélation n'est pas causalité — un même décrochage peut produire absences et baisse de notes.", "Le panneau ne se lance qu'à partir de 8 élèves notés, pour ne pas donner un chiffre instable."] },
      { titre: "Suivre l'évolution d'un élève trimestre après trimestre", pourquoi: "Un élève à 11/20 ce trimestre n'a pas le même profil selon qu'il monte ou qu'il glisse depuis trois trimestres.", etapes: ["Ouvrez « Apprenants », puis le dossier de l'élève.", "Repérez la carte « Évolution longitudinale » : la courbe suit la moyenne générale, le tableau détaille matière par matière et trimestre par trimestre.", "Lisez la puce « Progression » pour mesurer l'écart depuis le premier trimestre noté.", "Un « — » dans le tableau signifie que la matière n'a pas été évaluée sur la période, jamais une donnée estimée.", "Croisez avec l'onglet « Parcours » (inscriptions, passages, diplômes) pour situer le chiffre dans l'histoire de l'élève."] },
      { titre: "Ajuster une classe (capacité, professeur principal)", pourquoi: "La capacité décide de l'accueil : l'abaisser sous l'effectif crée une alerte de surcharge, sans retirer d'élève.", etapes: ["Dans le tableau des classes, touchez « Gérer » sur la classe concernée.", "Réglez la « Capacité (places) » (nombre entier entre 1 et 2000).", "Désignez le « Professeur principal » : la liste ne propose que les enseignants rattachés à l'établissement.", "Touchez « Enregistrer ». Le tableau est recalculé immédiatement."] },
      { titre: "Situer une classe par rapport à l'établissement", pourquoi: "Une moyenne de 11 n'a pas le même sens si l'établissement est à 9 ou à 13 : le comparatif montre l'écart, pas seulement la valeur.", etapes: ["Sur le tableau de bord, repérez « Comparatif des classes » sous la liste des classes.", "Choisissez l'indicateur : Moyenne, Occupation ou Absents du jour.", "La barre verticale est la valeur de votre établissement ; les classes en retrait apparaissent en surbrillance.", "Lisez les trois repères : référence, nombre de classes en retrait, écart le plus marqué.", "Ouvrez « Gérer » sur une classe en tension d'accueil pour ajuster sa capacité."] },
      { titre: "Faire tenir un conseil de passage", pourquoi: "Le conseil décide du passage de chaque élève ; l'application respecte les capacités et ouvre une division si nécessaire.", etapes: ["Dans le tableau des classes, touchez « Passage » sur la classe (hors niveau terminal).", "Indiquez l'« Année scolaire de réinscription » au format AAAA-AAAA.", "Pour chaque élève, touchez le statut pour basculer entre « Admis » (passage au niveau supérieur) et « Maintien » (réinscription dans la classe).", "Relisez le compteur « admis · maintenus », puis « Enregistrer ».", "Les admis changent de niveau, les maintenus sont réinscrits ; une nouvelle division est créée si une classe dépasse sa capacité."] },
      { titre: "Transférer un élève ou déclarer un abandon", etapes: ["Ouvrez « Apprenants », puis le dossier de l'élève.", "Touchez « Transférer », cherchez la classe d'accueil, cochez la confirmation, puis « Confirmer le transfert ».", "Ou touchez « Déclarer un abandon », indiquez le motif, puis « Confirmer l'abandon »."] },
      { titre: "Imprimer un état (nominatif, appel, conseil)", pourquoi: "Certains actes restent signés sur papier : l'état reprend exactement la liste affichée à l'écran, rien de plus.", etapes: ["Filtrez d'abord la liste (par classe via la recherche ou le sélecteur) pour cibler l'état voulu.", "Touchez « Imprimer » en haut de « Apprenants ».", "Choisissez le type dans la barre d'outils : État nominatif, Feuille d'appel ou PV de conseil.", "Touchez « Imprimer / PDF » ; dans la fenêtre du navigateur, sélectionnez « Enregistrer en PDF » pour archiver."] },
      { titre: "Suivre les résultats de ses élèves à un examen national", pourquoi: "Le verdict appartient à l'autorité d'examen : l'établissement le lit dans BEILE dès sa publication, sans ressaisie ni calcul.", etapes: ["Ouvrez « Examens nationaux ».", "Choisissez la session (par exemple BEPC · Juin 2026) : vos candidats s'affichent avec leur numéro de table et leur centre.", "Avant la publication, la colonne verdict indique « En attente » : c'est normal, le procès-verbal n'est pas encore publié.", "Après la publication, chaque candidat porte son verdict et sa mention ; « Diplôme » ouvre la vérification publique du diplôme délivré.", "Dans « Diplômes de vos élèves », « Attestation » affiche le QR code à remettre ou à imprimer."] },
      { titre: "Délivrer un acte demandé par un étudiant", pourquoi: "Sans date de mise à disposition ni pièce d'identité consignée, une remise ne se prouve plus — et c'est l'étudiant qui en pâtit.", etapes: ["Ouvrez « Guichet de l'étudiant » dans le menu « Établissement » (processus P6).", "Filtrez sur « À préparer » : ce sont les dépôts qu'aucun agent n'a encore pris en charge.", "Touchez « Prendre en charge » pour arrêter la première étape — le compteur du délai publié continue jusqu'à la mise à disposition.", "Touchez « Marquer prêt à retirer » en indiquant la date de mise à disposition (jamais future) : l'étudiant est notifié et lit le mode de retrait.", "Ce bouton n'apparaît pas sur une ligne dont l'autorité est DEC, DGES ou DBAU : votre guichet prépare et remet, il ne signe pas l'acte d'une autre autorité. La demande reste chez vous en « En cours » jusqu'à ce que l'écran national « Guichet & délais » la scelle ; la ligne repasse alors en « Prêtes » et vous constatez la remise.", "Le jour du retrait, « Constat de remise » : mode de retrait, pièce d'identité présentée, nom du réceptionnaire si ce n'est pas l'intéressé, référence de la quittance.", "Pour un mandataire, la procuration (notariée ou établie au tribunal) est exigée : sans elle, la remise ne se constate pas.", "Si la pièce demandée ne peut pas être délivrée, « Refuser » avec un motif d'au moins 5 caractères — il est transmis à l'étudiant tel quel.", "Chaque décision est définitive : un agent qui a déjà fait avancer la demande reçoit un refus explicite, et l'écran se rafraîchit."] },
      { titre: "Inscrire un étudiant dans une filière du supérieur", pourquoi: "La portée de votre règle, le volume de crédits de la filière et l'agrément de votre établissement décident de ce que l'inscription permet — pas l'inverse.", etapes: ["Ouvrez « Enseignement supérieur », puis le volet « Scolarité », onglet « Référentiel ».", "Déclarez d'abord la filière (diplôme visé, cycle, volume de crédits ECTS, composantes ouvertes), les périodes de l'année et les UE avec leurs crédits et coefficients.", "Portez votre règle de validation : seuil d'acquisition, compensation, pondération, validité d'un acquis, report de crédits. Une décision sans règle en vigueur est refusée.", "Ouvrez « Étudiants & parcours » et touchez « Inscrire un étudiant ».", "Choisissez la personne (votre liste du registre), la filière, la composante — limitée à celles que la filière a ouvertes — l'année universitaire (AAAA-AAAA), le régime et le numéro d'inscription matricule.", "Indiquez le statut de compte si un acte d'allocation le fonde : autorité et référence de l'arrêté. Aucun montant, aucun RIB, aucun échéancier ne se saisit ici.", "L'inscription apparaît avec son effectif de contrats ; un établissement privé non agréé ou dont l'autorisation d'ouverture a expiré est refusé, et le refus est journalisé."] },
      { titre: "Valider les acquis d'une période", pourquoi: "Vous ne fournissez que le couple étudiant / UE : la moyenne, les crédits et la voie d'acquisition sortent du serveur sous la règle en vigueur.", etapes: ["Sur « Étudiants & parcours », ouvrez la carte « Feuille de validation » et choisissez la période.", "Touchez « Contrats signés et notés » pour retenir ce que la période permet réellement de juger.", "Les lignes déjà acquises restent affichées mais décochables : rejouer une validation ne crée pas un second acquis.", "Lancez la validation et relisez le rendu, ligne par ligne : acquise ou non, voie (note de session, compensation…), justification et règle appliquée.", "Renseignez-vous sur les UE sans note : elles ne peuvent être ni validées ni compensées, et la période restera incomplète tant que l'enseignant n'a pas déposé ses notes.", "Exportez la liste des inscriptions en CSV si vous devez préparer un conseil : le fichier porte la date et l'origine des lignes affichées."] },
      { titre: "Certifier un diplôme par jury de capitalisation", pourquoi: "Un diplôme s'appuie sur une filière homologuée et sur des crédits que le jury ne saisit pas lui-même.", etapes: ["Ouvrez le volet « Jury & certification ».", "Touchez « Constituer un jury » : autorité « jury de l'établissement », le diplôme est celui que la filière vise, puis président, membres (sans le président), quorum, période et référence du PV.", "Faites avancer le jury : « → étape suivante » pour le passer de constitué à réuni, puis à ayant délibéré.", "Dans « Délibérer une promotion », choisissez ce jury et cochez les candidats de la filière.", "Donnez la décision : admis, admis sous réserve (en nommant les UE manquantes), ajourné ou refusé.", "Touchez « Délibérer au registre ». Un « admis » sous le volume de crédits de la filière n'est pas enregistré : le serveur rend la ligne avec son motif.", "Relisez la carte « Décisions rendues » : moyenne et mention sont recalculées depuis les acquis, et un certificat non émis y reste affiché avec son motif.", "Un jury d'examen national (BTS, CQP, licence ou master certifiés par l'État) ne se constitue pas ici : il relève du bureau du supérieur."] },
    ],
    faq: [
      { q: "L'enfant n'a pas d'acte de naissance. Puis-je l'inscrire ?", r: "Oui. Touchez « Inscrire avec procédure de régularisation ». L'identité reste déclarative et apparaît dans « Identité à régulariser » jusqu'à l'enregistrement à l'état civil." },
      { q: "Pourquoi une classe n'est-elle pas proposée ?", r: "Elle est complète. Une classe pleine ne peut plus recevoir d'inscription." },
      { q: "L'enfant est « Déjà inscrit·e » ailleurs.", r: "Il faut passer par un transfert, depuis l'établissement d'origine ou via le dossier de l'élève." },
      { q: "Un étudiant réclame son diplôme : est-ce à moi de le délivrer ?", r: "Regardez la colonne « autorité » de la ligne. Si elle indique la DEC, votre guichet ne peut que suivre la demande : le diplôme se signe à l'échelle nationale. Vous pouvez en revanche délivrer un relevé de notes ou une attestation de scolarité, qui souvent débloque l'étudiant en attendant." },
      { q: "Pourquoi aucune donnée de bourse n'apparaît-elle dans mon guichet ?", r: "Parce qu'une allocation se décide à la DBAU ou au ministère, pas à l'établissement. Vous voyez les pièces que vos étudiants doivent retirer chez vous — c'est votre part du dossier." },
      { q: "Pourquoi le volet « Agrégats & actes de l'État » ne s'ouvre-t-il pas chez moi ?", r: "Parce qu'il agrège le pays entier et qu'il statue : il se lit sous une habilitation de pilotage, et ses actes exigent l'administration centrale au périmètre national. Votre scolarité du supérieur reste limitée à vos étudiants, sur les trois premiers volets." },
      { q: "Un de mes étudiants arrive d'un autre établissement : puis-je reprendre ses crédits ?", r: "Oui, par une acquisition de type report de crédits, à partir de la référence d'inscription (INS-…) qu'il apporte, et si votre règle autorise ce report. Le serveur ne vérifie pas l'acquis pris ailleurs — la voie restant opposable est l'équivalence reconnue, instruite puis validée chez vous." },
    ],
    conseils: ["Consultez les absences du jour chaque matin : la famille est déjà prévenue, vous pouvez agir vite.", "Le conseil de passage est irréversible : statuez chaque élève, relisez, puis confirmez.", "En fin de cycle (CM2, 3e, Terminale), la suite relève de l'examen national et de l'affectation : seul le maintien se décide en conseil."],
    visites: ["etablissement", "guichet", "scolarite"],
  },
  {
    id: "enseignant",
    slug: "enseignant",
    nom: "Enseignant",
    pourQui: "Enseignantes et enseignants, en ville comme en brousse.",
    icone: "calendar-check",
    resume: "Faire l'appel, saisir les notes, même sans réseau.",
    objectif: "Faire l'appel en deux minutes et saisir les notes depuis votre téléphone. Ce que vous saisissez prévient les familles et alimente les bulletins, sans rien recopier.",
    espace: "Espace enseignant",
    arrivee: "/enseignant",
    ecrans: [
      { titre: "Mes classes", chemin: "/enseignant", icone: "calendar-check", resume: "Une carte par classe.", points: ["Présence du jour (anneau), moyenne du trimestre, remplissage.", "Deux gros boutons : « Appel » et « Notes »."] },
      { titre: "Carnet de classe", chemin: "/enseignant/classe/…", icone: "clipboard", resume: "Quatre sections : Appel, Notes, Historique, Élèves.", points: ["Appel : un toucher = absent, un second annule, puis « Valider ».", "Notes : saisie sur 20 au quart de point ; correction avec motif obligatoire.", "Historique : appels, notes et corrections de la classe.", "Élèves : fiches, moyennes et absences, tri par moyenne ou absences."] },
      { titre: "Parcours pro", chemin: "/enseignant/carriere", icone: "graduation", resume: "Votre passeport professionnel.", points: ["Grade, ancienneté, charge, formations validées.", "Catalogue de formation continue : « S'inscrire ».", "« Exporter le parcours » : recrutement, affectations et formations en CSV, à joindre à une demande de mutation."] },
      { titre: "Enseignement supérieur", chemin: "/enseignement-superieur", icone: "graduation", resume: "Préparer l'orientation post-bac de vos classes.", points: ["« Filières et parcours » : critères d'entrée (série de BAC, cycle, ECTS) et stage obligatoire, pour argumenter un conseil d'orientation.", "« Concours » : les sessions, leurs places et les coefficients des épreuves — utile pour un lycéen qui vise une école nationale.", "« Formations pro » : les débouchés EFTP et la passerelle CQP/BTS → licence professionnelle.", "Ici aucun élève n'est visible : vous préparez des conseils, vous ne déposez pas les vœux à leur place."] },
    ],
    taches: [
      { titre: "Faire l'appel", pourquoi: "Chaque absence validée prévient la famille et informe la direction, sans cahier à recopier.", etapes: ["Sur la carte de la classe, touchez « Appel ».", "Touchez chaque élève absent : sa ligne passe au rouge. Touchez à nouveau pour annuler.", "Vérifiez le compteur présents / absents.", "Touchez « Valider · N absents ». Le message « Appel enregistré » confirme l'envoi."] },
      { titre: "Faire l'appel sans réseau", pourquoi: "L'école n'a pas toujours de réseau : rien ne doit se perdre.", etapes: ["Faites l'appel normalement. Le bouton devient orange et indique « (hors ligne) ».", "Touchez-le : « Appel conservé » s'affiche. L'appel est gardé sur le téléphone.", "Au retour du réseau, l'envoi est automatique. Le bandeau « saisies en attente » disparaît.", "Pour forcer l'envoi, touchez « Envoyer » dans le bandeau. Ne videz pas les données du navigateur avant l'envoi."] },
      { titre: "Saisir les notes d'une évaluation", etapes: ["Sur la carte de la classe, touchez « Notes ».", "Choisissez la matière (si vous en avez plusieurs) et le trimestre (T1, T2, T3).", "Tapez chaque note sur 20 (au quart de point : 12,25). « Entrée » passe à l'élève suivant.", "Touchez « Enregistrer N notes ». Une note invalide est signalée en rouge avant l'envoi."] },
      { titre: "Corriger une note", pourquoi: "La note d'origine n'est jamais effacée : la correction est ajoutée, datée, signée, et la famille est informée.", etapes: ["Dans « Évaluations enregistrées », touchez la note à corriger.", "Saisissez la « Nouvelle note ».", "Écrivez le « Motif » (obligatoire, 5 caractères au moins).", "Validez. La note d'origine reste visible, barrée."] },
      { titre: "Exporter votre passeport professionnel", pourquoi: "Pour une mutation ou un avancement, vous n'avez pas à recomposer un dossier papier : le parcours se reconstruit depuis le registre.", etapes: ["Ouvrez « Parcours pro » (/enseignant/carriere).", "Touchez « Exporter le parcours » en haut de l'écran.", "Le fichier CSV réunit recrutement, affectations et formations, datés et triés du plus ancien au plus récent.", "Ouvrez-le avec un tableur ; il se joint à votre demande."] },
    ],
    faq: [
      { q: "J'ai marqué un élève absent par erreur, avant de valider.", r: "Touchez-le à nouveau : il redevient présent. « Tout présent » annule toute la saisie en cours." },
      { q: "J'ai validé une absence par erreur.", r: "Une absence enregistrée est verrouillée. Prévenez la direction de l'établissement, qui peut la traiter." },
      { q: "Mes saisies hors connexion sont-elles perdues si je ferme l'application ?", r: "Non, elles restent sur le téléphone. Elles sont perdues seulement si vous effacez les données du navigateur avant l'envoi." },
      { q: "Je suis aussi parent d'élève.", r: "L'onglet « Mon enfant » ouvre l'espace famille avec le même compte." },
    ],
    conseils: ["Faites l'appel en début de cours : les familles sont prévenues le jour même.", "Gardez un code de verrouillage sur votre téléphone.", "Vérifiez de temps en temps le bandeau « saisies en attente » quand vous travaillez sans réseau."],
    visites: ["enseignant", "enseignant-classe"],
  },
  {
    id: "parent",
    slug: "parent",
    nom: "Parent",
    pourQui: "Parents et tuteurs légaux.",
    icone: "users",
    resume: "Suivre la scolarité de ses enfants et justifier une absence.",
    objectif: "Savoir le jour même si votre enfant est absent, suivre ses résultats, justifier une absence en un geste et retrouver ses diplômes.",
    espace: "Espace famille",
    arrivee: "/famille",
    ecrans: [
      { titre: "Mes enfants", chemin: "/famille", icone: "house", resume: "La fiche de chaque enfant.", points: ["Identité, classe, établissement.", "Moyenne, évolution, absences, évaluations.", "Absences à justifier, résultats par matière, dernières notes, parcours."] },
      { titre: "Notifications", chemin: "/famille/notifications", icone: "bell", resume: "Les messages nés des faits enregistrés par l'école.", points: ["Absence, nouvelle note, note corrigée…", "Filtre « Toutes » / « Non lues », « Tout marquer comme lu »."] },
      { titre: "Documents", chemin: "/famille/documents", icone: "file", resume: "Les diplômes de vos enfants.", points: ["Chaque diplôme porte un QR code vérifiable sans compte."] },
    ],
    taches: [
      { titre: "Justifier une absence", pourquoi: "L'établissement reçoit le motif aussitôt, sans billet papier.", etapes: ["Dans « Absences », repérez le jour marqué « À justifier ».", "Touchez « Justifier ».", "Choisissez le motif : Maladie, Rendez-vous médical, Raison familiale, Transport ou Autre.", "Ajoutez une précision si besoin (obligatoire pour « Autre »), puis touchez « Transmettre »."] },
      { titre: "Suivre les résultats", etapes: ["Regardez la tuile « Moyenne » et son « Évolution ».", "Dans « Résultats par matière », chaque barre montre la moyenne sur 20 ; le trait rappelle le trimestre précédent.", "« Dernières notes » liste les évaluations récentes.", "Touchez « Bulletin » pour ouvrir le relevé du trimestre et l'imprimer (ou l'enregistrer en PDF) ; changez de trimestre depuis l'en-tête."] },
      { titre: "Présenter un diplôme", etapes: ["Ouvrez « Documents ».", "Montrez le QR code du diplôme : la personne le scanne et vérifie elle-même, sans compte."] },
    ],
    faq: [
      { q: "Je ne vois pas mon enfant.", r: "Le lien parent-enfant vient du registre national. Rapprochez-vous de l'établissement de votre enfant pour vérifier l'inscription." },
      { q: "J'ai plusieurs enfants.", r: "Un sélecteur avec leurs prénoms apparaît en haut de l'écran « Mes enfants »." },
      { q: "L'absence reste « Transmise ».", r: "L'établissement doit valider votre justificatif. Elle passera ensuite à « Justifiée »." },
    ],
    conseils: ["Ne prêtez pas votre compte à votre enfant : il a le sien s'il est apprenant.", "Activez le verrouillage de votre téléphone."],
    visites: ["famille"],
  },
  {
    id: "apprenant",
    slug: "apprenant",
    nom: "Apprenant",
    pourQui: "Élèves et apprenants.",
    icone: "graduation",
    resume: "Consulter son parcours, partager ses diplômes, explorer l'orientation.",
    objectif: "Retrouver tout votre parcours scolaire, quelle que soit l'école, et prouver vos diplômes à une école ou un employeur sans démarche.",
    espace: "Mon passeport éducatif",
    arrivee: "/apprenant",
    ecrans: [
      { titre: "Mon parcours", chemin: "/apprenant", icone: "route", resume: "Votre passeport éducatif.", points: ["Identifiant, classe, établissement.", "Moyenne, évaluations, absences, diplômes.", "« Bulletin » : relevé de notes du trimestre, à imprimer ou enregistrer en PDF.", "Points forts et frise de votre parcours."] },
      { titre: "Mes diplômes", chemin: "/apprenant/preuves", icone: "award", resume: "Vos preuves, à partager.", points: ["« Partager », « Copier le lien », « QR en grand ».", "Le QR code ne contient ni nom ni note."] },
      { titre: "Mes démarches", chemin: "/apprenant/demarches", icone: "stamp", resume: "Vos actes administratifs, du dépôt à la remise.", points: ["« Déposer une demande » : relevé de notes, attestation de scolarité, attestation de scolarité et de progression, attestation de succès provisoire ou définitive, diplôme, duplicata de diplôme.", "Le délai affiché est celui que l'administration a publié (la fiche CatIS correspondante est citée) ; BEILE ne le promet pas, il l'enregistre et le mesure.", "Le retard affiché est calculé par le serveur à partir de votre date de dépôt : l'heure de votre téléphone n'y change rien.", "Une demande « Prête à retirer » précise le mode de retrait et la pièce d'identité à présenter — pour vous, à un géniteur, à un mandataire (procuration), à l'autorité académique, ou en dématérialisé.", "« Mon dossier » (allocation) : les pièces exigées par l'échéance en cours, celles déjà remises, le nombre de jours restants. Une pièce prête au guichet mais non retirée y compte comme manquante.", "Aucun montant n'apparaît jamais : BEILE conserve le statut décidé et la référence du texte, la liquidation reste à la DBAU."] },
      { titre: "Orientation", chemin: "/apprenant/orientation", icone: "compass", resume: "Des pistes lues dans vos résultats réels.", points: ["Sept pistes du second cycle béninois : séries A1, A2, B, C et D, et séries techniques F et G, pondérées sur vos moyennes de l'année.", "Chaque piste affiche son indice /20, l'écart à la piste de tête et la part de vos matières qui jouent en sa faveur. La pondération est indicative, pas un barème officiel.", "Un bandeau teste la sensibilité : il dit si la piste de tête tient quand on pèse toutes les matières à égalité.", "En bas, « Et après le bac ? » prolonge ces pistes vers les filières du supérieur (Licence, Master, écoles nationales, BTS/CQP) que vos résultats et votre série envisagée rendent accessibles.", "Rien n'est inventé : une matière non évaluée n'est pas remplacée, elle réduit la couverture affichée. Les pistes éclairent votre choix, elles ne le font pas."] },
    ],
    taches: [
      { titre: "Demander un acte administratif et le suivre", pourquoi: "Chaque étape est un fait daté au registre : c'est ce qui permet de dire qui a retardé, et de réclamer son droit avec une preuve.", etapes: ["Ouvrez « Mes démarches », puis le volet « Déposer une demande ».", "Choisissez l'acte : un relevé de notes ou une attestation de scolarité se délivrent à l'établissement (3 jours ouvrés annoncés) ; une attestation de succès ou un diplôme relève de la DEC (30 à 60 jours).", "Précisez l'année universitaire (AAAA-AAAA). Pour un duplicata de diplôme, le motif est obligatoire — c'est lui qui déclenche la recherche de l'original.", "Touchez « Déposer la demande ». L'écran affiche la date à laquelle le guichet doit avoir préparé l'acte, d'après le délai publié.", "Suivez le statut ici même : « Déposée », « En cours de préparation », « Prête à retirer », « Remise ». Une notification arrive sur votre espace à chaque étape.", "Le jour du retrait, présentez la pièce d'identité annoncée. Si quelqu'un retire à votre place, la procuration notariée est exigée.", "En cas de refus, le motif est écrit sur la ligne : un refus ne se rouvre pas, mais vous pouvez redéposer dès que la pièce manquante est obtenue."] },
      { titre: "Ne pas perdre son allocation faute de dépôt", pourquoi: "Une allocation se perd plus souvent pour un dossier déposé trop tard que pour un manque de résultats.", etapes: ["Ouvrez « Mes démarches » et descendez jusqu'au volet de l'allocation.", "Lisez « Mon dossier » : le statut (complet, pièces à produire, hors délai, aucune échéance déclarée) et les jours restants avant la date limite.", "Comparez la liste des pièces exigées à celles déjà remises — une pièce prête au guichet mais que vous n'êtes pas allé retirer compte comme manquante.", "Si « aucune échéance déclarée » s'affiche, ce n'est pas une bonne nouvelle : c'est que l'autorité n'a pas encore publié de date. Déposez quand même, et gardez-en la trace.", "Après une décision, la nature (attribution, renouvellement, rétablissement, secours) et l'autorité qui a statué s'affichent, avec la référence du texte. Aucun montant : la liquidation se traite à la DBAU."] },
      { titre: "Partager un diplôme", pourquoi: "La personne vérifie elle-même l'authenticité, en quelques secondes, sans compte.", etapes: ["Ouvrez « Mes diplômes ».", "Touchez « Copier le lien » et collez-le dans un message, ou « Partager » sur téléphone.", "En face à face, touchez « QR en grand » et laissez scanner le code."] },
      { titre: "Explorer une orientation", etapes: ["Ouvrez « Orientation ».", "Lisez d'abord le bandeau : il dit si la piste de tête est robuste ou si elle dépend du poids des matières.", "Comparez les pistes : indice /20, écart à la tête, et les matières (et leur coefficient) qui fondent chaque score.", "Repérez un badge « Quasi équivalente » : deux pistes à moins d'un demi-point se discutent autant l'une que l'autre.", "Descendez jusqu'à « Et après le bac ? » pour voir les filières du supérieur cohérentes avec votre profil, avec un badge « Concours » quand l'entrée est sélective.", "Parlez-en avec vos enseignants, votre famille et le conseiller d'orientation : les pistes évoluent avec vos résultats."] },
    ],
    faq: [
      { q: "Un diplôme manque.", r: "Il apparaît dès la publication officielle des résultats par l'autorité d'examen. S'il manque ensuite, adressez-vous à votre établissement." },
      { q: "Quelqu'un peut-il modifier mon diplôme ?", r: "Toute modification du document est détectée à la vérification : le verdict devient « Document altéré »." },
      { q: "Mon diplôme tarde depuis des mois. Que faire ?", r: "Ouvrez « Mes démarches » : la ligne indique l'autorité qui doit signer (votre établissement, la DEC, la DGES) et le nombre de jours écoulés depuis votre dépôt. C'est cette autorité qu'il faut relancer, avec la référence de la demande — plus une pièce à charge que « je n'ai rien reçu »." },
      { q: "Le délai affiché est-il une promesse ?", r: "Non. Il est annoncé par l'administration (la fiche CatIS est citée) et certains barèmes restent à confirmer par arrêté. Ce que BEILE garantit, c'est la date de votre dépôt et celle de la mise à disposition — donc le retard réellement constaté." },
      { q: "Pourquoi je ne vois pas le montant de ma bourse ?", r: "Volontairement. Un montant, un échéancier ou un RIB sont des données bancaires et sociales qui ne se stockent pas dans un registre de scolarité. BEILE conserve le statut décidé, son autorité, sa date et la référence du texte ; le paiement se lit à la DBAU." },
      { q: "Puis-je retirer une demande ?", r: "Oui tant qu'elle n'est pas instruite : « Retirer » inscrit un fait en ajout seul. La demande reste visible, marquée « Retirée par vous », et un tiers qui vérifierait l'identifiant lira « retirée » — jamais un faux document." },
    ],
    conseils: ["Ne partagez que le lien ou le QR code de vérification, jamais votre mot de passe.", "Déconnectez-vous sur un ordinateur de l'école."],
    visites: ["apprenant", "demarches"],
  },
  {
    id: "dpo",
    slug: "dpo",
    nom: "Délégué à la protection des données",
    pourQui: "Le ou la DPO du ministère et son équipe.",
    icone: "shield",
    resume: "Contrôler qui accède à quoi, tenir le registre des traitements.",
    objectif: "Vérifier que chaque accès aux données personnelles est justifié, repérer les usages anormaux et répondre à l'autorité de protection des données.",
    espace: "Conformité",
    arrivee: "/audit",
    ecrans: [
      { titre: "Journal d'audit", chemin: "/audit", icone: "scroll", resume: "Qui a demandé quelle donnée, pour quelle finalité, avec quelle décision.", points: ["Décisions journalisées, accès refusés, part de refus.", "Recherche, filtres par décision et par finalité, « Exporter (CSV) ».", "Refus par critère manquant, comptes les plus souvent refusés.", "« Tenter d'ouvrir un dossier » : preuve que les refus sont journalisés."] },
      { titre: "Registre des traitements", chemin: "/audit/traitements", icone: "shield-check", resume: "Chaque usage des données personnelles.", points: ["Finalité, base légale, destinataires, durée de conservation, criticité."] },
      { titre: "État du service", chemin: "/plateforme/etat", icone: "server", resume: "Santé et sécurité de la plateforme.", points: ["Sécurité des 24 dernières heures : connexions, verrouillages, refus."] },
    ],
    taches: [
      { titre: "Contrôler les accès d'une personne", etapes: ["Dans le journal, cherchez son nom ou son identifiant.", "Filtrez par « Refusées » pour voir les tentatives indues.", "Touchez « Exporter (CSV) » pour conserver les lignes affichées."] },
      { titre: "Démontrer la traçabilité", pourquoi: "Devant un auditeur, montrer un refus journalisé en direct vaut mieux qu'un document.", etapes: ["Dans « Vérifier la traçabilité », touchez « Tenter d'ouvrir un dossier ».", "Le refus apparaît dans le journal, avec le critère manquant."] },
    ],
    faq: [
      { q: "Peut-on supprimer une ligne du journal ?", r: "Non. Le journal est en ajout seul : personne ne peut modifier ni supprimer une entrée, pas même un administrateur." },
      { q: "Que signifie « critère manquant » ?", r: "Le critère qui a fait refuser l'accès : rôle, périmètre, relation (par exemple, pas d'enseignement dans la classe) ou finalité." },
    ],
    conseils: ["Examinez chaque semaine les « Comptes les plus souvent refusés ».", "Conservez vos exports dans un espace protégé : ils contiennent des noms."],
    visites: ["conformite"],
  },
  {
    id: "administrateur",
    slug: "administrateur",
    nom: "Administrateur",
    pourQui: "L'équipe qui gère les comptes et le support de BEILE.",
    icone: "key",
    resume: "Créer les comptes, remettre les mots de passe, répondre au support.",
    objectif: "Donner à chacun l'accès strictement nécessaire, remettre des mots de passe temporaires en toute sécurité et résoudre les demandes d'assistance.",
    espace: "Comptes et accès",
    arrivee: "/administration",
    ecrans: [
      { titre: "Comptes et accès", chemin: "/administration", icone: "key", resume: "Trois volets : « Comptes », « Nouvel utilisateur », « Support ».", points: ["Comptes : recherche par nom, identifiant ou fonction ; filtres « Tous », « Actifs », « Désactivés », « À surveiller ».", "Actions sur un compte : « Gérer » (habilitations), « Réinitialiser », « Désactiver », « Activer ». Chaque action est journalisée.", "Nouvel utilisateur : Identité, Habilitations, Récapitulatif, Accès.", "Support : la file des demandes d'assistance (« À traiter », « Résolues », « Closes », « Toutes »)."] },
      { titre: "État du service", chemin: "/plateforme/etat", icone: "server", resume: "La plateforme fonctionne-t-elle, et vite ?", points: ["Latence, instance, activité du registre, sécurité, objectifs de continuité."] },
      { titre: "Interopérabilité", chemin: "/plateforme/interoperabilite", icone: "network", resume: "Les échanges avec les autres systèmes nationaux.", points: ["Raccordements, provenance des événements, vérifications publiques de diplômes."] },
    ],
    taches: [
      { titre: "Remettre un mot de passe temporaire", pourquoi: "Le titulaire devra le changer à sa première connexion : vous ne connaîtrez jamais son mot de passe définitif.", etapes: ["Vérifiez l'identité de la personne qui le demande (en personne ou par un canal officiel).", "Dans « Comptes », cherchez son compte, puis touchez « Réinitialiser ».", "Confirmez avec « Générer un mot de passe temporaire ». Le mot de passe s'affiche une seule fois.", "Transmettez-le par un canal sûr, puis touchez « J'ai transmis le mot de passe »."] },
      { titre: "Créer un utilisateur", pourquoi: "Une habilitation associe un rôle à un périmètre : elle ouvre des données personnelles, accordez le strict nécessaire.", etapes: ["Touchez « Nouvel utilisateur ».", "Identité : saisissez le NPI (10 chiffres, vérifié au registre national ; exigé pour les rôles enseignant, parent et apprenant), le nom, la fonction et l'identifiant (prenom.nom).", "Habilitations : choisissez le rôle et son périmètre (établissement, circonscription ou département).", "Récapitulatif : vérifiez, puis touchez « Créer le compte ».", "Accès : remettez l'identifiant et le mot de passe temporaire au titulaire, en main propre."] },
      { titre: "Traiter une demande d'assistance", etapes: ["Ouvrez le volet « Support » et choisissez une demande « À traiter ».", "Touchez « Prendre en charge ».", "Écrivez votre réponse (l'auteur est notifié), puis touchez « Envoyer ».", "Changez le statut jusqu'à « Résolue » quand le problème est réglé."] },
      { titre: "Désactiver un compte", etapes: ["Dans « Comptes », cherchez le compte de la personne qui quitte ses fonctions.", "Touchez « Désactiver », puis confirmez avec « Désactiver le compte ».", "Ses sessions ouvertes sont fermées ; « Activer » rétablit l'accès si besoin."] },
    ],
    faq: [
      { q: "Puis-je désactiver mon propre compte ?", r: "Non : le bouton est bloqué pour éviter de perdre l'accès à l'administration." },
      { q: "Le NPI est « inconnu du registre national des personnes ».", r: "Vérifiez les 10 chiffres avec la personne. Pour un agent sans rôle nominatif, le NPI peut rester vide." },
      { q: "Un utilisateur me donne son mot de passe pour que je vérifie son compte.", r: "Refusez de l'utiliser et demandez-lui de le changer : vous n'avez jamais besoin du mot de passe d'un autre." },
    ],
    conseils: ["Accordez le strict nécessaire : un rôle, un périmètre.", "Désactivez sans attendre le compte d'une personne qui quitte ses fonctions.", "Ne transmettez jamais un mot de passe par SMS ou réseau social."],
    visites: ["administration"],
  },
  {
    id: "public",
    slug: "public",
    nom: "Public",
    pourQui: "Employeurs, écoles, administrations, candidats et familles : toute personne sans compte.",
    icone: "badge",
    resume: "Vérifier un diplôme ou consulter un résultat d'examen, sans compte.",
    objectif: "Deux services publics gratuits, sans compte et sans conserver de donnée : vérifier l'authenticité d'un diplôme, et consulter le verdict officiel d'un examen national à partir du numéro de table.",
    espace: "Démarches publiques",
    arrivee: "/verifier",
    ecrans: [
      { titre: "Vérifier un diplôme", chemin: "/verifier", icone: "badge", resume: "Scanner le QR code ou saisir l'identifiant.", points: ["« Scanner le QR code » (caméra) ou saisie de l'identifiant (ex. CERT-CEP-2024-000001, CERT-LIC-2026-000012).", "Tout diplôme national se vérifie ici, du CEP au master certifié par l'État ; pour un diplôme du supérieur la réponse nomme la filière, l'établissement qui a délivré et l'office qui a délibéré.", "Verdict : Diplôme authentique, Identifiant existant (titulaire non vérifié), Ne correspond pas, Diplôme révoqué ou Diplôme introuvable.", "L'identifiant seul ne dit pas à qui appartient le diplôme : le registre confirme qu'il existe et rien de plus. Nom du titulaire, mention et contrôle d'intégrité du document exigent l'empreinte portée par le QR code."] },
      { titre: "Résultats d'examens", chemin: "/resultats", icone: "graduation", resume: "Saisir son numéro de table pour connaître le verdict d'une session.", points: ["Choisissez l'examen (CEP, BEPC, BAC), la session (ex. Juin 2024), puis saisissez le numéro de table porté sur la convocation.", "Verdict : Admis (avec moyenne et mention), Non admis, Résultats non publiés ou Numéro de table introuvable.", "Rien ne s'affiche tant que la session n'est pas officiellement publiée par le bureau des examens."] },
    ],
    taches: [
      { titre: "Vérifier un diplôme", pourquoi: "Le registre national compare l'empreinte du document à celle du diplôme délivré.", etapes: ["Ouvrez BEILE, puis « Vérifier un diplôme ».", "Touchez « Scanner le QR code » et visez le code, ou saisissez l'identifiant du diplôme.", "Touchez « Vérifier ».", "Lisez le verdict. « Diplôme authentique » se compare au document présenté ; « Identifiant existant, titulaire non vérifié » veut dire que le diplôme existe mais qu'aucune empreinte n'a été présentée — vous ne savez ni si le document est intact, ni si son porteur en est le titulaire. « Ne correspond pas » : n'acceptez pas le document en l'état.", "Pour un diplôme du supérieur, contrôlez aussi la filière et l'établissement affichés : c'est ce que le document prénommé doit dire."] },
      { titre: "Consulter un résultat d'examen", pourquoi: "BEILE reçoit les verdicts du procès-verbal de l'autorité d'examen ; la plateforme officielle des examens et concours reste eRESULTATS (www.eresultats.bj).", etapes: ["Ouvrez « Résultats d'examens ».", "Choisissez l'examen, puis la session dans la liste des sessions publiées.", "Saisissez le numéro de table de la convocation.", "Facultatif : saisissez la date de naissance du candidat pour afficher son nom et sa moyenne. Sans elle, seuls le verdict et la mention s'affichent — personne ne lit un nom avec le seul numéro de table.", "Touchez « Consulter le résultat ». « Résultats non publiés » : la session n'a pas encore été rendue publique."] },
    ],
    faq: [
      { q: "Faut-il un compte ?", r: "Non. La vérification d'un diplôme comme la consultation d'un résultat sont publiques, gratuites et immédiates." },
      { q: "Le verdict est « Document altéré ».", r: "Le diplôme existe, mais le document a été modifié (nom, mention, note ou session). Ne l'acceptez pas ; demandez l'original ou le lien de vérification au titulaire." },
      { q: "Le verdict est « Diplôme introuvable ».", r: "Vérifiez la saisie de l'identifiant. Si le document affirme le contraire, il est suspect." },
      { q: "« Résultats non publiés » alors que les épreuves sont finies.", r: "Le verdict n'apparaît qu'après la publication officielle de la session par le bureau des examens. Revenez après cette date." },
      { q: "Où trouver mon numéro de table ?", r: "Il est imprimé sur la carte de convocation. C'est la seule information nécessaire pour consulter un résultat." },
    ],
    conseils: ["Vérifiez un diplôme avec le QR code du document, pas avec un lien reçu d'un tiers inconnu.", "Comparez le nom, la mention et la session affichés à ceux du document.", "Pour un résultat d'examen, ne communiquez votre numéro de table qu'au besoin : c'est lui qui ouvre le verdict."],
    visites: [],
  },
];

export const profilParSlug = (slug: string) => PROFILS.find((p) => p.slug === slug);
