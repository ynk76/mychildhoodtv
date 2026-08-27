/**
 * Écran de veille rétro : après IDLE_MS sans interaction, un logo façon
 * "DVD" rebondit sur l'écran de la télé. Toute interaction le referme.
 */

const IDLE_MS = 3 * 60 * 1000; // 3 minutes

function createScreensaver(canvas) {
  const ctx = canvas.getContext("2d");
  let raf = null;
  let x = 40;
  let y = 30;
  let vx = 1.6;
  let vy = 1.3;
  let hue = Math.random() * 360;
  const label = "SALON 2000";

  function resize() {
    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
  }

  function step() {
    resize();
    ctx.font = "bold 28px 'Press Start 2P', monospace";
    const textWidth = ctx.measureText(label).width;
    const boxW = textWidth + 24;
    const boxH = 48;

    x += vx;
    y += vy;
    if (x <= 0 || x + boxW >= canvas.width) {
      vx *= -1;
      hue = Math.random() * 360;
      x = Math.max(0, Math.min(x, canvas.width - boxW));
    }
    if (y <= 0 || y + boxH >= canvas.height) {
      vy *= -1;
      hue = Math.random() * 360;
      y = Math.max(0, Math.min(y, canvas.height - boxH));
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = `hsl(${hue}, 90%, 60%)`;
    ctx.fillText(label, x + 12, y + 32);

    raf = requestAnimationFrame(step);
  }

  return {
    start() {
      resize();
      if (!raf) step();
    },
    stop() {
      if (raf) cancelAnimationFrame(raf);
      raf = null;
    },
  };
}

window.initScreensaver = function initScreensaver({ overlayEl, canvasEl, isPowerOn }) {
  const saver = createScreensaver(canvasEl);
  let idleTimer = null;
  let active = false;

  function show() {
    if (active || !isPowerOn()) return;
    active = true;
    overlayEl.hidden = false;
    canvasEl.style.display = "block";
    saver.start();
  }

  function hide() {
    if (!active) return;
    active = false;
    saver.stop();
    overlayEl.hidden = true;
    canvasEl.style.display = "none";
  }

  function resetTimer() {
    if (active) hide();
    clearTimeout(idleTimer);
    idleTimer = setTimeout(show, IDLE_MS);
  }

  ["mousemove", "mousedown", "keydown", "touchstart", "scroll"].forEach((evt) => {
    window.addEventListener(evt, resetTimer, { passive: true });
  });
  overlayEl.addEventListener("click", hide);

  resetTimer();

  return { hide, resetTimer };
};
