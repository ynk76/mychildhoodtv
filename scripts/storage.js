/**
 * Petit wrapper autour de localStorage : mémorise la dernière chaîne,
 * le volume, l'état du son et les chaînes personnalisées de l'utilisateur.
 */

const STORAGE_KEYS = {
  lastChannel: "salon2000.lastChannelNumber",
  volume: "salon2000.volume",
  muted: "salon2000.muted",
  ambientMuted: "salon2000.ambientMuted",
  customChannels: "salon2000.customChannels",
  nightMode: "salon2000.nightMode",
  power: "salon2000.power",
};

function safeGet(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw);
  } catch (e) {
    return fallback;
  }
}

function safeSet(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    /* localStorage indisponible (mode privé, quota...) : on ignore silencieusement */
  }
}

const Storage = {
  getLastChannel() {
    return safeGet(STORAGE_KEYS.lastChannel, null);
  },
  setLastChannel(number) {
    safeSet(STORAGE_KEYS.lastChannel, number);
  },
  getVolume() {
    return safeGet(STORAGE_KEYS.volume, 60);
  },
  setVolume(vol) {
    safeSet(STORAGE_KEYS.volume, vol);
  },
  getMuted() {
    return safeGet(STORAGE_KEYS.muted, false);
  },
  setMuted(muted) {
    safeSet(STORAGE_KEYS.muted, muted);
  },
  getAmbientMuted() {
    return safeGet(STORAGE_KEYS.ambientMuted, false);
  },
  setAmbientMuted(muted) {
    safeSet(STORAGE_KEYS.ambientMuted, muted);
  },
  getNightMode() {
    return safeGet(STORAGE_KEYS.nightMode, null);
  },
  setNightMode(isNight) {
    safeSet(STORAGE_KEYS.nightMode, isNight);
  },
  getPower() {
    return safeGet(STORAGE_KEYS.power, true);
  },
  setPower(isOn) {
    safeSet(STORAGE_KEYS.power, isOn);
  },
  getCustomChannels() {
    return safeGet(STORAGE_KEYS.customChannels, []);
  },
  setCustomChannels(list) {
    safeSet(STORAGE_KEYS.customChannels, list);
  },
  addCustomChannel(channel) {
    const list = this.getCustomChannels();
    list.push(channel);
    this.setCustomChannels(list);
    return list;
  },
  removeCustomChannel(number) {
    const list = this.getCustomChannels().filter((c) => c.number !== number);
    this.setCustomChannels(list);
    return list;
  },
  /**
   * Fusionne les chaînes par défaut (config.js) avec les chaînes
   * personnalisées de l'utilisateur, en re-numérotant proprement.
   */
  getAllChannels() {
    const defaults = window.DEFAULT_CHANNELS.map((c) => ({ ...c }));
    const custom = this.getCustomChannels();
    let nextNumber = defaults.reduce((max, c) => Math.max(max, c.number), 0) + 1;
    const numberedCustom = custom.map((c) => {
      const number = c.number || nextNumber++;
      if (!c.number) nextNumber = number + 1;
      return { ...c, number, isCustom: true };
    });
    return defaults.concat(numberedCustom);
  },
};

window.Storage = Storage;
