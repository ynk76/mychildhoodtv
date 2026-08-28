/**
 * ============================================================================
 *  LiveSchedule — simule une chaîne "en direct" partagée par tout le monde,
 *  sans aucun serveur.
 * ============================================================================
 *  Principe : chaque visiteur calcule, à partir de l'heure de son propre
 *  appareil, quel numéro de vidéo de la playlist "devrait" être diffusé
 *  maintenant (un simple calcul par créneaux de temps fixes). Comme ce calcul
 *  ne dépend que de l'heure (identique pour tout le monde) et de la playlist
 *  (identique pour tout le monde), tous les visiteurs convergent vers la même
 *  vidéo — comme une vraie chaîne de télé. La playlist boucle indéfiniment.
 *
 *  Volontairement PEU interventionniste : on ne cherche PAS à recaler la
 *  vidéo à la seconde près en permanence (seekTo répété). Ce genre
 *  d'intervention fréquente est ce qui provoquait des relances de publicités
 *  YouTube et un comportement erratique. On se contente de :
 *   - sauter au bon numéro de vidéo au démarrage / changement de chaîne,
 *   - avancer naturellement quand une vidéo se termine (onEnded),
 *   - un filet de sécurité très espacé (une fois par minute) qui ne fait
 *     rien tant que le numéro de vidéo "attendu" n'a pas changé.
 *  Résultat : moins précis à la seconde près, mais beaucoup plus stable.
 *
 *  Limite assumée : sans backend ni clé API YouTube Data, on ne connaît pas
 *  la durée réelle de chaque vidéo, ni si une publicité est en cours (l'API
 *  IFrame ne l'expose pas). On suppose une durée fixe par créneau
 *  (SLOT_SECONDS). C'est un compromis raisonnable pour un site statique.
 * ============================================================================
 */

const SLOT_SECONDS = 240; // durée supposée par vidéo (4 minutes)
const SAFETY_CHECK_MS = 60000;

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
    this._safetyTimer = null;
    this.player.onEndedCallback = () => this._onVideoEnded();
  }

  /** Démarre (ou change de) la diffusion en direct pour une chaîne donnée. */
  start(channel) {
    this.live = true;
    this._lastChannel = channel;
    this._lastIndex = null;
    clearTimeout(this._pollTimer);
    clearInterval(this._safetyTimer);

    const cached = playlistCache.get(channel.playlistId);
    if (cached && this.active) {
      // playlist déjà connue : on charge directement le bon numéro de
      // vidéo, sans repasser par la première le temps de la re-détecter.
      this.playlistIds = cached;
      const index = this._currentIndex();
      this._lastIndex = index;
      this.player.playChannelAt(channel, index);
      this._armSafetyCheck();
      // la playlist en cache peut avoir changé depuis (ex: mix YouTube
      // régénéré) : on la rafraîchit discrètement sans couper la lecture
      setTimeout(() => this._refreshCache(), 2500);
    } else {
      this.playlistIds = cached || null;
      this.player.playChannel(channel);
      if (!this.active) this.player.pause();
      // on laisse le lecteur assimiler la nouvelle playlist avant de lire
      // sa liste de vidéos (sinon on risque de lire l'ancienne, périmée)
      this._pollTimer = setTimeout(() => this._waitForPlaylist(), 800);
    }
  }

  _waitForPlaylist(attempts = 0) {
    const ids = this.player.getPlaylistIds();
    if (ids && ids.length) {
      this.playlistIds = ids;
      playlistCache.set(this._lastChannel.playlistId, ids);
      if (this.active) {
        const index = this._currentIndex();
        this._lastIndex = index;
        this.player.playVideoAt(index);
      }
      this._armSafetyCheck();
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

  _currentIndex() {
    const slot = Math.floor(Date.now() / 1000 / SLOT_SECONDS);
    return slot % this.playlistIds.length;
  }

  /** Une vidéo se termine naturellement : on avance vers le créneau actuel. */
  _onVideoEnded() {
    if (!this.live || !this.active || !this.playlistIds || !this.playlistIds.length) return;
    const index = this._currentIndex();
    this._lastIndex = index;
    this.player.playVideoAt(index);
  }

  /** Filet de sécurité très espacé : n'agit que si le créneau attendu a changé. */
  _armSafetyCheck() {
    clearInterval(this._safetyTimer);
    this._safetyTimer = setInterval(() => {
      if (!this.live || !this.active || !this.playlistIds || !this.playlistIds.length) return;
      const index = this._currentIndex();
      if (index !== this._lastIndex) {
        this._lastIndex = index;
        this.player.playVideoAt(index);
      }
    }, SAFETY_CHECK_MS);
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

  /**
   * Contrôle admin ("ignorer la pub") : recharge la vidéo actuellement
   * attendue par le direct. YouTube n'expose aucun moyen fiable de
   * détecter/zapper une publicité via l'API publique (volontairement, pour
   * protéger ses revenus publicitaires) — recharger la vidéo est le seul
   * levier disponible, et ça ne fonctionne pas à 100% des cas.
   */
  reloadCurrent() {
    if (!this._lastChannel) return;
    if (this.playlistIds && this.playlistIds.length) {
      const index = this._currentIndex();
      this._lastIndex = index;
      this.player.playChannelAt(this._lastChannel, index);
    } else {
      this.player.playChannel(this._lastChannel);
    }
  }

  /** Revient au direct : recale sur le créneau actuel et relance la lecture. */
  resumeLive() {
    this.live = true;
    if (this.active && this.playlistIds && this.playlistIds.length) {
      const index = this._currentIndex();
      this._lastIndex = index;
      this.player.playVideoAt(index);
      this._armSafetyCheck();
    }
  }

  /** La télé s'éteint : on coupe toute resynchronisation en arrière-plan. */
  suspend() {
    this.active = false;
    clearInterval(this._safetyTimer);
    this.player.pause();
  }

  /**
   * La télé se rallume : reprend le direct exactement là où il en est
   * (comme une vraie TV), sans jamais relancer la playlist depuis le début.
   */
  resume() {
    this.active = true;
    if (!this.playlistIds) {
      // jamais eu le temps de charger la playlist avant l'extinction
      if (this._lastChannel) this.start(this._lastChannel);
      return;
    }
    if (this.live) {
      const index = this._currentIndex();
      if (index !== this._lastIndex) {
        // le direct a avancé pendant que la télé était éteinte
        this._lastIndex = index;
        this.player.playVideoAt(index);
      } else {
        // toujours le même créneau : on reprend juste la lecture en pause
        this.player.play();
      }
      this._armSafetyCheck();
    } else {
      this.player.play();
    }
  }

  /** IDs vidéo actuellement/prochainement diffusés, pour le guide des programmes. */
  getNowAndNextIds() {
    if (!this.playlistIds || !this.playlistIds.length) return { nowId: null, nextId: null };
    const index = this._currentIndex();
    const nextIndex = (index + 1) % this.playlistIds.length;
    return { nowId: this.playlistIds[index], nextId: this.playlistIds[nextIndex] };
  }
}

window.LiveSchedule = LiveSchedule;
