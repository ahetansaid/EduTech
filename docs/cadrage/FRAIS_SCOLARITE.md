# Cadrage — Situation des frais scolaires

> Octobre 2026. Statut : **validée le 26/10/2026** (recommandations retenues par le commanditaire), livrée en code le 26/10/2026 ; la réclamation « j'ai payé, rien n'est enregistré » est livrée le 27/10/2026 (§7). Aucune écriture en base de démonstration : la feature se branche sur `ledger.evenements`, dont la colonne `type` est un texte libre — aucun `ALTER TABLE`. La réclamation, elle, réutilise les tables de circuits du socle (`workflow.modeles`, `demandes`, `decisions`) : aucun schéma nouveau non plus.

## 1. Constat

- Un parent qui paie ne peut pas vérifier qu'il a été bien encaissé. La quittance est une feuille de papier,
  perdue ou raturée ; rien au registre ne la rappelle. L'inquiétude est réelle et porte sur deux choses à la
  fois : « ai-je payé assez ? » et « où est passé mon argent ? ».
- Une école qui encaisse ne dispose d'aucun état : elle ne sait pas, pour l'année en cours, quels termes ont
  donné lieu à une pièce et lesquels n'en ont donné aucune.
- **Aucun texte officiel ne fixe une nomenclature des frais au Bénin** : la grille est arrêtée par
  l'établissement (conseil d'administration pour les établissements publics), et le CatIS (catalogue des
  services publics, consulté le 26/10/2026) ne publie **aucune fiche « frais de scolarité »** — il n'existe
  donc pas de guichet officiel dont BEILE pourrait copier le libellé ou le formulaire.

## 2. Règles retenues

| | |
|---|---|
| **Rien ne bloque** | Un statut « en attente » ne suspend ni le bulletin, ni l'examen, ni l'appel, ni l'accès à l'école. BEILE ne devient pas une pression de recouvrement : l'information demande que l'on sache, pas que l'on paie sous contrainte. |
| **Visibilité** | Le responsable légal qui paie (lien de filiation **vérifié** au registre) et l'administration de l'école. Ni l'enseignant, ni la classe, ni l'inspection, ni l'élève lui-même. Aucun agrégat nominatif ne remonte au pilotage. |
| **Aucun montant au registre** | Ni somme, ni échéancier chiffré, ni RIB. La trace dit qu'**une quittance a été délivrée** : sa référence, sa date, la qualité de celui qui a encaissé. Le chiffre reste sur la pièce papier et dans la comptabilité de l'établissement. |
| **Grille libre** | L'établissement déclare lui-même les termes qu'il appelle et leur date d'exigibilité. On ne contraint pas le standard : on permet à chaque école de l'adapter. |

Le contrôle anti-détournement ne passe donc pas par les montants, qui ne circulent pas dans BEILE, mais par le
**rapprochement** : l'école déclare ce qu'elle encaisse (termes, dates, quittances émises), le parent qui paie
sans trace ouvre une réclamation, et l'écart entre les deux devient une alerte. Trois règles techniques le
tiennent dès aujourd'hui : une référence de quittance dupliquée sur deux élèves différents est signalée à la
vigie, chaque écriture porte son auteur au registre, qui ne s'efface pas, et une réclamation de la famille ne
peut être close en « pièce reconnue » que si la pièce est effectivement consignée (§7) — l'école ne peut donc pas
éteindre une contestation par un simple avis.

## 3. Vocabulaire et bases, sourcés

- **« frais de scolarité »**, **« quittance »**, **« exonération »**, **« prise en charge »** — pas « facturation »,
  pas « impayé », pas « arriéré » : un élève n'est pas un client.
- **Quittance** : décret n°2014-571 du 7 octobre 2014 portant règlement général sur la comptabilité publique,
  **article 50** — « Tout versement en numéraires donne lieu à la délivrance d'une quittance. » L'article 71 du
  même texte subordonne le caractère libératoire du paiement à la personne « capable de donner valablement
  quittance ». C'est pourquoi la trace nomme la **qualité** de qui encaisse.
