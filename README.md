# Le Salon — 2000

Un salon des années 2000 reconstitué en full-screen dans le navigateur, avec au centre une télévision cathodique qui diffuse un vrai lecteur YouTube pilotable à la télécommande.

Site 100% statique (HTML/CSS/JS vanilla), sans dépendance serveur ni build. Déployable tel quel sur Netlify, Vercel, GitHub Pages, ou en ouvrant simplement `index.html` via un petit serveur local.

## Lancer le projet en local

```bash
# n'importe quel serveur statique fonctionne, par exemple :
python3 -m http.server 8000
# puis ouvrir http://localhost:8000
```

(Ouvrir `index.html` directement en `file://` fonctionne aussi pour le décor, mais l'API YouTube IFrame nécessite d'être servi en `http://` ou `https://`.)

## Structure du projet

```
index.html            Structure de la page (décor, télé, télécommande, EPG, réglages)
styles/
  main.css            Mise en page, décor, jour/nuit, responsive
  crt.css             Effets CRT (scanlines, vignette, flicker), boot, statique, mode cinéma
scripts/
  config.js           <-- Configuration des chaînes (voir ci-dessous)
  storage.js           Persistance localStorage (chaîne, volume, chaînes perso...)
  audio.js              Tous les sons (synthétisés en Web Audio API, pas de fichier audio)
  player.js             Wrapper autour de l'API YouTube IFrame (un seul lecteur instancié)
  decor.js               Parallax, easter eggs (lampe à lave, horloge, chat), jour/nuit
  screensaver.js          Écran de veille rétro après inactivité
  remote.js                Logique de la télécommande, du zapping, du guide et des réglages
  main.js                   Séquence de démarrage + branchement de tous les modules
```

## Ajouter une nouvelle chaîne

Deux façons de faire :

### 1. Chaîne en dur (pour les développeurs)

Ouvrir `scripts/config.js` et ajouter un objet dans le tableau `DEFAULT_CHANNELS` :

```js
{
  number: 6,
  name: "Ma Nouvelle Chaîne",
  playlistId: "PLxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
}
```

`playlistId` accepte :
- un ID de playlist YouTube classique (commence par `PL...`)
- un ID de "mix" YouTube (`RD` + un ID de vidéo), pratique pour transformer une simple vidéo en flux continu

### 2. Chaîne personnalisée (pour les visiteurs, sans toucher au code)

Cliquer sur le bouton ⚙ au dos de la télé (ou sur le bouton "Réglages"), puis coller :
- un nom de chaîne
- une URL de playlist YouTube (`.../playlist?list=...`), une URL de vidéo classique, ou directement un ID

Le site convertit automatiquement l'entrée en playlist utilisable, et la chaîne est sauvegardée dans le `localStorage` du navigateur (elle réapparaît donc aux visites suivantes, mais uniquement sur cet appareil/navigateur).

## Fonctionnalités

**Cœur du site**
- Décor de salon année 2000 en pur CSS (papier peint, fenêtre avec rideaux, étagères, VHS, cadres, plante, tapis, canapé) avec un léger parallax au mouvement de souris
- Télévision CRT avec un vrai lecteur YouTube IFrame API (play/pause/volume/changement de playlist piloté en JS)
- Effets CRT en overlay (scanlines, vignette, léger scintillement)
- Télécommande utilisable à la souris et au clavier (power, chaîne +/-, volume, muet, guide)
- Changement de chaîne avec effet de statique/neige + bandeau nom/numéro de chaîne
- Guide des programmes (EPG) listant toutes les chaînes

**Bonus**
- Écran de démarrage rétro façon connexion bas débit
- Mémoire de session (dernière chaîne, volume, mode jour/nuit) via `localStorage`
- Formulaire de chaînes personnalisées (voir plus haut)
- Écran de veille rétro après quelques minutes d'inactivité
- Cycle jour/nuit (interrupteur en haut à gauche du salon)
- Easter eggs : lampe à lave animable, horloge qui s'affole, chat qui se réveille
- Mode plein écran cinéma (double-clic sur l'écran de la télé, `Échap` pour sortir)
- Ambiance sonore synthétisée (crépitement, tic-tac) avec bouton dédié pour la couper
- Site responsive : sur mobile, la vue se recentre sur la télé et la télécommande

## Contraintes techniques respectées

- Un seul lecteur YouTube instancié à la fois (les chaînes rechargent une playlist dans le même lecteur plutôt que de créer un nouvel iframe)
- Aucune dépendance serveur : tout tourne côté front
- Aucun fichier audio/image externe : les sons sont synthétisés (Web Audio API) et le décor est fait en CSS/SVG inline
