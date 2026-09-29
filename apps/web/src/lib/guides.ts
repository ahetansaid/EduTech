import type { Role } from "@beile/contracts";

/**
 * Visites guidées de BEILE : une par espace (démarrée à la première visite), plus quelques écrans
 * riches (carnet de classe, « Où agir ? », Ask Education, assistance).
 *
 * Une étape vise un élément marqué `data-guide="…"` dans la page. Si l'élément n'existe pas
 * (donnée absente, rôle différent, écran pas encore livré), l'étape est ignorée sans bruit.
 * Le texte dit quoi faire ; « pourquoi » dit ce que cela change pour l'utilisateur.
 */

export type ProfilGuide =
  | "administration_centrale" | "direction_departementale" | "inspecteur" | "chercheur" | "chef_etablissement"
  | "enseignant" | "parent" | "apprenant" | "dpo" | "administrateur" | "public";

export interface EtapeGuide {
  /** Valeur(s) de `data-guide` visée(s) : la première visible l'emporte. Absente : étape centrée. */
  cible?: string | string[];
  /** Sélecteur CSS de repli, quand l'élément ne peut pas porter d'attribut. */
  selecteur?: string;
  /** Écran à ouvrir avant l'étape : chemin absolu (« /apprenant/preuves ») ou paramètres (« ?onglet=notes »). */
  aller?: string;
  /** L'étape ne concerne que ces rôles (sinon : tous les rôles du guide). */
  roles?: Role[];
  titre: string;
  texte: string;
  pourquoi?: string;
}

export interface Guide {
  id: string;
  /** Nom court affiché dans la bulle (« Visite guidée · … »). */
  titre: string;
  roles: Role[];
  /** Écran de départ : la visite y démarre, automatiquement à la première visite. */
  depart: string;
  /** Écrans couverts par ce guide (bouton « Guide »). */
  ecrans: RegExp;
  /** Guide d'espace (principal) ou d'écran (complément). */
  nature: "espace" | "ecran";
  /** Profil documenté dans le centre d'aide. */
  profil: ProfilGuide;
  etapes: EtapeGuide[];
}

/* ------------------------------------------------------------------ Étapes communes */

const COQUILLE_NAVIGATION: EtapeGuide = {
  cible: "navigation",
  titre: "Vos écrans",
  texte: "Le menu ne montre que les écrans permis par votre habilitation. Sur téléphone, il s'ouvre avec le bouton en haut à gauche.",
  pourquoi: "Masquer un écran n'est qu'un confort : c'est le serveur qui décide de chaque accès, et il note chaque refus.",
};

const BOUTON_GUIDE: EtapeGuide = {
  cible: "bouton-guide",
  titre: "Revoir ce guide",
  texte: "Ce bouton relance la visite de l'écran où vous êtes, quand vous voulez. Le centre d'aide détaille chaque tâche, pas à pas.",
};

const COMPTE: EtapeGuide = {
  cible: ["compte", "navigation"],
  titre: "Votre compte",
  texte: "Votre nom ouvre un menu : « Changer mon mot de passe », « Assistance » et « Se déconnecter ». Déconnectez-vous toujours sur un appareil partagé.",
  pourquoi: "Chaque action est faite en votre nom et inscrite au journal. Votre identifiant ne se prête pas.",
};

/* ------------------------------------------------------------------ Ask Education (partagé) */

const ETAPES_ASK: EtapeGuide[] = [
  {
    cible: "ask-question",
    titre: "Posez votre question en français",
    texte: "Écrivez comme vous parleriez à un analyste, puis touchez la flèche (ou « Entrée »). 400 caractères au plus.",
    pourquoi: "Le serveur traduit la question en calcul sur le dictionnaire national. Il n'invente jamais un chiffre.",
  },
  {
    cible: "ask-exemples",
    titre: "Partez d'un exemple",
    texte: "Un toucher sur un exemple pose la question aussitôt. C'est la façon la plus rapide de découvrir ce que l'outil sait calculer.",
  },
  {
    cible: "ask-reponses",
    titre: "Lisez la réponse et sa preuve",
    texte: "Chaque réponse donne le chiffre, sa définition, sa source, la couverture des données et un indice de confiance.",
    pourquoi: "Une question sur une personne ou hors de votre territoire est refusée : le refus est expliqué et journalisé.",
  },
];

/* ------------------------------------------------------------------ Guides */

