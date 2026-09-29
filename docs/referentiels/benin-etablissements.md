# Répertoire sourcé — établissements et acteurs éducatifs du Bénin

Document de recherche, **aucune donnée saisie en base**. Millésime : 2026-09-29.

## Règle de lecture

Chaque ligne porte un niveau de vérification, parce que BEILE ne doit jamais présenter une hypothèse
comme une donnée officielle :

- **OFFICIEL** — lu dans un texte (décret, arrêté, note signée) ou sur le site de l'autorité concernée.
- **OFFICIEL-SANS-DATE** — lu sur une source officielle, mais sans millésime du chiffre.
- **UNE-SOURCE** — un seul site officiel, non recoupé.
- **NON OFFICIEL** — annuaire tiers, OSM, presse, réseau social : piste à confirmer, jamais à afficher comme registre.
- **NON CONFIRMÉ** — cherché, **non trouvé**. Cette catégorie est aussi informative que les autres : elle signale ce qu'il ne faut pas coder.

Un catalogue d'établissements serti ainsi reste **indicatif**. Le bandeau « catalogue indicatif / non
officiel » de l'UI ne tombe que si l'arrêté ou l'annuaire officiel correspondant est fourni.

---

## 1. Découpage administratif — les trois chaînes et leurs sigles réels

C'est la colonne vertébrale du périmètre (`Perimetre`) de BEILE : un établissement, une direction
départementale, une circonscription.

