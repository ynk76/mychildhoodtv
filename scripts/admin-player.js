/**
 * ============================================================================
 *  AdminPlayer — le lecteur "studio", visible uniquement dans les réglages
 *  (admin, mot de passe requis).
 * ============================================================================
 *  Contrairement au lecteur du salon (piloté uniquement par la
 *  télécommande), celui-ci a ses contrôles YouTube natifs bien visibles :
 *  l'admin choisit une chaîne, puis joue/avance/met en pause directement
 *  avec l'interface YouTube normale — plus fiable que des boutons maison,
 *  puisque ça s'appuie sur le lecteur officiel.
 *
 *  Tout ce que l'admin y fait est régulièrement lu (numéro de vidéo dans la
 *  playlist + position + en pause ou non) et publié dans Firebase via
 *  SharedChannel ; c'est ce que la télé du salon de TOUS les visiteurs
 *  reproduit.
 *
 *  Ce lecteur est créé une seule fois (à la première ouverture des réglages
 *  déverrouillés) puis reste actif en permanence, même une fois les réglages
 *  refermés : sinon, à chaque fermeture, on perdrait la diffusion en direct
 *  pour tout le monde. Fermer les réglages ne fait donc que le rendre
 *  visuellement invisible (voir RemoteControl._positionAdminPlayer) — il
 *  continue de jouer et de publier sa position en arrière-plan.
 *
 *  Il est volontairement muet (mute:1) : son rôle est uniquement de piloter
 *  et publier la position, le son entendu par tout le monde (admin inclus)
 *  vient du lecteur du salon (scripts/player.js), pour éviter un écho à
 *  deux voix légèrement désynchronisées.
 * ============================================================================
 */

const ADMIN_PUBLISH_INTERVAL_MS = 4000;

class AdminPlayer {
  constructor({ elementId, sharedChannel }) {
    this.elementId = elementId;
    this.sharedChannel = sharedChannel;
    this.player = null;
    this.ready = false;
    this.channel = null;
    this._publishTimer = null;
    this._lastPublishedIndex = null;
    this._lastPublishedPaused = null;
    this._pendingShuffle = false; // en attente que la playlist studio soit chargée pour activer setShuffle
    this._lastGoodPublish = null; // { channel, index, currentTime, paused } — dernier contenu (pas pub) publié
  }

  /** Charge (ou change vers) une chaîne dans le lecteur studio. */
  load(channel) {
    this.channel = channel;
    if (!window.YT || !window.YT.Player) {
      setTimeout(() => this.load(channel), 300);
      return;
    }
    if (this.player && this.ready) {
      this._cue(channel);
      return;
    }
    if (this.player) return; // en cours de création, _cue sera appelé par onReady
    this.player = new YT.Player(this.elementId, {
      width: "100%",
      height: "100%",
      playerVars: {
        autoplay: 0,
        controls: 1,
        rel: 0,
        modestbranding: 1,
        cc_load_policy: 0,
        mute: 1,
        listType: "playlist",
      },
      events: {
        onReady: () => {
          this.ready = true;
          this.player.mute();
          this._cue(this.channel);
          this._startPublishing();
        },
      },
    });
  }

  _cue(channel) {
    if (!this.ready) return;
    try {
      this.player.cuePlaylist({ list: channel.playlistId, listType: "playlist", index: 0 });
      this.player.mute();
      // Répercuté à tous les visiteurs via l'index publié : une fois cette
      // vidéo terminée, le studio (et donc le salon de tout le monde) passe
      // à une chaîne aléatoire de la playlist, pas juste la suivante.
      // Différé (voir _publishIfChanged) : appelé immédiatement, setShuffle()
      // n'est pas fiable tant que la playlist n'est pas vraiment chargée.
      this._pendingShuffle = true;
      this._lastPublishedIndex = null;
    } catch (e) {
      /* silencieux */
    }
  }

