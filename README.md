# My Childhood TV

Un salon des années 2000 reconstitué en full-screen dans le navigateur, avec au centre une télévision qui diffuse en direct — tous les visiteurs regardent la même vidéo au même moment, comme une vraie chaîne.

Site 100% statique (HTML/CSS/JS vanilla), sans dépendance serveur ni build (le tchat utilise Firebase, voir plus bas). Déployable tel quel sur Netlify, Vercel, GitHub Pages, ou en ouvrant simplement `index.html` via un petit serveur local.

## Lancer le projet en local

```bash
# n'importe quel serveur statique fonctionne, par exemple :
python3 -m http.server 8000
# puis ouvrir http://localhost:8000
```

(Ouvrir `index.html` directement en `file://` fonctionne aussi pour le décor, mais l'API YouTube IFrame nécessite d'être servi en `http://` ou `https://`.)

## Structure du projet

```
index.html            Structure de la page (décor, télé, télécommande, réglages, tchat)
styles/
  main.css            Mise en page, décor "cartoon", jour/nuit, météo, responsive
  crt.css             Boot, statique, écran de veille, mode cinéma
scripts/
  config.js           <-- Configuration de la chaîne par défaut
  storage.js           Persistance localStorage (chaîne, volume, chaînes perso...)
  audio.js              Tous les sons (synthétisés en Web Audio API, pas de fichier audio)
  player.js             Wrapper autour de l'API YouTube IFrame
  schedule.js            "Diffusion en direct" (calcul de la vidéo/du moment à afficher)
  firebase-init.js         Initialise Firebase une seule fois (partagé tchat + chaîne en direct)
  shared-channel.js        La chaîne actuellement diffusée, partagée entre tous les visiteurs
  decor.js               Easter eggs (lampe à lave, horloge, chat), jour/nuit, météo
  screensaver.js          Écran de veille rétro après inactivité
  remote.js                Télécommande + réglages protégés par mot de passe + guide TV
  firebase-config.js       <-- Configuration Firebase (tchat + chaîne en direct, voir plus bas)
  chat.js                  Tchat en direct entre visiteurs
  main.js                   Séquence de démarrage + branchement de tous les modules
```

## La diffusion "en direct"

Deux ingrédients :

