/**
 * ============================================================================
 *  CONFIGURATION DE LA CHAINE — "My Childhood TV"
 * ============================================================================
 *  Une seule chaîne par défaut : un mix de dessins animés/génériques
 *  années 2000. `playlistId` accepte :
 *    - un ID de playlist YouTube classique (commence par "PL...")
 *    - un ID de "mix" YouTube (commence par "RD" + un ID de vidéo)
 *  Les visiteurs peuvent remplacer/compléter cette chaîne par leur propre
 *  playlist YouTube via le panneau Réglages (stocké en localStorage, voir
 *  scripts/storage.js -> getAllChannels()).
 * ============================================================================
 */

const DEFAULT_CHANNELS = [
  {
    number: 1,
    name: "My Childhood TV",
    playlistId: "PL6hfXTHSuahysoYq9bztq8UVSgXBtU_Jt",
  },
];

// Exposé globalement (pas de bundler dans ce projet : scripts chargés en <script> classiques)
window.DEFAULT_CHANNELS = DEFAULT_CHANNELS;
