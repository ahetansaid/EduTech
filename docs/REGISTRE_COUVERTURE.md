# Registre d'extension et de couverture du système éducatif

> Document de travail vivant. **Toute nouvelle idée entre ici avant de modifier l'architecture.**
> Cible finale : le graphe numérique du système éducatif béninois — MEMP (maternel, primaire), MESTFP (secondaire général et technique, formation professionnelle, alphabétisation, langues nationales), MESRS (supérieur, recherche) — et non une application scolaire.

## 1. La grille de lecture : cinq couches

| Couche | Question |
|---|---|
| 1. Personnes | Qui apprend, enseigne, accompagne ou administre ? |
| 2. Processus | Que fait réellement chaque acteur ? |
| 3. Systèmes | Quel outil existe déjà pour ce processus ? |
| 4. Données | Quelle information est produite, par qui, à quelle fréquence, avec quelle qualité ? |
| 5. Intelligence | Qu'est-ce que cette information permet de comprendre, décider ou anticiper ? |

Modèle directeur : **Personne → Parcours → Institutions → Services → Territoire → Données → Décisions → Résultats**, et la boucle **Observer → Comprendre → Décider → Agir → Mesurer → Apprendre**.

## 2. Les dix moteurs fondamentaux

Les fonctionnalités s'appuient sur ces moteurs ; aucun module ne réimplémente ce qu'un moteur fournit.

| # | Moteur | Rôle | État dans le dépôt |
|---|---|---|---|
| 1 | Identité | Identité éducative ancrée sur l'identité nationale (NPI) ; aucune identité civile créée | Prototype : registre national simulé, procédure pour l'enfant sans acte |
| 2 | Accès et politiques | RBAC + ABAC (rôle, périmètre, relation, finalité), journalisation des refus | Prototype : `packages/simulation/src/abac.ts` ; production : API + RLS |
| 3 | Workflow | Demandes, validations, transferts, réclamations, inspections, sans coder chaque circuit en dur | Schéma `workflow` créé ; moteur à construire |
| 4 | Événements | Registre en ajout seul, parcours reconstitués, corrections tracées | Prototype + schéma `ledger` (ajout seul) |
| 5 | Qualité des données | Doublons, incohérences, valeurs impossibles, fraîcheur, couverture | Prototype : indice de confiance, couverture ; règles à étendre |
| 6 | Interopérabilité et API | Contrats versionnés, validation de schéma, provenance, source de vérité | API v1 (Hono) ; connecteurs ANIP / EducMaster / examens à écrire |
| 7 | SIG | Carte, distances, accessibilité, planification | Prototype : carte SVG, 77 communes ; PostGIS au schéma |
| 8 | Notifications | Multicanal (application, courriel, SMS, push), dérivées des faits | Prototype : notifications dérivées des événements |
| 9 | Documents et certificats | Coffre numérique, empreinte, signature, QR, révocation | Prototype : diplômes vérifiables, détection d'altération |
| 10 | Intelligence éducative | Couche sémantique, requête contrôlée, simulation, alerte précoce | Prototype : dictionnaire, Ask Education, simulation « et si ? » |

## 3. Registre des processus

Légende action : **D** digitaliser · **I** intégrer un système existant · **E** exposer par API · **S** laisser au système source.
Sensibilité : 1 public · 2 professionnel · 3 personnel · 4 hautement sensible.
Priorité : **P1** socle · **P2** extension rapide · **P3** infrastructure nationale.
Prototype : ✅ démontré · 🟡 partiel · ⬜ non couvert.

### 3.1 Identité, parcours, apprentissage

