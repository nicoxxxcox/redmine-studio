# Redmine Studio

Client web moderne et ergonomique pour **Redmine 3.4+**, centré sur le travail quotidien :
consulter ses tickets, commenter et suivre le temps passé.

L'application se connecte directement à votre instance Redmine avec **votre clé API**. Aucun
compte, aucune base de données et aucun service tiers : la clé reste dans votre navigateur et
toutes les requêtes passent par le petit proxy same-origin intégré à l'application.

## Fonctionnalités

- **Tableau de bord** : tickets assignés, retards, tickets créés, temps de la semaine, activité
  récente.
- **Tickets** : liste filtrable (projet, statut, assigné, priorité, tracker, auteur, retard,
  recherche), changement de statut et d'assigné rapide depuis chaque ligne, le kanban et le
  tableau de bord, numéro copiable en un clic, une couleur distincte par statut, sprint (plugin
  Scrum, sinon version cible) visible dans la liste, le kanban et le détail, tableau kanban avec
  changement de statut par glisser-déposer et filtrage des colonnes de statut affichées.
- **Édition par lot** : sélection par cases à cocher dans la liste et le kanban, puis modification
  groupée du statut, de l'assigné et du sprint. Le changement de sprint est limité à une sélection
  dans un même projet, car les identifiants de sprint sont propres au projet.
- **Détail d'un ticket** : changement de statut et d'assigné rapide dans l'en-tête, sujet et
  description éditables avec un éditeur enrichi (gras, italique, titres, listes, citations, code,
  liens et bascule vers la source Textile), propriétés (statut, priorité, assigné, tracker,
  version, dates, estimation, avancement), suivi (watchers), relations et sous-tickets, pièces
  jointes avec aperçu des images (SVG compris) et visionneuse plein écran.
- **Discussion** : commentaires triables et repliables (les plus récents d'abord, les 3 derniers
  ouverts par défaut), historique des modifications compact, rédaction et édition des notes avec
  un éditeur enrichi, notes privées, pièces jointes visibles sous chaque commentaire et brouillons
  conservés localement.
- **Collage d'images** : `Ctrl+V` / `⌘+V` dans la description d'un ticket, l'édition de
  description ou un nouveau commentaire insère une référence compacte et joint l'image à
  l'enregistrement. Redmine 3.4 ne permet pas d'ajouter une pièce jointe à un commentaire existant
  lors de son édition ; un message invite alors à publier l'image dans un nouveau commentaire.
- **Mentions `@`** : autocomplétion avec recherche dans les descriptions et les commentaires,
  suggestions classées par activité (ticket courant puis saisies de temps du projet), insertion
  au format Redmine `@login` et mise en évidence dans les contenus affichés.
- **Composeur latéral** : l'ajout d'un commentaire se fait dans la colonne de droite, sans
  masquer les commentaires précédents.
- **Temps** : saisie rapide, édition/suppression, feuille de temps hebdomadaire, répartition
  par activité et résumé.
- **Projets** : accès rapide aux tickets de chaque projet.
- **Favoris** : sélection des statuts, utilisateurs et projets favoris dans les paramètres. Le
  bouton **Favoris** des listes de tickets applique automatiquement ces favoris (projets, statuts et
  assignés) et limite les choix des filtres ; il peut être désactivé pour revenir à tous les
  tickets. Une catégorie vide conserve tous ses éléments.
- **Confort** : thème clair/sombre/système, palette de commandes (`⌘/Ctrl + K`), raccourcis
  clavier, interface responsive, largeur des colonnes des tableaux ajustable (glisser les
  séparateurs d'en-tête, double-clic pour réinitialiser, mémorisée localement), notifications.
- **Rendu Textile / Markdown** léger et sécurisé pour les descriptions et commentaires.

## Prérequis

- Node.js **18 ou plus** (testé avec Node 24).
- Une instance **Redmine 3.4 ou plus récente** avec l'API REST activée.
- Votre **clé d'accès API** Redmine.

### Activer l'API et récupérer sa clé

1. Dans Redmine : **Administration → Paramètres → API** → cocher *Activer le service web REST*.
2. Ouvrir **Mon compte** (`/my/account`) → colonne de droite → **Clé d'accès API**.
3. Si aucune clé n'existe, cliquer sur **Réinitialiser** pour en générer une.

> L'API doit être activée côté Redmine. Une clé valide ne suffit pas si le service REST est
> désactivé.

## Démarrage

```bash
npm install
npm run dev
```

Ouvrir <http://localhost:5173>, renseigner l'URL de l'instance (par exemple
`https://redmine.mon-entreprise.fr`) et la clé API, puis **Tester la connexion** et
**Se connecter**.

