# BEILE — Comptes, portails et souveraineté

> Version 1.0 — octobre 2026. Complète [SECURITE.md](SECURITE.md) et [INFRASTRUCTURE.md](INFRASTRUCTURE.md).
> Chaque mesure marquée **en place** est couverte par la recette automatique (`npm run recette:ecritures -w @beile/api`, jouée en intégration continue).

## 1. Administration en cascade (lot A) — en place

| Règle | Où |
|---|---|
| Arbre des organisations : autorité (niveau 0, DSI du ministère ou ASIN) → ministères et organismes (1) → départements et universités (2) → circonscriptions et établissements (3) | `packages/db/src/organisations.ts`, table `core.organisations` |
| Chaque administrateur n'agit que dans son sous-arbre, et ne délègue que ce qu'il détient (rôles et date de fin) | `apps/api/src/delegation.ts` |
| Personne n'agit sur ses propres droits ; nomination de niveau ≤ 2 validée par une seconde personne de niveau supérieur | idem |
| Cumul encadré : niveau 0 sans rôle métier ; DPO et chercheur sans administration | idem |
| Droits datés (1 an) : non reconfirmés, ils tombent à la connexion suivante ; une révocation coupe les sessions | `apps/api/src/commun.ts` |
| Console « Administration déléguée » | `apps/web/src/app/(gestion)/delegation` |

## 2. Activation et récupération sans administrateur (lot B) — en place

- **Activation autonome.** À la création d'un compte avec un téléphone ou un courriel, la personne reçoit son identifiant et active elle-même son compte (« Activer mon compte ») avec un **code à 6 chiffres** : l'administrateur ne voit jamais de mot de passe. Sans coordonnée, repli sur un mot de passe provisoire remis en main propre.
- **Mot de passe oublié.** Code envoyé uniquement à une coordonnée **déjà vérifiée**.
- **Codes à usage unique** : 10 minutes, 5 essais, un seul usage, au plus 3 par quart d'heure et par compte ; seule une empreinte HMAC est conservée (`core.codes_usage_unique`). Les réponses sont identiques que le compte existe ou non (pas d'énumération).
- **Coordonnées de récupération** : chacun ajoute son téléphone ou son courriel depuis « Mon compte » ; ils ne sont adoptés que si le code qui y est envoyé revient (preuve de possession).
- **Mot de passe initial imposé par l'API** : tant qu'il n'est pas changé, l'API ne sert rien d'autre (code `mot_de_passe_a_changer`), quel que soit l'écran.
- **Inactivité** : session fermée après 2 h sans interaction réelle (30 min pour un administrateur). Les rafraîchissements automatiques des écrans ne prolongent pas une session (en-tête `X-Beile-Actif` envoyé seulement après un clic ou une frappe).

### Configuration des envois (à fournir par l'exploitant)

| Variable | Rôle |
|---|---|
| `BEILE_SMS_URL`, `BEILE_SMS_CLE`, `BEILE_SMS_EXPEDITEUR` | Passerelle SMS d'un opérateur national : `POST` JSON `{ to, from, text }`, en-tête `Authorization: Bearer` |
| `BEILE_SMTP_URL`, `BEILE_COURRIEL_EXPEDITEUR` | SMTP **du domaine de la plateforme** (SPF, DKIM, DMARC publiés), jamais une messagerie personnelle |

Sans ces variables, la production **annonce honnêtement** que l'envoi n'est pas ouvert (`/auth/canaux`) et l'activation se fait par mot de passe provisoire. Hors production, un fournisseur « journal » conserve les messages en base pour la recette.

## 3. Second facteur, élévation, vigie (lot C) — en place

- **Second facteur obligatoire** pour l'administrateur de la plateforme et toute délégation de niveau 0 à 2 : sans lui, l'API ne sert rien (codes `mfa_a_verifier`, `mfa_a_enroler`).
  - **Application d'authentification (TOTP, RFC 6238)** : secret chiffré AES-256-GCM, anti-rejeu (un code ne sert qu'une fois).
  - **Clé de sécurité FIDO2 / WebAuthn** (clé USB/NFC, empreinte, Windows Hello) : seule la clé publique est conservée.
  - **Dix codes de secours** à usage unique, affichés une fois. Perte de tous les facteurs : réinitialisation par l'administrateur de la plateforme, avec élévation et motif journalisé.
  - 5 échecs : session coupée, compte verrouillé 15 minutes, alerte « haute ».
