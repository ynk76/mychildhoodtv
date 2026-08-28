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
    this._pending = null; // { type: "at"|"shuffled", channel, index, startSeconds } avant que le lecteur soit prêt
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
        cc_load_policy: 0, // pas de sous-titres affichés par défaut
        modestbranding: 1,
        rel: 0,
        playsinline: 1,
        listType: "playlist",
      },
      events: {
        onReady: (e) => {
          this.ready = true;
          e.target.setVolume(this.initialVolume);
          try {
            e.target.setOption("captions", "reload", false);
          } catch (err) {
            /* pas grave si indisponible */
          }
          if (this._pending) {
            const pending = this._pending;
            this._pending = null;
            if (pending.type === "shuffled") this.playChannelShuffled(pending.channel);
            else this.loadPlaylistAt(pending.channel, pending.index, pending.startSeconds);
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
   * Rejoindre "en cours" (comme une vraie TV) ou démarrer au début ne sont
   * que des cas particuliers (index/startSeconds à 0). Une fois chargée, la
   * playlist avance ensuite toute seule via le mécanisme natif de YouTube.
   */
  loadPlaylistAt(channel, index, startSeconds) {
    if (!this.ready || !this.player || typeof this.player.loadPlaylist !== "function") {
      this._pending = { type: "at", channel, index: index || 0, startSeconds: startSeconds || 0 };
      return;
    }
    try {
      this.player.setShuffle(false);
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

  /**
   * Charge une playlist en lecture aléatoire (nouvelle vidéo à chaque
   * appel/rechargement de page) : utilisé quand personne ne pilote la
   * diffusion depuis les réglages admin.
   */
  playChannelShuffled(channel) {
    if (!this.ready || !this.player || typeof this.player.loadPlaylist !== "function") {
      this._pending = { type: "shuffled", channel };
      return;
    }
    try {
      this.player.setShuffle(true);
      this.player.loadPlaylist({ list: channel.playlistId, listType: "playlist" });
    } catch (e) {
      /* silencieux */
    }
  }

  play() {
    if (this.ready) this.player.playVideo();
  }

  pause() {
    if (this.ready) this.player.pauseVideo();
  }

  seekTo(seconds) {
    if (!this.ready || !this.player) return;
    try {
      this.player.seekTo(seconds, true);
    } catch (e) {
      /* silencieux */
    }
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

  getCurrentTime() {
    if (!this.ready || !this.player || typeof this.player.getCurrentTime !== "function") return null;
    try {
      return this.player.getCurrentTime();
    } catch (e) {
      return null;
    }
  }

  getPlayerState() {
    if (!this.ready || !this.player || typeof this.player.getPlayerState !== "function") return null;
    try {
      return this.player.getPlayerState();
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

  /** ID de la vidéo actuellement chargée (contenu OU publicité — voir scripts/minigames.js). */
  getCurrentVideoId() {
    if (!this.ready || !this.player || typeof this.player.getVideoData !== "function") return null;
    try {
      const data = this.player.getVideoData();
      return (data && data.video_id) || null;
    } catch (e) {
      return null;
    }
  }
}

window.TVPlayer = TVPlayer;
