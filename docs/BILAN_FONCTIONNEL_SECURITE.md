# BEILE — Bilan fonctionnel et niveau de sécurité

> Octobre 2026. Plateforme en production : front https://edu-tech-api-rho.vercel.app · API https://beile-api.vercel.app.
> Complète [SECURITE.md](SECURITE.md) et [SECURITE_COMPTES.md](SECURITE_COMPTES.md). Les identifiants de test sont dans
> `GUIDE-TESTS.local.md` (fichier local, jamais commité).

## Échelle de sécurité utilisée

| Niveau | Signification |
|---|---|
| **A** | Contrôle serveur + seconde barrière (base de données, déclencheur, scellé) + couvert par la recette automatique |
| **B** | Contrôle serveur couvert par la recette ; pas de seconde barrière en base |
| **C** | Contrôle serveur présent, non couvert par un test automatique, ou dépendant d'une décision d'exploitation |

## 1. Socle commun

| Fonctionnalité | Ce qu'elle fait | Sécurité | Niveau |
|---|---|---|---|
| Connexion | Identifiant + mot de passe (scrypt), session serveur 12 h en cookie HttpOnly, CSRF en double soumission | Verrouillage 15 min après 5 échecs sans révéler qu'un compte existe ; plafond par adresse partagé entre instances ; mots de passe courants refusés | A |
| Mot de passe initial | Imposé à la première connexion | L'API ne sert rien d'autre tant qu'il n'est pas changé | B |
| Activation et récupération par code | Code à 6 chiffres par SMS ou courriel | Empreinte HMAC seulement, 10 min, 5 essais consommés atomiquement, réponse identique et de durée constante | B (canaux fermés en production tant qu'aucun fournisseur n'est configuré) |
| Second facteur | Application d'authentification (TOTP), clé FIDO2, 10 codes de secours | Obligatoire niveaux 0 à 2 ; secret chiffré AES-256-GCM ; anti-rejeu atomique ; compteur d'échecs propre ; blocage croissant ; défis WebAuthn à usage unique | A |
| Élévation juste à temps | Reconfirmer son identité avant toute action d'administration (15 min) | Second facteur ou mot de passe ; échecs comptés | B |
| Inactivité | Session fermée après 2 h (30 min pour un administrateur) sans interaction réelle | Les rafraîchissements automatiques ne prolongent pas la session | B |
| Mon compte | Coordonnées de récupération, second facteur, mot de passe | Changement de coordonnée sous élévation, ancienne coordonnée prévenue | B |
| Journal d'audit | Chaque accès, accordé ou refusé, avec le critère manquant | Ajout seul en base (déclencheurs UPDATE, DELETE, TRUNCATE) | A |
| Vigie | Alertes : refus en rafale, verrouillage, administrateur sur une nouvelle adresse, créations en série, échecs du second facteur, octroi privilégié | Qualifiées par le DPO ; export pour le bjCSIRT | B |

## 2. Administration des comptes

| Fonctionnalité | Profil | Sécurité | Niveau |
|---|---|---|---|
| Administration déléguée en cascade | Autorité (N0) → ministère (N1) → département/université (N2) → établissement (N3) | Plafond : on ne délègue que ce qu'on détient ; nul n'agit sur ses propres droits ; double validation des nominations ≤ N2 ; droits datés (1 an) ; arbre en lecture seule pour l'application | A |
| Création de comptes | Administrateurs délégués | NPI obligatoire (pas de compte fantôme) ; compte parent/élève ancré dans l'établissement qui le crée ; activation autonome si téléphone ou courriel | B |
| Comptes et accès | Administrateur de la plateforme | Ne s'ajoute aucun droit ; ne cumule aucun rôle métier ; ne réinitialise jamais le mot de passe d'un compte privilégié ; tout octroi privilégié lève une alerte haute | B |
| Portails cloisonnés | public, usagers, gestion, national | Prêts dans le code ; la production fonctionne en portail unique (décision DNS et hébergement à prendre) | C |

## 3. Espaces par profil

