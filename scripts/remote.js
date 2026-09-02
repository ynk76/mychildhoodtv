/**
 * Télécommande : power, volume, plein écran, guide des programmes (public),
 * et réglages protégés par mot de passe (choix de chaîne via un vrai
 * lecteur YouTube "studio", voir scripts/admin-player.js).
 *
 * NB sécurité : le mot de passe est vérifié côté navigateur, dans du code
 * public (comme tout site 100% statique sans serveur). N'importe qui peut le
 * lire dans le code source. C'est un simple verrou "on n'y touche pas sans
 * le vouloir", pas une vraie protection contre quelqu'un de déterminé.
 */

const SETTINGS_PASSWORD = "Foot2Rue";

// L'admin publie sa position toutes les ~4s (voir ADMIN_PUBLISH_INTERVAL_MS
// dans admin-player.js) tant que son lecteur studio tourne. Si la dernière
// publication reçue est plus vieille que ce seuil, personne ne pilote plus
// activement la diffusion (onglet fermé, navigateur éteint...) : on ignore
// cette position périmée (sinon on calculerait un rattrapage de plusieurs
// minutes) et chaque visiteur repart sur une vidéo aléatoire.
const ADMIN_STALE_THRESHOLD_MS = 12000;

/** Essaie d'extraire un ID de playlist YouTube utilisable depuis une URL ou un ID collé. */
function parsePlaylistInput(raw) {
  const value = raw.trim();
  try {
    const url = new URL(value);
    const list = url.searchParams.get("list");
    if (list) return list;
    const v = url.searchParams.get("v");
    if (v) return "RD" + v;
    if (url.hostname === "youtu.be") {
      const id = url.pathname.replace("/", "");
      if (id) return "RD" + id;
    }
  } catch (e) {
    // Ce n'est pas une URL valide : on continue avec la valeur brute.
  }
  if (/^(PL|UU|FL|RD|OL)/.test(value)) return value;
  if (/^[\w-]{11}$/.test(value)) return "RD" + value;
  return value;
}

/** Récupère le titre d'une vidéo YouTube via oEmbed (public, sans clé API). */
async function fetchVideoTitle(videoId) {
  if (!videoId) return "?";
  try {
    const url = `https://www.youtube.com/oembed?url=${encodeURIComponent("https://www.youtube.com/watch?v=" + videoId)}&format=json`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("oembed failed");
    const data = await res.json();
    return data.title || "Titre indisponible";
  } catch (e) {
    return "Titre indisponible";
  }
}

