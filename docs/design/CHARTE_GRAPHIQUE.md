# Charte graphique BEILE

> Version 1.0 — septembre 2026. Remplace la version de travail.
> Les couleurs et typographies ci-dessous ne sont pas inventées : elles sont **relevées dans les feuilles de style des plateformes gouvernementales béninoises en service** (§1), puis complétées pour les besoins propres à BEILE (données, cartes, cockpit).

---

## 1. Fondement : l'identité numérique existante de l'État

Relevé effectué le 24/09/2026 sur les CSS de production.

| Plateforme | Couleur principale | Accent | Typographie |
|---|---|---|---|
| memp.gouv.bj (MEMP) | `#0A3764` (`--navy`) | `#0E6258` (sarcelle), `#1880E7` (bleu vif) | Montserrat |
| service-public.bj | `#0A3764` (`--primary`) | `#F0A945` (ambre) | Système |
| gouv.bj | `#023E79` | `#DC9122` (ambre), `#0E6258` | — |
| innovation.gouv.bj | `#093E73` (`--primary`) | `#FFD400` | Gotham Pro |
| educmaster.bj | `#003976` | `#E9F3FF` (bleu pâle) | Roboto, Poppins |
| anip.bj | — | `#EFB412` | Montserrat, Roboto |

**Constat.** Toutes les plateformes de l'État convergent vers un **bleu marine institutionnel** (`#0A3764` ± quelques nuances), relevé d'un **ambre** et d'un **vert sarcelle**. Le MEMP signe ses pages d'une **bande tricolore** aux couleurs du drapeau (`#008751` / `#FCD116` / `#E8112D`), et utilise **Montserrat**.

**Décision.** BEILE adopte cette famille. Un jury, un ministre ou un agent doit reconnaître au premier regard une plateforme de l'État, et non le produit d'un prestataire. C'est un argument de crédibilité autant qu'une contrainte d'intégration : le jour où BEILE s'insère dans l'écosystème gouvernemental, aucune refonte visuelle n'est nécessaire.

> **Réserve.** Les armoiries, le sceau et les logos officiels de la République **ne sont pas utilisés** dans le prototype. Leur usage relève d'une autorisation. BEILE porte son propre logotype et la bande tricolore, qui est un motif national et non une marque.

---

## 2. Couleurs de l'interface

### 2.1 Couleurs de marque

| Jeton | Hex | Usage | Contraste |
|---|---|---|---|
| `--brand-navy` | `#0A3764` | Barre de navigation, titres, boutons principaux | 12,05 : 1 sur blanc |
| `--brand-navy-deep` | `#072747` | Survol des boutons principaux, en-tête du cockpit | — |
| `--brand-blue` | `#1567C4` | Liens, focus, éléments interactifs secondaires | 5,57 : 1 sur blanc |
| `--brand-teal` | `#0E6258` | Action positive (valider, enregistrer), progression | 7,22 : 1 (texte blanc) |
| `--brand-amber` | `#DC9122` | Mise en évidence modérée, badges « nouveau » | Décoratif, jamais pour du texte |
| `--brand-blue-soft` | `#E9F3FF` | Fonds de sélection, bandeaux d'information | — |

`#1880E7` (bleu MEMP) est trop clair pour du texte (3,98 : 1). Il est réservé aux graphiques ; `#1567C4` le remplace dans l'interface.

### 2.2 Bande nationale

Signature visuelle présente en pied de page et en haut du cockpit : trois segments égaux, hauteur 4 px (interface) ou 7 px (pied de page).

| Segment | Hex |
|---|---|
| Vert | `#008751` |
| Jaune | `#FCD116` |
| Rouge | `#E8112D` |

La bande est **un motif, pas un code couleur** : ces trois teintes ne signifient jamais « bon / moyen / mauvais » dans l'interface.

### 2.3 Neutres

| Jeton | Clair | Sombre (cockpit) | Usage |
|---|---|---|---|
| `--bg` | `#F5F7FA` | `#06121F` | Fond de page |
| `--surface` | `#FFFFFF` | `#0D1F33` | Cartes, panneaux |
| `--surface-2` | `#EEF2F7` | `#132A44` | Zones secondaires, en-têtes de tableau |
| `--border` | `#D8E0EA` | `#1F3A58` | Filets, séparateurs |
| `--text` | `#0F1B2D` | `#E8EEF5` | Texte principal |
| `--text-2` | `#475569` | `#B6C3D4` | Texte secondaire (7,58 : 1) |
| `--text-muted` | `#5B6B80` | `#94A3B8` | Légendes, métadonnées (≥ 4,5 : 1) |