| Profil | Fonctionnalités principales | Contrôles d'accès | Niveau |
|---|---|---|---|
| **Apprenant** | Passeport éducatif, bulletins par année, preuves et diplômes, droits sur ses données | Périmètre personnel (ABAC) | B |
| **Famille** | Enfants (même dans plusieurs établissements), notes, absences, justificatifs, notifications, droits | Lien familial vérifié au registre | B |
| **Enseignant** | Classes, appel (hors connexion possible), notes et corrections motivées, carnet, passeport professionnel, « À faire », droits | Relation d'enseignement ; muté : accès retiré à l'ancien établissement ; saisies hors connexion rattachées au compte | A (registre en ajout seul) |
| **Chef d'établissement** | Tableau de bord, inscription (registre national), apprenants, personnel, justificatifs, examens et certification, guichet de l'étudiant (supérieur), administration de son établissement | Périmètre établissement ; registre : nom ET prénom, 200 recherches/jour | B |
| **Inspecteur / Direction départementale** | Poste de pilotage, console territoriale, « Où agir ? », alertes détectées, demandes, qualité des données et relances | Périmètre circonscription / département ; relances réservées aux autorités | B |
| **Administration centrale (cabinet)** | Cockpit national, analyses (Ask Education), jeux de données, dictionnaire, interopérabilité | National, agrégats avec seuil de publication ; second facteur | B |
| **Chercheur** | Jeux de données, Ask Education, dictionnaire | Agrégats seulement ; ne cumule ni administration ni gestion | B |
| **DPO** | Journal d'audit, registre des traitements, demandes de droits (30 jours), alertes de sécurité | Ne porte aucune délégation d'administration | B |
| **Supérieur (direction, enseignant, étudiant)** | Maquettes, UE, inscriptions, contrats pédagogiques, notes d'UE, jurys, délibérations, diplômes, guichet des actes, bourses | Inscription sur titre d'accès seulement ; contrat limité à l'établissement ; validations et diplômes en ajout seul et scellés | A |

## 4. Services publics (sans compte)

| Service | Sécurité | Niveau |
|---|---|---|
| Annuaire des établissements (2 116 établissements réels, sourcés) | Lecture seule ; référentiel non modifiable par l'application | A |
| Résultats d'examens | Numéro de table → verdict seulement ; nom et moyenne avec la date de naissance, envoyée en POST (jamais dans une adresse), 10 essais par candidat et 30 par adresse et par heure ; résultats publiés immuables en base | A |
| Vérification de diplômes et d'actes | MAC à clé ; sans empreinte du QR, aucune identité rendue ; préfixe d'au moins 16 caractères | A |
| Calendrier scolaire, chiffres publics | Lecture seule | B |

## 5. Interopérabilité

EducMaster (absences), eRESULTATS (PV et publication), université (PV de diplôme), DBAU (bourses).
Signature HMAC couvrant méthode, chemin, horodatage (±5 min), lot et corps ; habilitation par message ; lots
idempotents ; PV et publications non rejouables ; quota par adresse avant authentification. **Niveau A.**

## 6. Audit général d'octobre 2026

Quatre audits en parallèle (autorisations, authentification et cryptographie, front, base et chaîne logicielle),
puis vérification de chaque constat dans le code. **Corrigé et testé :**

- **Hautes** : création de comptes parent/élève hors de son établissement ; auto-attribution de droits et prise de
  contrôle d'un compte administrateur ; inscription arbitraire dans le supérieur ; contournement du plafond d'essais
  de date de naissance ; force brute du TOTP sans verrouillage ; secret TOTP non confirmé devenu facteur valide ;
  résultats d'examen modifiables en base ; redirection ouverte via `retour`.
- **Moyennes** : défis WebAuthn rejouables ; codes à usage unique sous concurrence ; coordonnée de récupération
  changeable sans réauthentification ; enseignant muté conservant ses accès ; fuite du contrat pédagogique entre
  établissements ; recherche au registre national trop large ; énumération par le verrouillage et par la durée de
  réponse ; signature d'interop détournable vers une autre route ; certificat TLS PostgreSQL non vérifié ; file hors
  connexion non rattachée au compte ; date de naissance dans les journaux d'accès.
- **Basses** : NPI du déclarant exposé, relances ouvertes au chercheur, stage encadrable sans relation, cookies Secure,
  version figée de Next/React, actions CI non épinglées, mots de passe courants acceptés, etc.