class RemoteControl {
  constructor(dom) {
    this.dom = dom;
    this.channels = Storage.getAllChannels();
    this.volume = Storage.getVolume();
    // Toujours allumée et avec le son, à chaque arrivée sur le site — peu
    // importe si le son ou la télé avaient été coupés lors d'une visite
    // précédente (voir Storage.setMuted/setPower plus bas, qui continuent
    // de suivre les changements PENDANT la session, ex: pour le lecteur
    // studio admin, mais ne sont plus relus au chargement).
    this.muted = false;
    this.power = true;
    this.currentIndex = this._resolveInitialIndex();
    this.adminSelectedIndex = this.currentIndex;
    this.adminPlayer = null;
    this.sharedChannel = new SharedChannel();

    this.player = new TVPlayer({
      elementId: "player",
      initialVolume: this.volume,
      onReady: () => {
        // Le volume (setVolume) n'affecte pas l'autoplay, mais couper le
        // son (unmute) AVANT que la lecture ait réellement démarré, si :
        // certains navigateurs mobiles bloquent alors carrément l'autoplay
        // (l'écran reste allumé mais la vidéo ne démarre jamais), le
        // considérant comme une tentative de lecture automatique AVEC son.
        // playerVars.mute=1 (voir player.js) assure un démarrage muet
        // toujours autorisé ; on ne réapplique le son réel qu'une fois la
        // lecture confirmée (voir onStateChange ci-dessous).
        this.player.setVolume(this.volume);
        // Sans diffusion partagée (Firebase), on démarre localement avec la
        // chaîne par défaut ; sinon on attend la position venant de
        // l'admin (voir onChange ci-dessous), qui arrive quasi aussitôt.
        if (!this.sharedChannel.available) this.liveSchedule.startDefault(this.currentChannel());
        if (!this.power) this.player.pause();
        else this._startAutoplayWatchdog();
      },
      onStateChange: (e) => {
        if (e.data === YT.PlayerState.PLAYING) {
          this._hideLoadingStatic();
          if (!this._initialVolumeApplied) {
            this._initialVolumeApplied = true;
            this._applyVolumeState();
          }
        }
      },
    });
    this.liveSchedule = new LiveSchedule(this.player);

    this.minigameOverlay = new MinigameOverlay({ containerEl: dom.minigameMount });
    this.adDetector = new AdDetector({
      player: this.player,
      liveSchedule: this.liveSchedule,
      onAdSequenceStart: () => this._onAdSequenceStart(),
      onAdSequenceEnd: () => this._onAdSequenceEnd(),
    });
    this.adDetector.start();

    if (this.sharedChannel.available) {
      this.sharedChannel.onChange((shared) => this._applySharedChannel(shared));
      // Filet de sécurité : si l'admin n'a encore jamais rien publié, on ne
      // reste pas silencieux indéfiniment — on démarre avec la chaîne par
      // défaut en attendant.
      setTimeout(() => {
        if (!this.liveSchedule.channel) this.liveSchedule.startDefault(this.currentChannel());
      }, 3000);
    }

    this._bindButtons();
    this._bindSettings();
    this._bindGuide();
    this._renderVolume();
    this._updatePowerUI(false);

    if (this.power) {
      this._showBanner(this.currentChannel());
      // Le premier frame vidéo met parfois 1 à quelques secondes à
      // s'afficher (chargement de l'iframe YouTube, mise en tampon) :
      // sans ça, l'écran reste sur son fond noir brut pendant ce délai,
      // qui donne l'impression que rien ne se passe alors que la vidéo
      // tourne déjà en coulisses. On masque ce trou avec l'effet
      // statique déjà utilisé au changement de chaîne (plus dans
      // l'esprit rétro qu'un écran vide) et on la retire dès la
      // première vraie lecture — ou après un délai de sécurité si la
      // vidéo ne démarre jamais (playlist indisponible, etc.).
      this.dom.staticOverlay.hidden = false;
      this._loadingStaticTimer = setTimeout(() => this._hideLoadingStatic(), 6000);
    }
  }

  /**
   * Sur certains navigateurs mobiles, la lecture automatique lancée depuis
   * onReady (donc de façon asynchrone, après le chargement de l'iframe
   * YouTube — pas dans le même geste utilisateur synchrone que le clic de
   * démarrage) ne démarre parfois tout simplement jamais : la télé reste
   * allumée mais rien ne joue, jusqu'à ce qu'on éteigne/rallume à la main
   * (ce qui, lui, appelle playVideo() directement dans un clic — et
   * fonctionne). Ce filet reproduit ce déclic automatiquement : si la
   * lecture n'a toujours pas démarré après quelques secondes, on retente
   * play() nous-mêmes, plusieurs fois si besoin.
   */
  _startAutoplayWatchdog() {
    const MAX_ATTEMPTS = 5;
    let attempts = 0;
    const check = () => {
      if (!this.power) return; // éteinte entre-temps : pas concerné
      const state = this.player.getPlayerState();
      if (state === 1 || state === 3) return; // PLAYING ou BUFFERING : ça avance déjà
      if (attempts >= MAX_ATTEMPTS) return;
      attempts++;
      this.player.play();
      setTimeout(check, 1500);
    };
    setTimeout(check, 1500);
  }

  _hideLoadingStatic() {
    if (this._loadingStaticTimer) {
      clearTimeout(this._loadingStaticTimer);
      this._loadingStaticTimer = null;
    }
    this.dom.staticOverlay.hidden = true;
  }

