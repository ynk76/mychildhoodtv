/**
 * Tous les sons du site sont synthétisés avec la Web Audio API : pas de
 * fichier audio à charger. `Audio2000.unlock()` doit être appelé après un
 * premier geste utilisateur (politique autoplay des navigateurs).
 */

const Audio2000 = (() => {
  let ctx = null;
  let masterGain = null;
  let ambientGain = null;
  let ambientNodes = [];
  let ambientMuted = false;

  function ensureContext() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
      masterGain = ctx.createGain();
      masterGain.gain.value = 0.5;
      masterGain.connect(ctx.destination);
      ambientGain = ctx.createGain();
      ambientGain.gain.value = ambientMuted ? 0 : 0.35;
      ambientGain.connect(masterGain);
    }
    return ctx;
  }

  function unlock() {
    ensureContext();
    if (ctx.state === "suspended") ctx.resume();
  }

  function noiseBuffer(duration) {
    const c = ensureContext();
    const bufferSize = Math.floor(c.sampleRate * duration);
    const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  /** Bip discret au survol des objets cliquables du décor / de la télécommande. */
  function hoverBlip() {
    const c = ensureContext();
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = "square";
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.001, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.05, c.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.08);
    osc.connect(gain).connect(masterGain);
    osc.start();
    osc.stop(c.currentTime + 0.09);
  }

  /** Clic sec de télécommande. */
  function remoteClick() {
    const c = ensureContext();
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(1200, c.currentTime);
    osc.frequency.exponentialRampToValueAtTime(300, c.currentTime + 0.05);
    gain.gain.setValueAtTime(0.15, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.06);
    osc.connect(gain).connect(masterGain);
    osc.start();
    osc.stop(c.currentTime + 0.07);
  }

  /** Rafale de "neige" TV pendant le changement de chaîne. */
  function staticBurst(duration = 0.4) {
    const c = ensureContext();
    const src = c.createBufferSource();
    src.buffer = noiseBuffer(duration);
    const gain = c.createGain();
    gain.gain.setValueAtTime(0.18, c.currentTime);
    gain.gain.linearRampToValueAtTime(0.0001, c.currentTime + duration);
    src.connect(gain).connect(masterGain);
    src.start();
    src.stop(c.currentTime + duration);
  }

  /** Petit "dong" pour l'horloge / interactions décor. */
  function ping(freq = 660) {
    const c = ensureContext();
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.001, c.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.12, c.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.4);
    osc.connect(gain).connect(masterGain);
    osc.start();
    osc.stop(c.currentTime + 0.4);
  }

  /** Miaulement grossier pour le chat qui se réveille. */
  function meow() {
    const c = ensureContext();
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(400, c.currentTime);
    osc.frequency.linearRampToValueAtTime(700, c.currentTime + 0.15);
    osc.frequency.linearRampToValueAtTime(300, c.currentTime + 0.35);
    gain.gain.setValueAtTime(0.0001, c.currentTime);
    gain.gain.linearRampToValueAtTime(0.08, c.currentTime + 0.1);
    gain.gain.linearRampToValueAtTime(0.0001, c.currentTime + 0.4);
    osc.connect(gain).connect(masterGain);
    osc.start();
    osc.stop(c.currentTime + 0.4);
  }

  function startAmbient() {
    if (ambientNodes.length) return;
    const c = ensureContext();

    // Crépitement de feu / statique de fond = bruit filtré en boucle.
    const noiseSrc = c.createBufferSource();
    noiseSrc.buffer = noiseBuffer(2);
    noiseSrc.loop = true;
    const filter = c.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 800;
    filter.Q.value = 0.6;
    const fireGain = c.createGain();
    fireGain.gain.value = 0.25;
    noiseSrc.connect(filter).connect(fireGain).connect(ambientGain);
    noiseSrc.start();

    // Tic-tac d'horloge.
    let tickTimer = setInterval(() => {
      if (ambientMuted) return;
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = "square";
      osc.frequency.value = 1000;
      gain.gain.setValueAtTime(0.06, c.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.03);
      osc.connect(gain).connect(ambientGain);
      osc.start();
      osc.stop(c.currentTime + 0.03);
    }, 1000);

    ambientNodes = [noiseSrc, tickTimer];
  }

  function setAmbientMuted(muted) {
    ambientMuted = muted;
    if (ambientGain) ambientGain.gain.value = muted ? 0 : 0.35;
  }

  return {
    unlock,
    hoverBlip,
    remoteClick,
    staticBurst,
    ping,
    meow,
    startAmbient,
    setAmbientMuted,
  };
})();

window.Audio2000 = Audio2000;
