# Front BEILE — conventions (mode réel)

Le front (Next.js 16, App Router, `apps/web`) n'a **aucune donnée locale** : tout vient de l'API (`apps/api`),
servie sous la même origine à `/api/v1` (réécriture Next → back-end, cf. `next.config.ts`).

## Socle à utiliser — ne pas réinventer

| Besoin | Où |
|---|---|
| Appels HTTP | `@/lib/http` : `lire<T>(chemin)`, `ecrire<T>(chemin, corps)`, `ErreurApi` (`.statut`, `.refus`, `.introuvable`). CSRF, cookies et 401 (retour vers la connexion) sont déjà gérés. |
| Session | `@/lib/session` : `useSession()`, `useProfil()`, `useRoles()`, `useEtablissementCourant()`, `accueilPour(roles)`. |
| Cache et requêtes | TanStack Query v5 (`useQuery`, `useMutation`, `useQueryClient`). Clés en tableau, préfixées par l'espace : `["etablissement", id, "tableau"]`. |
| Notifications éphémères | `notifier({ ton: "succes" \| "info" \| "avertissement" \| "critique", titre, texte? })` depuis `@/components/ui/Notifications`. Les erreurs de mutation sont déjà notifiées globalement. |
| Notifications serveur | `useNotifications()` et `useMarquerLues()` depuis `@/components/shell/Cloche`. |
| État réseau | `useEnLigne()` depuis `@/components/shell/EtatReseau`. |
| UI | `@/components/ui/primitives` (Card, CardHeader, Button, Badge, PageHeader, Etiquette, EtatVide, Squelette, Segmente), `@/components/ui/donnees` (TuileIndicateur, BadgeConfiance, Provenance, DecisionAccesCarte, Sparkline), `@/components/charts/Graphiques` (Courbes, BarresClassees, TableauDonnees), `@/components/map/CarteBenin`, `@/components/ui/Preuve`, `@/components/motion` (EntreePage, Cascade/Element, Compteur, IndicateurActif, motion, AnimatePresence, EASE), `@/lib/format`, `@/lib/cn`. |
| Référentiels statiques | `@beile/contracts` (types, MATIERES, NIVEAUX…) et `@beile/simulation/territoire` (géographie : COMMUNES, DEPARTEMENTS, communeById). Ce sont des référentiels, pas des données simulées. |

**Interdit** (supprimé à la fin de la migration) : `@/lib/store`, `@/lib/api`, `@/lib/sources`, `@/lib/famille`,
`@/lib/scolarite`, `@/lib/donnees` (`useCouches`/`useIndicateur`), `@beile/simulation/monde`, `@beile/simulation/micro`,
`@beile/simulation/semantique` (sauf `import type`), `DATE_SIMULEE`, tout bandeau « démonstration » ou « données fictives ».

## Organisation

- Hooks d'un espace : `src/lib/api/<espace>.ts` — types de réponse + hooks `useXxx()` (lecture) et `useXxxMutation()` (écriture,
  avec `invalidateQueries` des clés concernées). Les types reflètent exactement la réponse de la route (lire `apps/api/src/*.ts`).
- Pages : `"use client"`, une page = un écran, `EntreePage` en racine.

## Temps réel multi-utilisateurs

- Écrans « du jour » (absences, tableau de bord, flux du cockpit, notifications) : `refetchInterval` 15 à 30 s.
- Toute écriture invalide les requêtes qu'elle affecte : l'utilisateur voit immédiatement son action ; les autres la voient au prochain rafraîchissement.
- Mutations : bouton en état de chargement, confirmation par `notifier`, mise à jour optimiste si l'action est fréquente (appel, notifications).

## États obligatoires pour chaque écran

1. **Chargement** : squelettes (`Squelette`) à la forme du contenu — jamais un écran blanc.
2. **Vide** : `EtatVide` avec une phrase utile.
3. **Refus 403** : message clair (« hors de votre périmètre », « aucune relation pédagogique ») — l'API a journalisé le refus, dites-le.
4. **Erreur** : message et bouton « Réessayer » (`refetch`).

## Adaptatif — sur n'importe quel appareil (exigence)

- Tester mentalement et en classes CSS à **360 px, 768 px, 1024 px, 1440 px et plus**. Aucun débordement horizontal de la page.
- Grilles : `grid-cols-1` d'abord, puis `sm:` / `md:` / `lg:` / `xl:`. Tableaux larges : conteneur `overflow-x-auto` **ou** rendu en cartes sous `md`.
- Cibles tactiles ≥ 40 px sur mobile ; textes ≥ 13 px ; formulaires en une colonne sur mobile.
- Espaces personnels (apprenant, famille, enseignant) : conçus d'abord pour le téléphone (barre d'onglets en bas déjà fournie par la coquille : laisser `pb-28` à la coquille).
- Cartes et graphiques : largeur fluide (`w-full`), hauteur adaptée ; légendes qui passent à la ligne.

