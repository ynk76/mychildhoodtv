/**
 * ============================================================================
 *  TVPlayer — wrapper autour de l'API YouTube IFrame officielle.
 * ============================================================================
 *  C'est le lecteur "invisible" du salon, celui que voient tous les
 *  visiteurs (un seul instancié pour cette page, contrainte de perf du
 *  cahier des charges). Le lecteur "studio" visible dans les réglages admin
 *  est une instance séparée, voir scripts/admin-player.js.
 * ============================================================================
 */

class TVPlayer {
  constructor({ elementId, initialVolume, onReady, onStateChange }) {
    this.elementId = elementId;
    this.initialVolume = initialVolume;
    this.onReadyCallback = onReady;
    this.onStateChangeCallback = onStateChange;
    this.player = null;
    this.ready = false;
    this._pending = null; // { channel, index, startSeconds } demandé avant que le lecteur soit prêt
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
            const { channel, index, startSeconds } = this._pending;
            this._pending = null;
            this.loadPlaylistAt(channel, index, startSeconds);
          }
          if (typeof this.onReadyCallback === "function") this.onReadyCallback(e);
        },
        onStateChange: (e) => {
          if (typeof this.onStateChangeCallback === "function") this.onStateChangeCallback(e);
        },
        onError: () => {
          // Playlist indisponible : on ignore, l'écran garde juste le fond noir.
        },
      },
    });
  }

  playChannel(channel) {
    this.loadPlaylistAt(channel, 0, 0);
  }

  /**
   * Charge une playlist directement au N-ième élément, à la Xème seconde.
   * C'est la seule méthode de chargement : rejoindre "en cours" (comme une
   * vraie TV) ou démarrer au début ne sont que des cas particuliers
   * (index/startSeconds à 0). Une fois chargée, la playlist avance ensuite
   * toute seule via le mécanisme natif de YouTube (pas d'intervention JS
   * nécessaire, ce qui évite bien des soucis avec les publicités).
   */
  loadPlaylistAt(channel, index, startSeconds) {
    if (!this.ready || !this.player || typeof this.player.loadPlaylist !== "function") {
      this._pending = { channel, index: index || 0, startSeconds: startSeconds || 0 };
      return;
    }
    try {
      this.player.loadPlaylist({
        list: channel.playlistId,
        listType: "playlist",
        index: index || 0,
        startSeconds: startSeconds || 0,
      });
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

  /** Position (0-based) de la vidéo en cours dans la playlist. */
  getPlaylistIndex() {
    if (!this.ready || !this.player || typeof this.player.getPlaylistIndex !== "function") return null;
    try {
      return this.player.getPlaylistIndex();
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
