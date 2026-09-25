import type { Role } from "@beile/contracts";

/**
 * Visites guidées de BEILE : une par espace (démarrée à la première visite), plus quelques écrans
 * riches (carnet de classe, « Où agir ? », simulation, Ask Education, assistance).
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
      {
        cible: "carte-simuler",
        titre: "Passez à la décision",
        texte: "« Simuler une mesure » ouvre la simulation pour cette commune : construire, affecter des enseignants, voir l'effet en 2030.",
      },
      BOUTON_GUIDE,
    ],
  },
  {
    id: "simulation",
    titre: "Simulation « et si ? »",
    roles: ["administration_centrale", "direction_departementale"],
    depart: "/simulation",
    ecrans: /^\/simulation/,
    nature: "ecran",
    profil: "administration_centrale",
    etapes: [
      {
        titre: "Mesurer avant de décider",
        texte: "Cet écran projette une commune jusqu'en 2030 : effectifs attendus, places disponibles, enseignants en poste.",
      },
      {
        cible: "simulation-scenario",
        titre: "Choisissez la commune",
        texte: "Prenez une commune dans la liste, ou touchez l'une des plus saturées. « Réinitialiser » revient aux valeurs de départ.",
      },
      {
        cible: "simulation-curseurs",
        titre: "Réglez votre scénario",
        texte: "Établissements à construire, enseignants à affecter, croissance des effectifs. Le résultat se recalcule à chaque mouvement.",
        pourquoi: "« Appliquer la tendance observée » reprend la croissance réelle des dernières années, sans hypothèse arbitraire.",
      },
      {
        cible: "simulation-resultats",
        titre: "Lisez l'avant / après",
        texte: "La courbe des apprenants passe-t-elle au-dessus de celle des places ? Les besoins indiquent ce qu'il faut pour revenir à 100 %.",
      },
      {
        selecteur: "#hypotheses",
        titre: "Les hypothèses sont visibles",
        texte: "Chaque formule est écrite en clair. Une simulation éclaire une décision ; elle ne la remplace pas.",
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
        cible: "examens-deliberation",
        titre: "Examens et diplômes",
        texte: "Les candidats au BEPC sont inscrits depuis vos classes de 3e. La délibération délivre des diplômes vérifiables par QR code.",
        pourquoi: "Délibérer est définitif : relisez la liste des candidats avant de confirmer.",
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
        texte: "Ils apparaissent ici après la délibération du jury, sans aucune démarche.",
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