- **Qui encaisse** : le même décret, **article 27**, prévoit des **régisseurs de recettes** nommés auprès d'un
  ordonnateur pour encaisser pour le compte d'un comptable public — personnellement et pécuniairement
  responsables, et contrôlés par ce comptable « sur pièces et sur place ». Trois qualités admises au registre :
  `comptable_public`, `regisseur_de_recettes`, `intendance` (+ `autre`, avec le nom de la fonction).
- **Exonération non binaire** : la gratuité des frais de scolarité des filles dans les établissements
  secondaires publics, décidée en Conseil des ministres le **3 juin 2026** et généralisée dès la rentrée
  2026-2027, fait d'un élève un **exonéré**, statut légitime et non une anomalie. Un écran qui afficherait
  « en attente » à une famille concernée serait une faute. Le modèle porte donc `exoneration` et
  `prise_en_charge` à côté de la quittance, et le statut « sans trace » n'est jamais rendu comme une dette.
- **Données personnelles** : loi n°**2009-09 du 22 mai 2009** portant protection des données à caractère
  personnel (et non 2017-29) — une déclaration préalable à l'APDP est requise (article 34), et les données
  concernant un **mineur** relèvent d'une protection renforcée. C'est le motif pour lequel un fait nominatif de
  frais ne descend ni à l'enseignant, ni à la classe, ni à un indicateur agrégé.

## 4. Ce que le registre sait dire

Un statut par élève et par année, recalculé à la lecture (jamais stocké) à partir de trois faits :

| Fait | Portée | Contenu |
|---|---|---|
| `CADENCE_FRAIS` | l'établissement, une année | les termes appelés (T1, T2, T3 ou année entière) et leur date d'exigibilité, le cadre d'accueil du paiement en texte d'agent, la référence de la délibération |
| `QUITTANCE_FRAIS` | un élève, un terme | référence de la pièce, date de délivrance, qualité de l'agent qui a encaissé |
| `EXONERATION_FRAIS` | un élève, un terme ou l'année | nature (`exoneration` / `prise_en_charge`), motif, autorité, référence du texte |

Statuts recalculés dans cet ordre (`apps/api/src/frais.ts`, fonction `calculerSituation`) : `sans_declaration`
l'école n'a rien appelé pour l'année → `attendu` un terme exigible est passé sans pièce → `exonere` tous les
termes appelés sont couverts par une mesure → `couvert` chaque terme appelé a sa pièce → `en_cours` le reste de
l'année n'est pas encore exigible. `attendu` se lit **« un terme exigible n'a encore aucune pièce enregistrée »**,
jamais « impayé » : l'absence d'une pièce enregistrée n'est pas la preuve d'une absence de paiement — la quittance
de papier existe peut-être, le registre ne l'a pas vue. C'est exactement le cas qui ouvre une réclamation.

Deux règles de couverture, écrites parce qu'elles ne sont pas évidentes et qu'elles engagent la confiance :

- **Une pièce d'annualité couvre les termes appelés.** Une école qui appelle T1, T2, T3 peut consigner une seule
  quittance marquée « annualité » : elle couvre les trois termes, qui apparaissent `paye` avec la même référence.
  L'inverse est vrai — une pièce par terme ne couvre jamais l'annualité, puisqu'une école qui découpe n'a pas
  appelé d'annualité. Ce n'est pas une dette calculée, c'est la portée d'un papier.
- **Une pièce consignée hors appel reste visible.** Une quittance déposée avant la déclaration d'appel, ou pour
  un terme que l'école a oublié d'appeler, s'affiche en ligne `sans_appel` : la masquer ferait disparaître la
  trace d'un papier détenu par la famille. Elle n'entre pas pour autant dans le statut de l'année, qui ne se
  juge que sur les termes appelés — `sans_appel` ne peut donc ni bloquer un passage à `couvert`, ni créer un
  `attendu`.

Le rapprochement comparé à un effectif doit être lu avec la même prudence : `scolarites` ne garde qu'une ligne
par apprenant, l'état du jour, sans historique par année. L'effectif est donc **la liste scolarisée aujourd'hui**
dans l'établissement, complétée des élèves qui en sont sortis mais ont donné lieu à une pièce pour l'année lue
(`horsEffectif`). Pour une année close, l'écran le dit au lieu de laisser croire à une promotion complète.

