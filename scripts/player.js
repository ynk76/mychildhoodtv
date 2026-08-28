/**
 * ============================================================================
 *  TVPlayer — wrapper autour de l'API YouTube IFrame officielle.
 * ============================================================================
 *  Un SEUL lecteur YouTube est instancié pour toute la session (contrainte
 *  de perf du cahier des charges). Changer de "chaîne" recharge simplement
 *  une nouvelle playlist dans ce même lecteur via loadPlaylist().
 * ============================================================================
 */

class TVPlayer {
  constructor({ elementId, initialVolume, onReady, onStateChange }) {
    this.elementId = elementId;
    this.initialVolume = initialVolume;
    this.onReadyCallback = onReady;
    this.onStateChangeCallback = onStateChange;
    this.onEndedCallback = null; // assignable après coup (voir schedule.js)
    this.player = null;
    this.ready = false;
    this._pending = null; // { channel, index } demandé avant que le lecteur soit prêt
    this._loadApi();
  }

  _loadApi() {
    if (window.YT && window.YT.Player) {
      this._createPlayer();
      return;
    }
    // La fonction globale onYouTubeIframeAPIReady est appelée par le script
    // YouTube une fois chargé. On chaîne proprement si autre chose l'utilise déjà.
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (typeof previous === "function") previous();
      this._createPlayer();
    };
    if (!document.getElementById("youtube-iframe-api")) {
      const tag = document.createElement("script");
      tag.id = "youtube-iframe-api";
      tag.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(tag);
    }
  }

  _createPlayer() {
    this.player = new YT.Player(this.elementId, {
      width: "100%",
      height: "100%",
      playerVars: {
        autoplay: 1,
        // Toujours démarrer coupé : les navigateurs bloquent l'autoplay avec
        // le son sauf si la vidéo est muette au départ. On réapplique l'état
        // sonore réellement voulu juste après (voir onReady -> _applyVolumeState
        // côté RemoteControl), ce qui, lui, est autorisé car déclenché par le
        // code de la page suite au clic de démarrage de l'utilisateur.
        mute: 1,
        controls: 0,
        disablekb: 1,
        fs: 0,
        iv_load_policy: 3,
        modestbranding: 1,
        rel: 0,
        playsinline: 1,
        listType: "playlist",
      },
      events: {
        onReady: (e) => {
          this.ready = true;
          e.target.setVolume(this.initialVolume);
          if (this._pending) {
            const { channel, index } = this._pending;
            this._pending = null;
            this.playChannelAt(channel, index);
          }
          if (typeof this.onReadyCallback === "function") this.onReadyCallback(e);
        },
        onStateChange: (e) => {
          if (e.data === YT.PlayerState.ENDED && typeof this.onEndedCallback === "function") {
            this.onEndedCallback();
          }
          if (typeof this.onStateChangeCallback === "function") this.onStateChangeCallback(e);
        },
        onError: () => {
          // Playlist indisponible : on ignore, l'écran garde juste l'effet CRT.
        },
      },
    });
  }

  playChannel(channel) {
    this.playChannelAt(channel, 0);
  }

  /** Comme playChannel, mais démarre directement au N-ième élément de la playlist. */
  playChannelAt(channel, index) {
    if (!this.ready || !this.player || typeof this.player.loadPlaylist !== "function") {
      this._pending = { channel, index: index || 0 };
      return;
    }
    try {
      this.player.loadPlaylist({ list: channel.playlistId, listType: "playlist", index: index || 0 });
    } catch (e) {
      /* playlist invalide fournie par l'utilisateur : silencieux */
    }
  }

  play() {
    if (this.ready) this.player.playVideo();
  }

  pause() {
    if (this.ready) this.player.pauseVideo();
  }

  setVolume(vol) {
    if (this.ready) this.player.setVolume(vol);
  }

  mute() {
    if (this.ready) this.player.mute();
  }

  unmute() {
    if (this.ready) this.player.unMute();
  }

  /** Liste ordonnée des IDs vidéo de la playlist en cours (dispo une fois la playlist chargée). */
  getPlaylistIds() {
    if (!this.ready || !this.player || typeof this.player.getPlaylist !== "function") return null;
    try {
      return this.player.getPlaylist() || null;
    } catch (e) {
      return null;
    }
  }

  playVideoAt(index) {
    if (!this.ready || !this.player) return;
    try {
      this.player.playVideoAt(index);
    } catch (e) {
      /* index hors limites : silencieux */
    }
  }

  seekTo(seconds) {
    if (!this.ready || !this.player) return;
    try {
      this.player.seekTo(seconds, true);
    } catch (e) {
      /* silencieux */
    }
  }

  nextVideo() {
    if (this.ready && this.player) this.player.nextVideo();
  }

  getCurrentTime() {
    if (!this.ready || !this.player || typeof this.player.getCurrentTime !== "function") return null;
    try {
      return this.player.getCurrentTime();
    } catch (e) {
      return null;
    }
  }

  getVideoTitle() {
    if (!this.ready || !this.player || typeof this.player.getVideoData !== "function") return "";
    try {
      const data = this.player.getVideoData();
      return (data && data.title) || "";
    } catch (e) {
      return "";
    }
  }
}

window.TVPlayer = TVPlayer;
