/**
 * Télécommande + logique de zapping + guide des programmes (EPG) +
 * formulaire de chaînes personnalisées.
 */

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

class RemoteControl {
  constructor(dom) {
    this.dom = dom;
    this.channels = Storage.getAllChannels();
    this.volume = Storage.getVolume();
    this.muted = Storage.getMuted();
    this.power = Storage.getPower();
    this.currentIndex = this._resolveInitialIndex();
    this.switching = false;

    this.player = new TVPlayer({
      elementId: "player",
      initialVolume: this.volume,
      onReady: () => this._applyVolumeState(),
    });

    this._bindButtons();
    this._bindGuide();
    this._bindSettings();
    this._renderVolume();
    this._updatePowerUI(false);

    if (this.power) {
      this.player.playChannel(this.currentChannel());
      this._showBanner(this.currentChannel(), false);
    }
  }

  _resolveInitialIndex() {
    const last = Storage.getLastChannel();
    const idx = this.channels.findIndex((c) => c.number === last);
    return idx >= 0 ? idx : 0;
  }

  currentChannel() {
    return this.channels[this.currentIndex];
  }

  _bindButtons() {
    const d = this.dom;
    d.power.addEventListener("click", () => this.togglePower());
    d.chUp.addEventListener("click", () => this.changeChannel(1));
    d.chDown.addEventListener("click", () => this.changeChannel(-1));
    d.volUp.addEventListener("click", () => this.changeVolume(10));
    d.volDown.addEventListener("click", () => this.changeVolume(-10));
    d.mute.addEventListener("click", () => this.toggleMute());
    d.guide.addEventListener("click", () => this.toggleGuide());

    window.addEventListener("keydown", (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
      switch (e.key) {
        case "ArrowUp":
          this.changeChannel(1);
          break;
        case "ArrowDown":
          this.changeChannel(-1);
          break;
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
        case "g":
        case "G":
          this.toggleGuide();
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
      this.player.playChannel(this.currentChannel());
      this._showBanner(this.currentChannel(), false);
    } else {
      this.player.pause();
      this.dom.epgOverlay.hidden = true;
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

  changeChannel(direction) {
    if (!this.power || this.switching || this.channels.length < 2) return;
    this.currentIndex = (this.currentIndex + direction + this.channels.length) % this.channels.length;
    const channel = this.currentChannel();
    Storage.setLastChannel(channel.number);
    Audio2000.remoteClick();
    this._playStaticThen(() => {
      this.player.playChannel(channel);
      this._showBanner(channel, true);
    });
  }

  jumpToChannel(index) {
    if (!this.power || this.switching) return;
    this.currentIndex = index;
    const channel = this.currentChannel();
    Storage.setLastChannel(channel.number);
    Audio2000.remoteClick();
    this.dom.epgOverlay.hidden = true;
    this._playStaticThen(() => {
      this.player.playChannel(channel);
      this._showBanner(channel, true);
    });
  }

  _playStaticThen(callback) {
    this.switching = true;
    const staticEl = this.dom.staticOverlay;
    staticEl.hidden = false;
    Audio2000.staticBurst(0.4);
    setTimeout(() => {
      staticEl.hidden = true;
      this.switching = false;
      callback();
    }, 400);
  }

  _showBanner(channel, autoHide) {
    const { bannerNumber, bannerName, banner } = this.dom;
    bannerNumber.textContent = String(channel.number).padStart(2, "0");
    bannerName.textContent = channel.name;
    banner.classList.add("channel-banner--visible");
    clearTimeout(this._bannerTimer);
    if (autoHide !== false) {
      this._bannerTimer = setTimeout(() => {
        banner.classList.remove("channel-banner--visible");
      }, 2500);
    }
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
    this.dom.volumeBar.style.width = (this.muted ? 0 : this.volume) + "%";
    this.dom.volumeLabel.textContent = this.muted ? "MUET" : `VOL ${this.volume}`;
  }

  _bindGuide() {
    this._renderGuide();
    this.dom.epgClose.addEventListener("click", () => (this.dom.epgOverlay.hidden = true));
  }

  toggleGuide() {
    if (!this.power) return;
    Audio2000.remoteClick();
    this.dom.epgOverlay.hidden = !this.dom.epgOverlay.hidden;
    if (!this.dom.epgOverlay.hidden) {
      this._renderGuide();
      const firstBtn = this.dom.epgList.querySelector("button");
      if (firstBtn) firstBtn.focus();
    }
  }

  _renderGuide() {
    const list = this.dom.epgList;
    list.innerHTML = "";
    this.channels.forEach((channel, index) => {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "epg-item";
      btn.dataset.blip = "true";
      btn.innerHTML = `<span class="epg-item__num">${String(channel.number).padStart(2, "0")}</span><span class="epg-item__name">${channel.name}</span>`;
      if (index === this.currentIndex) btn.classList.add("epg-item--current");
      btn.addEventListener("click", () => this.jumpToChannel(index));
      btn.addEventListener("mouseenter", () => Audio2000.hoverBlip());
      li.appendChild(btn);
      list.appendChild(li);
    });
  }

  _bindSettings() {
    const d = this.dom;
    d.settingsToggle.addEventListener("click", () => {
      Audio2000.hoverBlip();
      d.settingsModal.hidden = !d.settingsModal.hidden;
      if (!d.settingsModal.hidden) this._renderCustomList();
    });
    d.settingsClose.addEventListener("click", () => (d.settingsModal.hidden = true));

    d.settingsForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const name = d.settingsName.value.trim();
      const urlValue = d.settingsUrl.value.trim();
      if (!name || !urlValue) return;
      const playlistId = parsePlaylistInput(urlValue);
      const channel = { name, playlistId };
      Storage.addCustomChannel(channel);
      this.channels = Storage.getAllChannels();
      d.settingsForm.reset();
      this._renderCustomList();
      this._renderGuide();
    });
  }

  _renderCustomList() {
    const list = Storage.getCustomChannels();
    const container = this.dom.settingsList;
    container.innerHTML = "";
    if (!list.length) {
      container.innerHTML = '<li class="settings-empty">Aucune chaîne personnalisée pour le moment.</li>';
      return;
    }
    list.forEach((channel) => {
      const li = document.createElement("li");
      li.className = "settings-item";
      const label = document.createElement("span");
      label.textContent = channel.name;
      const del = document.createElement("button");
      del.type = "button";
      del.className = "settings-item__delete";
      del.textContent = "Supprimer";
      del.addEventListener("click", () => {
        Storage.removeCustomChannel(channel.number);
        this.channels = Storage.getAllChannels();
        if (this.currentIndex >= this.channels.length) this.currentIndex = 0;
        this._renderCustomList();
        this._renderGuide();
      });
      li.appendChild(label);
      li.appendChild(del);
      container.appendChild(li);
    });
  }
}

window.RemoteControl = RemoteControl;