  /**
   * Best-effort, même heuristique que scripts/minigames.js côté salon : une
   * pub n'apparaît jamais dans la playlist elle-même, donc si la vidéo
   * réellement affichée par le studio ne correspond pas à celle attendue à
   * l'index courant (ou que son ID est inaccessible, ce que fait souvent
   * YouTube pendant une pub), c'est probablement une pub.
   */
  _looksLikeAd() {
    try {
      const ids = this.player.getPlaylist();
      const index = this.player.getPlaylistIndex();
      if (!ids || index == null || index < 0 || !ids[index]) return false;
      const data = this.player.getVideoData();
      const actual = data && data.video_id;
      return actual == null || actual !== ids[index];
    } catch (e) {
      return false;
    }
  }

  _startPublishing() {
    clearInterval(this._publishTimer);
    this._publishTimer = setInterval(() => this._publishIfChanged(), ADMIN_PUBLISH_INTERVAL_MS);
  }

  _publishIfChanged() {
    if (!this.ready || !this.player || !this.channel) return;
    try {
      // Garde-fou : le lecteur studio ne doit jamais être audible (double son
      // avec le lecteur du salon). On réaffirme régulièrement le mute, au cas
      // où l'admin l'aurait décoché par mégarde depuis les contrôles natifs.
      if (typeof this.player.isMuted === "function" && !this.player.isMuted()) {
        this.player.mute();
      }
      if (this._pendingShuffle) {
        const ids = this.player.getPlaylist();
        if (ids && ids.length > 1) {
          this._pendingShuffle = false;
          this.player.setShuffle(true);
        }
      }
      const state = this.player.getPlayerState();
      // -1 (non démarré) ou 5 (mise en attente) : rien à publier pour l'instant
      if (state !== YT.PlayerState.PLAYING && state !== YT.PlayerState.PAUSED) return;
      const index = this.player.getPlaylistIndex();
      if (index == null || index < 0) return;
      const paused = state === YT.PlayerState.PAUSED;
      const currentTime = this.player.getCurrentTime();

      if (this._looksLikeAd()) {
        // Une pub joue côté studio (ex: l'admin vient de changer de chaîne).
        // On republie la DERNIÈRE position de contenu connue plutôt que
        // l'état de la pub : la télé du salon continue donc tranquillement
        // l'ancienne vidéo — au lieu de montrer la pub, ou de décrocher au
        // bout de 12s faute de mise à jour (voir ADMIN_STALE_THRESHOLD_MS
        // dans scripts/remote.js) — jusqu'à ce que la VRAIE nouvelle vidéo
        // démarre, où tout le monde bascule dessus d'un coup, à son début.
        // On extrapole le temps écoulé depuis le début de la pub (plutôt
        // que de republier un "currentTime" figé) pour que la position
        // publiée continue d'avancer comme si l'ancienne vidéo jouait
        // toujours : sinon, chaque republication figée déclencherait une
        // correction de dérive qui fait sauter le salon en arrière.
        if (!this._inAd) {
          this._inAd = true;
          this._adStartedAt = Date.now();
        }
        if (this._lastGoodPublish) {
          const g = this._lastGoodPublish;
          const extrapolated = g.currentTime + (g.paused ? 0 : (Date.now() - this._adStartedAt) / 1000);
          this.sharedChannel.publishPosition(g.channel, g.index, extrapolated, g.paused);
        }
        return;
      }
      this._inAd = false;

      // on republie si l'index a changé, l'état pause a changé, ou simplement
      // toutes les quelques secondes pour garder "updatedAt" frais (permet
      // aux nouveaux arrivants de rattraper la bonne position)
      this.sharedChannel.publishPosition(this.channel, index, currentTime, paused);
      this._lastGoodPublish = { channel: this.channel, index, currentTime, paused };
      this._lastPublishedIndex = index;
      this._lastPublishedPaused = paused;
    } catch (e) {
      /* silencieux */
    }
  }

}

window.AdminPlayer = AdminPlayer;