export const GUIDES: Guide[] = [
  /* ---------------------------------------------------------------- Administration centrale */
  {
    id: "cockpit",
    titre: "Cockpit national",
    roles: ["administration_centrale"],
    depart: "/cockpit",
    ecrans: /^\/(cockpit$|plateforme\/(qualite|dictionnaire|interoperabilite|etat))/,
    nature: "espace",
    profil: "administration_centrale",
    etapes: [
      {
        titre: "Bienvenue dans le cockpit national",
        texte: "Cet écran résume la situation du système éducatif. Tous les chiffres sont calculés par le serveur, sous le périmètre de votre habilitation.",
        pourquoi: "La direction centrale, un département et une circonscription obtiennent le même chiffre pour le même territoire.",
      },
      {
        cible: "cockpit-indicateurs",
        titre: "Les chiffres clés",
        texte: "Apprenants, établissements, enseignants, réussite au BEPC, mathématiques. Chaque tuile montre la tendance et l'écart sur un an.",
        pourquoi: "L'indice de confiance vous dit si la donnée est complète. Un chiffre partiel n'est jamais présenté comme complet.",
      },
      {
        cible: "cockpit-carte",
        titre: "La carte à couches",
        texte: "Choisissez une couche (priorités, occupation, absentéisme…), puis touchez une commune pour lire les facteurs qui expliquent sa couleur.",
      },
      {
        cible: "cockpit-flux",
        titre: "Les faits du jour, en direct",
        texte: "Absences, inscriptions, notes : les faits enregistrés dans les écoles arrivent ici en moins de 15 secondes.",
        pourquoi: "Ces faits sont anonymes : type, établissement, heure. Aucune donnée individuelle ne remonte au cockpit.",
      },
      {
        cible: "cockpit-priorites",
        titre: "Où regarder d'abord",
        texte: "Les communes en « Attention » ou « Critique » sont classées par nombre de facteurs d'alerte. Un toucher ouvre leur fiche.",
      },
      {
        cible: "cockpit-question",
        titre: "Une question précise ?",
        texte: "« Poser une question » ouvre Ask Education. « Où agir ? » descend du pays jusqu'aux établissements.",
      },
      COQUILLE_NAVIGATION,
      BOUTON_GUIDE,
    ],
  },
  {
    id: "ou-agir",
    titre: "Où agir ?",
    roles: ["administration_centrale", "direction_departementale"],
    depart: "/cockpit/carte",
    ecrans: /^\/cockpit\/carte/,
    nature: "ecran",
    profil: "administration_centrale",
    etapes: [
      {
        cible: "carte-fil",
        titre: "Descendez pas à pas",
        texte: "Ce fil indique où vous êtes : Bénin, puis département, puis commune. Touchez un niveau pour y revenir.",
      },
      {
        cible: "carte-carte",
        titre: "La carte des priorités",
        texte: "Touchez une zone pour descendre d'un niveau. Au niveau de la commune, les points sont ses établissements.",
        pourquoi: "Cinq facteurs objectivés fixent la couleur : croissance, occupation, encadrement, absentéisme, résultats.",
      },
      {
        selecteur: '[data-guide="carte-carte"] [role="radiogroup"]',
        titre: "Changez de couche",
        texte: "Affichez un autre indicateur sur la même carte. Les hachures signalent une donnée masquée ou hors de votre périmètre.",
      },
      {
        cible: "carte-panneau",
        titre: "Le détail qui explique",
        texte: "Ce panneau liste les zones à examiner, puis les facteurs et les établissements de la commune choisie.",
      },
      BOUTON_GUIDE,
    ],
  },
  /* ---------------------------------------------------------------- Direction départementale et inspection */
  {
    id: "territoire",
    titre: "Console territoriale",
    roles: ["direction_departementale", "inspecteur"],
    depart: "/territoire",
    ecrans: /^\/(territoire|plateforme\/(qualite|dictionnaire))/,
    nature: "espace",
    profil: "direction_departementale",
    etapes: [
      {
        cible: "territoire-indicateurs",
        titre: "Votre territoire en six chiffres",
        texte: "Effectif, occupation, encadrement, mathématiques, absentéisme, abandon. Le repère national s'affiche sous chaque valeur.",
        pourquoi: "Ces chiffres suivent la définition nationale : vous parlez le même langage que la direction centrale.",
      },
      {
        cible: "territoire-carte",
        titre: "Les niveaux de priorité",
        texte: "La carte colore chaque commune selon ses facteurs d'alerte. Touchez une commune pour descendre jusqu'aux établissements.",
      },
      {
        cible: "territoire-absences",
        titre: "Les absences du jour",
        texte: "L'appel fait en classe arrive ici en direct, établissement par établissement. L'écran se met à jour toutes les 30 secondes.",
        pourquoi: "Un fait saisi une fois notifie la famille, informe la direction et fait bouger ce taux, sans ressaisie.",
      },
      {
        cible: "territoire-classement",
        roles: ["direction_departementale"],
        titre: "Comparez les communes",
        texte: "Choisissez l'indicateur de classement. Le trait vertical marque la valeur du département. Un toucher ouvre la commune.",
      },
      {
        cible: "territoire-attention",
        roles: ["inspecteur"],
        titre: "Les points d'attention",
        texte: "Établissements saturés, classes surchargées, remontées absentes, points d'eau manquants : ce qui demande une visite.",
      },
      {
        cible: "territoire-retardataires",
        roles: ["direction_departementale"],
        titre: "Relancez ceux qui n'ont pas transmis",
        texte: "Un établissement qui n'a pas transmis baisse la confiance du territoire. « Relancer » lui envoie un rappel tracé.",
      },
      {
        cible: "territoire-etablissements",
        roles: ["inspecteur"],
        titre: "Vos établissements",
        texte: "Effectifs, encadrement, infrastructures et transmission. « Relancer » envoie un rappel à l'établissement en retard.",
      },
      {
        cible: "territoire-carte-lien",
        titre: "Aller plus loin",
        texte: "« Où agir ? » ou « Voir sur la carte » ouvre la carte détaillée, jusqu'à chaque établissement.",
      },
      BOUTON_GUIDE,
    ],
  },

  /* ---------------------------------------------------------------- Chercheur */
  {
    id: "chercheur",
    titre: "Ask Education",
    roles: ["chercheur"],
    depart: "/ask",
    ecrans: /^\/(ask|plateforme\/dictionnaire)/,
    nature: "espace",
    profil: "chercheur",
    etapes: [
      {
        titre: "Des chiffres, jamais des personnes",
        texte: "Votre accès porte sur des statistiques agrégées. Toute question qui viserait une personne est refusée.",
        pourquoi: "Les petits effectifs sont masqués : une ligne de moins de quelques élèves ne s'affiche pas.",
      },
      ...ETAPES_ASK,
      {
        aller: "/plateforme/dictionnaire",
        cible: "dictionnaire-recherche",
        titre: "Le dictionnaire national",
        texte: "Chaque indicateur y est défini : ce qu'il mesure, sa formule, sa source, qui en répond. Cherchez par nom ou par code.",
        pourquoi: "Citez la définition et sa version dans vos travaux : un chiffre publié se recalcule avec la définition de son année.",
      },
      {
        cible: "dictionnaire-historique",
        titre: "Les versions d'une définition",
        texte: "Quand une définition change, l'ancienne reste consultable. Vous voyez l'effet du changement sur le chiffre.",
      },
      BOUTON_GUIDE,
    ],
  },
  {
    id: "ask",
    titre: "Ask Education",
    roles: ["administration_centrale", "direction_departementale", "inspecteur"],
    depart: "/ask",
    ecrans: /^\/ask/,
    nature: "ecran",
    profil: "administration_centrale",
    etapes: [
      {
        titre: "Interroger les données en français",
        texte: "Ask Education répond à une question sur le système éducatif, avec la preuve du calcul. Le périmètre de votre habilitation s'applique.",
      },
      ...ETAPES_ASK,
      BOUTON_GUIDE,
    ],
  },

  /* ---------------------------------------------------------------- Chef d'établissement */
  {
    id: "etablissement",
    titre: "Mon établissement",
    roles: ["chef_etablissement"],
    depart: "/etablissement",
    ecrans: /^\/etablissement/,
    nature: "espace",
    profil: "chef_etablissement",
    etapes: [
      {
        cible: "etab-indicateurs",
        titre: "Votre établissement d'un coup d'œil",
        texte: "Apprenants, occupation, enseignants, moyenne du trimestre et absents du jour. Les chiffres viennent de ce que vos équipes saisissent.",
      },
      {
        cible: "etab-absences",
        titre: "Les absences du jour, en direct",
        texte: "Dès qu'un enseignant valide son appel, l'absence apparaît ici, sans recharger la page.",
        pourquoi: "La famille est prévenue en même temps que vous. Personne ne ressaisit rien.",
      },
      {
        cible: "etab-alertes",
        titre: "Ce que le système vous signale",
        texte: "Classes pleines, identités à régulariser, résultats en baisse, formations obligatoires. Chaque alerte propose une action.",
        pourquoi: "Aucune mesure n'est prise sans décision humaine : le système signale, vous décidez.",
      },
      {
        cible: "etab-accompagnement",
        titre: "Accompagner un élève en difficulté",
        texte: "Cochez les élèves dont les notes baissent, puis « Proposer un accompagnement ». La demande part au conseil pédagogique.",
      },
      {
        cible: "etab-classes",
        titre: "Vos classes",
        texte: "Effectif et capacité de chaque classe, absents du jour. Une classe pleine ne peut plus recevoir d'inscription.",
      },
      {
        aller: "/etablissement/inscription",
        cible: "inscription-etapes",
        titre: "Inscrire un apprenant en 4 étapes",
        texte: "Rechercher au registre, confirmer l'identité, choisir la classe, vérifier puis confirmer.",
        pourquoi: "BEILE ne crée jamais une identité en double : il interroge d'abord le registre national des personnes.",
      },
      {
        aller: "/etablissement/examens",
        cible: "examens-sessions",
        titre: "Examens nationaux",
        texte: "Vos candidats au CEP, au BEPC ou au BAC : numéro de table, centre, puis le verdict officiel et le diplôme dès que l'autorité a publié la session.",
        pourquoi: "Un diplôme national n'est délivré que par l'autorité d'examen (DEC, Office du Baccalauréat) : ce que vous voyez ici vient de son procès-verbal, jamais d'un calcul de l'établissement.",
      },
      BOUTON_GUIDE,
    ],
  },

  /* ---------------------------------------------------------------- Enseignant */
  {
    id: "enseignant",
    titre: "Espace enseignant",
    roles: ["enseignant"],
    depart: "/enseignant",
    ecrans: /^\/enseignant(\/carriere)?$/,
    nature: "espace",
    profil: "enseignant",
    etapes: [
      {
        cible: "ens-indicateurs",
        titre: "Votre journée en quatre chiffres",
        texte: "Vos classes, vos élèves, les absents du jour et la moyenne de vos matières.",
      },
      {
        cible: "ens-carte-classe",
        titre: "Une carte par classe",
        texte: "L'anneau montre la présence du jour. Les jauges montrent la moyenne du trimestre et le remplissage de la classe.",
      },
      {
        cible: "ens-appel",
        titre: "Faire l'appel",
        texte: "Touchez « Appel », puis touchez les élèves absents et validez. Deux minutes suffisent.",
        pourquoi: "Chaque absence prévient la famille et informe la direction, sans cahier à recopier.",
      },
      {
        cible: "ens-notes",
        titre: "Saisir des notes",
        texte: "Touchez « Notes » pour saisir une évaluation, élève par élève. La moyenne provisoire se calcule en direct.",
      },
      {
        titre: "Pas de réseau ? Continuez",
        texte: "Sans connexion, l'appel et les notes sont gardés sur votre téléphone. Ils partent seuls dès le retour du réseau.",
        pourquoi: "Un bandeau « saisies en attente » vous montre ce qui n'est pas encore envoyé. Ne videz pas les données du navigateur avant l'envoi.",
      },
      {
        cible: "onglets",
        titre: "Parcours pro et Mon enfant",
        texte: "« Parcours pro » réunit votre carrière et vos formations. « Mon enfant » ouvre l'espace famille si vous êtes aussi parent.",
      },
      COMPTE,
      BOUTON_GUIDE,
    ],
  },
  {
    id: "enseignant-classe",
    titre: "Carnet de classe",
    roles: ["enseignant"],
    depart: "/enseignant",
    ecrans: /^\/enseignant\/classe\//,
    nature: "ecran",
    profil: "enseignant",
    etapes: [
      {
        selecteur: '[role="radiogroup"][aria-label="Section du carnet"]',
        titre: "Les quatre sections du carnet",
        texte: "Appel, Notes, Historique et Élèves. Vous revenez toujours sur l'appel en ouvrant la classe.",
      },
      {
        aller: "?onglet=appel",
        cible: "appel-liste",
        titre: "Touchez les absents",
        texte: "Un toucher marque l'élève absent, un second annule. La recherche retrouve un élève par son nom.",
        pourquoi: "Les absences déjà enregistrées aujourd'hui sont verrouillées : elles ne partent jamais deux fois.",
      },
      {
        cible: "appel-compteur",
        titre: "Le compteur suit vos gestes",
        texte: "Présents et absents se mettent à jour à chaque toucher. Vérifiez-les avant de valider.",
      },
      {
        cible: "appel-valider",
        titre: "Validez d'un geste",
        texte: "« Valider » envoie toutes les absences. Hors connexion, le bouton devient orange : l'appel est gardé et partira seul.",
        pourquoi: "Les familles sont notifiées dès l'enregistrement.",
      },
      {
        aller: "?onglet=notes",
        cible: "notes-saisie",
        titre: "Saisir une évaluation",
        texte: "Choisissez la matière et le trimestre, puis tapez les notes sur 20, au quart de point. « Entrée » passe à l'élève suivant.",
      },
      {
        cible: "notes-evaluations",
        titre: "Corriger une note, avec un motif",
        texte: "Touchez une note enregistrée pour la corriger. Le motif est obligatoire (5 caractères au moins).",
        pourquoi: "La note d'origine n'est jamais effacée : la correction s'ajoute au registre, datée et signée, et la famille en est informée.",
      },
      {
        aller: "?onglet=historique",
        cible: "historique-journal",
        titre: "Tout ce qui a été saisi",
        texte: "Appels, notes et corrections de la classe, du plus récent au plus ancien. Filtrez par type d'événement.",
      },
      BOUTON_GUIDE,
    ],
  },

  /* ---------------------------------------------------------------- Parent */
  {
    id: "famille",
    titre: "Espace famille",
    roles: ["parent"],
    depart: "/famille",
    ecrans: /^\/famille/,
    nature: "espace",
    profil: "parent",
    etapes: [
      {
        cible: ["famille-enfants", "famille-fiche"],
        titre: "Vos enfants, et seulement eux",
        texte: "Vos enfants sont rattachés à vous par le registre national. Si vous en avez plusieurs, choisissez-le ici.",
        pourquoi: "Chaque consultation est vérifiée et inscrite au journal, au titre du suivi familial.",
      },
      {
        cible: "famille-indicateurs",
        titre: "L'essentiel en quatre chiffres",
        texte: "Moyenne du trimestre, évolution, absences et nombre d'évaluations.",
      },
      {
        cible: "famille-absences",
        titre: "Justifier une absence",
        texte: "Touchez « Justifier », choisissez le motif (maladie, rendez-vous médical…), puis « Transmettre ».",
        pourquoi: "L'établissement reçoit le motif aussitôt. L'absence d'origine n'est pas modifiée : il la valide.",
      },
      {
        cible: "famille-resultats",
        titre: "Les résultats par matière",
        texte: "Chaque barre montre la moyenne sur 20. Le petit trait rappelle le trimestre précédent.",
      },
      {
        cible: "famille-direct",
        titre: "Toujours à jour",
        texte: "Les informations se mettent à jour seules. Touchez ce bouton pour actualiser tout de suite.",
      },
      {
        cible: "onglets",
        titre: "Notifications et documents",
        texte: "« Notifications » rassemble les messages de l'école. « Documents » garde les diplômes de vos enfants.",
      },
      {
        aller: "/famille/documents",
        cible: "documents-liste",
        titre: "Les diplômes de vos enfants",
        texte: "Chaque diplôme porte un QR code. Une école ou un employeur le vérifie en quelques secondes, sans compte.",
      },
      BOUTON_GUIDE,
    ],
  },

  /* ---------------------------------------------------------------- Apprenant */
  {
    id: "apprenant",
    titre: "Mon passeport éducatif",
    roles: ["apprenant"],
    depart: "/apprenant",
    ecrans: /^\/apprenant/,
    nature: "espace",
    profil: "apprenant",
    etapes: [
      {
        cible: "apprenant-passeport",
        titre: "Votre passeport éducatif",
        texte: "Votre identifiant, votre classe et votre établissement. Ce passeport vous suit d'une école à l'autre.",
      },
      {
        cible: "apprenant-indicateurs",
        titre: "Vos chiffres",
        texte: "Moyenne du trimestre, évaluations, absences et diplômes.",
      },
      {
        cible: "apprenant-points-forts",
        titre: "Vos points forts",
        texte: "Vos moyennes de l'année, de la plus haute à la plus basse.",
      },
      {
        cible: "apprenant-frise",
        titre: "Votre parcours, étape par étape",
        texte: "Inscriptions, passages, diplômes : chaque étape indique sa source.",
      },
      {
        aller: "/apprenant/preuves",
        cible: "preuves-liste",
        titre: "Vos diplômes vous appartiennent",
        texte: "Ils apparaissent ici dès la publication officielle des résultats, sans aucune démarche.",
      },
      {
        cible: "preuves-actions",
        titre: "Partagez une preuve",
        texte: "« Copier le lien » ou « QR en grand » : la personne vérifie elle-même l'authenticité, sans compte.",
        pourquoi: "Le QR code ne contient ni nom ni note : seulement l'identifiant du diplôme et une empreinte.",
      },
      {
        aller: "/apprenant/orientation",
        cible: "orientation-pistes",
        titre: "Des pistes d'orientation",
        texte: "Des pistes lues dans vos résultats réels, avec leurs critères. Elles éclairent votre choix, elles ne le font pas.",
      },
      BOUTON_GUIDE,
    ],
  },

  /* ---------------------------------------------------------------- DPO */
  {
    id: "conformite",
    titre: "Conformité",
    roles: ["dpo"],
    depart: "/audit",
    ecrans: /^\/(audit|plateforme\/(etat|interoperabilite))/,
    nature: "espace",
    profil: "dpo",
    etapes: [
      {
        cible: "audit-indicateurs",
        titre: "Le journal en quatre chiffres",
        texte: "Décisions journalisées, accès refusés, part de refus, heure de la dernière décision.",
      },
      {
        cible: "audit-journal",
        titre: "Qui a demandé quoi, pourquoi",
        texte: "Chaque ligne : la personne, l'action, la donnée, la finalité et la décision. Le journal se relit toutes les 15 secondes.",
        pourquoi: "Le journal est en ajout seul : personne ne peut modifier ni supprimer une entrée, pas même un administrateur.",
      },
      {
        cible: "audit-filtres",
        titre: "Filtrez",
        texte: "Cherchez une personne ou une ressource (APP-…, CLS-…). Filtrez par décision ou par finalité.",
      },
      {
        cible: "audit-exporter",
        titre: "Exportez",
        texte: "« Exporter (CSV) » télécharge les lignes affichées, pour un contrôle ou une réponse à l'autorité.",
      },
      {
        cible: "audit-preuve",
        titre: "Vérifiez la traçabilité",
        texte: "Ce bouton tente un accès interdit. Vous voyez le refus apparaître dans le journal.",
        pourquoi: "C'est la preuve, devant un auditeur, que les refus sont journalisés comme les accords.",
      },
      {
        aller: "/audit/traitements",
        cible: "traitements-liste",
        titre: "Le registre des traitements",
        texte: "Chaque usage des données : finalité, base légale, destinataires, durée de conservation, criticité.",
      },
      {
        aller: "/plateforme/etat",
        cible: "etat-securite",
        titre: "La sécurité des dernières 24 heures",
        texte: "Connexions réussies ou échouées, comptes verrouillés, accès refusés : lus dans le journal d'audit.",
      },
      BOUTON_GUIDE,
    ],
  },

  /* ---------------------------------------------------------------- Administrateur */
  {
    id: "administration",
    titre: "Comptes et accès",
    roles: ["administrateur"],
    depart: "/administration",
    ecrans: /^\/(administration|plateforme\/(etat|interoperabilite))/,
    nature: "espace",
    profil: "administrateur",
    etapes: [
      {
        titre: "Vous tenez les clés",
        texte: "Vous créez les comptes, remettez les mots de passe temporaires et répondez aux demandes d'assistance.",
        pourquoi: "Chaque création, réinitialisation, activation ou désactivation est inscrite au journal d'audit.",
      },
      {
        cible: "admin-onglets",
        titre: "Trois volets",
        texte: "« Comptes », « Nouvel utilisateur » et « Support ». Le nombre à côté de « Support » compte les demandes à traiter.",
      },
      {
        aller: "?onglet=comptes",
        cible: "admin-comptes",
        titre: "Les comptes",
        texte: "Cherchez par nom, identifiant ou fonction. « Gérer » modifie les habilitations ; « Réinitialiser » produit un mot de passe temporaire.",
        pourquoi: "Le mot de passe temporaire s'affiche une seule fois. Remettez-le en main propre : le titulaire le changera à sa première connexion.",
      },
      {
        aller: "?onglet=nouveau",
        cible: "admin-creer",
        titre: "Créer un utilisateur",
        texte: "Quatre étapes : Identité (NPI vérifié au registre), Habilitations (rôle et périmètre), Récapitulatif, Accès.",
        pourquoi: "Accordez le strict nécessaire : chaque habilitation ouvre des données personnelles.",
      },
      {
        aller: "?onglet=support",
        cible: "admin-support",
        titre: "Le support",
        texte: "Les demandes d'assistance arrivent ici. Ouvrez-en une, « Prendre en charge », répondez, puis changez son statut jusqu'à « Résolue ».",
      },
      {
        cible: "navigation",
        titre: "Surveiller le service",
        texte: "« État du service » et « Interopérabilité » montrent la santé de la plateforme et des échanges avec les autres systèmes.",
      },
      COMPTE,
      BOUTON_GUIDE,
    ],
  },

  /* ---------------------------------------------------------------- Assistance (tous profils) */
  {
    id: "assistance",
    titre: "Assistance",
    roles: ["administration_centrale", "direction_departementale", "inspecteur", "chercheur", "chef_etablissement", "enseignant", "parent", "apprenant", "dpo", "administrateur"],
    depart: "/assistance",
    ecrans: /^\/assistance/,
    nature: "ecran",
    profil: "administrateur",
    etapes: [
      {
        titre: "Besoin d'aide ?",
        texte: "Cet écran vous met en relation avec l'équipe d'administration de BEILE. Vous suivez chaque demande jusqu'à sa résolution.",
      },
      {
        cible: "assistance-nouvelle",
        titre: "Ouvrir une demande",
        texte: "Choisissez la catégorie et l'urgence, donnez un sujet court, décrivez ce qui s'est passé, puis « Envoyer la demande ».",
        pourquoi: "Une description précise (écran, heure, message affiché) fait gagner un aller-retour.",
      },
      {
        titre: "Jamais de mot de passe",
        texte: "N'écrivez jamais votre mot de passe dans une demande. L'équipe ne vous le demandera jamais.",
      },
      {
        cible: "assistance-liste",
        titre: "Suivez vos demandes",
        texte: "Vos demandes, leur statut et les réponses de l'équipe. Ouvrez-en une pour répondre ou la clore quand le problème est réglé.",
      },
      BOUTON_GUIDE,
    ],
  },
  {
    id: "demarches",
    titre: "Mes démarches",
    roles: ["apprenant"],
    depart: "/apprenant/demarches",
    ecrans: /^\/apprenant\/demarches/,
    nature: "ecran",
    profil: "apprenant",
    etapes: [
      {
        titre: "Vos actes administratifs, au même endroit",
        texte: "Ici vous déposez une demande d'acte, vous suivez où elle en est, et vous lisez ce qu'il reste à produire pour votre dossier de bourse.",
        pourquoi: "Chaque étape est enregistrée à la date où elle arrive : c'est ce qui permet de dire qui a retardé, et de réclamer avec une preuve.",
      },
      {
        cible: "demarches-depot",
        titre: "Déposer une demande",
        texte: "Choisissez l'acte, puis l'année universitaire si elle compte (AAAA-AAAA). Le guichet compétent et le délai s'affichent avec la source du barème. Pour un duplicata de diplôme, le motif est obligatoire.",
        pourquoi: "Un relevé de notes se délivre à votre établissement en trois jours ; une attestation de succès ou un diplôme relève de la DEC, en trente à soixante jours. Savoir laquelle vous demandez évite d'attendre six semaines une pièce qui traînait depuis trois jours.",
      },
      {
        cible: "demarches-suivi",
        titre: "Le suivi, ligne par ligne",
        texte: "« Déposée », « En cours de préparation », « Prête à retirer », « Remise ». Quand le délai publié est dépassé, la ligne affiche le retard en jours et l'autorité qui doit signer.",
        pourquoi: "Relancer avec la référence de la demande et le nombre de jours écoulés vaut mieux que « je n'ai rien reçu ».",
      },
      {
        cible: "demarches-pieces",
        titre: "Votre dossier de bourse avant la date limite",
        texte: "Les pièces exigées par l'échéance en cours, celles déjà remises, et les jours restants. Une pièce prête au guichet mais que vous n'êtes pas allé retirer y compte comme manquante.",
        pourquoi: "Une allocation se perd plus souvent pour un dépôt hors délai que pour un manque de résultats.",
      },
      {
        cible: "demarches-allocations",
        titre: "Les décisions qui vous concernent",
        texte: "Nature de la décision (attribution, renouvellement, rétablissement, secours), autorité qui a statué, date et référence du texte. Aucun montant n'apparaît ici.",
        pourquoi: "Le montant, l'échéancier et le RIB relèvent de la DBAU, pas d'un registre de scolarité. Ce que BEILE conserve, c'est votre droit et sa preuve.",
      },
      BOUTON_GUIDE,
    ],
  },
  {
    id: "guichet",
    titre: "Guichet de l'étudiant",
    roles: ["chef_etablissement"],
    depart: "/etablissement/guichet",
    ecrans: /^\/etablissement\/guichet/,
    nature: "ecran",
    profil: "chef_etablissement",
    etapes: [
      {
        cible: "guichet-file",
        titre: "La file de vos guichetiers",
        texte: "Les actes demandés par vos étudiants, dans l'ordre des dépôts. Filtrez sur « À préparer » pour voir ce qu'aucun agent n'a encore pris en charge, ou sur « En retard » pour ce qui dépasse le délai publié.",
        pourquoi: "Le retard est calculé par le serveur contre le barème applicable au jour du dépôt, pas contre l'horloge du poste.",
      },
      {
        titre: "Faire avancer, étape par étape",
        texte: "« Prendre en charge », puis « Marquer prêt à retirer » avec la date de mise à disposition, puis « Constat de remise ». Trois faits distincts, chacun daté et signé de votre agent.",
        pourquoi: "Une remise sans date de mise à disposition ne prouve rien et laisse l'étudiant dans l'incertitude.",
      },
      {
        titre: "Consigner la remise",
        texte: "Indiquez le mode de retrait — titulaire, géniteur, mandataire, autorité académique, dématérialisé — et la pièce d'identité présentée. Pour un mandataire, la procuration est exigée ; la quittance n'est qu'une référence.",
        pourquoi: "C'est la preuve qui clôt le dossier de bourse de l'étudiant, et la protection de votre établissement en cas de contestation.",
      },
      {
        cible: "guichet-delais",
        titre: "Ce que votre guichet met de jours",
        texte: "Par acte et par barème : nombre de demandes, remises dans le délai, médiane constatée. Sous dix demandes, la ligne est marquée « sous le seuil ».",
        pourquoi: "Une moyenne se laisse tirer par deux dossiers lents, et un délai mesuré sur trois dossiers d'une petite filière réidentifierait son auteur.",
      },
      BOUTON_GUIDE,
    ],
  },
  {
    id: "guichet-national",
    titre: "Guichet & délais",
    roles: ["administration_centrale", "direction_departementale", "inspecteur", "chercheur"],
    depart: "/enseignement-superieur/guichet",
    ecrans: /^\/enseignement-superieur\/guichet/,
    nature: "ecran",
    profil: "administration_centrale",
    etapes: [
      {
        titre: "Le coût réel du parcours administratif",
        texte: "Le délai constaté entre le dépôt d'une demande d'acte et sa mise à disposition, agrégé par établissement, par acte et par autorité signataire.",
        pourquoi: "C'est la réponse chiffrée à « les étudiants n'obtiennent jamais leurs diplômes à temps » — sans jamais nommer un étudiant.",
      },
      {
        cible: "guichet-national-tableau",
        titre: "Lire le comparateur",
        texte: "Chaque ligne compare le barème publié à la médiane réellement observée. Sous dix demandes, un badge « sous le seuil » prévient : la médiane est instable.",
        pourquoi: "Nommer l'autorité (établissement, DEC, DGES, DBAU) change tout : on ne peut pas imputer à une université la lenteur de sa DEC.",
      },
      {
        cible: "guichet-national-calendrier",
        titre: "Le calendrier des dépôts",
        texte: "Les dates limites déclarées par la DBAU ou le MESRS, avec les pièces exigées à chaque échéance. Tant qu'aucune date n'est déclarée, l'étudiant lit « aucune échéance » — et un retard n'est imputable à personne.",
      },
      {
        cible: "guichet-national-allocations",
        titre: "L'effet des allocations",
        texte: "Effectifs par statut de compte, par nature de décision et par autorité. Aucun montant, aucun RIB : un statut daté, signé, avec la référence de l'arrêté.",
        pourquoi: "La liquidation reste à l'administration payeuse ; ici on suit le droit, pas la paie.",
      },
      {
        cible: "guichet-national-scellement",
        titre: "Signer ce que l'établissement ne peut pas signer",
        texte: "Un diplôme se scelle à la DEC, un duplicata national à la DGES : saisissez la référence de l'acte (ACTE-…, celle que l'étudiant lit sur son espace) pour le déclarer prêt à retirer, ou le refuser avec un motif.",
        pourquoi: "Le guichet d'établissement prépare et remet ; s'il scellait l'acte d'une autre autorité, la plateforme affirmerait une signature qui n'a pas eu lieu.",
      },
      COMPTE,
    ],
  },
  {
    id: "scolarite",
    titre: "Scolarité du supérieur",
    roles: ["chef_etablissement"],
    depart: "/enseignement-superieur/scolarite/referentiel",
    ecrans: /^\/enseignement-superieur\/scolarite/,
    nature: "espace",
    profil: "chef_etablissement",
    etapes: [
      {
        titre: "Votre scolarité du supérieur, en quatre volets",
        texte: "Référentiel (filières, périodes, UE, offres, règle), Étudiants & parcours, Jury & certification — sur vos propres étudiants. Le quatrième volet, les agrégats de l'État, ne nomme personne et ne vous est pas ouvert.",
        pourquoi: "Deux portes, deux périmètres : mélanger du nominatif et un agrégat ferait croire que l'État feuillette vos dossiers.",
      },
      {
        cible: "scolarite-filieres",
        titre: "L'ossature : filière, période, UE, offre",
        texte: "Une filière déclare le diplôme visé et un volume de crédits ECTS. Une période découpe l'année. Une UE porte des crédits et un coefficient ; une offre l'ouvre pour une période, avec un enseignant et des volumes.",
        pourquoi: "Une filière sans volume de crédits déclaré ne peut pas être délibérée : le serveur refuse plutôt que d'inventer un seuil.",
      },
      {
        cible: "scolarite-regles",
        titre: "La règle sous laquelle vous jugerez",
        texte: "Huit paramètres : seuil d'acquisition, note éliminatoire, compensation, pondération, session retenue, moyenne de période, validité d'un acquis, report de crédits. La portée la plus précise gagne — période, puis filière, puis établissement, puis nationale.",
        pourquoi: "Chaque décision cite la règle qui l'a jugée. Sans règle en vigueur, aucune validation n'est possible : c'est un refus 409, pas un calcul silencieux.",
      },
      {
        aller: "/enseignement-superieur/scolarite/etudiants",
        cible: "scolarite-inscriptions",
        titre: "Inscrire un étudiant",
        texte: "La personne vient du registre national, la filière de votre référentiel, et la composante est bornée à celles que la filière a ouvertes. Aucun montant, aucun RIB : le statut de compte se déclare avec son autorité, pas avec une somme.",
      },
      {
        cible: "scolarite-contrat",
        titre: "Le contrat pédagogique",
        texte: "Choisissez l'étudiant : ses UE inscrites, leurs notes et leurs décisions s'affichent, avec la règle appliquée. Signer, abandonner ou refuser un contrat sont trois faits distincts, chacun daté.",
        pourquoi: "Les crédits attendus d'une période se mesurent sur les contrats signés, pas sur les inscrits : un contrat non signé ne doit rien à la période.",
      },
      {
        cible: "scolarite-validation",
        titre: "Valider une période",
        texte: "Cochez les lignes à juger (le filtre « contrats signés et notés » fait l'essentiel du tri), puis lancez la validation. Vous ne fournissez que le couple étudiant / UE : crédits, moyenne et voie d'acquisition sortent du serveur sous la règle en vigueur.",
        pourquoi: "Rejouer la même période ne valide pas deux fois : la saisie est reconnue et le même résultat est rendu.",
      },
      {
        cible: "scolarite-acquis",
        titre: "Acquis sans note et report de crédits",
        texte: "Une UE peut être acquise par VAE, équivalence, décision de jury ou acquis antérieur, avec une justification de 5 à 200 caractères. Le report depuis un autre établissement se déclare à partir de la référence d'inscription (INS-…) que l'étudiant apporte.",
        pourquoi: "Le serveur vérifie la règle de report et l'existence des UE, pas la réalité d'un acquis pris ailleurs : la voie auditable reste l'équivalence.",
      },
      {
        aller: "/enseignement-superieur/scolarite/certification",
        cible: "scolarite-jurys",
        titre: "Constituer le jury de capitalisation",
        texte: "Président, membres, quorum, période et diplôme visé. Le jury avance par étapes : constitué, réuni, délibéré, publié. Un jury d'examen national ne se constitue pas ici.",
        pourquoi: "Le président ne peut pas être membre et le quorum se lit avant de juger : un jury incomplet ne délibère pas.",
      },
      {
        cible: "scolarite-deliberation",
        titre: "Délibérer le diplôme",
        texte: "Choisissez un jury ayant délibéré, cochez les candidats, donnez la décision. Un « admis » sous le volume de la filière n'est pas enregistré, et une admission sous réserve doit nommer les UE manquantes. Chaque admission pleine émet sur le même acte un diplôme vérifiable (CERT-…), rattaché à la délibération.",
        pourquoi: "Moyenne, mention et crédits viennent du registre, jamais de la saisie : deux jurys sur les mêmes acquis rendent le même chiffre — et le même sceau.",
      },
      {
        cible: "scolarite-deliberations",
        titre: "Le diplôme rendu opposable",
        texte: "La colonne « Certificat émis » nomme le diplôme que le registre a scellé, avec sa filière, son établissement et l'office qui a délibéré. Une ligne « non émis » reste visible : ajournement, refus ou admission sous réserve — le document n'existe pas encore.",
        pourquoi: "Un tiers vérifie par l'identifiant et le QR code : si BEILE scellait une admission sous réserve, il publierait un diplôme que le jury n'a pas délivré.",
      },
      {
        cible: "scolarite-equivalences",
        titre: "Les équivalences",
        texte: "Un étudiant dépose, vous statuez — ou le MESRS (DCE) statue si la reconnaissance est nationale. Les crédits reconnus partent de zéro tant que la demande n'est pas instruite.",
        pourquoi: "Reconnaître une équivalence ne valide pas l'UE : l'établissement d'accueil l'instruit ensuite par une acquisition.",
      },
      {
        cible: "scolarite-credits-ects",
        titre: "Vos crédits ECTS, et leur dénominateur",
        texte: "Crédits acquis, attendus, périmés et taux de capitalisation par période, calculés à partir des écritures du registre.",
        pourquoi: "Un pourcentage de crédits sans population lisible n'est pas contestable : la ligne affiche toujours ses étudiants sous le taux.",
      },
      BOUTON_GUIDE,
    ],
  },
  {
    id: "scolarite-pilotage",
    titre: "Agrégats & actes de l'État",
    roles: ["administration_centrale", "direction_departementale", "inspecteur", "chercheur"],
    depart: "/enseignement-superieur/scolarite/pilotage",
    ecrans: /^\/enseignement-superieur\/scolarite\/pilotage/,
    nature: "ecran",
    profil: "administration_centrale",
    etapes: [
      {
        titre: "Compter sans nommer",
        texte: "Aucun étudiant, aucun établissement nommé dans les agrégats. L'écran permet aussi de poser les actes de l'État, et là un établissement est choisi — mais jamais feuilleté.",
        pourquoi: "Un agent de l'État n'a pas besoin du dossier d'un établissement pour statuer sur une filière qu'il homologue.",
      },
      {
        cible: "scolarite-credits-ects",
        titre: "La capitalisation ECTS par voie",
        texte: "Une ligne par voie (universitaire, technologique, professionnelle…), avec les crédits acquis, attendus et périmés, et le taux. Filtrez par année universitaire (AAAA-AAAA) pour isoler une promotion.",
        pourquoi: "Le seuil de publication s'applique ici pour de vrai : sous le seuil, la cellule garde son effectif et perd ses valeurs.",
      },
      {
        cible: "scolarite-effets-agreges",
        titre: "Les quatre comptages",
        texte: "Inscriptions par statut, décisions de validation par voie, homologations par statut, jurys par étape. Exportables en CSV avec leur provenance.",
        pourquoi: "Un effectif n'est pas une population : les décisions se comptent par acquis, pas par étudiant.",
      },
      {
        cible: "scolarite-actes-etat",
        titre: "Poser un acte sur un établissement",
        texte: "Choisissez l'établissement dans l'annuaire, puis suivez son cycle EPES par autorité tutélaire, homologuez une filière (le diplôme est celui que la filière vise), et consignez le contrôle pédagogique de l'homologation que vous venez de rendre.",
        pourquoi: "Un contrôle « non conforme » ferme la porte de certification : les étudiants de cette filière ne peuvent plus être diplômés tant que l'acte n'est pas réparé.",
      },
      {
        cible: "scolarite-regle-nationale",
        titre: "La règle nationale de validation",
        texte: "Les huit paramètres applicables là où aucune portée plus précise n'a été déclarée. Renseignez l'identifiant (RGL-…) pour remplacer la ligne plutôt que d'en ajouter une seconde.",
        pourquoi: "Deux lignes nationales laissent le moteur libre de l'une ou l'autre : la règle citée par un acquis doit rester unique.",
      },
      COMPTE,
    ],
  },
];