## 5. Écrans livrés

- **Espace famille** (`/famille`, carte « Frais scolaires ») : le bloc arrive avec le dossier de l'enfant
  (`Dossier.frais`), sans appel supplémentaire. Statut de l'année, cadre déclaré par l'école, terme par terme
  l'état et la référence de la pièce ou de la mesure. Aucun montant, et un renvoi explicite à l'intendance pour
  la somme. La carte porte aussi le bouton **« J'ai payé, rien n'est enregistré »** et, sous les termes, la liste
  des réclamations déjà déposées avec leur statut et la dernière réponse écrite de l'école (§7).
- **Établissement › Frais scolaires** (`/etablissement/frais`) : déclarer ou modifier l'appel de l'année
  (termes + dates, cadre, référence de délibération), totaux par statut comparés à l'effectif scolarisé,
  rapprochement terme par terme (quittances, exonérations, sans pièce, avant échéance), puis état par apprenant
  avec enregistrement d'une quittance ou d'une exonération depuis la ligne de l'élève. Les élèves sans pièce sur
  un terme exigible viennent en tête de liste. Le sélecteur d'année et la recherche nominative sont servis par la
  route : la recherche filtre la liste sur toute l'école (une liste tronquée à 300 lignes ne saurait promettre
  de « retrouver un élève précis »), tandis que les comptes et les totaux restent calculés sur l'effectif entier.
  Les cinq cases de statut s'affichent même à zéro — une case masquée empêcherait de faire la somme avec
  l'effectif. La date limite des formulaires est celle rendue par le serveur, en calendrier béninois (UTC+1) :
  une pièce délivrée le matin même ne doit pas être refusée parce qu'il est 00 h 30 à Cotonou et la veille en UTC.
  Un panneau **« Réclamations des familles »** vient entre l'appel de l'année et l'état par apprenant : les
  réclamations à instruire d'abord, avec le nom de l'élève, le texte de la famille, l'échéance des 7 jours et
  deux actions — *Consigner la pièce* (qui ouvre le même formulaire que la ligne d'élève) puis *Pièce reconnue*
  ou *Refuser*, les deux exigeant une réponse écrite. Une réclamation vivante est aussi signalée sur la ligne de
  l'élève concerné, pour que le lien entre la pièce à consigner et la réclamation à clore reste visible.
- **Entrée de navigation** réservée à `chef_etablissement` ; le masque n'est que cosmétique, la route est gardée
  côté serveur par l'habilitation d'établissement.

Deux propriétés techniques valent d'être écrites : la lecture d'une cadence s'appuie sur l'index existant
`evenements_type_etablissement_idx (type, etablissement_id, survenu_le)` — aucune indexation nouvelle n'est
nécessaire ; et la notification d'une quittance ou d'une exonération ne part qu'aux responsables au lien
**vérifié**, jamais à l'élève (loi 2009-09, protection renforcée du mineur), tandis que `CADENCE_FRAIS` ne
notifie personne.

Trois cloisonnements sont tenus côté serveur, pas à l'affichage :

- les trois faits de frais sortent du **flux des faits du jour** du pilotage (`filtreFluxDuProfil`) : un décompte
  « QUITTANCE_FRAIS · CEG X · 10 h 12 » école par école serait déjà un état de rapprochement lu par l'inspection
  ou la recherche, ce que la règle 2 refuse ;
- une pièce consignée par une **autre école** n'apparaît pas dans la situation d'un élève : un apprenant ne doit
  ses frais qu'à l'établissement qui le scolarise aujourd'hui, et les références, agents et motifs d'une école
  d'origine ne se lisent pas depuis le compte d'une école d'accueil ;
- un compte qui n'administre **aucune école** est refusé avant toute lecture en base sur les trois écritures,
  pour que le 409 « apprenant non scolarisé » ne serve pas d'oracle permettant de parcourir la scolarité de tout
  le registre.

Enfin, la charge utile des trois faits est `.strict()` au contrat (`packages/contracts/src/evenements.ts`) : un
montant, un RIB ou un mode de paiement ne peut s'y loger par aucun point d'écriture — la règle 3 est tenue par le
schéma, pas par la bonne volonté d'un futur développeur. Le schéma ferme les CLÉS ; il ne fermait pas les TEXTES,
et « quinze mille francs CFA par terme » écrit dans le cadre de l'appel aurait tout aussi bien trahi la règle.
`commun.ts` (`sansSomme`, portée par `frais.ts` et par la route des demandes) refuse donc aussi une **devise**
dans la prose que compose l'agent — cadre de l'appel, motif et autorité d'une mesure, fonction de l'agent
encaisseur, texte du dépôt d'une réclamation, et **tout motif rendu par `POST /demandes/:id/decision`** : ce motif
est cité tel quel dans la notification qui part sur le téléphone du demandeur, quel que soit le circuit. Un refus de
`valide` en frais était le premier cas traité ; la garde est désormais commune, parce que la faille ne venait pas
du circuit mais du fait que la prose d'un agent voyage jusqu'à un téléphone. 422 avant toute écriture. Un nombre nu
n'est pas
une somme (un numéro de salle, une année) ; c'est le nom de devise qui fait intention. Les références de pièces et
de délibérations ne se vérifient pas : ce sont des numéros, opaques par nature, et un rapprochement de lettres y
serait un faux positif.

## 6. Recette

La feature est couverte par `apps/api/src/recette.ts` en deux temps, comme le reste du registre.

- **Refus, aucune écriture** : 401 sans session sur les deux lectures **et sur les trois écritures** ; 403 à
  l'enseignant, à l'inspection et à la direction départementale sur la situation d'un apprenant et sur l'état de
  rapprochement de leur périmètre ; 403 à l'élève lui-même ; 403 au parent et à l'élève qui voudraient *consigner*
  une pièce ou une mesure — ils déclarent, ils n'émettent pas ; 200 au parent au lien vérifié et à l'administration
  de son école ; 403 à l'école qu'un compte n'administre pas ; 422 pour une année que l'école n'a pas ouverte. Le
  refus d'écrire est le **même statut** pour un élève existant et pour un élève inexistant, sur la quittance comme
  sur l'exonération — c'est la démonstration que le 409 de la scolarité ne sert plus d'oracle. La forme est testée
  à la porte : une quittance ou un terme portant un `montant` est rejeté, un cadre ou un motif qui **nomme une
  devise** aussi. La réclamation est gardée de la même façon : dépôt refusé sans session, à l'enseignant, à
  l'inspection, à l'élève lui-même et au parent qui n'a pas le lien — le refus est **identique** pour un élève
  inexistant, afin que la route ne serve pas d'oracle — et refusé à l'administration de l'école, qui n'écrit pas
  la contestation à la place de la famille. Sa forme est contrôlée avant toute écriture : texte nommant une
  devise, texte trop court pour décrire une pièce, clé `montant` inconnue du contrat. Et l'invariant « aucun
  montant » est vérifié **mécaniquement** sur la réponse entière
  (`clefsMontant`, `deviseDansLeTexte`) dans l'espace famille, la lecture d'une famille et l'état de l'école —
  chaque contrôle exige une réponse peuplée, un scan sur un tableau vide étant vert sans rien regarder. Le
  cloisonnement du pilotage se prouve sur la base réelle, pas seulement après les pièces que la recette elle-même
  a consignées : le flux de la tutelle centrale et celui d'une direction départementale sont lus avant toute
  écriture.
- **Écritures** (`--ecritures`, branche de base éphémère uniquement) : l'année saisie est **celle que l'élève lit**
  (`GET /apprenants/:id/frais`), puis l'état de l'école est relu borné à cette année — écrire sur « la dernière
  année où l'école a ouvert des classes » ferait consigner une pièce invisible aux deux écrans. Ensuite :
  déclaration d'appel et son rejou idempotent, pièce consignée hors appel puis rendue `sans_appel` après
  déclaration (la régression critique ; non rejouable ailleurs, le cas contrôle alors qu'aucune ligne orpheline
  ne subsiste), refus d'un terme non appelé, **règle 1 jouée pendant que l'élève est exactement `attendu`** — le
  bulletin de sa classe s'imprime et son dossier se lit, rien n'est suspendu ; **réclamation déposée par la
  famille au moment exact où l'élève est `attendu`**, son rejou rendu sans être empilé, son refus sur un terme
  non appelé, puis les quatre gardes de la réponse de l'école jouées dans l'ordre — un enseignant ne statue pas
  (403), une réponse nommant une devise est refusée, une réponse trop courte est refusée, un renvoi est refusé,
  et **reconnaître sans pièce au registre est refusé** ; quittance et son rejou, référence
  dupliquée sur deux élèves puis recopiée dans un autre alphabet (la vigie la reconnaît), **alerte lisible par le
  seul DPO et ne nommant aucun apprenant**, notification au responsable au lien vérifié et à lui seul — le
  passeport de l'élève ne porte aucun bloc de frais et son téléphone ne reçoit rien —, **clôture de la
  réclamation une fois la pièce consignée**, sa réponse écrite notifiée à la famille sans somme ni devise, sa
  relecture par la famille (statut et motif) comme par l'école (avec le nom de l'élève joint) et l'impossibilité
  pour l'enseignant d'en lire le détail, mesure annuelle couvrant
  les termes appelés, rapprochement de l'école (effectif égal aux lignes du jour), recherche nominative servie en
  base et retrouvant l'élève saisi, relecture par la famille après écritures (même statut des deux côtés, toujours
  aucun montant), et l'absence des trois faits du flux lu par la tutelle comme du parcours général d'un élève.