| Chaîne | Autorité centrale | Démembrement départemental | Échelon local | Source |
|---|---|---|---|---|
| Maternel + primaire | **MEMP** — Ministère des Enseignements Maternel et Primaire ; directions **DEP**, **DEM**, **DIIP** (inspection), **DEC** | **DDEMP** × 12 (décret 2021-570 art. 10) | **Circonscription scolaire (CS)** tenue par un **Inspecteur de l'Enseignement Primaire, Chef de Circonscription (IEP/CCS)**, nommé par arrêté ; **344 zones pédagogiques** tenues par le **Conseiller pédagogique (CP)** | décret 2004-095 ch. VI, décret 2021-570 (memp.gouv.bj/documentation/11 et /12) — **OFFICIEL** |
| Secondaire général | **MESTFP** → **DESG** (Direction de l'Enseignement Secondaire Général), qui contient **SEPub-ESG** (publics) et **SEPriv-ESG** (privés) | **DDESTFP** × 12 (« démembrement territorial … au niveau des départements », CatIS `IN00132`) | inspecteur de circonscription secondaire : **NON CONFIRMÉ** (l'**AIC** n'a été lu que pour le primaire) | enseignementsecondaire.gouv.bj + décret 2021-569 — **OFFICIEL** |
| Technique et formation professionnelle | **MESTFP** → **DESTFP**, **DEC-MESTFP** (`IN00127`), **DPAF** | **DDESTFP** (mêmes 12) | guichet dénommé « Service de Délivrance … et du Contentieux » | CatIS PS00170/PS01194 — **OFFICIEL** |
| Supérieur | **MESRS** → **DGES** (+ **DEPES** pour le privé, Kintémonou, Cotonou), **DPP** (statistiques), **CCNES** (avis), **DEC** (`decsup.bj`, `IN00212`) | pas de démembrement territorial lu pour la DEC | guichet établissement | CatIS PS00278, decsup.bj — **OFFICIEL** ; **divergence de libellé** : `decsup.bj` dit « Direction des Examens et Concours Supérieurs », CatIS dit « Direction des Examens et Concours du MESRS » |

**12 départements, 77 communes** — chefs-lieux : Alibori/Kandi, Atacora/Natitingou, Atlantique/Allada,
Borgou/Parakou, Collines/Dassa-Zoumè, Couffo/Aplahoué, Donga/Djougou, Littoral/Cotonou, Mono/Lokossa,
Ouémé/Porto-Novo, Plateau/Pobè, Zou/Abomey. **UNE-SOURCE** (liste Wikipedia recoupée par RFI 2016 ; le
décret SGG du 22/06/2016 n'a pas été extrait).

À retirer du vocabulaire de BEILE : **IEN n'existe pas au Bénin** (non rencontré), et **« académie » au
sens ivoirien/nigérien n'a pas été confirmée**.

---

## 2. Enseignement maternel et primaire

**Libellés réels** : **EPP** — école primaire publique (usage officiel constant, ex. « l'EPP Akpaka de
Savè », gouv.bj) ; **enseignement maternel** est le terme légal de la loi 2003-17 art. 23 pour le
pré-primaire ; les structures d'accueil s'appellent **crèches et écoles maternelles** (décret 2021-570) ;
le régime privé est désigné « **établissements privés des enseignements maternel et primaire** » (décret
2007-279, cité par CatIS PS00702). **EPPT, EPEE, CDPE : non rencontrés** — ne pas les coder. « EPPE »
n'existe que dans la littérature des bailleurs.

Chiffres, portail officiel **memp.gouv.bj/documentation/statistiques** (Direction des Statistiques MEMP,
renvoi INSAE) — **OFFICIEL-SANS-DATE pour les périmètres** :

| Indicateur | Valeur | Année |
|---|---|---|
| Établissements maternel + primaire, toutes structures | **17 141** | 2025-2026 |
| Écoles **publiques** | **4 094** | 2024-2025 |
| Apprenantes et apprenants, toutes structures | 2 295 038 | 2025-2026 |
| Enseignants, toutes structures | 63 314 | 2025-2026 |
| Circonscriptions scolaires | 90 → **118** | 2026 (presse : Matin Libre 04/03/2026 — **NON OFFICIEL**) |

Répartition des établissements par département (2025-2026) : Atlantique 3 514, Ouémé 2 660, Borgou 1 704,
Zou 1 509, Atacora 1 159, Collines 1 105, Littoral 1 105, Donga 899, Plateau 928, Couffo 867, Alibori 855,
Mono 836.

**Incohérence à ne pas colmater seul** : deux séries coexistent (« évolution 2018-2025 » : 1 427 340
apprenants et 32 654 enseignants en 2024-25 ; « toutes structures 2025-26 » : 2 295 038 et 63 314), et
deux versions du « CEP 2025 par département » sont publiées. Les périmètres (public/privé, avec ou sans
confessionnel) ne sont pas explicités → à confirmer auprès de la DEP / Direction des Statistiques avant
d'afficher un total national.

CEP 2025 : **215 840 inscrits, 169 238 admis, 78,4 %** (memp.gouv.bj/donnees-cep) — **OFFICIEL**.
Le CEP est institué par la loi 2003-17 art. 26 et relevé de la **DEC** du MEMP.

---

## 3. Enseignement secondaire général

| Indicateur | Valeur | Source / niveau |
|---|---|---|
| Établissements ESG **publics** | **880**, dont **460** à cycles 1 + 2 | enseignementsecondaire.gouv.bj/…enseignement-secondaire-general — **OFFICIEL-SANS-DATE** |
| Établissements ESG **privés** | **1 696** | même page — **OFFICIEL-SANS-DATE** |
| **CEG publics nommés** | **469** (avec commune) | répertoire officiel `education.benin.bj/repertoire-des-college-denseignement-general-publics`, **site mort**, repris intégralement dans la table OSM WikiProject Benin/Schools — **NON OFFICIEL** dans sa forme actuelle, mais c'est le seul nominatif accessible |
| Nombre de **lycées publics** | **NON TROUVÉ** de source lisible | — |

Répartition des 469 CEG par département : Atlantique 54, Collines 55, Couffo 57, Mono 53, Borgou 44,
Ouémé 43, Atacora 29, Donga 25, Plateau 25, Alibori 18, Littoral 17, Zou 49.

Lycées nommés lus (département / commune) : **Lycée Béhanzin** et **Lycée Toffa** (Ouémé, Porto-Novo),
**Lycée Mathieu Bouké** (Borgou, Parakou), **Lycée Mafrig Bangoura** et **Lycée Houffon** (Zou, Bohicon —
à confirmer), **Lycée des Jeunes Filles** (Atacora, Natitingou). Sources OSM/Wikipedia : **NON OFFICIEL**.

Régime du privé : autorisation d'ouverture, d'extension ou de transfert, service actif **PS01194** porté
par la **DPAF-MESTFP**, suivi du privé par **SEPriv-ESG**, texte de référence **décret 2007-279** du
16/06/2007. **Aucun registre nominatif public des collèges/lycées privés autorisés n'a été trouvé en
ligne.**

Examens : BEPC et BAC relèvent de la **DEC-MESTFP** ; attestations et diplômes « BEPC, CAP, DT » =
service **PS00170** (retrait au SEC/DDESTFP, arrêté 063/MESFTP du 09/12/2010) ; numérotation et affectation
des candidats = **PS00175**. Portails : `secondaire.educmaster.bj`, `eresultats.bj`. Candidats BEPC :
124 860 (session 2024, presse) ; 130 253 (session 2026, réseaux — **NON OFFICIEL**).

---

## 4. Enseignement technique et de la formation professionnelle

### Diplômes et qui les certifie

| Diplôme | Autorité | Entrée | Passerelle | Source |
|---|---|---|---|---|
| **CQM** — Certificat de Qualification aux Métiers | examen national : MESTFP + MPMEPE + **CMA-Bénin** + DEC + DDESTFP, inscriptions par Comités Communaux d'Organisation | 17 ans, apprenti d'un maître accrédité | CQM → CQP → CAP | CatIS PS00201, cmabenin.bj — **OFFICIEL** |
| **CQP** — Certificat de Qualification Professionnelle | formation **duale** des apprentis (DESTFP), session conjointe avec la CMA | ≥ 15 ans | CQP → CAP | CatIS PS00199/PS00201 — **OFFICIEL** |
| **CAP** — Certificat d'Aptitude Professionnelle | **examen national** (DEC-MESTFP) | fin de 3e | → DT/BAC pro | CatIS PS00169/PS00170/PS00196 — **OFFICIEL** |
| **DT / DTM** — Diplôme de Technicien (aux Métiers) | **examen national** (DEC-MESTFP) | BEPC ou CAP | → BTS | CatIS PS00196/PS00170 — **OFFICIEL** |
| **Baccalauréat technique/professionnel** | **examen national** (DEC-MESTFP) | BEPC ; séries STG G1/G2/G3, STI E, T, Eau-Assainissement, F1-F4 | → BTS, licence | CatIS PS00196/PS00169 — **OFFICIEL** |
| **BTS** — Brevet de Technicien Supérieur | diplôme national géré par la **DEC du MESRS** (attestations, relevés) | Bac/DT | licence pro (conditions non lues) | CatIS PS00882-887 — **OFFICIEL**, mais rattachement MESRS vs MESTFP à re-vérifier |
| **DTSBM** — Diplôme de Technicien Supérieur au Métier (Bac+2) | écoles des métiers (programme ADET) | DTM | — | guide MESTFP « Métiers d'avenir » 2023 — **OFFICIEL** |
| **BEAT / DEAT** (agriculture) | cités dans le guide MESTFP sans détail | à confirmer | — | **NON CONFIRMÉ** |
| **BEP** | **n'apparaît dans aucune source officielle lue** | — | — | **NON CONFIRMÉ** |
| **BT — Brevet de Technicien** | **aucune occurrence lue** | — | — | **NON CONFIRMÉ** |

### Réseau public EFTP

Noms **OFFICIELS** (guide MESTFP 2023, liste « non exhaustive ») :

- **LTP** — Lycées Techniques Professionnels : Natitingou, Pobè, Djakotomey, Kandi, Porto-Novo, Coulibaly,
  Kpondèhou, Asba, Ouidah, Lokossa, Djougou, INA.
- **LTA** — Lycées Techniques Agricoles : Banikoara, Kika, Djougou, Natitingou, Kpataba, LAMS, Adja-Ouèrè,
  Adjahonmey, Akodeha, INA, Bariénou (Djougou).
- **CFPA** — Centres de Formation Professionnelle et d'Apprentissage : Agouagon, Abomey, Covè, Dogbo,
  Agoua, Athiémè, Zè, Se, Nikki, Kouandé, Djidja, Djougou, Pahou (13 sites nommés).
- **CMTH** Centre des Métiers du Tourisme et de l'Hôtellerie (Calavi), **CFTH** Centre de Formation
  Touristique et Hôtelière (Cotonou), **CFME** Centre de Formation aux Métiers de l'Eau (ville non lue),
  École des Métiers du Numérique (ville non lue).
- **INIFRCF** — Institut National d'Ingénierie de Formation et de Renforcement des Capacités des
  Formateurs (CatIS `IN00129` + MESTFP).
- Programme **ADET** : 7 écoles des métiers de référence, 30 LTA modernes, spécialisation de 16 lycées
  industriels (`adet.bj`).

**Absent vérifié** : **CFP comme sigle officiel** (le terme en usage est CFPA/LTP/LTA), **INFP** (c'est
haïtien), **IRFDE**, **INFA-Tokan**, **INAM**, **ITP**, **Institut National des Arts et Métiers** — aucune
occurrence dans les sources lues.

Acteurs et financement lus : **SN-EFTP 2020-2030** (conseil des ministres du 11/12/2019), **FODEFCA**,
**FDA** (Fonds de Développement de l'Artisanat, décret 2017-387, `IN00142`), **ANPE** (décret 2021-454,
13 antennes, 77 ULPE), **CNA** (Commission Nationale pour l'Apprentissage), **COPA** (~40 cellules
d'orientation), **CNAB**, **EFAT** (Examen de Fin d'Apprentissage Traditionnel, source BIT), **CMA-Bénin**.
**ONEC** : aucun texte béninois lu — au Bénin l'autorité d'examen s'appelle **DEC**.

---

## 5. Enseignement supérieur public

Source décisive : **décret n° 2016-638 du 13 octobre 2016 portant création de quatre universités
nationales**, et la page « Universités » de `enseignementsuperieur.gouv.bj`, qui n'en liste **que quatre**.
CatIS confirme les quatre institutions (`IN00117` UAC, `IN00119` UP, `IN00046` UNA, `IN00118` UNSTIM),
toutes sous MESRS. **OFFICIEL.**

| Université | Sigle | Siège | Département |
|---|---|---|---|
| Université d'Abomey-Calavi | UAC | Abomey-Calavi | Atlantique |
| Université de Parakou | UP | Parakou | Borgou |
| Université Nationale d'Agriculture | UNA | Porto-Novo (écoles à Sakété, Kétou, Adjohoun…) | Ouémé/Plateau |
| Université Nationale des Sciences, Technologies, Ingénierie et Mathématiques | **UNSTIM** | **Abomey** (centres à Natitingou, Lokossa, Dassa, Savalou) | Collines |

**Ces trois noms sont des hypothèses à écarter : « Université de Malanville/Malanou », « Université de
Nam-Lodi », « Université des Métiers de la Santé » — aucune trace officielle.**

Composantes lues sur les sites des universités et dans le décret 2016-638 :

- **UAC** : FSS (Sciences de la Santé, Cotonou/Abomey-Calavi ; inclut école d'odontostomatologie, ESAS,
  ESK, école de nutrition et diététique), FADESP (droit ; le site affiche FADESP, « FDSP » n'a pas été
  rencontré comme sigle), FASEG, FAST, FASHS (née en 2017 de la scission de la FLASH), FLLAC, FSA,
  **EPAC** (l'école affiche aujourd'hui « College of Engineering — Énergie, Infrastructure de transport et
  Environnement »), **ENEAM** (ex-INE), **ENS** (Porto-Novo), **ENSTIC** (Savalou) ; le décret rattache
  aussi INJEPS, IMSP (Dangbo), HERCI (Sèmè-Podji). UAC revendique « 28 UFR » : **liste complète non extraite**.
- **UNA** : EGESE, EGPVS, EHAEV, EFIB, école d'aquaculture, EAPA (agrobusiness), ESRVA, ENSTCTPA (Sakété),
  EMACoM, ENSTA (Kétou) — **l'orthographe exacte des sigles diverge entre le décret et una.bj** ; à figer
  sur una.bj avant tout encodage.
- **UNSTIM** : **ENSTP** (Abomey, ex-ESTBR, arrêté 206-MESRS du 17/04/2018), ENS Natitingou, ENSET Lokossa,
  IUT Lokossa, FAST Natitingou, ENSBBA Dassa, ENSGEP, **INSPEI** (classe prépa-ingénieurs ; Savalou selon
  le décret, Abomey selon Wikipedia → **ville discordante**).

Grandes écoles hors universités : **ENAM** (École Nationale d'Administration et de Magistrature, créée par
arrêté S-040/MEMS/DGM du 14/09/1984, Abomey-Calavi) — **tutelle ministérielle non confirmée**, Wikipedia
dit « rattachée à l'UAC », uac.bj la décrit comme établissement public. **ESBTP/ESTBR** : ESTBR est
devenue l'ENSTP d'Abomey ; la piste « ESBTP Cotonou » n'apparaît que dans des sources non officielles.
**IFIE**, **IUPMF**, **INAM**, **IEP**, **INS**, **École Nationale des Eaux et Forêts**, **Institut
National d'Énergie**, **ENE Natitingou** : **non confirmés** (l'ENE semble absorbée dans les écoles de
l'UNA).

Régime des diplômes : **les examens nationaux de licence et de master visent les filières non homologuées
des établissements privés** — **décret n° 2020-551 du 18 novembre 2020**, et les fiches CatIS PS00939 /
PS00940 / PS00945 ciblent explicitement « tout étudiant inscrit dans un établissement **privé** ». Les
universités publiques délivrent de leurs propres jurys (décret 2021-379, statuts-types) : c'est une
**inférence**, le texte précis des prérogatives d'attribution n'ayant pas été extrait.

---

## 6. Enseignement supérieur privé (EPES)

Chaîne juridique, fiche CatIS **PS00278** (« Agrément de filières d'EPES », DGES, gratuit) — **OFFICIEL** :
autorisation de **création** → autorisation d'**ouverture** (deux ans renouvelables une fois, soit 2 à 4 ans
de régime d'ouverture) → **agrément** par arrêté du ministre **sur avis du CCNES**, **filière par filière**
(« un établissement agréé est un établissement qui a toutes ses filières agréées »). Textes : décret
2008-818, arrêté 350/2014 du 31/07/2014, arrêté AOF CCNES 53/2009. Guichet : **DEPES**
(mesrs.depes.infos@gouv.bj).

La seule liste consolidée trouvée : **note d'information n° 800/MESRS/DC/SGM/DGES/DEPES/SA du 29 octobre
2019** (`enseignementsuperieur.gouv.bj/doc/LISTE_EPES_ACTUALISEE.pdf`) — **13 pages sans couche de texte**
(vérifié : `pdftotext` et PyMuPDF renvoient 0 caractère), rendue lisible par OCR. Elle donne trois listes :
**31** EPES avec avis favorable du CCNES pour l'agrément, **45** avec délai supplémentaire d'un an,
**50** proposés à la fermeture. Ce n'est **pas** un total national d'EPES, et rien de consolidé
postérieur à 2019 n'a été trouvé.

Avis favorable 2019, extrait (filières résumées ; ville indiquée seulement quand le document la donne) :
**UATM-Gasa**, **UCAO**, **UPAO**, **IRGIB Africa Université**, **UPI Obiang Nguema Mbasogo**,
**Les Cours Sonou**, **ESAE**, **ESEP Le Berger** (Cotonou), **ESGTIC-Ecce Homo**, **ESMER**,
**ESSF (Sainte-Cécile / Sainte-Félicité)**, **ES Jean Michel Le Faucon**, **HECM**, **IJP2**,
**ESGC Verechaguine A.K.**, **ISCG**, **ISMA**, **ISM Adonaï**, **IUP Panafricain**, **Pigier Bénin**,
**École de Formation des Enseignants du Secondaire Sapientia**. La liste de régularisation cite notamment
ESTAM, HEIM Weldios, IUB/IUBO, ESGT, ESPAM, ISCOM ; la liste de fermeture propose, entre autres, ESEP Le
Berger de Porto-Novo, ESGA Amen, ESEC Parakou, ESTI-IFA, ESPO, HEULI-Bénin, ISCOM-ICAMA, USTB, USAM.
**OFFICIEL, via OCR** : l'import définitif devra repartir d'une version texte ou des arrêtés eux-mêmes.

Obligations périodiques d'un EPES (dossier d'agrément, à modéliser comme échéances dans BEILE) : 4
rapports de **jury de délibération** (un par semestre) validés, 2 rapports annuels d'activités validés, 2
rapports du **Conseil scientifique** validés, 2 **inspections** annuelles favorables, 2 dépôts annuels de
**statistiques (DPP)**, attestation de non-changement de statut, liste nominative du personnel avec **la
mention des cumuls dans d'autres universités, notamment publiques**, autorisations d'enseigner,
attestations d'inscription sur les listes d'aptitude du **CAMES**, effectifs par filière depuis
l'ouverture, équipements (25 ha exigés pour l'agronomie), **efficacité interne (taux de réussite)** et
**externe (taux d'insertion)**.

---

## 7. Formation des maîtres

| Sigle | Nom lu | Rôle | Source |
|---|---|---|---|
| **ENI** | Écoles Normales d'Instituteurs — **6** : Abomey, Allada, Djougou, Dogbo, Kandi, Porto-Novo | formation initiale des instituteurs maternel/primaire | memp.gouv.bj/ministere/ecoles-normales — **OFFICIEL** |
| **INFRE** | Institut National pour la Formation et la Recherche en Éducation | formation continue et initiale (normaliens, élèves-inspecteurs, conseillers) | memp.gouv.bj/ua/infre + décret 2004-095 art. 68 — **OFFICIEL** |
| **EFPEEN** | École de Formation des Personnels d'Encadrement de l'Éducation Nationale (ex-CFPEEN) | inspecteurs et conseillers pédagogiques ; accès **par concours national**, statut de **stagiaire** | décret 2015-461 du 07/09/2015 — **OFFICIEL** |
| ENS (Porto-Novo), ENS Natitingou, ENSET Lokossa, INSPEI | formation supérieure des maîtres et d'ingénieurs | rattachées UAC / UNSTIM | décret 2016-638 + sites — **OFFICIEL** |
| « Sapientia » | école privée de formation des enseignants du secondaire (BAPEP/CAPES) | agrément 2019 | note 800 — **OFFICIEL-OCR** |
| **IFIE**, **IUPMF** | — | — | **NON CONFIRMÉS** |

---

## 8. Sources de données machine-readables (le plus actionnable)

1. **HDX / HOT — « Education Facilities of Benin »** : GeoJSON, GeoPackage, SHP, KML, rafraîchissement
   automatique (dernier vu le 07/09/2026). `data.humdata.org/dataset/hotosm_ben_education_facilities` ;
   API CKAN `…/api/3/action/package_show?id=hotosm_ben_education_facilities`. **Géolocalisation, pas un
   registre d'autorité** : 433 des 469 CEG n'ont pas de géométrie ; à marquer « non officiel ».
2. **Table HTML OSM WikiProject Benin/Schools** : le nominatif de 469 CEG publics (nom, département,
   commune, nœuds OSM), repris du répertoire officiel aujourd'hui hors ligne — parseable.
3. **CatIS / X-Road** : toute fiche service ou institution en JSON
   (`/publicservices/PSxxxxx/download?format=json`, `/institutions/INxxxxx/download?format=json`).
   Structurellement exploitable (autorité, textes, canaux), **pas un annuaire d'écoles**.
4. **MEMP — statistiques** : 71 séries embarquées dans la page (`allStats`) + export CSV par indicateur,
   et `donnees-cep` avec CSV par session. **La source de chiffres primaires la plus riche du pays.**
5. **Geofabrik** : `download.geofabrik.de/africa/benin-latest.osm.pbf` (vérifié) → extraction
   `amenity=school|college` par Overpass.
6. HeiGIT/HDX « accessibilité écoles » : `hot.storage.heigit.org/heigit-hdx-public/access/ben/BEN_education_access_long.csv` (+ GeoPackage).
7. Banque mondiale — PAR P175768 (2024) : PDF 5,9 Mo **non dépouillé**, actions par établissement.
8. **Hors service ou fermés aux robots** : `instad.bj` (503), `data.gov.bj` et `cartostat.bj`
   (n'existent pas), `Open Data For Africa` (403 Cloudflare), `educmaster.bj` (aucune API publique
   documentée, seul `/api/auth` vu), `education.benin.bj` (DNS mort).

---

## 9. Ce que cette recherche contredit dans le code BEILE actuel

À trancher avant toute mise en base (rien n'est modifié ici) :

1. **`BT` et `BEP`** figurent partout : `packages/contracts/src/certification.ts:11,27,28`
   (`DiplomeAtteste`, `NOM_DIPLOME_ATTESTE`), `enseignement-superieur.ts:36` (`Diplome`),
   `etudiants-superieur.ts:469,472` (`MODES_CERTIFICATION` qui les déclare **examens nationaux**),
   `:536, :566` (`ExamenNational`, `CODE_CERTIFICAT`) et les trois miroirs db
   (`DIPLOMES`, `DIPLOMES_ATTESTES`, `EXAMENS_NATIONAUX` dans `packages/db/src/schema.ts`). Or **aucune
   source officielle lue ne les mentionne** : le Bénin certifie CAP, DT/DTM, BAC technique, CQP, CQM, BTS,
   DTSBM. Deux précautions : (a) tant que le texte fait défaut, les afficher comme « examen national »
   est une invention ; (b) les **retirer d'un `z.enum` casse le rejeu** de tout `CERTIFICATION` ou
   `DIPLÔME` déjà enregistré avec cette valeur — la colonne `text` n'a pas de CHECK, donc la base ne dit
   rien, seul le contrat refuse. Retirer = décision à prendre en connaissance de ce point, pas un nettoyage.
2. **`ONEC`** : l'assertion `apps/api/src/recette.ts:158` interdit déjà ce sigle dans l'autorité d'une
   session — bien joué. Mais `recette.ts:291` écrit comme motif de révocation « Fraude établie par
   l'ONEC », et ce motif est ensuite **affiché au public** sur `/verifier/[id]`. Au Bénin l'autorité
   d'examen est la **DEC** (DEC-MESTFP pour CEP/BEPC/CAP/DT/BAC, DEC-MESRS pour licence/master/BTS) ;
   `ONEC` est ivoirien. Une ligne à changer dans la recette.
3. **`INFP` / `IRFP`** : `apps/web/src/lib/enseignement-superieur.ts:104` libelle
   `institut_national_formation_professionnelle: "INFP"` et `institut_regional_formation_professionnelle:
   "IRFP"`. **`INFP` est haïtien** ; `IRFDE` et `CFP` comme sigle officiel n'ont été rencontrés nulle part.
   Les termes lus sont **CFPA, LTP, LTA, CMTH, CFTH, CFME, INIFRCF, ADET**.
4. **`packages/db/src/superieur.ts`** (seed non commité) : id `ETB-SUP-UAC-FDSP` avec le sigle `FADESP`
   (incohérence interne), et « Centre de formation professionnelle de Porto-Novo » alors que le réseau lu
   s'appelle **CFPA**. Ses 20 lignes d'établissements et 18 filières sont des **hypothèses invérifiables**
   (capacités, séries de bac exigées, critères d'orientation) : à recalrer sur le §5 avant tout usage, et
   à garder marqué « démonstration ».
5. **UNSTIM / UNA / UAC** : le siège de l'UNSTIM est **Abomey** (Collines), celui de l'UNA **Porto-Novo** ;
   les composantes réelles sont FSS, FADESP, FASEG, FAST, FASHS, FLLAC, FSA, EPAC, ENEAM, ENS, ENSTIC
   (UAC), ENSTP, ENS Natitingou, ENSET Lokossa, IUT Lokossa, FAST Natitingou, ENSBBA, INSPEI (UNSTIM).
   Les hypothèses « Université de Malanville », « Nam-Lodi », « Université des Métiers de la Santé »,
   « IFIE », « IUPMF », « ESBTP Cotonou » doivent rester hors du catalogue.
6. **Asymétrie privé/public** : les examens nationaux de licence et de master visent les **filières non
   homologuées des EPES** (décret 2020-551, CatIS PS00939/940/945). Notre
   `MODES_CERTIFICATION` (`etudiants-superieur.ts:463-472`) doit rendre cette distinction au lieu de
   laisser croire que toute licence est un examen national.
7. **BTS** : CatIS l'attribue à la **DEC-MESRS** alors que CAP/DT relèvent de la **DEC-MESTFP** — à
   re-vérifier avant d'encoder l'office délibérant.
8. **Terminologie à aligner sur les textes lus** : `EPP` (école primaire publique), `enseignement
   maternel`, `crèche et école maternelle`, `circonscription scolaire` tenue par un `IEP/CCS`, zone
   pédagogique tenue par un `CP`, `DDEMP`, `DDESTFP`, `DESG/DESTFP/DGES/DEPES/DPP`. À écarter : **IEN**,
   **EPPT**, **EPEE**, **CDPE** (non rencontrés).
9. Aucun **montant**, aucune donnée de sensibilité 4 : les redevances lues (3 000 F, 5 000 F, 1 200 F,
   500 F) sont un tarif administratif, pas une information à servir dans le registre d'un élève.

---

## 10. Lacunes, et ce qu'il faut demander pour les combler

- **Total national actuel d'EPES** : non vérifié → écrire à la **DEPES/DGES** (`mesrs.depes.infos@gouv.bj`).
- **Liste nominative des collèges et lycées privés autorisés** : pas de registre public en ligne →
  **SEPriv-ESG** / **DPAF-MESTFP**.
- **Nombre de lycées publics** et millésime des 880 / 460 / 1 696 : **DESG**, annuaire statistiques.
- **Périmètres des séries MEMP** (deux séries d'apprenants et d'enseignants qui se contredisent) : **DEP /
  Direction des Statistiques**.
- **Liste complète des 28 UFR de l'UAC**, orthographe figée des écoles de l'**UNA**, ville de l'**INSPEI** :
  secrétariats des universités (les pages `una.bj` et `univ-parakou.bj` rendent en JavaScript, donc vides
  au `curl`).
- **Tutelle de l'ENAM**, statut d'EPAC sous ce sigle : textes à obtenir.
- **Arrêtés annuels DEC-MESTFP** pour le mécanisme exact BEPC/BAC (scolarisé vs candidat libre, centre,
  numéro de table) : les instructions 2025 n'ont été vues que sur Scribd.
- **Passerelles BTS/DT → licence professionnelle** : les conditions d'admission n'ont été lues nulle part.
- **Carte des circonscriptions** et effectifs par circonscription : non publiée.
- Les PDF officiels béninois sont **souvent scannés sans couche de texte** (`LISTE_EPES_ACTUALISEE.pdf`,
  `AOF_DESTFP_SIGNE.pdf`) : prévoir un passage en OCR et l'indiquer comme niveau de vérification.

## Annuaire des sources citées

sgg.gouv.bj (décrets 2016-638, 2020-551, 2021-379, 2021-569, 2021-570, 2007-279, 2004-095, 2015-461,
loi 2003-17) · enseignementsuperieur.gouv.bj (+ LISTE_EPES_ACTUALISEE.pdf, guide orientation 2024-25) ·
decsup.bj · uac.bj · una.bj · unstim.bj · univ-parakou.bj · epac-uac.bj ·
enseignementsecondaire.gouv.bj (ESG, organismes sous tutelle, directions, guide Métiers d'avenir 2023) ·
memp.gouv.bj (documentation/11 et /12, statistiques, donnees-cep, ua/dec, ua/infre,
ministere/ecoles-normales, directions-departementales) · catis.xroad.bj (PS00169, PS00170, PS00175,
PS00196, PS00199, PS00200, PS00201, PS00268, PS00278, PS00577, PS00593, PS00702, PS00882-887, PS00939,
PS00940, PS00945, PS01029, PS01107, PS01178-1180, PS01194, PS01536 ; IN00045, IN00046, IN00048, IN00117,
IN00118, IN00119, IN00124, IN00127, IN00129, IN00132, IN00142, IN00212) · data.humdata.org
(hotosm_ben_education_facilities) · wiki.openstreetmap.org/wiki/WikiProject_Benin/Schools ·
download.geofabrik.de · cmabenin.bj · adet.bj · educmaster.bj · eresultats.bj · lechasseurinfos.bj
(piste de vérification, non officielle) · matinlibre, acotonou, visa-infobenin, RFI (presse).
