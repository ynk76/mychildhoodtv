/**
 * ============================================================================
 *  CONFIGURATION DES CHAINES — "Le Salon"
 * ============================================================================
 *  Pour ajouter une chaîne : ajoute un objet { number, name, playlistId }
 *  ci-dessous. `playlistId` accepte :
 *    - un ID de playlist YouTube classique (commence par "PL...")
 *    - un ID de "mix" YouTube (commence par "RD" + un ID de vidéo)
 *  Les chaînes ajoutées ici sont "en dur". Les utilisateurs peuvent aussi
 *  ajouter leurs propres chaînes via le panneau Réglages : elles sont
 *  stockées en localStorage et fusionnées avec cette liste au chargement
 *  (voir scripts/storage.js -> getAllChannels()).
 * ============================================================================
 */

const DEFAULT_CHANNELS = [
  {
    number: 1,
    name: "MTV Hits 2000",
    playlistId: "PLmyAPRLQRJ6lMbAdXYGuyZ627Y9RoX25i",
  },
  {
    number: 2,
    name: "Dessins Animés",
    playlistId: "PLJYf0JdTApCqAbZImkQagXEuByh-b_7To",
  },
  {
    number: 3,
    name: "Ciné Club",
    playlistId: "RDvTi_xaPRRhw",
  },
  {
    number: 4,
    name: "Jeux Vidéo Rétro",
    playlistId: "PLA5F8A028CC9F12FD",
  },
  {
    number: 5,
    name: "Zap Pub",
    playlistId: "PLmWoJpHG9qzwIP8-A5nVXIRt-OVC0O1qV",
  },
];

// Exposé globalement (pas de bundler dans ce projet : scripts chargés en <script> classiques)
window.DEFAULT_CHANNELS = DEFAULT_CHANNELS;