Pour exposer le serveur de développement sur le réseau local :

```bash
npm run dev -- --host 0.0.0.0
```

## Production

```bash
npm run build
npm start
```

L'application est servie sur <http://127.0.0.1:4173> par défaut.

Variables d'environnement du serveur (`server/index.mjs`) :

| Variable | Défaut      | Description                          |
| -------- | ----------- | ------------------------------------ |
| `PORT`   | `4173`      | Port d'écoute                        |
| `HOST`   | `127.0.0.1` | Interface d'écoute                   |

Exemple :

```bash
HOST=0.0.0.0 PORT=8080 npm start
```

En production, placez l'application derrière un reverse proxy HTTPS (nginx, Caddy, Apache…) et
protégez l'accès si l'instance Redmine n'est pas publique.

## Pourquoi un proxy ?

Redmine 3.4 n'envoie pas d'en-têtes **CORS**. Un navigateur ne peut donc pas appeler directement
`https://redmine.exemple.fr/issues.json` depuis une autre origine, et la clé API ne doit pas
transiter par un service tiers.

Redmine Studio embarque un proxy **same-origin** :

- le client appelle `/api/redmine/issues.json` ;
- il indique l'instance cible via l'en-tête `X-Redmine-Base` et la clé via
  `X-Redmine-API-Key` ;
- le middleware Node (`server/proxy.mjs`) relaie la requête vers Redmine, sans journaliser ni
  stocker la clé ;
- le même middleware est monté dans Vite en développement et dans le serveur de production.

Aucune modification d'Apache/nginx n'est nécessaire sur le serveur Redmine.

## Sécurité et données

