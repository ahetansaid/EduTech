# Bibliothèque numérique BEILE — note de cadrage

*Octobre 2026 · document de décision · aucune ligne de code engagée*

## 1. La thèse

Le Bénin n'a pas besoin d'un catalogue de PDF de plus. Il a besoin que **la bonne ressource arrive au bon élève au bon moment, même sans connexion**.

BEILE est la seule plateforme qui sait déjà, pour chaque élève : son niveau, sa classe, ses notes par matière et par trimestre, ses absences, l'examen national qu'il passera et sa date au calendrier officiel, sa série, ses vœux d'orientation. Pour l'étudiant : sa filière, ses UE, ses crédits. Une bibliothèque branchée sur ces faits devient un **outil de remédiation et d'égalité des chances**, pas une étagère.

Ce qui coûte, c'est **le contenu, ses droits et sa validation**, pas le code.

## 2. Ce que BEILE a déjà, et ce qui manque

| Brique existante | Usage pour la bibliothèque |
|---|---|
| Rôles, périmètres, ABAC, journal | Qui voit, qui publie, qui valide ; trace de chaque consultation sensible |
| Moteur de circuits (demandes, étapes, échéances) | Circuit de validation pédagogique d'une ressource |
| Calendrier officiel en base | Faire remonter les annales avant l'épreuve ; embargo des sujets |
| Sessions d'examen (CEP, BEPC, BAC), séries | Annales rangées par examen, session, série |
| Registre des diplômes, sceau, révocation | Mémoires et thèses rattachés à un diplôme authentique ; retrait d'une ressource fautive avec trace |
| Notifications | « Nouvelle ressource pour ta classe », « Annales du BEPC disponibles » |
| File hors connexion de l'enseignant | Modèle pour les paquets hors ligne |
| `besoinsParticuliers` sur l'apprenant | Proposer d'office les formats accessibles (audio, gros caractères) |
| Seuil de publication des indicateurs | Statistiques d'usage sans réidentification |

**Ce qui manque, et conditionne la valeur** :

1. **Un référentiel des programmes officiels** (niveau × matière × chapitre ou compétence). Il n'existe pas dans le code. Sans lui, on ne peut que dire « faible en mathématiques », pas « faible en fractions ». C'est le premier chantier, et il sert bien au-delà de la bibliothèque : cahier de textes, progression, couverture du programme.
2. **Le rattachement d'une évaluation à un chapitre** (facultatif à la saisie de note). C'est ce qui rend la remédiation précise. Sans ce rattachement, on recommande au niveau de la matière, ce qui reste honnête mais grossier.
3. **Des disciplines au-delà des 7 matières** actuelles (philosophie, enseignement technique, langues, EPS…).
4. **Un stockage de fichiers.** Vercel n'est pas fait pour cela.

## 3. Parcours par profil

**Élève**
- « Pour toi » : ressources des matières où sa moyenne baisse, au chapitre près quand l'évaluation le précise.
- À l'approche de l'examen (CM2, 3e, Tle) : annales de sa série, avec corrigés, compte à rebours lié au calendrier.
- Téléchargement en paquet (« Mathématiques 3e — T2 ») pour réviser hors ligne.

**Parent**
- Pas de catalogue : une suggestion courte (« trois fiches pour accompagner Koffi en fractions »).
- Format audio pour un parent qui ne lit pas le français. Les langues nationales viendront dans un second temps.

