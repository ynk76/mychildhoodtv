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
      this._lastPublishedIndex = null;
    } catch (e) {
      /* silencieux */
    }
  }

  _startPublishing() {
    clearInterval(this._publishTimer);
    this._publishTimer = setInterval(() => this._publishIfChanged(), ADMIN_PUBLISH_INTERVAL_MS);
  }

  _publishIfChanged() {
    if (!this.ready || !this.player || !this.channel) return;
    try {
      const state = this.player.getPlayerState();
      // -1 (non démarré) ou 5 (mise en attente) : rien à publier pour l'instant
      if (state !== YT.PlayerState.PLAYING && state !== YT.PlayerState.PAUSED) return;
      const index = this.player.getPlaylistIndex();
      if (index == null || index < 0) return;
      const paused = state === YT.PlayerState.PAUSED;
      const currentTime = this.player.getCurrentTime();
      // on republie si l'index a changé, l'état pause a changé, ou simplement
      // toutes les quelques secondes pour garder "updatedAt" frais (permet
      // aux nouveaux arrivants de rattraper la bonne position)
      this.sharedChannel.publishPosition(this.channel, index, currentTime, paused);
      this._lastPublishedIndex = index;
      this._lastPublishedPaused = paused;
    } catch (e) {
      /* silencieux */
    }
  }

}

window.AdminPlayer = AdminPlayer;
