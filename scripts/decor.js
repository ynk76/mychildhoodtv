/**
 * Interactions du décor (fixe, pas de parallax) : easter eggs cliquables,
 * horloge à l'heure réelle, chat qui se balade (lentement), lampe de
 * chevet jour/nuit, météo derrière la fenêtre.
 */

function initLavaLamp() {
  const lamp = document.getElementById("lava-lamp");
  if (!lamp) return;
  lamp.addEventListener("click", () => {
    lamp.classList.toggle("lava-lamp--active");
    Audio2000.hoverBlip();
  });
}

/** Horloge du magnétoscope : affiche l'heure réelle, glitch amusant au clic. */
function initClock() {
  const clock = document.getElementById("wall-clock");
  const text = clock && clock.querySelector(".vcr__clock-text");
  if (!clock || !text) return;

  function render() {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    const separator = now.getSeconds() % 2 === 0 ? ":" : " ";
    text.textContent = `${hh}${separator}${mm}`;
  }

  render();
  setInterval(render, 1000);

  clock.addEventListener("click", () => {
    clock.classList.add("clock--glitch");
    Audio2000.ping(880);
    setTimeout(() => clock.classList.remove("clock--glitch"), 1200);
  });
}

/** Le chat, gros, noir et paresseux : il se balade rarement et lentement. */
function initWanderingCat() {
  const cat = document.getElementById("room-cat");
  if (!cat) return;

  const spots = [
    { top: "82%", left: "38%" }, // sur le tapis
    { top: "82%", left: "60%" }, // sur le tapis, côté opposé
    { top: "68%", left: "22%" }, // au pied du canapé
    { top: "56%", left: "10%" }, // près de la plante
    { top: "86%", left: "50%" }, // devant la télé
  ];
  let currentSpot = -1;
  let awake = false;

  function moveTo(index) {
    currentSpot = index;
    const spot = spots[index];
    cat.classList.add("cat--walking");
    cat.classList.remove("cat--lying");
    cat.style.top = spot.top;
    cat.style.left = spot.left;
    clearTimeout(cat._arriveTimer);
    cat._arriveTimer = setTimeout(() => {
      cat.classList.remove("cat--walking");
      cat.classList.add("cat--lying");
    }, 4500);
  }

  function scheduleNextMove() {
    clearTimeout(cat._wanderTimer);
    // paresseux : une seule fois toutes les 45 à 90 secondes
    cat._wanderTimer = setTimeout(() => {
      if (!awake) {
        let next = Math.floor(Math.random() * spots.length);
        if (next === currentSpot) next = (next + 1) % spots.length;
        moveTo(next);
      }
      scheduleNextMove();
    }, 45000 + Math.random() * 45000);
  }

  moveTo(Math.floor(Math.random() * spots.length));
  scheduleNextMove();

  cat.addEventListener("click", () => {
    Audio2000.meow();
    awake = true;
    cat.classList.add("cat--awake");
    clearTimeout(cat._awakeTimer);
    cat._awakeTimer = setTimeout(() => {
      awake = false;
      cat.classList.remove("cat--awake");
    }, 2500);
  });
}

/** Lampe de chevet à côté de la télé : cliquer bascule jour/nuit. */
function initDayNight() {
  const toggle = document.getElementById("bedside-lamp");
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

/** Météo derrière la fenêtre : change de temps de temps en temps le jour, étoilé la nuit. */
function initWeather() {
  const window_ = document.querySelector(".window");
  const room = document.getElementById("room");
  if (!window_ || !room) return;

  const states = ["sunny", "cloudy", "rainy"];

  function pick() {
    const next = states[Math.floor(Math.random() * states.length)];
    window_.dataset.weather = next;
  }

  pick();
  setInterval(pick, 3 * 60 * 1000 + Math.random() * 90000);
}

window.initDecor = function initDecor() {
  initLavaLamp();
  initClock();
  initWanderingCat();
  initDayNight();
  initWeather();
};