Le second temps ne s'exécute pas en local : la seule base joignable ici est la base de production, et une
écriture de recette y serait définitive (le registre est en ajout seul).

## 7. Ce que la réclamation fait, et ce qui manque encore

**Livré le 27/10/2026** : « j'ai payé, rien n'est enregistré ». La famille dépose, depuis l'espace famille, une
réclamation sur un terme (ou sur l'année) : un texte de 15 à 500 caractères, sans montant ni devise, et rien
d'autre — pas de scan, pas de numéro de pièce, pas de moyen de paiement. Le papier qu'elle détient se montre à
l'école, il ne monte pas au registre national. L'administration de l'école la voit sur son écran de frais, avec
le nom de l'élève, et répond par écrit sous 7 jours.

C'est un circuit du socle (`workflow.demandes`, modèle `RECLAMATION_FRAIS`) et **non** un fait du registre : il
ne modifie aucune situation de frais, n'apparaît ni au dossier général de l'élève, ni au flux du pilotage, ni au
passeport. Sa visibilité est exactement celle du circuit — la famille qui l'a déposée et l'étape courante, tenue
par le rôle `chef_etablissement` au périmètre de l'école ressource. L'enseignant ne la lit pas et ne la statue
pas.

Quatre verrous, parce qu'une réclamation sans verrou devient une boîte aux lettres :

- **`valide` exige la pièce.** L'API refuse de reconnaître une réclamation tant qu'aucune quittance, exonération
  ou prise en charge n'est consignée pour cet élève, cette année (et ce terme, s'il est nommé). La réclamation se
  clos donc par un **fait**, pas par un avis : c'est ce qui la rend utile au rapprochement au lieu de le
  contourner.
