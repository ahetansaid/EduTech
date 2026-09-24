# BEILE — Sécurité et protection des données

> Version 0.1 — septembre 2026. Complète [INFRASTRUCTURE.md](INFRASTRUCTURE.md).
> Le système traitera des données de mineurs : la sécurité est une condition de mise en service, pas une étape de fin de projet.

## 1. Ce qui est déjà en place dans le prototype

Chaque mesure ci-dessous est **vérifiable en direct**, pas seulement décrite.

| Domaine | Mesure effective | Où la vérifier |
|---|---|---|
| Injection de script (XSS) | Politique de sécurité du contenu (CSP) **stricte à nonce unique par requête** : aucun script non émis par l'application ne s'exécute (`script-src 'self' 'nonce-…' 'strict-dynamic'`) | `apps/web/src/proxy.ts` · en-tête `Content-Security-Policy` de toute page |
| Aucune ressource tierce | `default-src 'self'` : pas de CDN, pas de fond de carte externe, pas de police distante (polices auto-hébergées), pas de traceur | Onglet Réseau du navigateur : tout provient de l'origine |
| Détournement de clic | `frame-ancestors 'none'` + `X-Frame-Options: DENY` | En-têtes HTTP |
| Transport | `Strict-Transport-Security` (2 ans, préchargement), `upgrade-insecure-requests` en production | En-têtes HTTP |
| Surface du navigateur | `Permissions-Policy` : caméra, micro, géolocalisation, paiement, USB désactivés ; `Cross-Origin-Opener-Policy` / `Resource-Policy` | En-têtes HTTP |
| Divulgation technique | En-tête `X-Powered-By` supprimé ; aucune trace de pile exposée | `next.config.ts` |
| Autorisation | Moteur **ABAC à quatre critères** (rôle, périmètre, relation, finalité) évalué à chaque ouverture de dossier ; un rôle seul ne donne jamais accès à un individu | `apps/web/src/lib/sim/abac.ts` · espace enseignant, « Ouvrir le dossier d'un élève » |
| Journalisation | Accès **accordés et refusés** journalisés avec le critère manquant | Profil DPO → Journal d'audit |
| Requête statistique (IA) | Le traducteur ne produit qu'une **requête structurée validée par schéma** ; le moteur calcule ; refus des questions visant une personne ou hors périmètre | Ask Education → « Voir la requête structurée » ; question « Montre-moi les notes de Aïcha ZANNOU » |
| Réidentification | Seuil minimal de publication par indicateur ; les cellules sous le seuil sont **masquées** | `semantique.ts` (`effectifMinimalPublication`) |
| Intégrité des diplômes | Empreinte SHA-256 des champs certifiés ; toute altération est détectée à la vérification | `/verifier` → « Tester la détection de fraude » |
| Intégrité du registre | Registre d'événements **en ajout seul** : une correction de note crée un nouvel événement avec auteur et motif | Espace enseignant → Notes → corriger une note |
| Validation des entrées | Toute saisie est bornée et validée (notes 0–20 au quart de point, longueurs maximales, formats d'identifiant) ; aucun HTML injecté (`dangerouslySetInnerHTML` réservé à un script statique de thème, sans donnée utilisateur) | Code des formulaires |
| Données personnelles | **Aucune donnée réelle** : le prototype est entièrement fictif et déterministe ; le stockage local du navigateur ne contient que les actions de démonstration | Bandeau permanent |
| Chaîne logicielle | `npm audit` : 0 vulnérabilité à la date de rédaction ; dépendances en contraintes `^` pour recevoir les correctifs | `package.json` |

> **Réserve assumée.** Dans le prototype, l'autorisation s'exécute dans le navigateur : elle **démontre les règles**, elle ne constitue pas une frontière de sécurité. En production, la même décision est prise **côté serveur** (API) et redoublée par la sécurité au niveau des lignes de PostgreSQL. Masquer un écran n'est jamais une mesure de sécurité.

## 2. Architecture de sécurité cible (production)

### 2.1 Huit niveaux de défense

| Niveau | Mesures |
|---|---|
| 1. Périmètre | Anti-DDoS, pare-feu applicatif (WAF), TLS 1.3 uniquement, limitation de débit par IP et par compte |
| 2. Identité | OIDC (Keycloak) fédéré à l'identité nationale ; **second facteur obligatoire** pour tout compte accédant à des données individuelles au-delà de sa famille ; sessions courtes, jetons de rafraîchissement rotatifs ; cookies `HttpOnly`, `Secure`, `SameSite=Strict` |
| 3. Autorisation | Décision ABAC **côté serveur** à chaque requête + **RLS PostgreSQL** (seconde barrière si l'API est contournée) ; principe du moindre privilège ; comptes de service à portée minimale |
| 4. Application | Validation zod à l'entrée de chaque route, requêtes SQL exclusivement paramétrées, protection CSRF (double soumission), CSP à nonce, en-têtes de sécurité, pas de téléversement exécutable (types et tailles bornés, stockage objet hors racine web, analyse antivirale) |
| 5. Données | Chiffrement en transit et au repos ; **chiffrement applicatif des champs sensibles** (identifiant national, besoins particuliers) ; pseudonymisation de tout usage analytique ; secrets dans Vault, rotation des clés |
| 6. Infrastructure | Réseau segmenté (public / applicatif / données) ; bases non exposées à Internet ; accès d'administration par bastion avec MFA et enregistrement de session ; durcissement CIS des hôtes ; images de conteneurs minimales, signées, analysées |
| 7. Audit | Journaux **non modifiables** (stockage WORM) ; traçabilité des accès et des actions d'administration ; alertes sur comportements anormaux (volume de consultations, refus répétés, horaires inhabituels) |
| 8. Exploitation | Correctifs de sécurité sous 72 h pour les vulnérabilités critiques ; `npm audit` et analyse des dépendances bloquants en intégration continue ; tests d'intrusion avant chaque ouverture de vague ; plan de réponse aux incidents avec notification à l'APDP |

### 2.2 Le modèle d'accès en une phrase

> Un utilisateur n'accède jamais à la base de données. Il accède à une ressource précise si, et seulement si, son **rôle**, son **périmètre**, sa **relation** avec la personne concernée et la **finalité** déclarée l'autorisent — et la décision, accordée ou refusée, est journalisée.

### 2.3 Menaces principales et réponses

| Menace | Réponse |
|---|---|
| Consultation abusive par un agent habilité (menace interne) | ABAC par relation, journal consultable par le DPO, alertes de volume, finalité déclarée obligatoire |
| Vol de session | MFA, sessions courtes, cookies `HttpOnly`, liaison de session à l'appareil, révocation centralisée |
| Réidentification à partir des statistiques publiques | Seuils de publication, suppression des petites cellules, contrôle des exports, agrégation minimale |
| Fraude documentaire | Diplômes à empreinte et signature de l'autorité, vérification publique, révocation |
| Gonflement de données servant à un financement | Contrôles croisés, audits, indice de confiance, provenance de chaque donnée |
| Détournement du modèle de langage (injection de requête) | Sortie contrainte à un schéma validé, aucun accès du modèle aux données, aucun SQL généré, périmètre appliqué après traduction |
| Compromission d'un fournisseur tiers | Hébergement souverain, réversibilité, secrets hors code, dépendances auditées |
| Perte de données | Sauvegardes chiffrées 3-2-1, restauration testée, RPO/RTO par niveau de criticité |

## 3. Protection des données personnelles

- **Saisine de l'Autorité de protection des données personnelles (APDP) avant toute mise en service.**
- Registre des traitements : finalité, base légale, catégories de données, destinataires, durée de conservation (voir le profil DPO → Registre des traitements).
- Minimisation : aucune donnée collectée « au cas où ».
- Droits des personnes : accès, rectification, et les autres droits applicables, exercés depuis les espaces personnels.
- Transparence : chaque famille voit qui a consulté le dossier de son enfant, et à quel titre (cible production).
- Aucune décision individuelle (orientation, affectation, sanction) ne résulte d'un calcul automatique : le système propose et explique, un responsable décide.

## 4. Contrôles avant mise en production (liste de vérification)

- [ ] `APP_ENV`/`NODE_ENV=production`, aucun mode débogage, aucune trace de pile exposée
- [ ] Secrets uniquement dans le coffre (Vault) ou les variables d'environnement de l'hébergeur ; aucun secret dans le dépôt (vérification automatisée)
- [ ] `npm audit` sans vulnérabilité élevée ou critique
- [ ] En-têtes de sécurité vérifiés (CSP, HSTS, anti-framing) sur l'environnement cible
- [ ] Limitation de débit active sur toutes les routes publiques (vérification, connexion)
- [ ] MFA imposé aux rôles à données individuelles
- [ ] RLS PostgreSQL activée et testée (tentative d'accès hors périmètre refusée au niveau de la base)
- [ ] Journal d'audit en écriture seule, alertes configurées
- [ ] Sauvegarde chiffrée **restaurée avec succès** sur un environnement isolé
- [ ] Test d'intrusion réalisé, vulnérabilités critiques corrigées
- [ ] Dossier APDP déposé
