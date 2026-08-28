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
  schedule.js            "Diffusion en direct" partagée par tous les visiteurs (voir plus bas)
  decor.js               Easter eggs (lampe à lave, horloge, chat), jour/nuit, météo
  screensaver.js          Écran de veille rétro après inactivité
  remote.js                Télécommande + réglages protégés par mot de passe + guide TV
  firebase-config.js       <-- Configuration du tchat (voir plus bas)
  chat.js                  Tchat en direct entre visiteurs
  main.js                   Séquence de démarrage + branchement de tous les modules
```

## La diffusion "en direct"

Il n'y a pas de serveur derrière ce site : pour que tout le monde regarde la même chose en même temps, chaque navigateur calcule indépendamment, à partir de l'heure (identique pour tout le monde), quelle vidéo de la playlist devrait être diffusée "maintenant" et à quel endroit — un peu comme une vraie chaîne de télé. Voir `scripts/schedule.js` pour le détail.

**Limite à connaître** : sans clé API YouTube, on ne connaît pas la durée réelle de chaque vidéo. Le calcul suppose donc une durée fixe par vidéo (4 minutes, réglable via `SLOT_SECONDS` dans `schedule.js`). Une vidéo plus courte peut donc rester figée sur sa dernière image jusqu'au créneau suivant, une vidéo plus longue peut être coupée. C'est un compromis pour rester 100% statique.

## Réglages protégés par mot de passe

Le bouton ⚙ au-dessus de la télé ouvre un panneau protégé par le mot de passe **`Foot2Rue`** (modifiable dans `scripts/remote.js`, constante `SETTINGS_PASSWORD`). Une fois déverrouillé, ce panneau permet de :
- mettre la diffusion en pause, passer à la vidéo suivante, ou revenir au direct (sur cet appareil uniquement)
- ajouter/choisir une chaîne personnalisée (playlist YouTube)

⚠️ **Ce mot de passe est vérifié côté navigateur**, dans du code visible par n'importe qui (comme tout site 100% statique sans serveur). C'est un verrou simple pour éviter qu'on y touche par mégarde, pas une vraie protection contre quelqu'un de déterminé à lire le code source.

## Le tchat en direct (Firebase)

Le tchat a besoin d'un endroit partagé pour stocker les messages entre visiteurs ; ce dépôt utilise **Firebase Realtime Database** (gratuit). Pour l'activer :

1. Ouvre `scripts/firebase-config.js` : les instructions complètes de création du projet Firebase (gratuit, 5 minutes, sans carte bancaire) y sont détaillées en commentaire.
2. Colle la configuration de ton projet Firebase dans ce fichier.

Sans configuration, le tchat affiche simplement "non configuré" et le reste du site fonctionne normalement.

Chaque visiteur reçoit un pseudo aléatoire de personnage de dessin animé des années 2000 (Titeuf, Oggy, Kim Possible...), différent à chaque nouvelle visite.

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