- **`refuse` exige un motif écrit** (10 caractères au moins), refusé s'il nomme une devise, et ce motif part tel
  quel en notification à la famille. Une famille n'obtient pas un silence.
- **`renvoye` est refusé** : la première étape est le dépôt par la famille elle-même, qu'aucune file ne
  présenterait. Le circuit a donc **deux** étapes et non les trois du `RECLAMATION` générique du socle — le
  troisième maillon (correction par la direction départementale) serait une surface sans pouvoir, la DD n'ayant
  aucune route pour consigner une pièce.
- **Un seul dossier par élève, année et terme** — pas par compte. Deux responsables légitimes du même enfant
  (père et mère au registre national) qui déposent le même signalement obtiennent le dossier déjà ouvert, et non
  deux lignes sur la table de l'école. La vérification et l'écriture partagent le verrou d'advisoire posé sur
  cette clé, comme les transferts posent le leur sur l'élève : deux clics, ou deux onglets ouverts, ne créent
  pas deux demandes.

Deux courses fermées du même coup, côté socle — la réclamation les traverse comme tout circuit :

- **statuer deux fois** : la décision générique d'une demande écrivait sa ligne d'historique puis mettait à jour
  la demande sans condition d'état. Deux comptes d'une même école, ou une double requête, produisaient deux
  décisions contradictoires et deux notifications au même téléphone. Le passe est maintenant conditionné à
  l'étape et au statut lus avant, dans la même transaction ; le second perd (409) et n'écrit rien.