1. **Le calcul du moment** (`scripts/schedule.js`) : chaque navigateur calcule, à partir de l'heure (identique pour tout le monde), quel numéro de vidéo de la playlist devrait être diffusé "maintenant" — un simple découpage du temps en créneaux fixes qui boucle sur la playlist. Volontairement peu interventionniste (pas de rattrapage seconde par seconde) pour éviter de perturber le lecteur YouTube (voir plus bas, pubs).
2. **La chaîne elle-même, partagée** (`scripts/shared-channel.js`, via Firebase) : sans backend, chaque appareil gardait sa propre chaîne sélectionnée en mémoire locale — deux visiteurs sur deux appareils pouvaient donc se retrouver sur deux chaînes différentes, ce qui n'a rien de "en direct". La chaîne active (nom + playlist + **la liste exacte des vidéos qui la composent**) est donc stockée dans la même base Firebase que le tchat, écrite uniquement par l'admin (mot de passe) et lue par tout le monde en temps réel. Partager la liste de vidéos elle-même (pas juste l'ID de la playlist) évite aussi que deux appareils obtiennent une liste légèrement différente depuis YouTube (région, chargement partiel...) et calculent donc un numéro de vidéo différent pour la même minute.

**Limites à connaître** :
- Sans clé API YouTube, on ne connaît pas la durée réelle de chaque vidéo : le calcul suppose une durée fixe par créneau (4 minutes, réglable via `SLOT_SECONDS` dans `schedule.js`).
- YouTube n'expose aucun moyen fiable de détecter/zapper une publicité depuis un site externe (volontaire de leur part) : le bouton "Ignorer la pub" des réglages fait de son mieux (recharge la vidéo) mais ne fonctionne pas à 100% des cas.
- **Sans Firebase configuré**, chaque appareil reste indépendant pour le choix de chaîne (mais tout le monde a la même chaîne par défaut, codée en dur dans `config.js`).

## Réglages protégés par mot de passe

Le bouton ⚙ au-dessus de la télé ouvre un panneau protégé par le mot de passe **`Foot2Rue`** (modifiable dans `scripts/remote.js`, constante `SETTINGS_PASSWORD`). Une fois déverrouillé, ce panneau permet de :
- mettre la diffusion en pause, passer à la vidéo suivante, ou revenir au direct, ou tenter d'ignorer une pub (sur cet appareil uniquement)
- ajouter/choisir une chaîne personnalisée (playlist YouTube) — **avec Firebase configuré, ce choix est diffusé à tous les visiteurs en temps réel** (voir la section suivante) ; sinon il ne change la chaîne que sur cet appareil

⚠️ **Ce mot de passe est vérifié côté navigateur**, dans du code visible par n'importe qui (comme tout site 100% statique sans serveur). C'est un verrou simple pour éviter qu'on y touche par mégarde, pas une vraie protection contre quelqu'un de déterminé à lire le code source.

## Firebase (tchat + chaîne en direct partagée)

Le tchat et la synchronisation de la chaîne en direct ont besoin d'un endroit partagé pour stocker des données entre visiteurs ; ce dépôt utilise **Firebase Realtime Database** (gratuit) pour les deux. Pour l'activer :

1. Ouvre `scripts/firebase-config.js` : les instructions complètes de création du projet Firebase (gratuit, 5 minutes, sans carte bancaire) y sont détaillées en commentaire.
2. Colle la configuration de ton projet Firebase dans ce fichier.
3. Dans les règles de ta Realtime Database (onglet "Règles"), assure-toi d'avoir bien les DEUX chemins suivants (pas seulement `messages`) :
   ```json
   {
     "rules": {
       "messages": { ".read": true, ".write": true },
       "liveChannel": { ".read": true, ".write": true }
     }
   }
   ```

Sans configuration, le tchat affiche "non configuré" et la chaîne en direct reste locale à chaque appareil — le reste du site fonctionne normalement dans les deux cas.

Chaque visiteur du tchat reçoit un pseudo aléatoire de personnage de dessin animé des années 2000 (Titeuf, Oggy, Kim Possible...), différent à chaque nouvelle visite.

## Fonctionnalités

**Cœur du site**
- Décor de salon année 2000 en pur CSS, style cartoon — décor fixe, seules les animations dédiées bougent
- Télévision avec un vrai lecteur YouTube IFrame API, diffusion "en direct" synchronisée entre tous les visiteurs (voir plus haut)
- Télécommande utilisable à la souris et au clavier (power, volume, muet, plein écran)
- Guide des programmes (bouton "TV" sur l'étagère) : ce qui passe en ce moment et ensuite

**Bonus**
- Écran de démarrage rétro façon connexion bas débit
- Réglages protégés par mot de passe (choix de chaîne, pause/suivant/direct)
- Tchat en direct entre visiteurs (Firebase, voir plus haut)
- Écran de veille rétro après quelques minutes d'inactivité
- Cycle jour/nuit (lampe de chevet à côté de la télé) + météo qui change derrière la fenêtre le jour, ciel étoilé la nuit
- Easter eggs : lampe à lave animable au clic, horloge du magnétoscope à l'heure réelle (glitch amusant au clic), gros chat noir paresseux qui se balade rarement et s'allonge à différents endroits
- Mode plein écran cinéma (bouton "⛶ Écran" sur la télécommande, ou double-clic sur l'écran ; `Échap` pour sortir)
- Ambiance sonore synthétisée (crépitement, tic-tac) avec bouton dédié pour la couper
- Site responsive : sur mobile, la vue se recentre sur la télé et la télécommande

## Contraintes techniques respectées

- Un seul lecteur YouTube instancié à la fois
- Aucune dépendance serveur pour la télé (tout tourne côté front) ; le tchat utilise Firebase (backend géré, pas de serveur à maintenir)
- Aucun fichier audio/image externe : les sons sont synthétisés (Web Audio API) et le décor est fait en CSS/SVG inline
