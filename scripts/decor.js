/**
 * Interactions du décor : parallax souris, easter eggs cliquables,
 * cycle jour/nuit, et bips au survol des éléments interactifs.
 */

function initParallax(root) {
  const layers = root.querySelectorAll("[data-depth]");
  if (!layers.length) return;
  let raf = null;
  root.addEventListener("mousemove", (e) => {
    if (root.classList.contains("cinema-mode")) return;
    const { innerWidth, innerHeight } = window;
    const x = (e.clientX / innerWidth - 0.5) * 2;
    const y = (e.clientY / innerHeight - 0.5) * 2;
    if (raf) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      if (root.classList.contains("cinema-mode")) return;
      layers.forEach((layer) => {
        const depth = parseFloat(layer.dataset.depth) || 0;
        layer.style.transform = `translate3d(${x * depth}px, ${y * depth * 0.6}px, 0)`;
      });
    });
  });
}

function initHoverSounds(root) {
  root.querySelectorAll("[data-blip]").forEach((el) => {
    el.addEventListener("mouseenter", () => Audio2000.hoverBlip());
  });
}

function initLavaLamp() {
  const lamp = document.getElementById("lava-lamp");
  if (!lamp) return;
  lamp.addEventListener("click", () => {
    lamp.classList.toggle("lava-lamp--active");
    Audio2000.hoverBlip();
  });
}

function initClock() {
  const clock = document.getElementById("wall-clock");
  if (!clock) return;
  clock.addEventListener("click", () => {
    clock.classList.add("clock--fast");
    Audio2000.ping(880);
    setTimeout(() => clock.classList.remove("clock--fast"), 4000);
  });
}

function initSleepingCat() {
  const cat = document.getElementById("sofa-cat");
  if (!cat) return;
  cat.addEventListener("click", () => {
    const awake = cat.classList.toggle("cat--awake");
    Audio2000.meow();
    if (awake) {
      clearTimeout(cat._sleepTimer);
      cat._sleepTimer = setTimeout(() => cat.classList.remove("cat--awake"), 6000);
    }
  });
}

function initDayNight() {
  const toggle = document.getElementById("light-switch");
  const room = document.getElementById("room");
  if (!toggle || !room) return;

  function apply(isNight) {
    room.classList.toggle("room--night", isNight);
    Storage.setNightMode(isNight);
    toggle.setAttribute("aria-pressed", String(isNight));
  }

  const stored = Storage.getNightMode();
  const initial = stored === null ? new Date().getHours() >= 19 || new Date().getHours() < 7 : stored;
  apply(initial);

  toggle.addEventListener("click", () => {
    apply(!room.classList.contains("room--night"));
    Audio2000.hoverBlip();
  });
}

window.initDecor = function initDecor() {
  const room = document.getElementById("room");
  if (room) initParallax(room);
  initHoverSounds(document);
  initLavaLamp();
  initClock();
  initSleepingCat();
  initDayNight();
};