### 2.4 États (réservés, toujours avec icône et libellé)

| Rôle | Texte / icône | Fond | Signification |
|---|---|---|---|
| Succès | `#0B6B3A` | `#E7F5EC` | Opération réussie, donnée validée |
| Information | `#1567C4` | `#E9F3FF` | Information neutre |
| Avertissement | `#8A5A00` | `#FFF4DB` | Donnée incomplète, action attendue |
| Critique | `#B42318` | `#FDECEA` | Erreur, refus d'accès, alerte critique |

Tous les textes d'état dépassent 4,5 : 1 sur blanc. Une couleur d'état n'est **jamais** le seul porteur du sens.

### 2.5 Mode sombre

- **Cockpit national et console territoriale** : sombre par défaut. Ce sont des écrans de salle de pilotage, consultés longtemps et projetés.
- **Espaces apprenant, famille, enseignant, établissement** : clairs par défaut, lisibles en plein soleil sur téléphone.
- Chaque utilisateur peut basculer. Le mode sombre est un jeu de valeurs dédié (§2.3), pas une inversion automatique.

---

## 3. Couleurs des données (graphiques et cartes)

Palette **validée par calcul** (écart de couleur perçu, simulation des trois formes de daltonisme, contraste) et non à l'œil.

### 3.1 Catégorielle — ordre fixe, jamais recyclé

| Rang | Teinte | Clair | Sombre | Origine |
|---|---|---|---|---|
| 1 | Bleu | `#1880E7` | `#3A8BE6` | Bleu MEMP |
| 2 | Ambre | `#DC9122` | `#C4841F` | Ambre gouv.bj |
| 3 | Sarcelle | `#0E8A74` | `#189A80` | Sarcelle MEMP, éclaircie |
| 4 | Violet | `#7A5BD6` | `#8570DD` | Complément |
| 5 | Magenta | `#D55181` | `#CF5886` | Complément |

Résultats du contrôle :
- **Clair** (surface `#FFFFFF`) : tous les contrôles passent. Pire paire adjacente pour le daltonisme : ΔE 13,8 (cible ≥ 8). Les trois premiers rangs passent aussi en comparaison **toutes paires** (cartes, nuages de points).
- **Sombre** (surface `#0D1F33`) : tous les contrôles passent, contraste ≥ 3 : 1 pour les cinq teintes.
- L'ambre clair (2,59 : 1) impose des **étiquettes directes ou une vue tableau** : c'est la règle pour tout graphique BEILE.

Au-delà de cinq séries : regroupement en « Autres » ou petits multiples. Jamais de sixième couleur générée.

Règles :
- **La couleur suit l'entité, pas son rang** : l'Atlantique garde la même teinte quel que soit le filtre.
- **Un seul axe vertical** par graphique.
- Pour un sexe : filles = rang 1, garçons = rang 2, partout dans l'application.

### 3.2 Séquentielle (cartes choroplèthes, cartes de chaleur)

Une seule teinte, le bleu institutionnel, du clair (faible) au foncé (fort) : `#E9F3FF` → `#B7D3F6` → `#6DA7EC` → `#1880E7` → `#1567C4` → `#0A3764` → `#072747`.

### 3.3 Divergente (écart à une moyenne, évolution)

Bleu `#1567C4` (au-dessus de la référence) ↔ gris `#EEF2F7` (neutre) ↔ rouge `#B42318` (en dessous). Même nombre de paliers de chaque côté.

### 3.4 Niveaux d'alerte territoriale (cockpit « Où agir ? »)

| Niveau | Couleur | Icône | Libellé |
|---|---|---|---|
| Favorable | `#0B6B3A` | ● plein | Situation favorable |
| Surveillance | `#C49A00` | ◐ | Surveillance |
| Attention | `#D66A1F` | ▲ | Attention |
| Critique | `#B42318` | ◆ | Critique |

Chaque niveau affiché sur la carte est **cliquable et explicable** : les facteurs qui l'ont déclenché sont listés.

### 3.5 Anatomie des graphiques
- Traits de 2 px, marqueurs ≥ 8 px, extrémités de barres arrondies à 4 px, 2 px d'espace entre segments.
- Grille en filet discret, axes en `--text-muted`.
- Le texte n'est jamais dans la couleur de la série.
- Chaque graphique porte : **titre, source, période, date de mise à jour, indice de confiance**, et propose une **vue tableau**.
- Survol : infobulle sur chaque barre ou point, réticule sur les courbes.

---