  /** Reçu de Firebase : l'admin a choisi/avancé/mis en pause la diffusion, pour tout le monde. */
  _applySharedChannel(shared) {
    const age = this.sharedChannel.serverNow() - shared.updatedAt;
    if (age > ADMIN_STALE_THRESHOLD_MS) {
      if (!this._noAdminMode) {
        this._noAdminMode = true;
        this.liveSchedule.startDefault(this.currentChannel());
        if (!this.power) this.player.pause();
      }
      this._renderLiveStatus();
      return;
    }
    this._noAdminMode = false;

    let idx = this.channels.findIndex((c) => c.playlistId === shared.playlistId);
    if (idx === -1) {
      this.channels = this.channels.concat([{ name: shared.name, playlistId: shared.playlistId, number: -1 }]);
      idx = this.channels.length - 1;
    }
    const isNewVideo = !(
      this.liveSchedule.channel &&
      this.liveSchedule.channel.playlistId === shared.playlistId &&
      this.liveSchedule.index === shared.index
    );
    this.currentIndex = idx;

    // On rattrape le temps écoulé depuis que l'admin a publié cette
    // position, pour rejoindre "en cours" comme une vraie chaîne de télé.
    const elapsed = Math.max(0, age / 1000);
    const currentTime = (shared.currentTime || 0) + (shared.paused ? 0 : elapsed);

    if (isNewVideo && this.power) {
      Audio2000.staticBurst(0.3);
      this.dom.staticOverlay.hidden = false;
      setTimeout(() => (this.dom.staticOverlay.hidden = true), 350);
    }

    this.liveSchedule.join(this.channels[idx], shared.index, currentTime, shared.paused);
    if (!this.power) this.player.pause();
    // Uniquement au changement réel de chaîne/vidéo, pas à chaque synchro
    // périodique avec l'admin (~4s) tant qu'on regarde la même chose —
    // sinon le bandeau clignote en boucle. Il reste consultable en
    // survolant l'écran (voir styles/crt.css).
    else if (isNewVideo) this._showBanner(this.channels[idx]);

    this._renderLiveStatus();
    this._renderChannelList();
  }

  _resolveInitialIndex() {
    const last = Storage.getLastChannel();
    const idx = this.channels.findIndex((c) => c.number === last);
    return idx >= 0 ? idx : 0;
  }

  currentChannel() {
    return this.channels[this.currentIndex];
  }

  /**
   * Retour visuel immédiat, indépendant de l'état ":active" (qui exige de
   * garder le doigt/la souris appuyée) : avec seulement 4 LEDs de volume,
   * beaucoup de clics ne font pas franchir de palier visible (ex. 60→70%),
   * ce qui pouvait donner l'impression qu'"il faut appuyer plusieurs fois"
   * pour que ça marche. Ce flash confirme chaque clic, quel que soit l'état
   * du volume avant/après.
   */
  _flashButton(el) {
    if (!el) return;
    el.classList.remove("remote-btn--flash");
    void el.offsetWidth; // force le redémarrage de l'animation si déjà en cours
    el.classList.add("remote-btn--flash");
  }

  _bindButtons() {
    const d = this.dom;
    d.power.addEventListener("click", () => this.togglePower());
    d.volUp.addEventListener("click", () => {
      this._flashButton(d.volUp);
      this.changeVolume(10);
    });
    d.volDown.addEventListener("click", () => {
      this._flashButton(d.volDown);
      this.changeVolume(-10);
    });
    d.mute.addEventListener("click", () => this.toggleMute());
    d.fullscreen.addEventListener("click", () => {
      Audio2000.remoteClick();
      if (typeof this.onFullscreenRequest === "function") this.onFullscreenRequest();
    });

    window.addEventListener("keydown", (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
      switch (e.key) {
        case "ArrowRight":
          this.changeVolume(10);
          break;
        case "ArrowLeft":
          this.changeVolume(-10);
          break;
        case "m":
        case "M":
          this.toggleMute();
          break;
      }
    });
  }

  togglePower() {
    this.power = !this.power;
    Storage.setPower(this.power);
    Audio2000.remoteClick();
    this._updatePowerUI(true);
    if (this.power) {
      this.player.play();
      this._showBanner(this.currentChannel());
      // Cas rare : la TV était déjà éteinte au chargement (power=false en
      // storage), la vidéo n'a donc jamais atteint l'état PLAYING pour
      // déclencher l'application différée du son (voir onStateChange dans
      // le constructeur) — on s'assure ici qu'elle l'a bien été au moins
      // une fois, sinon le son resterait coupé indéfiniment malgré l'allumage.
      if (!this._initialVolumeApplied) {
        this._initialVolumeApplied = true;
        this._applyVolumeState();
      }
    } else {
      this.player.pause();
      this._onAdSequenceEnd();
    }
  }