- **Élévation juste à temps** : toute action d'administration (créer un compte, attribuer, révoquer, nommer, valider) exige une confirmation d'identité de moins de 15 minutes — second facteur pour les niveaux 0 à 2, mot de passe pour les autres. Le portail l'ouvre de lui-même et rejoue l'action.
- **Vigie** (`apps/api/src/vigie.ts`) : règles explicables évaluées au fil de l'eau — refus d'accès en rafale (8 en 10 min), verrouillage, administrateur sur une adresse nouvelle ou entre minuit et 5 h, créations de comptes en série (20/h), échecs du second facteur. Dédupliquées par heure, qualifiées par le DPO ou l'administrateur (« Alertes de sécurité »).

## 4. Portails séparés (lot D) — code en place, déploiement à décider

Une même base de code, **plusieurs déploiements cloisonnés** ; chacun déclare `BEILE_PORTAIL` :

| Portail | Sert | Connexion | Base de données |
|---|---|---|---|
| `public` | annuaire, chiffres, calendrier, résultats, vérification de diplômes et d'actes | **aucune** ; toute autre route répond 404 | rôle `beile_portail_public` : lecture des données publiques ; des élèves, seulement prénoms, nom et date de naissance |
| `usagers` | élèves, familles, enseignants | ces rôles uniquement | rôle applicatif |
| `gestion` | établissements, inspections, directions départementales | ces rôles uniquement | rôle applicatif |
| `national` | ministères, DPO, chercheurs, administrateurs de niveau 0 à 2, connecteurs partenaires | ces rôles uniquement **et** `BEILE_IP_AUTORISEES` obligatoire | rôle applicatif |
| `unique` | tout (déploiement actuel de démonstration) | tous | rôle applicatif |

Un compte qui se trompe de portail est orienté vers le bon ; une session ouverte ailleurs est refusée ; les connecteurs partenaires (`/interop/`) n'existent que sur le portail national.

**Topologie recommandée** : `portail.beile.bj` (public, mis en cache, anti-DDoS) · `usagers.beile.bj` · `gestion.beile.bj` · console nationale **hors Internet public** (réseau de l'administration ou VPN), derrière une passerelle qui **réécrit** `X-Forwarded-For` — la liste d'adresses s'appuie sur cet en-tête et ne vaut que si l'instance n'est joignable que par la passerelle. Cookies propres à chaque sous-domaine (déjà le cas : cookies sans attribut `Domain`).

**Reste à faire (décision d'exploitation)** : noms de domaine, projets d'hébergement par portail, passerelle et VPN de la console nationale, rôle de connexion PostgreSQL par portail (`CREATE ROLE … LOGIN IN ROLE beile_portail_public`).

## 5. Souveraineté (lot E) — à conduire avec les institutions

Ce lot ne se règle pas dans le code ; voici ce qui est prêt et ce qui reste à décider.

| Sujet | Prêt dans BEILE | À décider ou à obtenir |
|---|---|---|
| Hébergement national (ASIN) | PostgreSQL standard + PostGIS, migrations rejouables (`npm run migrer`), réinitialisation et peuplement scriptés, aucune dépendance propriétaire de l'hébergeur | Capacité au centre de données national ; bascule par `pg_dump` / `pg_restore` puis changement de `DATABASE_URL*`, avec le même durcissement |
| Clés (HSM) | Une clé maîtresse unique (`BEILE_CLE_SEAU`), dont tout le reste est dérivé par HKDF (sceau des actes, codes, secrets TOTP) ; rotation sans faux « altéré » (`BEILE_CLES_SEAU_ANCIENNES`) | Garde de la clé maîtresse dans un HSM de l'État ; à terme, signature asymétrique des diplômes (non-répudiation) au lieu d'un MAC |
| Réponse aux incidents (bjCSIRT) | Vigie et export JSON des alertes « moyenne » et « haute » (« Export pour le bjCSIRT », `/securite/alertes/export`) sans donnée d'élève | Point de contact, procédure et délais de notification au bjCSIRT et à l'APDP, à arrêter avec le DPO |
| Envois SMS et courriel | Fournisseurs configurables par variables d'environnement | Convention avec un opérateur national ; domaine d'envoi avec SPF, DKIM, DMARC |