## 4. Typographie

| Rôle | Police | Graisse | Justification |
|---|---|---|---|
| Titres, navigation, chiffres clés | **Montserrat** | 600–700 | Police du MEMP et de l'ANIP : continuité avec l'État |
| Texte courant, formulaires, tableaux | **Inter** | 400–500 | Lisibilité supérieure en petite taille et sur écrans modestes |
| Identifiants, codes, extraits techniques | **JetBrains Mono** | 400 | Identifiants éducatifs, codes de vérification |

Chiffres alignés (`font-variant-numeric: tabular-nums`) dans les tableaux et les axes.

### Échelle

| Jeton | Taille / interligne | Usage |
|---|---|---|
| `display` | 40 / 48 | Chiffre vedette du cockpit |
| `h1` | 28 / 36 | Titre de page |
| `h2` | 22 / 30 | Titre de section |
| `h3` | 18 / 26 | Titre de carte |
| `body` | 15 / 24 | Texte courant (16 sur mobile) |
| `small` | 13 / 20 | Métadonnées, légendes |
| `micro` | 12 / 16 | Badges, étiquettes d'axe |

---

## 5. Langage visuel : épuré, flottant, institutionnel

Le langage visuel reprend celui de **DrwinDesk** (`intra_front`), éprouvé en production chez Drwintech, et lui applique l'identité de l'État.

| Principe | Réalisation |
|---|---|
| **Les cartes flottent** | Fond d'application gris bleuté (`--app-bg` `#EDF1F6`), cartes blanches opaques, bordure à 70 % d'opacité, ombre en trois couches (`float`). Aucune bordure épaisse, aucun fond teinté inutile |
| **La barre supérieure flotte aussi** | Barre détachée des bords (marge de 8–12 px), translucide à 75 %, `backdrop-blur`, fil d'Ariane et recherche ⌘K |
| **Une seule commande pour tout** | Palette ⌘K : naviguer, changer de profil, ouvrir un dossier autorisé, **poser une question à Ask Education** |
| **Tuiles d'indicateur « flat »** | Micro-libellé en capitales (10–11 px, espacement large), chiffre tabulaire de 24–40 px, sparkline de tendance, badge de confiance |
| **Mouvement discret** | Apparition 180 ms, glissement de 6 px, lignes de tableau en cascade, survol des cartes cliquables : −4 px et ombre `pop`. Tout est désactivé sous `prefers-reduced-motion` |
| **Au-delà de DrwinDesk** | Cockpit **centré sur la carte** et projetable ; ligne de temps du passeport éducatif ; **visualisation de la décision d'accès** (les 4 critères) ; bande nationale comme signature ; sélecteur de profil pour la démonstration |

### Formes

- **Grille de 4 px** : 4, 8, 12, 16, 24, 32, 48, 64.
- **Rayons** : 10 px (badges, champs), 14 px (boutons), 18 px (tuiles), 24 px (cartes), 32 px (panneaux, modales).
- **Élévation** (teintée du marine institutionnel, pas de noir pur) :
  - `soft` : `0 1px 2px rgb(10 55 100 / .04)`
  - `float` : `0 1px 3px rgb(10 55 100 / .04), 0 6px 16px -6px rgb(10 55 100 / .10), 0 16px 40px -12px rgb(10 55 100 / .10)`
  - `pop` : `0 10px 38px -8px rgb(10 55 100 / .18), 0 4px 12px -4px rgb(10 55 100 / .08)`
- **Largeur de lecture** : 72 caractères maximum pour les textes longs.
- **Cibles tactiles** : 44 × 44 px minimum.
- **Mobile** : barre de navigation basse à 4–5 entrées, tiroir latéral pour le reste.

---

## 6. Composants

| Composant | Règles |
|---|---|
| Bouton principal | Fond `--brand-navy`, texte blanc, une seule action principale par écran |
| Bouton de validation | Fond `--brand-teal` pour les actions qui enregistrent une donnée officielle |
| Bouton secondaire | Contour `--border`, texte `--brand-navy` |
| Action destructive | Texte `--critical`, confirmation obligatoire avec rappel de la conséquence |
| Champ de formulaire | Libellé toujours visible (jamais seulement un texte indicatif), erreur sous le champ, mention « facultatif » plutôt qu'astérisque |
| Tableau | En-tête `--surface-2`, lignes de 44 px, tri et filtre, pagination, export contrôlé selon les droits |
| Carte d'indicateur | Valeur, variation, période, source, indice de confiance, lien vers le détail |
| Badge de confiance | Pastille ≥ 90 % succès, 70–89 % avertissement, < 70 % critique, **toujours avec le pourcentage** |
| Bandeau « données de démonstration » | Permanent dans le prototype, fond ambre pâle, non masquable |
| Écran d'accès refusé | Explique **quel critère** manque (rôle, périmètre, relation ou finalité) et indique que le refus est journalisé |
| Mode hors connexion | Indicateur permanent « non synchronisé » avec le nombre d'éléments en attente |