| Univers | Processus | Acteurs | Données | Système existant | Action | Moteurs | Sens. | Prio. | Proto. |
|---|---|---|---|---|---|---|---|---|---|
| Identité | Rattachement d'une personne au registre national | Établissement, ANIP | NPI, filiation | ANIP | I | 1, 6 | 4 | P1 | ✅ |
| Identité | Rattrapage des enfants sans acte d'état civil | Établissement, ANIP | Identité déclarative | ANIP | D + I | 1, 3 | 4 | P1 | ✅ |
| Identité | Rôles multiples d'une même personne (enseignant et parent) | Tous | Habilitations | — | D | 1, 2 | 3 | P1 | ✅ |
| Parcours | Inscription et réinscription | Famille, établissement | Inscription, classe | EducMaster | D + I | 4, 1 | 3 | P1 | ✅ |
| Parcours | Transfert en cours d'année | Deux établissements | Événement de transfert | EducMaster | D | 4, 3 | 3 | P1 | ✅ |
| Parcours | Bifurcations (générale, technique, apprentissage, abandon, retour) | Apprenant, conseiller | Transitions | À identifier | D | 4 | 3 | P2 | 🟡 |
| Parcours | **Parcours parallèles** (étudiant + formation professionnelle + certification) | Apprenant, institutions | Parcours multiples | À identifier | D | 4 | 3 | P2 | ⬜ |
| Parcours | Formation continue, reconversion, apprentissage tout au long de la vie | Adultes, centres | Formations courtes | À identifier | D | 4, 9 | 3 | P3 | ⬜ |
| Apprentissage | Suivi pédagogique (appel, notes, bulletins) | Enseignant | Présences, évaluations | EducMaster | D | 4, 8 | 3 | P1 | ✅ |
| Apprentissage | **Moteur de compétences** (maîtrisée, en progression, à renforcer) | Enseignant, apprenant | Compétences par référentiel | À identifier | D | 4, 10 | 3 | P2 | ⬜ |
| Apprentissage | Remédiation, tutorat | Enseignant, conseiller | Plans d'accompagnement | — | D | 3 | 3 | P2 | 🟡 |
| Ressources | Graphe national des ressources éducatives (manuels, cours, vidéos par compétence) | Enseignants, apprenants | Ressources indexées | MOOC, plateformes existantes | I + E | 6 | 1 | P3 | ⬜ |
| Langues | Contenus et interfaces multilingues, alphabétisation | MESTFP, centres | Contenus | À identifier | D | 8 | 1 | P3 | ⬜ |
| Non formel | Centres d'alphabétisation, apprenants adultes, acquis hors système formel | Centres communautaires | Parcours non formels | À identifier | D | 4, 9 | 3 | P3 | ⬜ |

### 3.2 Personnels, établissements, territoire