  /* ---------------------------------------------------------------- */
  /* Détection de pub + mini-jeux                                        */
  /* ---------------------------------------------------------------- */

  _onAdSequenceStart() {
    if (!this.power) return;
    this._minigameManual = false; // désormais piloté par la pub, pas par un clic manuel
    this._inAdSequence = true;
    this._adSkipAttempts = 0;
    if (this.dom.adWaitingOverlay) this.dom.adWaitingOverlay.hidden = false;
    this._tryAdSkip();
  }

  /**
   * Recharge la playlist à la même position dès qu'une pub est détectée,
   * dans l'espoir que YouTube ne resserve pas de pub cette fois-ci (rien ne
   * le garantit — YouTube n'expose aucune API pour lire/sauter une pub,
   * voir la note en tête de fichier — mais un rechargement redemande
   * simplement la vidéo depuis le début, ce qui peut suffire). En pratique
   * ça ne marche qu'environ une tentative sur quatre : il faut donc pas mal
   * insister avant d'abandonner. Pendant ce temps, #ad-waiting-overlay
   * masque le grésillement des rechargements successifs derrière un
   * message clair plutôt que de laisser voir la vidéo sauter dans tous les
   * sens. Au-delà du nombre max de tentatives, cette vidéo précise sert
   * peut-être systématiquement une pub, et on laisse le mini-jeu habituel
   * occuper l'attente plutôt que de recharger indéfiniment.
   */
  _tryAdSkip() {
    const MAX_AD_SKIP_ATTEMPTS = 20;
    if (!this._inAdSequence) return;
    if (this._adSkipAttempts >= MAX_AD_SKIP_ATTEMPTS) {
      this._showAdMinigame();
      return;
    }
    this._adSkipAttempts++;
    const channel = this.liveSchedule.channel || this.currentChannel();
    const index = this.player.getPlaylistIndex();
    if (channel && index != null) this.player.loadPlaylistAt(channel, index, 0);
    clearTimeout(this._adSkipTimer);
    this._adSkipTimer = setTimeout(() => this._tryAdSkip(), 2500);
  }

  _showAdMinigame() {
    if (this.dom.adWaitingOverlay) this.dom.adWaitingOverlay.hidden = true;
    if (this.dom.minigameHint) this.dom.minigameHint.textContent = "📺 Pub en cours — petite pause jeu !";
    this.dom.minigameOverlay.hidden = false;
    this.minigameOverlay.show();
  }

  _onAdSequenceEnd() {
    this._inAdSequence = false;
    clearTimeout(this._adSkipTimer);
    if (this.dom.adWaitingOverlay) this.dom.adWaitingOverlay.hidden = true;
    // Ne referme pas une session ouverte à la main (chat noir cliqué) : elle
    // ne dépend pas de la pub, seule la pub qui vient de se terminer doit
    // fermer la sienne.
    if (this._minigameManual) return;
    this.dom.minigameOverlay.hidden = true;
    this.minigameOverlay.hide();
  }

  /** Ouvre/ferme les mini-jeux à la demande (clic sur le chat noir), même hors pub. */
  toggleMinigameMenu() {
    if (!this.power) return;
    if (this.dom.minigameOverlay.hidden) {
      this._minigameManual = true;
      if (this.dom.minigameHint) this.dom.minigameHint.textContent = "🎮 Petite pause jeu !";
      this.dom.minigameOverlay.hidden = false;
      this.minigameOverlay.show();
    } else {
      this._minigameManual = false;
      this.dom.minigameOverlay.hidden = true;
      this.minigameOverlay.hide();
    }
  }

  _updatePowerUI(animate) {
    const { screen, powerOff } = this.dom;
    this.dom.power.setAttribute("aria-pressed", String(this.power));
    if (this.power) {
      screen.classList.remove("tv-screen--off");
      powerOff.classList.remove("power-off--playing");
      powerOff.hidden = true;
    } else {
      powerOff.hidden = false;
      if (animate) {
        powerOff.classList.remove("power-off--playing");
        // force reflow pour rejouer l'animation
        void powerOff.offsetWidth;
        powerOff.classList.add("power-off--playing");
      }
      screen.classList.add("tv-screen--off");
    }
  }

