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

/** Le chat, gros, noir et paresseux : il se balade rarement et lentement.
 * Coordonnées en px absolus dans le canevas #room (1280x740 desktop,
 * 390x780 mobile) — le décor n'est plus fluide, voir styles/main.css. */
function initWanderingCat() {
  const cat = document.getElementById("room-cat");
  if (!cat) return;

  const DESKTOP_SPOTS = [
    { top: 636, left: 790 }, // sur le tapis
    { top: 648, left: 430 }, // sur le tapis, côté opposé
    { top: 630, left: 250 }, // au pied du canapé
  ];
  const MOBILE_SPOTS = [
    { top: 142, left: 232 }, // endormi sur la télé, côté droit
    { top: 142, left: 96 }, // endormi sur la télé, côté gauche
  ];
  const isMobile = () => window.innerWidth <= 760;

  let currentSpot = -1;
  let awake = false;

  function moveTo(index) {
    currentSpot = index;
    const spots = isMobile() ? MOBILE_SPOTS : DESKTOP_SPOTS;
    const spot = spots[index % spots.length];
    cat.classList.add("cat--walking");
    cat.classList.remove("cat--lying");
    cat.style.top = spot.top + "px";
    cat.style.left = spot.left + "px";
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
        const spots = isMobile() ? MOBILE_SPOTS : DESKTOP_SPOTS;
        let next = Math.floor(Math.random() * spots.length);
        if (next === currentSpot) next = (next + 1) % spots.length;
        moveTo(next);
      }
      scheduleNextMove();
    }, 45000 + Math.random() * 45000);
  }

  moveTo(Math.floor(Math.random() * (isMobile() ? MOBILE_SPOTS.length : DESKTOP_SPOTS.length)));
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
    room.setAttribute("data-mode", isNight ? "night" : "day");
    Storage.setNightMode(isNight);
    toggle.setAttribute("aria-pressed", String(isNight));
  }

  const stored = Storage.getNightMode();
  const initial = stored === null ? new Date().getHours() >= 19 || new Date().getHours() < 7 : stored;
  apply(initial);

  toggle.addEventListener("click", () => {
    apply(room.getAttribute("data-mode") !== "night");
    Audio2000.hoverBlip();
  });
}

window.initDecor = function initDecor() {
  initLavaLamp();
  initClock();
  initWanderingCat();
  initDayNight();
};