- La clé API est stockée dans `localStorage` si **Mémoriser la clé** est coché, sinon dans
  `sessionStorage` (oubliée à la fermeture de l'onglet).
- Elle n'est jamais écrite dans les logs du proxy ni envoyée à un service externe.
- Les brouillons de commentaires sont enregistrés dans `localStorage` sous
  `redmine-studio.issue-draft.<id>` et peuvent être effacés depuis **Paramètres**.
- Le proxy accepte l'URL cible depuis l'en-tête `X-Redmine-Base`. Il est donc destiné à un usage
  local ou à un déploiement de confiance : ne l'exposez pas publiquement sans authentification.

### Édition des commentaires

Redmine 3.4 n'expose pas l'édition des journaux dans son API REST. Redmine Studio utilise donc
la route web `/journals/:id/edit`, récupère le jeton CSRF du formulaire puis soumet la note.
Cette opération nécessite une **session Redmine active** dans le navigateur. Pour éviter toute
fuite, le proxy ne transmet le cookie de session que lorsque Redmine est servi sur le même nom
d'hôte que l'application (les ports peuvent différer). Sur une instance distante, l'édition est
refusée avec un message explicite ; les autres fonctions restent disponibles avec la clé API.

Le collage d'une image s'effectue dans le composeur de nouveau commentaire, la description d'un
ticket ou le formulaire de création. Redmine 3.4 ne permet pas d'ajouter une pièce jointe à un
journal existant : lors de l'édition d'une note, un message invite à publier l'image dans un
nouveau commentaire.

## Certificats et réseau

Le proxy utilise Node.js pour joindre Redmine. Si votre instance utilise une autorité de
certification interne, fournissez son bundle à Node :

```bash
NODE_EXTRA_CA_CERTS=/chemin/vers/ca.pem npm start
```

Un certificat auto-signé non approuvé provoquera une erreur `502` avec un code
`DEPTH_ZERO_SELF_SIGNED_CERT` ou `UNABLE_TO_VERIFY_LEAF_SIGNATURE`.

## Raccourcis clavier

| Raccourci            | Action                          |
| -------------------- | ------------------------------- |
| `⌘/Ctrl + K`, `/`    | Ouvrir la palette de commandes  |
| `N`                  | Nouveau ticket                  |
| `T`                  | Saisir du temps                 |
| `G` puis `D`         | Tableau de bord                 |
| `G` puis `I`         | Tickets                         |
| `G` puis `T`         | Temps                           |
| `G` puis `P`         | Projets                         |
| `G` puis `S`         | Paramètres                      |

Les raccourcis sont désactivés pendant la saisie dans un champ.

## Structure du projet

```text
.
├── index.html
├── vite.config.js          # Vite + montage du proxy en développement
├── server/
│   ├── proxy.mjs           # Middleware proxy Redmine (dev et production)
│   └── index.mjs           # Serveur statique + proxy pour la production
├── public/
│   └── favicon.svg
└── src/
    ├── App.vue             # Amorçage, session, thème, erreurs de connexion
    ├── router.js           # Routes et garde d'authentification
    ├── lib/
    │   ├── api.js          # Client REST Redmine
    │   ├── format.js       # Dates, durées, rendu Textile/Markdown
    │   ├── pastedImages.js # Images du presse-papiers et références de brouillon
    │   ├── constants.js    # Tons de statuts, priorités, avatars
    │   └── theme.js        # Thème clair/sombre/système
    ├── stores/             # Pinia : session, réglages, UI, temps, notifications
    ├── components/         # Coquille, sidebar, topbar, modales, badges…
    └── views/              # Tableau de bord, tickets, détail, temps, projets, réglages
```

## Compatibilité Redmine

- API REST Redmine **3.4+** (`/issues.json`, `/time_entries.json`, `/projects.json`,
  `/users/current.json`, `/uploads.json`, etc.).
- Les statuts autorisés (`allowed_statuses`) sont utilisés lorsqu'ils sont disponibles
  (Redmine récent) ; sinon tous les statuts de l'instance sont proposés.
- Les watchers, relations, sous-tickets et pièces jointes sont pris en charge.
- Le sprint du plugin **Scrum** (`issues.sprint_id`) n'est pas exposé par l'API REST de
  Redmine 3.4. Redmine Studio le lit dans les pages HTML de la liste et du ticket, authentifiées
  par la clé API, puis l'associe aux tickets. Pour l'édition par lot, les sprints disponibles
  sont extraits des valeurs du filtre « Sprint » de la liste HTML (l'endpoint REST du plugin
  exige une session web) et enregistrés via `sprint_id`. Sans sprint Scrum, la version cible
  (`fixed_version`) reste utilisée comme libellé et champ de repli.
- Le collage d'images joint les fichiers via `/uploads.json` puis les référence en Textile
  (`!fichier!`) dans la description ou la note. Les fichiers collés ne sont pas conservés dans
  les brouillons locaux : recollez-les après un rechargement de la page.
- Les champs personnalisés ne sont pas encore éditables.
- Le rendu Textile/Markdown est volontairement léger : titres, listes, citations, gras, italique,
  code, liens, références `#123`. Il ne remplace pas le rendu complet de Redmine (tableaux,
  macros, images).

## Dépannage

| Symptôme | Piste |
| -------- | ----- |
| `Clé API refusée` | Vérifier la clé dans **Mon compte** et que l'API REST est activée. |
| `Redmine est injoignable` | Vérifier l'URL (sous-dossier inclus), le réseau, le VPN et le certificat TLS. |
| `Impossible de contacter le proxy local` | Lancer l'application avec `npm run dev` ou `npm start`, pas en ouvrant `dist/index.html`. |
| Erreur `502` avec `CERT_*` | Installez le certificat ou utilisez `NODE_EXTRA_CA_CERTS`. |
| Aucun projet | Le compte Redmine n'a peut-être accès à aucun projet, ou l'API projects est restreinte. |
| Liste des membres vide | L'utilisateur n'a pas la permission *Voir les membres*; la liste se limite alors à votre compte. |

## Licence

Projet privé. Redmine est une marque de ses auteurs respectifs ; Redmine Studio est un client non
officiel.