  _showBanner(channel) {
    const { bannerName, banner } = this.dom;
    bannerName.textContent = channel.name;
    banner.classList.add("channel-banner--visible");
    clearTimeout(this._bannerTimer);
    this._bannerTimer = setTimeout(() => {
      banner.classList.remove("channel-banner--visible");
    }, 2500);
  }

  changeVolume(delta) {
    this.volume = Math.max(0, Math.min(100, this.volume + delta));
    this.muted = false;
    Storage.setVolume(this.volume);
    Storage.setMuted(false);
    this._applyVolumeState();
    Audio2000.hoverBlip();
  }

  toggleMute() {
    this.muted = !this.muted;
    Storage.setMuted(this.muted);
    this._applyVolumeState();
    Audio2000.remoteClick();
  }

  _applyVolumeState() {
    this.player.setVolume(this.volume);
    if (this.muted) this.player.mute();
    else this.player.unmute();
    this._renderVolume();
  }

  _renderVolume() {
    this.dom.mute.setAttribute("aria-pressed", String(this.muted));
    const level = this.muted ? 0 : Math.ceil((this.volume / 100) * this.dom.volumeLeds.length);
    this.dom.volumeLeds.forEach((led, i) => led.classList.toggle("on", i < level));
  }

  /* ---------------------------------------------------------------- */
  /* Réglages protégés par mot de passe                                 */
  /* ---------------------------------------------------------------- */

