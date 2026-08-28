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
 *  chaîne de télé. La playlist boucle indéfiniment (l'index revient à 0 une
 *  fois la fin atteinte).
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
const DRIFT_TOLERANCE_SECONDS = 4;

// Cache partagé le temps de la session : évite de re-scanner une playlist
// déjà vue (utile quand on jongle entre plusieurs chaînes dans les réglages).
const playlistCache = new Map();

class LiveSchedule {
  constructor(player) {
    this.player = player;
    this.playlistIds = null;
    this.live = true; // suit le direct, ou a été mis en pause/changé manuellement par l'admin
    this.active = true; // la télé est allumée (vs éteinte à la télécommande)
    this._lastIndex = null;
    this._lastChannel = null;
    this._pollTimer = null;
    this._resyncTimer = null;
  }

  /** Démarre (ou change de) la diffusion en direct pour une chaîne donnée. */
  start(channel) {
    this.live = true;
    this._lastChannel = channel;
    this._lastIndex = null;
    clearTimeout(this._pollTimer);
    clearInterval(this._resyncTimer);

    const cached = playlistCache.get(channel.playlistId);
    if (cached) {
      this.playlistIds = cached;
      if (this.active) {
        // playlist déjà connue : on peut charger directement le bon index,
        // sans passer par la vidéo n°1 le temps de re-détecter la playlist.
        const { index, offset } = this._currentSlot();
        this._lastIndex = index;
        this.player.playChannelAt(channel, index);
        setTimeout(() => this.player.seekTo(offset), 900);
        this._armResync();
        // la playlist en cache peut avoir changé depuis (ex: mix YouTube
        // régénéré) : on la rafraîchit discrètement sans couper la lecture
        setTimeout(() => this._refreshCache(), 2000);
      } else {
        this.player.playChannel(channel);
        this.player.pause();
      }
    } else {
      this.playlistIds = null;
      this.player.playChannel(channel);
      if (!this.active) this.player.pause();
      // on laisse le lecteur assimiler la nouvelle playlist avant de lire
      // sa liste de vidéos (sinon on risque de lire l'ancienne, périmée)
      this._pollTimer = setTimeout(() => this._waitForPlaylist(), 700);
    }
  }

  _waitForPlaylist(attempts = 0) {
    const ids = this.player.getPlaylistIds();
    if (ids && ids.length) {
      this.playlistIds = ids;
      playlistCache.set(this._lastChannel.playlistId, ids);
      if (this.active) this._syncToLive();
      this._armResync();
    } else if (attempts < 40) {
      this._pollTimer = setTimeout(() => this._waitForPlaylist(attempts + 1), 250);
    }
  }

  _refreshCache() {
    const ids = this.player.getPlaylistIds();
    if (ids && ids.length) {
      this.playlistIds = ids;
      playlistCache.set(this._lastChannel.playlistId, ids);
    }
  }

  _armResync() {
    clearInterval(this._resyncTimer);
    this._resyncTimer = setInterval(() => {
      if (this.live && this.active) this._syncToLive();
    }, RESYNC_INTERVAL_MS);
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
    if (index !== this._lastIndex) {
      // vraiment une nouvelle vidéo à afficher
      this._lastIndex = index;
      this.player.playVideoAt(index);
      setTimeout(() => this.player.seekTo(offset), 700);
    } else {
      // même vidéo qu'avant : on ne fait que corriger une dérive
      // significative, jamais un playVideoAt qui la relancerait pour rien
      const current = this.player.getCurrentTime();
      if (current != null && Math.abs(current - offset) > DRIFT_TOLERANCE_SECONDS) {
        this.player.seekTo(offset);
      }
    }
  }

  /** Contrôle admin (protégé par mot de passe côté UI) : pause locale, ne suit plus le direct. */
  pauseLocal() {
    this.live = false;
    this.player.pause();
  }

  /** Contrôle admin : passe à la vidéo suivante de la playlist, ne suit plus le direct. */
  skipNext() {
    this.live = false;
    this._lastIndex = null;
    this.player.nextVideo();
  }

  /** Revient au direct : recale sur le créneau actuel et relance la lecture. */
  resumeLive() {
    this.live = true;
    if (this.active) {
      this._lastIndex = null;
      this._syncToLive();
      this.player.play();
      this._armResync();
    }
  }

  /** La télé s'éteint : on coupe toute resynchronisation en arrière-plan. */
  suspend() {
    this.active = false;
    clearInterval(this._resyncTimer);
    this.player.pause();
  }

  /** La télé se rallume : on rejoint le direct exactement là où il en est. */
  resume() {
    this.active = true;
    if (!this.playlistIds) {
      // jamais eu le temps de charger la playlist avant l'extinction
      if (this._lastChannel) this.start(this._lastChannel);
      return;
    }
    if (this.live) {
      this._lastIndex = null;
      this._syncToLive();
      this._armResync();
    }
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