**Enseignant**
- Ressources des points faibles **de sa classe**, pas de ses élèves pris un par un : son tableau de classe dit déjà où la classe décroche.
- Auteur : il dépose une fiche ou une séquence, qui part en validation. **Une ressource validée est inscrite à son parcours professionnel** (l'écran Carrière existe déjà). C'est la reconnaissance, et donc la motivation à produire.
- Banque de sujets pour les évaluations formatives.

**Chef d'établissement**
- Paquet de classe à distribuer (salle informatique, vidéoprojecteur, serveur local).
- Vue de ce qui est utilisé dans son école, en agrégé.

**Inspecteur et conseiller pédagogique**
- Valideur de sa discipline et de sa circonscription, dans le circuit de validation.
- Voit les chapitres où sa circonscription décroche, et les ressources qui manquent pour y répondre : la carte des besoins devient la commande éditoriale.

**Étudiant et université**
- Dépôt des mémoires et thèses, rattachés au diplôme du registre (authenticité opposable, empreinte).
- Cours et supports par UE, liés au contrat pédagogique.

**Chercheur**
- Statistiques d'usage agrégées, sous seuil de publication : ressources consultées, liens avec la progression.
- Jamais de trace individuelle.

**Public**
- Annales et ressources libres sans compte, comme l'annuaire et les résultats.

## 4. Ce qu'il faut anticiper

### 4.1 Droits : la décision qui commande tout

- **Libre de droits ou sous licence libre** : annales des examens nationaux (à confirmer auprès des directions des examens), productions des enseignants publiées sous licence choisie au dépôt (CC BY par défaut, CC BY-NC possible), mémoires avec accord écrit de l'auteur, ressources internationales sous licence libre.
- **Sous droits** : manuels de l'INFRE et des éditeurs. Ils exigent une **licence nationale négociée** (accès pour tout compte BEILE authentifié, sans téléchargement libre, filigrane nominatif). C'est une négociation, pas un développement.
- **Recommandation** : lancer avec le seul contenu libre, et ouvrir la négociation en parallèle. Chaque ressource porte sa licence, sa source et son ayant droit : **pas de licence, pas de publication**.

### 4.2 Validation et responsabilité

Une erreur diffusée par une plateforme d'État engage l'État. Le circuit proposé :

1. dépôt ;
2. contrôle de forme (licence, métadonnées, format) ;
3. validation pédagogique par l'inspection ou le conseiller de la discipline ;
4. publication.

Une ressource fautive se **retire avec trace**, comme un diplôme révoqué. Elle ne s'efface pas : ceux qui l'ont téléchargée sont prévenus. Chaque ressource publiée porte une **empreinte**, pour qu'une copie altérée qui circule sur WhatsApp soit détectable sur la page de vérification, qui existe déjà pour les diplômes.

### 4.3 Coût des données et coupures

- Aucune vidéo par défaut. Privilégier le texte, le PDF compressé et l'audio basse résolution. Le poids s'affiche **avant** chaque téléchargement.
- Paquets hors ligne par niveau, matière et trimestre, mis en cache par l'application, avec mise à jour **différentielle** (on ne retélécharge que ce qui a changé).
- **Serveur d'école hors réseau** : pour une école sans internet, un petit serveur local (type Raspberry Pi, sur le modèle éprouvé de Kiwix ou RACHEL) qui diffuse la bibliothèque en Wi-Fi dans l'enceinte, et se met à jour quand quelqu'un passe en ville avec une clé ou une connexion. C'est l'idée qui change l'échelle de la bibliothèque, à chiffrer avec les partenaires.
- Partage de paquet de téléphone à téléphone : à étudier. L'empreinte permet de vérifier qu'un paquet reçu n'a pas été modifié.

### 4.4 Fraude aux examens

- Les annales sont publiées **après** l'épreuve, jamais avant. L'embargo est lié à la date de l'épreuve au calendrier officiel, et le serveur le fait respecter, pas l'interface.
- Les banques de sujets formatifs restent réservées aux enseignants.

### 4.5 Accessibilité et langues

- Formats accessibles proposés d'office quand le dossier signale des besoins particuliers (lecture vocale, gros caractères, contraste élevé).
- Audio en langues nationales (fon, yoruba, bariba, dendi…) pour l'accompagnement des familles : priorité éditoriale, avec des partenaires de radios communautaires.

### 4.6 Intelligence artificielle : utile, sous garde-fous

- **Oui** pour la recherche plein texte, l'OCR des annales scannées, la suggestion de métadonnées (niveau, chapitre) soumise au valideur, et un quiz généré **à partir d'une ressource validée** puis relu.
- **Non** pour un contenu officiel produit par une IA sans validation humaine, ou un « tuteur » qui inventerait une réponse à un élève. Toute production automatique passe par le même circuit que celle d'un enseignant.

### 4.7 Vie privée et mesure d'impact

- On mesure l'usage **agrégé** (par classe, école, circonscription), sous le seuil de publication déjà appliqué aux indicateurs.
- L'historique de lecture d'un élève n'est visible que par lui et sa famille. Il n'apparaît jamais dans un tableau de l'établissement.
- La question qui justifiera le budget : **les classes qui utilisent les ressources de remédiation progressent-elles plus ?** Elle se mesure par comparaison agrégée, sans suivre personne.

### 4.8 Souveraineté et coûts

- Fichiers en stockage objet. L'hébergement au Bénin ou dans la région est à préférer pour les données de l'État, à arbitrer avec l'hébergeur national s'il en existe un éligible.
- Coût variable surtout lié à la bande passante, d'où le cache, les paquets et le serveur d'école.

### 4.9 Ne pas devenir un projet éditorial déguisé

Le risque principal n'est pas technique. Une bibliothèque vide déçoit plus qu'une absence de bibliothèque. Il faut **un comité éditorial nommé** (ministères, inspection, enseignants auteurs) et **un stock de départ réel** avant l'ouverture.

## 5. Modèle de données (esquisse)

- **ressource** : titre, type (annale, corrigé, fiche, séquence, audio, mémoire, cours d'UE), niveau(x), matière, chapitres (référentiel), série, examen et session, langue, licence, ayant droit, auteur (profil), poids, empreinte, statut (déposée, en validation, publiée, retirée).
- **version** : une ressource corrigée est une nouvelle version. L'ancienne reste consultable, marquée « remplacée ».
- **validation** : réutilise le moteur de circuits (`demandes`, `decisions`), avec un nouveau modèle de circuit `RESSOURCE`.
- **paquet hors ligne** : liste de ressources et de versions, empreinte globale, poids.
- **référentiel des programmes** : niveau × matière × chapitre ou compétence, versionné comme le dictionnaire des indicateurs.
- **usage** : compteurs agrégés par jour et par maille. Aucune ligne par élève côté pilotage.

## 6. Architecture

- **API Hono existante** : catalogue, métadonnées, droits, circuits, recommandations.
- **Stockage objet** (compatible S3) derrière un CDN. Liens de téléchargement signés et à durée courte pour les contenus sous licence.
- **Recherche plein texte** et **OCR des annales scannées**. La stack GED Intelligent de Drwintech (MinIO, Elasticsearch, MinerU) couvre exactement ces besoins : deux options sont à arbitrer :
  - un **service documentaire séparé**, que BEILE appelle ;
  - **reprendre les briques** dans BEILE.

  Le service séparé isole les coûts et le risque, mais demande une intégration (authentification de service, sur le modèle des connecteurs signés existants).
- **Front** : service worker et cache des paquets, ce qui est aussi le chantier du « mode économie de données » déjà recommandé.

## 7. Phasage proposé

**Phase 0 — prérequis (code pur)**
- Référentiel des programmes, au moins pour les trois classes d'examen.
- Rattachement facultatif d'une évaluation à un chapitre.
- Service worker.

**Phase 1 — démontrable devant le jury**
- Annales CEP, BEPC, BAC (contenu libre, à confirmer) avec embargo calendaire.
- « Pour toi » côté élève, au niveau de la matière, puis du chapitre dès que les évaluations le portent.
- Circuit de validation par l'inspection.
- Empreinte et page de vérification.
- Paquet hors ligne d'un niveau.

**Phase 2**
- Enseignants auteurs, et inscription au parcours professionnel.
- Ressources de classe pour l'enseignant.
- Statistiques d'usage agrégées.
- Formats accessibles.

**Phase 3**
- Dépôt des mémoires et thèses, lié au registre des diplômes.
- Cours par UE.
- Serveur d'école hors réseau (pilote dans quelques établissements).
- Audio en langues nationales.
- Licence nationale avec les éditeurs, si elle est négociée.

## 8. Décisions à prendre

1. **Droits** : contenu libre seulement au lancement, et ouverture de la négociation avec l'INFRE et les éditeurs ? Qui porte cette négociation ?
2. **Stockage** : service documentaire séparé (stack GED) ou intégré à BEILE ? Hébergement : où ?
3. **Validation** : l'inspection et les conseillers pédagogiques sont-ils les valideurs ? Qui nomme le comité éditorial ?
4. **Stock de départ** : qui fournit les annales (directions des examens) et sous quel délai ?
5. **Jury** : présenter la phase 1 en démonstration, ou la vision complète avec la phase 0 réalisée ?
6. **Référentiel des programmes** : quelle source officielle fait foi (programmes en vigueur par niveau), et qui la fournit ?