  _bindSettings() {
    const d = this.dom;

    d.settingsToggle.addEventListener("click", () => {
      Audio2000.hoverBlip();
      const opening = d.settingsModal.hidden;
      d.settingsModal.hidden = !d.settingsModal.hidden;
      if (opening) this._openSettings();
      else this._positionAdminPlayer();
    });
    d.settingsClose.addEventListener("click", () => {
      d.settingsModal.hidden = true;
      this._positionAdminPlayer();
    });
    window.addEventListener("resize", () => {
      if (!d.settingsModal.hidden && !d.settingsBody.hidden) this._positionAdminPlayer();
    });
    // Le panneau de réglages défile (liste de chaînes) : sans ce listener,
    // le lecteur studio (positionné "à la main" par-dessus son emplacement
    // réservé, voir _positionAdminPlayer) restait figé à son ancienne
    // position pendant que le contenu défilait sous lui.
    if (d.settingsPanel) {
      d.settingsPanel.addEventListener(
        "scroll",
        () => {
          if (!d.settingsModal.hidden && !d.settingsBody.hidden) this._positionAdminPlayer();
        },
        { passive: true }
      );
    }

    d.settingsAuthForm.addEventListener("submit", (e) => {
      e.preventDefault();
      if (d.settingsPassword.value === SETTINGS_PASSWORD) {
        Storage.setSettingsUnlocked(true);
        d.settingsAuthError.hidden = true;
        d.settingsPassword.value = "";
        this._showSettingsBody();
      } else {
        d.settingsAuthError.hidden = false;
        Audio2000.staticBurst(0.2);
      }
    });

    d.settingsForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const name = d.settingsName.value.trim();
      const urlValue = d.settingsUrl.value.trim();
      if (!name || !urlValue) return;
      const playlistId = parsePlaylistInput(urlValue);
      Storage.addCustomChannel({ name, playlistId });
      this.channels = Storage.getAllChannels();
      d.settingsForm.reset();
      this._renderChannelList();
    });
  }

  _openSettings() {
    if (Storage.getSettingsUnlocked()) this._showSettingsBody();
    else this._showSettingsAuth();
  }

  _showSettingsAuth() {
    this.dom.settingsAuth.hidden = false;
    this.dom.settingsBody.hidden = true;
    this.dom.settingsAuthError.hidden = true;
    this._positionAdminPlayer();
  }

  _showSettingsBody() {
    this.dom.settingsAuth.hidden = true;
    this.dom.settingsBody.hidden = false;
    if (!this.adminPlayer) {
      this.adminPlayer = new AdminPlayer({ elementId: "admin-player", sharedChannel: this.sharedChannel });
      this.adminSelectedIndex = this.currentIndex;
      this.adminPlayer.load(this.currentChannel());
    }
    this._renderChannelList();
    this._renderLiveStatus();
    this._positionAdminPlayer();
  }

  /**
   * Le vrai lecteur studio (#admin-player) vit en dehors du panneau de
   * réglages (voir styles/main.css) pour ne jamais être mis en display:none
   * — ce qui interromprait sa lecture — quand on ferme les réglages. On le
   * superpose donc "à la main" par-dessus son emplacement réservé
   * (#admin-player-slot) tant que les réglages sont ouverts et déverrouillés,
   * et on le réduit à un coin de 2x2px sinon (toujours techniquement
   * "visible" pour le navigateur, juste imperceptible).
   */
  _positionAdminPlayer() {
    const el = this.dom.adminPlayerEl;
    const slot = this.dom.adminPlayerSlot;
    if (!el) return;
    const docked = !this.dom.settingsModal.hidden && !this.dom.settingsBody.hidden;
    if (docked && slot) {
      const r = slot.getBoundingClientRect();
      Object.assign(el.style, {
        top: r.top + "px",
        left: r.left + "px",
        width: r.width + "px",
        height: r.height + "px",
        bottom: "auto",
        right: "auto",
        opacity: "1",
        pointerEvents: "auto",
        border: "2px solid var(--wood-mid)",
      });
    } else {
      Object.assign(el.style, {
        top: "auto",
        left: "auto",
        bottom: "0",
        right: "0",
        width: "2px",
        height: "2px",
        opacity: "0.01",
        pointerEvents: "none",
        border: "none",
      });
    }
  }

  _renderLiveStatus() {
    if (!this.sharedChannel.available) {
      this.dom.liveStatus.textContent = "🔴 Chaîne par défaut (pas de synchro entre appareils, Firebase non configuré)";
    } else if (this._noAdminMode) {
      this.dom.liveStatus.textContent = "🎲 Personne ne pilote la diffusion : vidéo aléatoire";
    } else {
      this.dom.liveStatus.textContent = this.liveSchedule.paused ? "⏸ En pause" : "🔴 En direct";
    }
  }

  /** Choisir une chaîne dans les réglages charge le lecteur studio (admin), pas directement le salon. */
  selectChannel(index) {
    this.adminSelectedIndex = index;
    const channel = this.channels[index];
    Storage.setLastChannel(channel.number);
    if (this.adminPlayer) this.adminPlayer.load(channel);
    this._renderChannelList();
  }

  _renderChannelList() {
    const list = this.dom.settingsList;
    list.innerHTML = "";
    this.channels.forEach((channel, index) => {
      const li = document.createElement("li");
      li.className = "settings-item";

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "settings-item__select";
      btn.textContent = channel.name;
      if (index === this.adminSelectedIndex) btn.classList.add("settings-item__select--current");
      btn.addEventListener("click", () => this.selectChannel(index));
      li.appendChild(btn);

      if (channel.isCustom) {
        const del = document.createElement("button");
        del.type = "button";
        del.className = "settings-item__delete";
        del.textContent = "Supprimer";
        del.addEventListener("click", () => {
          Storage.removeCustomChannel(channel.number);
          this.channels = Storage.getAllChannels();
          if (this.adminSelectedIndex >= this.channels.length) {
            this.adminSelectedIndex = 0;
            if (this.adminPlayer) this.adminPlayer.load(this.channels[0]);
          }
          this._renderChannelList();
        });
        li.appendChild(del);
      }

      list.appendChild(li);
    });
  }

  /* ---------------------------------------------------------------- */
  /* Guide des programmes (public, lecture seule)                       */
  /* ---------------------------------------------------------------- */

  _bindGuide() {
    this.dom.guideClose.addEventListener("click", () => (this.dom.guideOverlay.hidden = true));
  }

  async openGuide() {
    Audio2000.hoverBlip();
    this.dom.guideOverlay.hidden = false;
    this.dom.guideNow.textContent = "Chargement...";
    this.dom.guideNext.textContent = "Chargement...";

    const ids = this.player.getPlaylistIds();
    const idx = this.player.getPlaylistIndex();
    const liveTitle = this.player.getVideoTitle();

    this.dom.guideNow.textContent = liveTitle || "?";
    if (ids && ids.length && idx != null && idx >= 0) {
      this.dom.guideNext.textContent = await fetchVideoTitle(ids[(idx + 1) % ids.length]);
    } else {
      this.dom.guideNext.textContent = "?";
    }
  }
}

window.RemoteControl = RemoteControl;
