# My Childhood TV

Un salon des années 2000 reconstitué en full-screen dans le navigateur, avec au centre une télévision qui diffuse un vrai lecteur YouTube pilotable à la télécommande.

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
index.html            Structure de la page (décor, télé, télécommande, réglages)
styles/
  main.css            Mise en page, décor "cartoon", jour/nuit, responsive
  crt.css             Boot, statique, écran de veille, mode cinéma
scripts/
  config.js           <-- Configuration de la chaîne par défaut (voir ci-dessous)
  storage.js           Persistance localStorage (chaîne, volume, chaînes perso...)
  audio.js              Tous les sons (synthétisés en Web Audio API, pas de fichier audio)
  player.js             Wrapper autour de l'API YouTube IFrame (un seul lecteur instancié)
  decor.js               Easter eggs (lampe à lave, horloge à l'heure réelle, chat), jour/nuit
  screensaver.js          Écran de veille rétro après inactivité
  remote.js                Logique de la télécommande et des réglages (choix de chaîne)
  main.js                   Séquence de démarrage + branchement de tous les modules
```

## Changer ou ajouter une chaîne

Le site diffuse une seule chaîne par défaut (un mix de génériques de dessins animés des années 2000). Deux façons de la remplacer/compléter :

### 1. Chaîne en dur (pour les développeurs)

Ouvrir `scripts/config.js` et modifier l'entrée du tableau `DEFAULT_CHANNELS` :

```js
{
  number: 1,
  name: "Ma Chaîne",
  playlistId: "PLxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
}
```

`playlistId` accepte :
- un ID de playlist YouTube classique (commence par `PL...`)
- un ID de "mix" YouTube (`RD` + un ID de vidéo), pratique pour transformer une simple vidéo en flux continu

### 2. Chaîne personnalisée (pour les visiteurs, sans toucher au code)

Cliquer sur le bouton ⚙ au-dessus de la télé (ou sur le bouton "Réglages"), puis coller :
- un nom de chaîne
- une URL de playlist YouTube (`.../playlist?list=...`), une URL de vidéo classique, ou directement un ID

Le site convertit automatiquement l'entrée en playlist utilisable, et la chaîne est sauvegardée dans le `localStorage` du navigateur (elle réapparaît donc aux visites suivantes, mais uniquement sur cet appareil/navigateur). Cliquer sur une chaîne dans la liste des réglages permet d'y basculer.

## Fonctionnalités

**Cœur du site**
- Décor de salon année 2000 en pur CSS, style cartoon (papier peint, fenêtre avec rideaux, étagères, VHS, cadres, plante, tapis, canapé) — décor fixe, seules les animations dédiées bougent
- Télévision avec un vrai lecteur YouTube IFrame API (play/pause/volume piloté en JS)
- Télécommande utilisable à la souris et au clavier (power, volume, muet, plein écran)
- Changement de chaîne avec effet de statique/neige + bandeau nom de chaîne

**Bonus**
- Écran de démarrage rétro façon connexion bas débit
- Mémoire de session (chaîne, volume, mode jour/nuit) via `localStorage`
- Formulaire de chaîne personnalisée (voir plus haut)
- Écran de veille rétro après quelques minutes d'inactivité
- Cycle jour/nuit (interrupteur en haut à gauche du salon)
- Easter eggs : lampe à lave animable au clic, horloge du magnétoscope à l'heure réelle (avec un petit glitch amusant au clic), chat qui se balade dans le salon et s'allonge à différents endroits (cliquer dessus le réveille)
- Mode plein écran cinéma (bouton "⛶ Écran" sur la télécommande, ou double-clic sur l'écran ; `Échap` pour sortir)
- Ambiance sonore synthétisée (crépitement, tic-tac) avec bouton dédié pour la couper
- Site responsive : sur mobile, la vue se recentre sur la télé et la télécommande

## Contraintes techniques respectées

- Un seul lecteur YouTube instancié à la fois
- Aucune dépendance serveur : tout tourne côté front
- Aucun fichier audio/image externe : les sons sont synthétisés (Web Audio API) et le décor est fait en CSS inline
