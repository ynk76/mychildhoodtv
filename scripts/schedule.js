/**
 * ============================================================================
 *  LiveSchedule — simule une chaîne "en direct" partagée par tout le monde,
 *  sans aucun serveur.
 * ============================================================================
 *  Principe : chaque visiteur calcule, à partir de l'heure UTC de son propre
 *  appareil, la même vidéo de la playlist et le même point de lecture. Comme
 *  ce calcul ne dépend que de l'heure (identique pour tout le monde) et de la
 *  playlist (identique pour tout le monde), tous les visiteurs arrivant à un
 *  instant donné tombent sur la même vidéo, au même moment — comme une vraie
 *  chaîne de télé.
 *
 *  Limite assumée : sans backend ni clé API YouTube Data, on ne connaît pas
 *  la durée réelle de chaque vidéo. On suppose donc une durée fixe par
 *  créneau (SLOT_SECONDS) : une vidéo peut donc être coupée avant sa fin
 *  réelle, ou rester figée sur sa dernière image si elle est plus courte que
 *  le créneau. C'est un compromis raisonnable pour un site 100% statique.
 * ============================================================================
 */

const SLOT_SECONDS = 240; // durée supposée par vidéo (4 minutes)
const RESYNC_INTERVAL_MS = 20000;

class LiveSchedule {
  constructor(player) {
    this.player = player;
    this.playlistIds = null;
    this.live = true;
    this._pollTimer = null;
    this._resyncTimer = null;
  }

  /** Démarre (ou change de) la diffusion en direct pour une chaîne donnée. */
  start(channel) {
    this.live = true;
    this.playlistIds = null;
    clearTimeout(this._pollTimer);
    clearInterval(this._resyncTimer);
    this.player.playChannel(channel);
    this._waitForPlaylist();
  }

  _waitForPlaylist(attempts = 0) {
    const ids = this.player.getPlaylistIds();
    if (ids && ids.length) {
      this.playlistIds = ids;
      this._syncToLive();
      this._resyncTimer = setInterval(() => {
        if (this.live) this._syncToLive();
      }, RESYNC_INTERVAL_MS);
    } else if (attempts < 40) {
      this._pollTimer = setTimeout(() => this._waitForPlaylist(attempts + 1), 250);
    }
  }

  _currentSlot() {
    const nowSeconds = Date.now() / 1000;
    const slot = Math.floor(nowSeconds / SLOT_SECONDS);
    const index = slot % this.playlistIds.length;
    const offset = nowSeconds % SLOT_SECONDS;
    return { index, offset };
  }

  _syncToLive() {
    if (!this.playlistIds || !this.playlistIds.length) return;
    const { index, offset } = this._currentSlot();
    this.player.playVideoAt(index);
    // petite marge pour laisser la vidéo se charger avant de chercher la position
    setTimeout(() => this.player.seekTo(offset), 700);
  }

  /** Contrôle admin (protégé par mot de passe côté UI) : pause locale, ne suit plus le direct. */
  pauseLocal() {
    this.live = false;
    this.player.pause();
  }

  /** Contrôle admin : passe à la vidéo suivante de la playlist, ne suit plus le direct. */
  skipNext() {
    this.live = false;
    this.player.nextVideo();
  }

  /** Revient au direct : recale sur le créneau actuel et relance la lecture. */
  resumeLive() {
    this.live = true;
    this._syncToLive();
    this.player.play();
  }

  /** IDs vidéo actuellement/prochainement diffusés, pour le guide des programmes. */
  getNowAndNextIds() {
    if (!this.playlistIds || !this.playlistIds.length) return { nowId: null, nextId: null };
    const { index } = this._currentSlot();
    const nextIndex = (index + 1) % this.playlistIds.length;
    return { nowId: this.playlistIds[index], nextId: this.playlistIds[nextIndex] };
  }
}

window.LiveSchedule = LiveSchedule;