| Univers | Processus | Acteurs | Données | Système existant | Action | Moteurs | Sens. | Prio. | Proto. |
|---|---|---|---|---|---|---|---|---|---|
| RH | Passeport professionnel de l'enseignant | Enseignant, DRH | Carrière, formations | Services enseignants MEMP | I + D | 4, 1 | 3 | P1 | ✅ |
| RH | Affectation et mutation | DRH, directions départementales | Postes, besoins | À identifier | D + I | 3, 4 | 3 | P1 | 🟡 |
| RH | Analyse des déficits (disciplines, zones, départs prévus) | Pilotage | Agrégats | — | D | 10, 7 | 2 | P2 | 🟡 |
| RH | Formation continue (dont « enseignant augmenté par l'IA ») | Enseignants, MEMP | Inscriptions, validations | MEMP | D | 4, 3 | 2 | P2 | ✅ |
| Établissements | Jumeau numérique de l'établissement (classes, salles, équipements, services) | Direction | Référentiel établissement | Annuaire statistique | D | 7, 5 | 2 | P1 | 🟡 |
| Établissements | Patrimoine : état des bâtiments, énergie, eau, sanitaires, accessibilité, risques | Direction, inspection | Inventaire | À identifier | D | 7 | 2 | P2 | 🟡 |
| Établissements | Public, privé, confessionnel, technique, communautaire (agrément, gestionnaire) | Établissements, ministères | Statut, agrément | À identifier | D | 1, 3 | 2 | P1 | 🟡 |
| Conformité | Dossier numérique de l'établissement, non-conformités, actions correctives | Inspection | Inspections | À identifier | D | 3 | 2 | P2 | ⬜ |
| Inspection | Missions sur tablette, grilles, recommandations, hors connexion | Inspecteurs, conseillers | Observations | À identifier | D | 3, 5 | 2 | P2 | ⬜ |
| Territoire | Carte scolaire, zones prioritaires, accessibilité (distance, temps d'accès) | Pilotage | Géographie, agrégats | Portail statistique MEMP | D | 7, 10 | 1 | P1 | ✅ |
| Territoire | Planification et simulation (« si 2 000 élèves arrivent… ») | Pilotage | Projections | — | D | 10, 7 | 1 | P2 | ✅ |
| Transport | Localisation approximative et temps d'accès (données individuelles très protégées) | Pilotage | Distances agrégées | — | D | 7 | 4 | P3 | ⬜ |

### 3.3 Examens, orientation, emploi

| Univers | Processus | Acteurs | Données | Système existant | Action | Moteurs | Sens. | Prio. | Proto. |
|---|---|---|---|---|---|---|---|---|---|
| Examens | Inscription, éligibilité, convocation, centre, correction, délibération | Candidats, centres | Candidatures, résultats | EducMaster, système d'examens | I | 3, 4 | 3 | P1 | ✅ |
| Certification | Délivrance et **API de vérification** (sans accès au dossier) | Tiers | Diplômes | EducMaster (relevés CEP) | D + E | 9, 6 | 2 | P1 | ✅ |
| Coffre | Coffre numérique : bulletins, attestations, relevés, décisions, versions, révocation | Apprenants, institutions | Documents signés | — | D | 9 | 3 | P2 | 🟡 |
| Orientation | Orientation scolaire, professionnelle, universitaire, réorientation | Apprenant, conseiller | Résultats, compétences, intérêts, offre | À identifier | D | 10, 3 | 3 | P1 | 🟡 |
| Emploi | Insertion : formations → secteurs d'emploi (analyses agrégées) | Pilotage, partenaires | Agrégats | Systèmes emploi | I | 6, 10 | 2 | P3 | ⬜ |
| Supérieur | Admissions, parcours étudiants | Universités | Inscriptions | Systèmes universitaires (MESRS) | I | 6, 4 | 3 | P3 | ⬜ |
| Recherche | Chercheurs, laboratoires, projets, publications, financements | MESRS | Registre de la recherche | À identifier | I | 6 | 2 | P3 | ⬜ |

### 3.4 Inclusion, protection, bien-être (compartiment sensible)

| Univers | Processus | Acteurs | Données | Système existant | Action | Moteurs | Sens. | Prio. | Proto. |
|---|---|---|---|---|---|---|---|---|---|
| Inclusion | Besoins éducatifs particuliers, aménagements d'examen | Établissement, services | Besoins, aménagements | À identifier | D | 2, 3 | 4 | P1 | 🟡 |
| Décrochage | **Système d'alerte précoce** (absences, baisse, changements, interruption) → vérification humaine | Établissement, conseiller, famille | Signaux | — | D | 10, 3, 8 | 3 | P1 | 🟡 |
| Protection | Signalements (harcèlement, violences), gestion de cas, besoin d'en connaître | Référents habilités | Cas chiffrés | — | D | 3, 2 | 4 | P2 | ⬜ |
| Santé | Visites médicales, vaccinations, santé mentale : **interface avec le système de santé**, pas de dossier médical centralisé | Services de santé | Références, pas de contenu | Système santé | E | 6 | 4 | P3 | ⬜ |
| Alimentation | Cantines, couverture, bénéficiaires (analyses agrégées) | PNASI, établissements | Couverture | PNASI | I | 6, 10 | 2 | P2 | ⬜ |

### 3.5 Financement, partenaires, gouvernance, services

| Univers | Processus | Acteurs | Données | Système existant | Action | Moteurs | Sens. | Prio. | Proto. |
|---|---|---|---|---|---|---|---|---|---|
| Financement | Budget → programme → projet → établissement → dépense → résultat ; coût par apprenant | Ministères, finances | Budget, dépenses | Systèmes budgétaires | I | 6, 10 | 2 | P3 | ⬜ |
| Partenaires | Registre des programmes (zone, bénéficiaires, budget, indicateurs), coordination | PTF, ONG, collectivités | Programmes | — | D | 3, 7 | 2 | P2 | ⬜ |
| Communication | Calendrier, annonces, convocations, alertes multicanal | Ministères, établissements | Messages | — | D | 8 | 1 | P2 | 🟡 |
| Service | **Service d'assistance** (réclamations, corrections de données, suivi, escalade) | Tous | Tickets | — | D | 3, 8 | 3 | P2 | ⬜ |
| Gouvernance | Dictionnaire, propriétaire, gestionnaire, source de référence, règle de qualité, politique d'accès, conservation | Gouvernance des données | Métadonnées | — | D | 5, 10 | 2 | P1 | 🟡 |
| Qualité | Détection des doublons, incohérences, valeurs impossibles, anomalies | Gouvernance | Règles | — | D | 5 | 2 | P1 | 🟡 |
| Temporalité | Validité dans le temps de chaque information (affectations, référentiels, programmes) | Tous | Périodes de validité | — | D | 4 | 2 | P1 | 🟡 |
| Données ouvertes | Portail public agrégé (aucune donnée personnelle) | Public, chercheurs | Agrégats | Portail statistique MEMP | D + E | 6, 10 | 1 | P2 | 🟡 |
| API nationale | Vérifications autorisées pour EdTech, universités, organismes (jamais le dossier complet) | Partenaires | Réponses minimales | — | E | 6, 2 | 2 | P2 | 🟡 |
| Hors connexion | Saisie locale, synchronisation, validation (enseignants, inspections, collectes) | Terrain | File locale | — | D | 4, 5 | 3 | P1 | ✅ |
| Accessibilité | Handicaps, faible débit, petits écrans, faible littératie numérique : dans le design system | Tous | — | — | D | — | — | P1 | 🟡 |

## 4. Règles d'usage du registre

1. Une idée nouvelle devient une ligne ici avant tout développement.
2. Une ligne ne passe en développement que si son moteur existe ou est planifié.
3. Toute donnée de sensibilité 4 vit dans le compartiment `sensible` : chiffrement, accès au besoin d'en connaître, journalisation, durée de conservation.
4. Pour chaque donnée, une **source de référence unique** est désignée ; les autres systèmes la consultent, ils ne la recopient pas.