export const guideParId = (id: string) => GUIDES.find((g) => g.id === id);

/** Guides accessibles à ces rôles. */
export const guidesPour = (roles: Role[]) => GUIDES.filter((g) => g.roles.some((r) => roles.includes(r)));

/**
 * Guide à lancer depuis le bouton « Guide » : d'abord celui de l'écran affiché, puis celui de l'espace,
 * puis le guide d'espace du premier rôle de l'utilisateur.
 */
export function guidePourEcran(chemin: string, roles: Role[]): Guide | undefined {
  const possibles = guidesPour(roles);
  return possibles.find((g) => g.nature === "ecran" && g.ecrans.test(chemin))
    ?? possibles.find((g) => g.nature === "espace" && (g.depart === chemin || g.ecrans.test(chemin)))
    ?? possibles.find((g) => g.nature === "espace");
}

/** Guide qui démarre seul à la première arrivée sur cet écran. */
export function guideAutomatique(chemin: string, roles: Role[]): Guide | undefined {
  return guidesPour(roles).find((g) => (g.nature === "espace" ? g.depart === chemin : g.ecrans.test(chemin)));
}

/** Étapes retenues pour ces rôles (filtre `roles` de chaque étape). */
export const etapesPour = (g: Guide, roles: Role[]) => g.etapes.filter((e) => !e.roles || e.roles.some((r) => roles.includes(r)));

/** Mémoire « guide déjà vu », par compte et par guide (stockage local, jamais bloquant). */
const cleVu = (compte: string, guide: string) => `beile.guide.vu.${compte}.${guide}`;
export function guideVu(compte: string, guide: string): boolean {
  try { return localStorage.getItem(cleVu(compte, guide)) === "1"; } catch { return true; }
}
export function marquerGuideVu(compte: string, guide: string) {
  try { localStorage.setItem(cleVu(compte, guide), "1"); } catch { /* stockage indisponible */ }
}