- **l'ordre des gardes** : l'autorisation (rôle de l'étape dans le périmètre) passe avant toute garde d'état ou
  de circuit. Dans l'autre ordre, un compte qui n'a rien à faire ici lisait dans le seul code de la réponse si
  une demande est close, si une pièce de frais existe au registre pour un élève, ou si un transfert est en cours.
  La permission se juge donc clos ou non (`habilitee`), la clôture restant lisible par celui qui a le rôle.

**Ce qui manque, dit tel quel : le recours au-dessus de l'école.** Quand l'école refuse, sa réponse est écrite,
motivée, horodatée et lisible par la famille — mais la plateforme ne lui offre aucun échelon à saisir. Un
recours suppose un acteur qui puisse **ordonner** une écriture de frais ou constater un manquement, et cet
acteur n'existe pas dans le modèle actuel (`Role` n'a ni intendant ni autorité de recours ; la DD n'a pas la
route). L'écran famille le dit à la famille au moment du dépôt plutôt que de le lui laisser découvrir. C'est un
lot à arbitrer, pas une ligne à ajouter.

## 8. Hors périmètre pour l'instant

- **Le montant** : il ne viendra pas au registre national. Si une envie de totalisation se faisait jour, ce
  serait un nouvel espace de confidentialité à arbitrer, pas une colonne à ajouter.
- Le paiement lui-même : BEILE n'encaisse rien, n'émet aucun moyen de paiement et ne remplace pas la régie.
- Une nomenclature des frais, des taux, ou un barème national : inexistant à ce jour, donc inventé — refusé.

## 9. Qui encaisse (arbitrage rendu le 2026-10-26 : la nomenclature reste ouverte)

La documentation officielle ne dit **nulle part** qui, dans un collège ou lycée public béninois, encaisse
réellement les frais et sur quelle pièce : l'intendance, le CPE, un régisseur de recettes nommé (art. 27 du
RGCP), l'association de parents d'élèves, ou le comptable assignataire. Les trois premières qualités proposées
au registre dérivent du RGCP, pas du terrain.

**Décision : ne pas figer.** `QualiteAgentEncaisseur` garde sa quatrième valeur, `autre` — libellée « Autre
agent désigné » (`packages/contracts/src/evenements.ts:79-84`). Un agent réel hors de la liste peut donc être
consigné sans que le registre prétende connaître l'organigramme de l'école. La valeur n'est pas une poubelle :
choisir `autre`, c'est dire « je consigne une responsabilité que BEILE ne sait pas nommer », et le champ
`agent` (texte libre, refusé s'il contient une somme ou une devise) porte la désignation telle que la pièce
papier l'écrit.

Ce que cela implique pour la saisie, dit tel quel : le compte d'un intendant ou d'un régisseur **n'existe pas**.
`Role` (`packages/contracts/src/acces.ts:9-20`) ne contient ni intendant, ni régisseur, ni comptable — seul un
compte `chef_etablissement` au périmètre de l'école qui scolarise l'élève peut écrire un fait de frais
(`apps/api/src/frais.ts`, `administration()`). La trace est donc signée par l'administration de l'école pour un
agent dont elle consigne la qualité. C'est honnête tant que l'école est le lieu du rapprochement ; ce serait
faux si la pièce était émise hors d'elle.

Un rôle dédié (compte « agent financier » avec périmètre) est possible mais ce n'est pas une ligne à ajouter :
c'est un contrat, une habilitation ABAC et une migration. **À redemander explicitement**, et à ne trancher
qu'après validation du formulaire auprès de la DDESTF ou du cabinet du MESTFP — si l'agent qui encaisse n'existe
dans aucune nomenclature, la trace serait juste et la pièce introuvable.
