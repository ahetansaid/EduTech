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
    resume: "Piloter le système éducatif national : situation, zones prioritaires, simulation des décisions.",
    objectif: "Voir en un écran la situation du pays, repérer les territoires qui demandent une action, mesurer l'effet d'une décision avant de la prendre, et interroger les données en français.",
    espace: "Cockpit national",
    arrivee: "/cockpit",
    ecrans: [
      { titre: "Cockpit national", chemin: "/cockpit", icone: "chart", resume: "La situation du système éducatif, calculée sous votre habilitation.", points: ["Chiffres clés : apprenants, établissements, enseignants, réussite au BEPC, mathématiques ≥ 15/20.", "Carte à couches : priorités, occupation, absentéisme, abandon…", "Flux des faits du jour, actualisé toutes les 15 secondes (faits anonymes).", "Parité filles-garçons, classement territorial, abandon scolaire, zones à examiner."] },
      { titre: "Où agir ?", chemin: "/cockpit/carte", icone: "map", resume: "Descendre du pays jusqu'aux établissements.", points: ["Fil de descente : Bénin, département, commune.", "Facteurs objectivés : croissance, occupation, encadrement, absentéisme, résultats.", "Liste des établissements d'une commune, avec « Relancer » pour ceux qui n'ont pas transmis."] },
      { titre: "Ask Education", chemin: "/ask", icone: "sparkles", resume: "Poser une question en français, obtenir un chiffre prouvé.", points: ["Réponse avec définition, source, couverture et indice de confiance.", "Refus expliqué et journalisé pour une question sur une personne ou hors périmètre."] },
      { titre: "Simulation « et si ? »", chemin: "/simulation", icone: "sliders", resume: "Mesurer l'effet d'une décision jusqu'en 2030.", points: ["Établissements à construire, enseignants à affecter, croissance des effectifs.", "Avant / après et hypothèses écrites en clair."] },
      { titre: "Données et service", chemin: "/plateforme/qualite", icone: "database", resume: "Qualité des données, dictionnaire national, interopérabilité, état du service.", points: ["Qui a transmis, depuis quand, avec quelle confiance.", "Définition officielle de chaque indicateur et de ses versions."] },
    ],
    taches: [
      { titre: "Repérer une commune à examiner", pourquoi: "La couleur d'une commune s'explique toujours par des facteurs mesurés.", etapes: ["Dans le cockpit, regardez la carte « Priorités » et la liste « Zones à examiner en priorité ».", "Touchez une commune : le panneau affiche son niveau et le « Pourquoi ? » (facteurs et valeurs).", "Touchez « Descendre jusqu'aux établissements » pour ouvrir « Où agir ? » sur cette commune."] },
      { titre: "Simuler une mesure", etapes: ["Dans « Où agir ? », choisissez une commune, puis touchez « Simuler une mesure ».", "Réglez les curseurs : « Établissements à construire », « Enseignants à affecter », « Croissance des effectifs d'ici 2030 ».", "Lisez « Avant / après, en toute transparence » et les besoins pour ramener l'occupation à 100 %.", "« Réinitialiser » revient au scénario de départ."] },
      { titre: "Poser une question à Ask Education", etapes: ["Touchez « Poser une question » dans le cockpit, ou ouvrez Ask Education dans le menu.", "Écrivez votre question (400 caractères au plus) ou touchez un exemple.", "Lisez le chiffre, puis sa définition, sa source et son indice de confiance avant de le citer."] },
    ],
    faq: [
      { q: "Pourquoi un chiffre du cockpit diffère-t-il d'un rapport papier ?", r: "Le cockpit suit la définition du dictionnaire national et la couverture réelle des transmissions. Regardez l'indice de confiance et, dans le dictionnaire, la version de la définition utilisée." },
      { q: "Puis-je voir un élève en particulier ?", r: "Non. Le cockpit ne reçoit que des faits anonymes et des agrégats. C'est voulu : le pilotage n'a pas besoin des personnes." },
      { q: "À quelle fréquence les données se mettent-elles à jour ?", r: "Le flux des faits du jour toutes les 15 secondes ; les indicateurs à chaque ouverture, à partir du registre." },
    ],
    conseils: ["Citez toujours un chiffre avec sa source et son indice de confiance.", "Une simulation éclaire une décision ; elle ne la remplace pas. Vérifiez les hypothèses affichées."],
    visites: ["cockpit", "ou-agir", "simulation", "ask"],
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
      { titre: "Console territoriale", chemin: "/territoire", icone: "landmark", resume: "Votre département en un écran.", points: ["Six chiffres : apprenants, occupation, élèves par enseignant, maths ≥ 15/20, absentéisme, abandon (avec le repère national).", "Carte des niveaux de priorité par commune.", "Absences du jour en direct (toutes les 30 secondes).", "Classement des communes et établissements n'ayant pas transmis."] },
      { titre: "Où agir ?", chemin: "/cockpit/carte", icone: "map", resume: "Descendre jusqu'aux établissements d'une commune.", points: ["Facteurs de priorité, capacité d'accueil, liste des établissements."] },
      { titre: "Simulation « et si ? »", chemin: "/simulation", icone: "sliders", resume: "Mesurer l'effet d'une construction ou d'une affectation.", points: ["Limitée aux communes de votre département."] },
      { titre: "Ask Education, qualité, dictionnaire", chemin: "/ask", icone: "sparkles", resume: "Interroger les données et vérifier leur complétude.", points: ["Qualité des données : complétude par commune, suivi des relances."] },
    ],
    taches: [
      { titre: "Relancer les établissements qui n'ont pas transmis", pourquoi: "Un établissement silencieux fait baisser l'indice de confiance de tout le département.", etapes: ["Dans la console, descendez jusqu'à « Établissements n'ayant pas transmis ».", "Touchez « Relancer » en face de la commune concernée.", "Vérifiez la liste, puis touchez « Envoyer les relances ». Le suivi apparaît dans « Qualité des données »."] },
      { titre: "Comparer les communes", etapes: ["Dans « Classement des communes », choisissez l'indicateur (occupation, élèves par enseignant, maths, absentéisme).", "Le trait vertical marque la valeur du département.", "Touchez une commune pour ouvrir sa fiche dans « Où agir ? »."] },
    ],
    faq: [
      { q: "Pourquoi ne vois-je pas les autres départements ?", r: "Votre habilitation couvre votre département. Une commune hors périmètre est refusée par le serveur et le refus est journalisé." },
      { q: "Le taux d'absence est-il fiable dès le matin ?", r: "Il repose sur les appels déjà faits. « Dernière saisie à … » indique l'heure du dernier appel reçu." },
    ],
    conseils: ["Relancez tôt dans l'année : un indice de confiance bas fragilise toutes vos analyses.", "Appuyez vos arbitrages sur la carte « Où agir ? » plutôt que sur une seule valeur."],
    visites: ["territoire", "ou-agir", "simulation", "ask"],
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
      { titre: "Console territoriale", chemin: "/territoire", icone: "landmark", resume: "Votre circonscription en un écran.", points: ["Six chiffres de la circonscription, avec le repère national.", "Carte : votre circonscription et ses établissements (points).", "Absences du jour en direct.", "Points d'attention et tableau des établissements (effectifs, encadrement, eau, électricité, transmission)."] },
      { titre: "Ask Education", chemin: "/ask", icone: "sparkles", resume: "Poser une question chiffrée sur votre circonscription.", points: ["Le périmètre de votre habilitation s'applique à chaque réponse."] },
      { titre: "Demandes à traiter", chemin: "/demandes", icone: "inbox", resume: "La file des circuits en attente de votre décision.", points: ["Accompagnements à valider et demandes relevant de votre rôle et de votre circonscription.", "« Statuer » pour rendre une décision motivée ; l'étape suivante du circuit est alors déclenchée."] },
    ],
    taches: [
      { titre: "Préparer une visite d'établissement", etapes: ["Lisez « Points d'attention de la circonscription » : saturés, classes surchargées, sans transmission, sans point d'eau.", "Dans « Établissements de la circonscription », repérez l'établissement concerné et ses infrastructures.", "Touchez « Voir sur la carte » pour situer l'établissement et sa commune."] },
      { titre: "Relancer un établissement", etapes: ["Dans le tableau des établissements, touchez « Relancer » en face de l'établissement en retard.", "La relance est envoyée et tracée ; son suivi est visible dans la qualité des données."] },
      { titre: "Statuer sur une demande", pourquoi: "Un circuit ne peut avancer que si l'étape qui vous incombe reçoit une décision motivée.", etapes: ["Ouvrez « Demandes à traiter » : seules les demandes de votre rôle et de votre périmètre s'affichent.", "Touchez « Statuer » sur la demande concernée.", "Choisissez le sens (avis favorable ou défavorable) et rédigez la motivation.", "Validez : la décision est journalisée et le circuit passe à l'étape suivante."] },
    ],
    faq: [
      { q: "Puis-je ouvrir le dossier d'un élève ?", r: "Non. Votre rôle porte sur les établissements et les agrégats. Les dossiers individuels relèvent de l'établissement." },
      { q: "Pourquoi un établissement a-t-il un indice de confiance bas ?", r: "Il n'a pas transmis ses données de l'année, ou partiellement. Une relance règle souvent le problème." },
    ],
    conseils: ["Consultez les absences du jour avant une visite : elles disent souvent plus qu'un rapport.", "Signalez à l'administrateur toute habilitation qui ne correspond pas à votre circonscription."],
    visites: ["territoire", "ask"],
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
      { titre: "Dictionnaire national", chemin: "/plateforme/dictionnaire", icone: "database", resume: "La définition officielle de chaque indicateur.", points: ["Formule, source, unité, direction propriétaire.", "Historique des versions : un chiffre publié se recalcule avec la définition de son année."] },
    ],
    taches: [
      { titre: "Obtenir un chiffre citable", etapes: ["Posez votre question dans Ask Education, ou touchez un exemple.", "Notez le chiffre, l'indicateur utilisé, la source et l'indice de confiance.", "Ouvrez le Dictionnaire national et relevez la définition et sa version.", "Citez les trois : chiffre, définition (avec version), date de consultation."] },
      { titre: "Comprendre un refus", etapes: ["Lisez le motif affiché sous la question (donnée personnelle, hors périmètre, effectif trop petit…).", "Reformulez en agrégat (par département, par année) plutôt que par personne ou par petit groupe."] },
    ],
    faq: [
      { q: "Pourquoi certaines lignes sont-elles masquées ?", r: "Quand un groupe compte trop peu d'élèves, afficher le chiffre permettrait de reconnaître des personnes. Il est donc masqué." },
      { q: "Puis-je exporter les données brutes ?", r: "Non. L'accès chercheur porte sur des résultats agrégés. Pour un besoin particulier, adressez une demande à l'administration centrale." },
    ],
    conseils: ["Citez toujours la version de la définition utilisée.", "Ne tentez pas de recouper des résultats pour identifier une personne : c'est interdit et journalisé."],
    visites: ["chercheur"],
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
      { titre: "Tableau de bord", chemin: "/etablissement", icone: "building", resume: "Votre établissement d'un coup d'œil.", points: ["Apprenants, occupation, enseignants, moyenne du trimestre, absents aujourd'hui.", "« Ce que le système vous signale » : alertes et actions proposées.", "« Élèves en baisse en mathématiques » et proposition d'accompagnement.", "Absences du jour en direct, classes, demandes en circuit.", "Dans le tableau des classes : « Gérer » (capacité, professeur principal) et « Passage » (conseil de fin d'année)."] },
      { titre: "Inscrire un apprenant", chemin: "/etablissement/inscription", icone: "user-plus", resume: "Quatre étapes : Registre national, Identité et filiation, Classe, Confirmation.", points: ["Recherche au registre national des personnes : aucune identité créée en double.", "Enfant sans acte d'état civil : inscription avec procédure de régularisation."] },
      { titre: "Apprenants", chemin: "/etablissement/eleves", icone: "users", resume: "La liste des élèves et leur dossier.", points: ["Filtres « Tous », « À risque », « En baisse », « Identité à régulariser ».", "Panneau « Vigilance décrochage » : score explicable (moyenne, absences, maths), seuils réglables.", "Dossier : moyennes, parcours, diplômes ; « Transférer » ou « Déclarer un abandon ».", "« Exporter » : CSV des lignes affichées, avec le score et le niveau de risque."] },
      { titre: "Examens et certification", chemin: "/etablissement/examens", icone: "award", resume: "Candidatures, délibération, diplômes vérifiables (CEP, BEPC, BAC).", points: ["Choisissez l'examen : les candidats viennent du niveau correspondant (CEP → CM2, BEPC → 3e, BAC → Terminale).", "La note affichée est la moyenne annuelle de l'apprenant : une base provisoire tant que le centre d'examen n'a pas transmis les notes officielles.", "Délibération définitive ; chaque admis reçoit un diplôme au QR code vérifiable par un tiers."] },
    ],
    taches: [
      { titre: "Inscrire un nouvel apprenant", pourquoi: "Interroger le registre national évite les doublons et rattache automatiquement les parents.", etapes: ["Touchez « Inscrire un apprenant ».", "Étape « Registre national » : saisissez le nom et les prénoms, puis « Interroger le registre ».", "Touchez « Sélectionner » en face du bon enfant. S'il n'existe pas : « Inscrire avec procédure de régularisation ».", "Vérifiez l'identité et les responsables légaux, puis « Choisir la classe ».", "Choisissez une classe qui a de la place, puis « Vérifier ».", "Relisez le récapitulatif et touchez « Confirmer l'inscription »."] },
      { titre: "Proposer un accompagnement", etapes: ["Dans « Élèves en baisse en mathématiques », cochez les élèves concernés.", "Touchez « Proposer un accompagnement » et précisez l'objet (5 à 200 caractères).", "Touchez « Transmettre ». La demande apparaît dans « Demandes en circuit »."] },
      { titre: "Repérer un décrochage qui se profile", pourquoi: "Le score additionne des signaux que vous connaissez déjà ; il ne remplace pas votre jugement, il vous montre où regarder en premier.", etapes: ["Ouvrez « Apprenants » et dépliez le panneau « Vigilance décrochage ».", "Chaque élève affiche son score sur 100 et les trois contributions : moyenne, absences, tendance en maths.", "Réglez la sensibilité des seuils (basse, normale, sensible) selon votre marge de manœuvre.", "Touchez « Dossier » pour ouvrir l'élève, ou filtrez sur « À risque » pour n'afficher que les concernés.", "Enchaînez avec « Proposer un accompagnement » pour les élèves que vous décidez de suivre."] },
      { titre: "Ajuster une classe (capacité, professeur principal)", pourquoi: "La capacité décide de l'accueil : l'abaisser sous l'effectif crée une alerte de surcharge, sans retirer d'élève.", etapes: ["Dans le tableau des classes, touchez « Gérer » sur la classe concernée.", "Réglez la « Capacité (places) » (nombre entier entre 1 et 2000).", "Désignez le « Professeur principal » : la liste ne propose que les enseignants rattachés à l'établissement.", "Touchez « Enregistrer ». Le tableau est recalculé immédiatement."] },
      { titre: "Faire tenir un conseil de passage", pourquoi: "Le conseil décide du passage de chaque élève ; l'application respecte les capacités et ouvre une division si nécessaire.", etapes: ["Dans le tableau des classes, touchez « Passage » sur la classe (hors niveau terminal).", "Indiquez l'« Année scolaire de réinscription » au format AAAA-AAAA.", "Pour chaque élève, touchez le statut pour basculer entre « Admis » (passage au niveau supérieur) et « Maintien » (réinscription dans la classe).", "Relisez le compteur « admis · maintenus », puis « Enregistrer ».", "Les admis changent de niveau, les maintenus sont réinscrits ; une nouvelle division est créée si une classe dépasse sa capacité."] },
      { titre: "Transférer un élève ou déclarer un abandon", etapes: ["Ouvrez « Apprenants », puis le dossier de l'élève.", "Touchez « Transférer », cherchez la classe d'accueil, cochez la confirmation, puis « Confirmer le transfert ».", "Ou touchez « Déclarer un abandon », indiquez le motif, puis « Confirmer l'abandon »."] },
      { titre: "Délibérer un examen national", pourquoi: "La délibération est définitive : toute correction ultérieure — notamment l'arrivée des notes officielles du centre — passe par un événement correctif journalisé.", etapes: ["Ouvrez « Examens et certification » et choisissez l'examen (CEP, BEPC ou BAC).", "Relisez la liste des candidats et leurs moyennes annuelles.", "Touchez « Délibérer et délivrer les diplômes » : les candidats sans moyenne ne sont pas jugés.", "Pour confirmer, saisissez DÉLIBÉRER, puis « Délibérer définitivement ».", "Les diplômes apparaissent dans « Diplômes délivrés » ; « Attestation » affiche le QR code."] },
    ],
    faq: [
      { q: "L'enfant n'a pas d'acte de naissance. Puis-je l'inscrire ?", r: "Oui. Touchez « Inscrire avec procédure de régularisation ». L'identité reste déclarative et apparaît dans « Identité à régulariser » jusqu'à l'enregistrement à l'état civil." },
      { q: "Pourquoi une classe n'est-elle pas proposée ?", r: "Elle est complète. Une classe pleine ne peut plus recevoir d'inscription." },
      { q: "L'enfant est « Déjà inscrit·e » ailleurs.", r: "Il faut passer par un transfert, depuis l'établissement d'origine ou via le dossier de l'élève." },
    ],
    conseils: ["Consultez les absences du jour chaque matin : la famille est déjà prévenue, vous pouvez agir vite.", "Ne délibérez qu'après avoir relu la liste des candidats : l'opération est irréversible.", "La note de délibération est provisoire (moyenne annuelle) : elle ne vaut note officielle qu'une fois les résultats du centre transmis."],
    visites: ["etablissement"],
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
      { titre: "Orientation", chemin: "/apprenant/orientation", icone: "compass", resume: "Des pistes lues dans vos résultats réels.", points: ["Indice de compatibilité et critères visibles.", "Les pistes éclairent votre choix, elles ne le font pas."] },
    ],
    taches: [
      { titre: "Partager un diplôme", pourquoi: "La personne vérifie elle-même l'authenticité, en quelques secondes, sans compte.", etapes: ["Ouvrez « Mes diplômes ».", "Touchez « Copier le lien » et collez-le dans un message, ou « Partager » sur téléphone.", "En face à face, touchez « QR en grand » et laissez scanner le code."] },
      { titre: "Explorer une orientation", etapes: ["Ouvrez « Orientation ».", "Lisez l'indice de compatibilité de chaque piste et les matières qui le fondent.", "Parlez-en avec vos enseignants et votre famille : les pistes évoluent avec vos résultats."] },
    ],
    faq: [
      { q: "Un diplôme manque.", r: "Il apparaît après la délibération du jury. S'il manque ensuite, adressez-vous à votre établissement." },
      { q: "Quelqu'un peut-il modifier mon diplôme ?", r: "Toute modification du document est détectée à la vérification : le verdict devient « Document altéré »." },
    ],
    conseils: ["Ne partagez que le lien ou le QR code de vérification, jamais votre mot de passe.", "Déconnectez-vous sur un ordinateur de l'école."],
    visites: ["apprenant"],
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
      { titre: "Vérifier un diplôme", chemin: "/verifier", icone: "badge", resume: "Scanner le QR code ou saisir l'identifiant.", points: ["« Scanner le QR code » (caméra) ou saisie de l'identifiant (ex. CERT-CEP-2024-000001).", "Verdict : Diplôme authentique, Document altéré, Diplôme révoqué ou Diplôme introuvable."] },
      { titre: "Résultats d'examens", chemin: "/resultats", icone: "graduation", resume: "Saisir son numéro de table pour connaître le verdict d'une session.", points: ["Choisissez l'examen (CEP, BEPC, BAC), la session (ex. Juin 2024), puis saisissez le numéro de table porté sur la convocation.", "Verdict : Admis (avec moyenne et mention), Non admis, Résultats non publiés ou Numéro de table introuvable.", "Rien ne s'affiche tant que la session n'est pas officiellement publiée par le bureau des examens."] },
    ],
    taches: [
      { titre: "Vérifier un diplôme", pourquoi: "Le registre national compare l'empreinte du document à celle du diplôme délivré.", etapes: ["Ouvrez BEILE, puis « Vérifier un diplôme ».", "Touchez « Scanner le QR code » et visez le code, ou saisissez l'identifiant du diplôme.", "Touchez « Vérifier ».", "Lisez le verdict. S'il est « Diplôme authentique », comparez les informations affichées au document présenté."] },
      { titre: "Consulter un résultat d'examen", pourquoi: "Le bureau des examens publie les verdicts dès la fin de la délibération du jury.", etapes: ["Ouvrez BEILE, puis « Résultats d'examens » (ou la section « Consulter les résultats » de l'accueil).", "Choisissez l'examen et la session.", "Saisissez le numéro de table de la convocation, puis « Consulter mon résultat ».", "Lisez le verdict. « Résultats non publiés » signifie que la session n'a pas encore été rendue publique."] },
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
