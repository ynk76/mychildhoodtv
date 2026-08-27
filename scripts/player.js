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
    this.player = null;
    this.ready = false;
    this._pendingChannel = null;
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
          if (this._pendingChannel) {
            this.playChannel(this._pendingChannel);
            this._pendingChannel = null;
          }
          if (typeof this.onReadyCallback === "function") this.onReadyCallback(e);
        },
        onStateChange: (e) => {
          if (typeof this.onStateChangeCallback === "function") this.onStateChangeCallback(e);
        },
        onError: () => {
          // Playlist indisponible : on ignore, l'écran garde juste l'effet CRT.
        },
      },
    });
  }

  playChannel(channel) {
    if (!this.ready || !this.player || typeof this.player.loadPlaylist !== "function") {
      this._pendingChannel = channel;
      return;
    }
    try {
      this.player.loadPlaylist({ list: channel.playlistId, listType: "playlist", index: 0 });
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
}

window.TVPlayer = TVPlayer;
