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
  schedule.js            Applique au lecteur du salon une position "en direct" reçue
  firebase-init.js         Initialise Firebase une seule fois (partagé tchat + chaîne en direct)
  shared-channel.js        La position en direct (chaîne + vidéo + seconde), partagée entre tous
  admin-player.js          Le lecteur "studio" (natif, visible dans les réglages admin, jamais arrêté)
  minigames.js             Détection de pub (best-effort) + mini-jeux (morpion, puissance 4, pong)
  decor.js               Easter eggs (lampe à lave, horloge, chat), jour/nuit, météo
  screensaver.js          Écran de veille rétro après inactivité
  remote.js                Télécommande + réglages protégés par mot de passe + guide TV
  firebase-config.js       <-- Configuration Firebase (tchat + chaîne en direct, voir plus bas)
  chat.js                  Tchat en direct entre visiteurs
  main.js                   Séquence de démarrage + branchement de tous les modules
```

## La diffusion "en direct"

Sans serveur permanent, il faut bien qu'une machine décide "ce qui passe en ce moment" — c'est l'admin qui joue ce rôle, via un vrai lecteur YouTube (natif, avec ses contrôles normaux) visible dans les réglages (`scripts/admin-player.js`) :

1. L'admin choisit une chaîne, puis la pilote avec l'interface YouTube normale (lecture, pause, avancer, vidéo suivante...) — plus fiable qu'une télécommande maison, puisque ça s'appuie sur le lecteur officiel. Les sous-titres sont désactivés par défaut sur ce lecteur comme sur celui du salon, et il reste volontairement muet (le son entendu par tout le monde, admin inclus, vient du lecteur du salon — sinon on entendrait les deux en même temps, légèrement désynchronisés).
2. Toutes les ~4 secondes, la position de ce lecteur (chaîne + numéro de vidéo dans la playlist + seconde + en pause ou non) est publiée dans Firebase (`scripts/shared-channel.js`), la même base que le tchat — avec une estampille **d'heure serveur** (`ServerValue.TIMESTAMP`), pas l'heure locale de l'admin : deux appareils n'ont presque jamais la même horloge système (souvent plusieurs minutes d'écart), donc comparer l'heure locale d'un visiteur à l'heure locale de l'admin aurait rendu le rattrapage complètement faux. Chaque appareil compense en plus son propre décalage d'horloge via `.info/serverTimeOffset` (mécanisme standard de Firebase).
3. Tous les visiteurs (télé du salon) reçoivent cette position en temps réel — dès la connexion pour un nouvel arrivant, comme à chaque mise à jour de l'admin ensuite — et rejoignent la même vidéo en rattrapant le temps écoulé depuis la publication (sur l'heure serveur commune) — comme rejoindre une vraie chaîne de télé déjà en cours. Si c'est déjà la bonne vidéo à l'écran, le lecteur du salon vérifie juste qu'il n'a pas dérivé de plus de **2 secondes** par rapport à l'admin, et se resynchronise (seekTo) uniquement dans ce cas — jamais à chaque mise à jour, pour ne pas perturber une publicité en cours (voir plus bas).
4. **Le lecteur studio ne s'arrête jamais** une fois lancé : fermer les réglages le rend juste invisible (réduit à 2x2 pixels dans un coin de l'écran, jamais en `display:none`, qui interromprait sa lecture) — il continue de jouer et de publier sa position en arrière-plan. Le rouvrir affiche à nouveau le même lecteur, toujours en cours, sans le recharger.
5. **Sans admin actif** — personne n'a encore publié de position, Firebase non configuré, ou la dernière publication reçue date de plus de 12 secondes (l'admin a fermé son navigateur, plus personne ne pilote) — chaque visiteur démarre sur une vidéo **aléatoire** de la playlist plutôt que toujours la même, et surtout pas sur une position figée vieille de plusieurs minutes : recharger la page fait tomber sur une autre vidéo à chaque fois.

**Limites à connaître** :
- La synchronisation fine entre appareils dépend de la fraîcheur de la dernière publication de l'admin ; passé 12 secondes sans nouvelle publication, le site bascule en mode "vidéo aléatoire" (voir point 5 ci-dessus) plutôt que de continuer à afficher une position de plus en plus périmée.
- YouTube n'expose aucun moyen fiable de détecter/zapper une publicité depuis un site externe (volontaire de leur part) : c'est un lecteur YouTube tout à fait normal. La détection de pub (voir section mini-jeux ci-dessous) comme la correction de dérive s'appuient donc sur une heuristique (comparer la vidéo réellement affichée à celle attendue dans la playlist), pas sur un vrai signal YouTube.
- Garder le lecteur studio actif en arrière-plan quand l'onglet réglages est fermé dépend du bon vouloir du navigateur : certains navigateurs peuvent throttle un iframe très peu visible pour économiser la batterie. Le lecteur reste techniquement dans la page (jamais retiré du DOM ni mis en `display:none`) pour minimiser ce risque, mais ce n'est pas garanti à 100%.
- **Sans Firebase configuré**, chaque appareil reste indépendant et démarre simplement la chaîne par défaut (vidéo aléatoire, voir ci-dessus).

## Réglages protégés par mot de passe

Le bouton ⚙ au-dessus de la télé ouvre un panneau protégé par le mot de passe **`Foot2Rue`** (modifiable dans `scripts/remote.js`, constante `SETTINGS_PASSWORD`). Une fois déverrouillé, ce panneau donne accès à :
- un vrai lecteur YouTube (le "studio") pour choisir et piloter la chaîne diffusée
- l'ajout d'une chaîne personnalisée (playlist YouTube)

**Avec Firebase configuré, tout ce que l'admin fait dans ce lecteur studio est diffusé à tous les visiteurs en temps réel** (voir la section suivante) ; sans Firebase, ça ne change la chaîne que sur cet appareil.

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
- Réglages protégés par mot de passe, avec un vrai lecteur YouTube "studio" pour piloter la diffusion (jamais interrompu, voir plus haut)
- Mini-jeux pendant les pubs (morpion, puissance 4, pong) : dès qu'une pub (ou un enchaînement de plusieurs pubs) est détectée, un mini-jeu aléatoire apparaît le temps de la coupure et disparaît au retour du programme
- Tchat en direct entre visiteurs (Firebase, voir plus haut)
- Écran de veille rétro après quelques minutes d'inactivité
- Cycle jour/nuit (lampe de chevet à côté de la télé) + météo qui change derrière la fenêtre le jour, ciel étoilé la nuit
- Easter eggs : lampe à lave animable au clic, horloge du magnétoscope à l'heure réelle (glitch amusant au clic), gros chat noir paresseux qui se balade rarement et s'allonge à différents endroits
- Mode plein écran cinéma (bouton "⛶ Écran" sur la télécommande, ou double-clic sur l'écran ; `Échap` pour sortir). Sur mobile en portrait, ce mode masque en plus toutes les commandes (télécommande, tchat) et pivote l'écran pour l'afficher en grand format paysage, à regarder en tournant le téléphone à l'horizontale — un bouton "✕" dédié (qui pivote avec l'écran) permet d'en sortir
- Ambiance sonore synthétisée (crépitement, tic-tac) avec bouton dédié pour la couper
- Site responsive : sur mobile, la vue se recentre sur la télé (en 16:9, à l'endroit) et la télécommande ; voir le mode plein écran cinéma ci-dessus pour la vue paysage

## Contraintes techniques respectées

- Un seul lecteur YouTube instancié côté salon pour tous les visiteurs ; un second lecteur "studio" existe une fois créé (à la première ouverture des réglages déverrouillés) et reste actif en continu pour ne jamais couper la diffusion en direct
- Aucune dépendance serveur pour la télé (tout tourne côté front) ; le tchat utilise Firebase (backend géré, pas de serveur à maintenir)
- Aucun fichier audio/image externe : les sons sont synthétisés (Web Audio API) et le décor est fait en CSS/SVG inline
