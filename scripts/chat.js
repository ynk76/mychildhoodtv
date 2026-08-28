/**
 * Tchat en direct partagé entre tous les visiteurs (via Firebase Realtime
 * Database, voir scripts/firebase-config.js). Chaque visiteur reçoit un
 * pseudo aléatoire de personnage de dessin animé des années 2000, différent
 * à chaque nouvelle visite.
 */

const CARTOON_NICKNAMES = [
  "Titeuf", "Oggy", "Trotro", "Sacha", "Pikachu", "Yugi", "BobLeponge",
  "Patrick", "Carl", "Will", "Irma", "Taranee", "Cornelia", "HayLin",
  "Aelita", "Jeremy", "Odd", "Ulrich", "Yumi", "Sam", "Clover", "Alex",
  "Dora", "Diego", "Timmy", "JimmyNeutron", "Marsupilami", "Franklin",
  "Naruto", "KimPossible", "Djib", "Souley", "Gaston", "Lariflette",
];

function randomNickname() {
  const base = CARTOON_NICKNAMES[Math.floor(Math.random() * CARTOON_NICKNAMES.length)];
  const suffix = Math.floor(10 + Math.random() * 90);
  return `${base}${suffix}`;
}

function initChat() {
  const panel = document.getElementById("chat-panel");
  const toggle = document.getElementById("chat-toggle");
  const closeBtn = document.getElementById("chat-close");
  const messagesEl = document.getElementById("chat-messages");
  const form = document.getElementById("chat-form");
  const input = document.getElementById("chat-input");
  const nicknameEl = document.getElementById("chat-nickname");
  const statusEl = document.getElementById("chat-status");
  if (!panel || !toggle || !form || !input) return;

  toggle.addEventListener("click", () => {
    panel.hidden = !panel.hidden;
    Audio2000.hoverBlip();
    if (!panel.hidden) input.focus();
  });
  closeBtn.addEventListener("click", () => (panel.hidden = true));

  let nickname = null;
  try {
    nickname = sessionStorage.getItem("salon2000.chatNickname");
  } catch (e) {
    /* stockage indisponible : pseudo re-tiré à chaque interaction, tant pis */
  }
  if (!nickname) {
    nickname = randomNickname();
    try {
      sessionStorage.setItem("salon2000.chatNickname", nickname);
    } catch (e) {
      /* silencieux */
    }
  }
  nicknameEl.textContent = nickname;

  function disableChat(message) {
    statusEl.textContent = message;
    statusEl.hidden = false;
    input.disabled = true;
    form.querySelector("button[type=submit]").disabled = true;
  }

  const config = window.FIREBASE_CONFIG;
  if (!config || !config.apiKey || !config.databaseURL) {
    disableChat("Tchat non configuré pour ce site (voir scripts/firebase-config.js).");
    return;
  }
  if (typeof firebase === "undefined") {
    disableChat("Tchat indisponible (bibliothèque non chargée).");
    return;
  }

  let db;
  try {
    firebase.initializeApp(config);
    db = firebase.database();
  } catch (e) {
    disableChat("Tchat indisponible pour le moment.");
    return;
  }

  statusEl.textContent = "Connexion au tchat...";

  const messagesRef = db.ref("messages").limitToLast(50);
  let firstLoad = true;
  messagesRef.on(
    "child_added",
    (snapshot) => {
      const msg = snapshot.val();
      if (!msg || !msg.text) return;
      const line = document.createElement("p");
      line.className = "chat-line";
      const author = document.createElement("span");
      author.className = "chat-line__author";
      author.textContent = msg.name || "?";
      line.appendChild(author);
      line.appendChild(document.createTextNode(" : " + String(msg.text).slice(0, 200)));
      messagesEl.appendChild(line);
      messagesEl.scrollTop = messagesEl.scrollHeight;
      if (firstLoad) {
        statusEl.hidden = true;
        firstLoad = false;
      }
    },
    () => disableChat("Tchat indisponible (accès refusé).")
  );
  messagesRef.once("value", () => {
    statusEl.hidden = true;
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = input.value.trim().slice(0, 140);
    if (!text) return;
    db.ref("messages").push({
      name: nickname,
      text,
      ts: firebase.database.ServerValue.TIMESTAMP,
    });
    input.value = "";
  });
}

window.initChat = initChat;