### États obligatoires de chaque écran
Chargement (squelettes, pas de spinner plein écran) · vide · erreur · succès · accès refusé · hors connexion.

---

## 7. Iconographie et illustrations

- **Lucide** : icônes à trait de 1,5–2 px, cohérentes avec Montserrat et Inter.
- **Photographies : Pexels** (licence Pexels : usage libre et gratuit, attribution non obligatoire mais pratiquée). Règles :
  - photographies **d'ambiance** uniquement : page d'accueil, écrans de connexion, états vides, en-têtes d'espace ;
  - **jamais** une photographie associée à une donnée individuelle (une fiche d'apprenant n'a pas de photo de banque d'images : cela suggérerait une personne réelle) ;
  - sujets : scènes éducatives d'Afrique de l'Ouest, lumière naturelle, sans mise en scène artificielle ; aucune image dévalorisante ou misérabiliste ;
  - traitement uniforme : léger voile marine (`--brand-navy` à 35–55 %) pour la lisibilité du texte posé dessus ;
  - chaque image est **téléchargée et servie par l'application** (pas de lien à chaud) ; le crédit (photographe, lien Pexels) est consigné dans `apps/web/public/images/CREDITS.md`.
- Cartes : fond de carte neutre et désaturé, pour que les couches de données portent la couleur.

---

## 8. Rédaction

- Français administratif clair : phrases courtes, verbes d'action, pas de jargon technique dans les parcours métier.
- Terminologie du dictionnaire national : « apprenant » (pas « utilisateur »), « établissement » (pas « école » quand le cycle est indéterminé), « année scolaire 2025-2026 ».
- Nombres au format français : `2 295 038`, `16,2 %`, dates `24/09/2026`.
- Un chiffre n'apparaît jamais sans sa source, sa période et sa définition accessibles en un clic.

---

## 9. Accessibilité

- Conformité visée : **WCAG 2.2 niveau AA**.
- Contraste texte ≥ 4,5 : 1, éléments d'interface ≥ 3 : 1, vérifiés par calcul (§2, §3).
- Navigation complète au clavier, focus visible (anneau `--brand-blue` de 2 px).
- Le sens ne repose jamais sur la couleur seule.
- Respect de `prefers-reduced-motion`.
- Interface utilisable à 200 % de zoom et sur un écran de 360 px de large.

---

## 10. Jetons (référence d'implémentation)

```css
:root {
  --brand-navy: #0A3764;  --brand-navy-deep: #072747;
  --brand-blue: #1567C4;  --brand-teal: #0E6258;
  --brand-amber: #DC9122; --brand-blue-soft: #E9F3FF;
  --flag-green: #008751;  --flag-yellow: #FCD116; --flag-red: #E8112D;

  --app-bg: #EDF1F6; --bg: #F5F7FA; --surface: #FFFFFF; --surface-2: #EEF2F7; --border: #D8E0EA;
  --text: #0F1B2D; --text-2: #475569; --text-muted: #5B6B80;

  --success: #0B6B3A; --success-bg: #E7F5EC;
  --info: #1567C4;    --info-bg: #E9F3FF;
  --warning: #8A5A00; --warning-bg: #FFF4DB;
  --critical: #B42318; --critical-bg: #FDECEA;

  --series-1: #1880E7; --series-2: #DC9122; --series-3: #0E8A74;
  --series-4: #7A5BD6; --series-5: #D55181;

  --font-display: "Montserrat", system-ui, sans-serif;
  --font-sans: "Inter", system-ui, sans-serif;
  --font-mono: "JetBrains Mono", ui-monospace, monospace;
}

[data-theme="dark"] {
  --bg: #06121F; --surface: #0D1F33; --surface-2: #132A44; --border: #1F3A58;
  --text: #E8EEF5; --text-2: #B6C3D4; --text-muted: #94A3B8;
  --series-1: #3A8BE6; --series-2: #C4841F; --series-3: #189A80;
  --series-4: #8570DD; --series-5: #CF5886;
}
```

La source de vérité de ces jetons est le fichier CSS de l'application web. Ce document et le code sont mis à jour ensemble.