**Vérification** : recette de l'API (260 cas, dont 30 nouveaux), vérification de la base (25 cas attendus, échec
au moindre écart), parcours navigateur (14 contrôles, clé FIDO2 comprise), scénario du supérieur, interop et
test de charge (100 utilisateurs, aucune erreur). Contrôle réel : l'en-tête `X-Forwarded-For` usurpé ne contourne
pas les plafonds sur Vercel (mesuré).

## 7. Accès aux portails et comptes de test

> Tous les portails sont aujourd'hui servis depuis une seule adresse : **https://edu-tech-api-rho.vercel.app**.
> Connexion : https://edu-tech-api-rho.vercel.app/connexion ; chaque profil arrive ensuite sur son espace.
> Les **mots de passe** et les **clés de second facteur** ne figurent pas ici (fichier versionné) : ils sont dans
> `GUIDE-TESTS.local.md`, à la racine du projet. 🔐 = second facteur demandé après le mot de passe.

### Portail public (sans compte)

| Service | Lien |
|---|---|
| Accueil | https://edu-tech-api-rho.vercel.app/ |
| Annuaire des établissements | https://edu-tech-api-rho.vercel.app/etablissements |
| Résultats d'examens | https://edu-tech-api-rho.vercel.app/resultats |
| Vérification de diplômes et d'actes | https://edu-tech-api-rho.vercel.app/verifier |
| Calendrier scolaire | https://edu-tech-api-rho.vercel.app/calendrier |
| Données publiques | https://edu-tech-api-rho.vercel.app/donnees |
| Activer mon compte | https://edu-tech-api-rho.vercel.app/activation |
| Mot de passe oublié | https://edu-tech-api-rho.vercel.app/mot-de-passe-oublie |

### Portail des usagers

| Profil | Identifiant | Espace |
|---|---|---|
| Apprenante (5e, CEG Les Rôniers) | `aicha.zannou` | https://edu-tech-api-rho.vercel.app/apprenant |
| Parent (2 enfants, 2 établissements) | `chantal.dossou` | https://edu-tech-api-rho.vercel.app/famille |
| Enseignant (mathématiques) | `idrissou.sanni` | https://edu-tech-api-rho.vercel.app/enseignant |
| Étudiant (L3 Informatique, IFRI) | `etudiant.ifri` | https://edu-tech-api-rho.vercel.app/apprenant |

### Portail de gestion

| Profil | Identifiant | Espace |
|---|---|---|
| Cheffe d'établissement (CEG Les Rôniers) | `hortense.guera` | https://edu-tech-api-rho.vercel.app/etablissement |
| Inspecteur (circonscription de Parakou) | `nestor.orou` | https://edu-tech-api-rho.vercel.app/aujourd-hui |
| Direction départementale (Borgou) 🔐 | `bertrand.chabi` | https://edu-tech-api-rho.vercel.app/territoire |
| Direction de l'IFRI (supérieur) | `prosper.ahouandjinou` | https://edu-tech-api-rho.vercel.app/enseignement-superieur |
| Enseignante du supérieur (IFRI) | `sena.hounkpatin` | https://edu-tech-api-rho.vercel.app/enseignant |

### Console nationale

| Profil | Identifiant | Espace |
|---|---|---|
| Cabinet du ministre 🔐 | `felicite.akakpo` | https://edu-tech-api-rho.vercel.app/cockpit |
| Chercheur | `landry.kouton` | https://edu-tech-api-rho.vercel.app/jeux-de-donnees |
| Déléguée à la protection des données | `laure.zannou` | https://edu-tech-api-rho.vercel.app/audit |
| Administrateur de la plateforme (autorité N0) 🔐 | `admin.beile` | https://edu-tech-api-rho.vercel.app/administration |

Pages communes :
- **Administration déléguée** (directrice, direction départementale, cabinet, administrateur) : https://edu-tech-api-rho.vercel.app/delegation
- **Alertes de sécurité** (DPO, administrateur) : https://edu-tech-api-rho.vercel.app/securite
- **Mon compte** (tous) : https://edu-tech-api-rho.vercel.app/mon-compte