## Animations (Motion)

Le mouvement guide l'œil (d'où vient l'information, ce qui a changé), il n'est jamais décoratif :
entrée de page, cascade des cartes, compteurs, indicateurs actifs qui glissent, ligne ajoutée/retirée (`AnimatePresence` + `layout`),
confirmation d'action. `prefers-reduced-motion` est déjà respecté globalement.

## Qualité

- Français partout, typographie française (espaces avant `:`, guillemets « »).
- `npx tsc --noEmit` et `npx eslint <vos fichiers>` sans erreur dans `apps/web`.
- Aucune donnée personnelle dans les journaux de la console.

## Disposition inspirée de l'intranet (`C:\xampp\htdocs\intra_front`)

La charte BEILE (couleurs gouvernementales, polices) est conservée ; on reprend la **structure** et la **densité** de l'intranet.
Jetons BEILE : `bg-bg` (fond), `bg-surface`, `bg-surface-2`, `text-ink` / `text-ink-2` / `text-ink-muted`, `border-line`, `bg-blue-soft text-accent-ink`,
états `bg-success-bg text-success`, `bg-warning-bg text-warning`, `bg-critical-bg text-critical`, `bg-info-bg text-info`. Jamais de gris ou de bleu Tailwind en dur.

1. **Racine de page** : `<EntreePage><div className="space-y-5">` (tableau de bord : `space-y-6`). Premier élément : `PageHeader` (titre, sous-titre, actions à droite, action primaire en dernier avec icône).
2. **Onglets** juste sous l'en-tête : `Segmente`, état synchronisé avec l'URL `?onglet=` quand c'est utile.
3. **Tuiles KPI** : grille `grid gap-3 sm:grid-cols-2 lg:grid-cols-4` (ou `-5`), dans `Cascade`/`Element`. Anatomie : libellé `text-[10.5px] uppercase tracking-[0.12em] text-ink-muted` + icône 16 en haut à droite ; valeur `text-2xl font-semibold tabular-nums` (Compteur) ; indication `text-xs text-ink-muted` ; sparkline facultative.
4. **Tableau de bord** : `grid gap-6 lg:grid-cols-3`, colonne étroite + colonne large `lg:col-span-2`. **`min-w-0` sur chaque colonne et chaque carte** (évite tout débordement horizontal).
5. **Listes et tableaux** : une carte de filtres `p-3` en `grid gap-3 sm:grid-cols-[1fr_auto_auto]` (recherche avec icône à gauche, sélecteurs), puis une carte `overflow-hidden p-0` contenant `overflow-x-auto` > `table w-full text-sm tabular-nums`. En-têtes `bg-surface-2 text-xs uppercase tracking-wide text-ink-muted`, cellules `px-5 py-3`, cellule principale sur deux lignes (`font-medium text-ink` + `text-xs text-ink-muted`), actions alignées à droite en boutons `sm`. Colonnes secondaires `hidden sm:table-cell` ; les listes d'entités (élèves, comptes) passent en **grille de cartes** `sm:grid-cols-2 lg:grid-cols-3` sous `md`.
6. **Lignes qui arrivent** : `AnimatePresence` + `motion.tr/li layout`, décalage `min(i,12)*0.035 s`.
7. **États, dans cet ordre** : chargement (squelettes de lignes), erreur (`EtatVide` + Réessayer), vide (`EtatVide` + action), données.
8. **Statuts** : `Badge` avec point, mapping central `TON[statut]` / `LIBELLE[statut]` dans le fichier de l'espace.
9. **Formulaires** : carte `space-y-4`, rangées `grid gap-4 sm:grid-cols-2`, champs `h-10 rounded-md border border-line bg-surface px-3.5 text-sm focus:border-blue focus:ring-4 focus:ring-blue/15`, libellé `text-sm font-medium`, erreur par champ `text-xs text-critical`, pied `flex justify-end gap-3` (Annuler secondaire, puis Enregistrer primaire avec `chargement`).
10. **Modales** (confirmations, détails) : **feuille basse sur mobile** (`items-end`, `rounded-t-2xl`), centrée à partir de `sm` (`sm:rounded-2xl sm:max-w-lg`), voile `bg-navy-deep/40 backdrop-blur-sm`, entrée en ressort (stiffness 360, damping 30), Échap et clic sur le voile ferment, en-tête/pied séparés par `border-line`. Pas de tiroir latéral.
11. **Listes d'activité** : `ul divide-y divide-line`, `li flex items-start gap-3 py-2.5`, point de statut `h-2 w-2 rounded-full`, titre `text-sm`, heure relative `text-xs text-ink-muted` à droite.
12. **Micro-interactions** : bouton `active:scale-[0.97]`, carte cliquable `hover:-translate-y-1 hover:shadow-pop`, entrées 0,24–0,45 s, ease `[0.22,1,0.36,1]`, cascade 50 ms.
