const $ = (id) => document.getElementById(id),
  canvas = $("arena"),
  ctx = canvas.getContext("2d");
let socket,
  myId,
  room,
  state,
  offset = 0,
  connected = false,
  keys = {},
  joy = { x: 0, y: 0 },
  dash = false,
  drawn = new Map(),
  lastPhase = "",
  lastHolder = "",
  lastDraw = performance.now(),
  lastPing = 0;
const params = new URLSearchParams(location.search),
  invite = params.get("room")?.toUpperCase();
if (invite && /^[A-Z2-9]{6}$/.test(invite)) {
  $("code").value = invite;
  $("create").textContent = "Create a different room ↗";
  $("name").focus();
}
try {
  $("name").value = localStorage.getItem("bombtag-name") || "";
} catch {}
function cleanCode() {
  return $("code").value.trim().toUpperCase();
}
function makeCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789",
    bytes = crypto.getRandomValues(new Uint8Array(6));
  return [...bytes].map((x) => chars[x % chars.length]).join("");
}
$("create").onclick = () => join(makeCode());
$("join").onclick = () => join(cleanCode());
$("code").onkeydown = (e) => {
  if (e.key === "Enter") join(cleanCode());
};
$("name").onkeydown = (e) => {
  if (e.key === "Enter") {
    if (invite) join(cleanCode());
    else join(makeCode());
  }
};
function join(code) {
  const name = $("name").value.trim();
  if (!name) {
    $("error").textContent = "Pick a nickname first.";
    $("name").focus();
    return;
  }
  if (!/^[A-Z2-9]{6}$/.test(code)) {
    $("error").textContent = "Enter the 6-character room code.";
    return;
  }
  try {
    localStorage.setItem("bombtag-name", name);
  } catch {}
  room = code;
  $("home").hidden = true;
  $("game").hidden = false;
  $("roomcode").textContent = room;
  history.replaceState(null, "", `?room=${room}`);
  connect(name);
}
function connect(name) {
  socket = new WebSocket(
    `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/room/${room}?name=${encodeURIComponent(name)}`,
  );
  let welcomed = false;
  socket.onopen = () => {
    connected = true;
    $("network").textContent = "● LIVE";
  };
  socket.onmessage = (e) => {
    let m;
    try {
      m = JSON.parse(e.data);
    } catch {
      return;
    }
    if (m.type === "welcome") {
      myId = m.id;
      welcomed = true;
    }
    if (m.type === "state") {
      offset = m.now - Date.now();
      state = m;
      renderUI();
    }
    if (m.type === "pong") {
      $("network").textContent = `● ${Math.round(Date.now() - m.t)}ms`;
    }
  };
  socket.onclose = () => {
    connected = false;
    $("network").textContent = "OFFLINE";
    $("overlay").hidden = false;
    $("overlaytitle").textContent = welcomed
      ? "Connection lost."
      : "Could not join.";
    $("overlaylabel").textContent = "OFFLINE";
    $("overlaytext").textContent = welcomed
      ? "Your connection closed. Tap rejoin to enter again. Wins reset when you leave."
      : "Room may be full (8 players), or hosting is unavailable. Try again in a moment.";
    $("start").hidden = false;
    $("start").disabled = false;
    $("start").textContent = "Rejoin room →";
  };
  socket.onerror = () => {
    $("network").textContent = "OFFLINE";
  };
}
$("start").onclick = () => {
  if (!connected) {
    state = null;
    drawn.clear();
    connect($("name").value.trim());
  } else send({ type: "start" });
};
$("copy").onclick = async () => {
  const link = location.origin + "/?room=" + room;
  try {
    await navigator.clipboard.writeText(link);
    toast("Invite link copied. Send it to your friends.");
  } catch {
    toast("Room " + room + " · Share the address from your browser.");
  }
};
$("leave").onclick = () => {
  socket?.close();
  location.href = "/";
};
function toast(t) {
  $("toast").textContent = t;
  $("toast").hidden = false;
  setTimeout(() => ($("toast").hidden = true), 3500);
}
function send(m) {
  if (socket?.readyState === 1) socket.send(JSON.stringify(m));
}
function renderUI() {
  if (!state || !myId) return;
  const me = state.players.find((p) => p.id === myId),
    host = state.host === myId,
    playing = state.phase === "playing";
  $("phase").textContent = playing
    ? `ROUND ${String(state.round).padStart(2, "0")} · ${state.players.filter((p) => p.alive).length} STILL IN`
    : state.phase === "countdown"
      ? "GET READY"
      : state.phase === "finished"
        ? "ROUND COMPLETE"
        : "WAITING ROOM";
  $("you").textContent = me?.alive
    ? "YOU: " + (state.holder === myId ? "BOMB!" : "RUN")
    : playing
      ? "SPECTATING"
      : "YOU: " + (me?.name || "");
  $("danger").hidden = state.holder !== myId;
  $("event").textContent = state.event;
  $("count").textContent = state.players.length + " / 8";
  const signature =
    JSON.stringify(
      state.players.map((p) => [
        p.id,
        p.name,
        p.wins,
        p.alive,
        p.id === state.holder,
      ]),
    ) +
    state.host +
    state.phase;
  if ($("players").dataset.sig !== signature) {
    $("players").dataset.sig = signature;
    $("players").replaceChildren(
      ...state.players.map((p) => {
        const row = document.createElement("div");
        row.className = "player" + (!p.alive && playing ? " out" : "");
        const dot = document.createElement("span");
        dot.className = "dot";
        dot.style.background = p.id === state.holder ? "#ff806c" : p.color;
        const n = document.createElement("span");
        n.className = "pname";
        n.textContent = p.name + (p.id === myId ? " (you)" : "");
        const tag = document.createElement("small");
        tag.textContent = p.id === state.host ? "HOST" : "";
        const wins = document.createElement("span");
        wins.className = "wins";
        wins.textContent = p.wins + " ★";
        row.append(dot, n, tag, wins);
        return row;
      }),
    );
  }
  $("overlay").hidden = playing;
  if (!playing) {
    $("overlaylabel").textContent =
      state.phase === "countdown"
        ? "INCOMING CHAOS"
        : state.phase === "finished"
          ? "LAST ONE STANDING"
          : "YOUR ROOM IS READY";
    $("overlaytitle").textContent =
      state.phase === "countdown"
        ? String(Math.max(1, Math.ceil((state.deadline - state.now) / 1000)))
        : state.phase === "finished"
          ? (state.players.find((p) => p.id === state.winner)?.name ||
              "Nobody") + " wins!"
          : "Bring your people.";
    $("overlaytext").textContent =
      state.phase === "countdown"
        ? "Move with WASD or the thumbstick. Dash to escape."
        : state.phase === "finished"
          ? "Another round? Same friends, fresh trouble."
          : state.players.length < 2
            ? "Invite at least one friend using the room link or code."
            : host
              ? "The crew is here. Start whenever you are ready."
              : "Waiting for the host to start the round.";
    $("start").hidden = state.phase === "countdown" || !host;
    $("start").disabled = state.players.length < 2;
    $("start").textContent =
      state.phase === "finished" ? "Play again →" : "Start round →";
  }
  lastPhase = state.phase;
  lastHolder = state.holder;
}
window.addEventListener("keydown", (e) => {
  if (
    ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(e.key) &&
    !$("game").hidden
  )
    e.preventDefault();
  keys[e.key.toLowerCase()] = true;
  if (e.code === "Space" && !e.repeat) dash = true;
});
window.addEventListener("keyup", (e) => (keys[e.key.toLowerCase()] = false));
window.addEventListener("blur", () => {
  keys = {};
  joy = { x: 0, y: 0 };
  resetStick();
});
document.addEventListener("visibilitychange", () => {
  keys = {};
  joy = { x: 0, y: 0 };
  send({ type: "input", x: 0, y: 0 });
});
let stickPointer = null;
function resetStick() {
  joy = { x: 0, y: 0 };
  $("knob").style.transform = "";
  stickPointer = null;
}
function updateStick(e) {
  const r = $("stick").getBoundingClientRect();
  let x = e.clientX - (r.left + r.width / 2),
    y = e.clientY - (r.top + r.height / 2),
    d = Math.hypot(x, y),
    max = 34;
  if (d > max) {
    x = (x / d) * max;
    y = (y / d) * max;
  }
  joy = { x: x / max, y: y / max };
  $("knob").style.transform = `translate(${x}px,${y}px)`;
}
$("stick").onpointerdown = (e) => {
  e.preventDefault();
  stickPointer = e.pointerId;
  $("stick").setPointerCapture(e.pointerId);
  updateStick(e);
};
$("stick").onpointermove = (e) => {
  if (e.pointerId === stickPointer) {
    e.preventDefault();
    updateStick(e);
  }
};
$("stick").onpointerup = resetStick;
$("stick").onpointercancel = resetStick;
$("dash").onpointerdown = (e) => {
  e.preventDefault();
  dash = true;
};
setInterval(() => {
  if (!connected) return;
  let x =
      joy.x +
      (keys.d || keys.arrowright ? 1 : 0) -
      (keys.a || keys.arrowleft ? 1 : 0),
    y =
      joy.y +
      (keys.s || keys.arrowdown ? 1 : 0) -
      (keys.w || keys.arrowup ? 1 : 0);
  const l = Math.hypot(x, y);
  if (l > 1) {
    x /= l;
    y /= l;
  }
  send({ type: "input", x, y, dash });
  dash = false;
  if (Date.now() - lastPing > 5000) {
    lastPing = Date.now();
    send({ type: "ping", t: lastPing });
  }
}, 50);
function rounded(x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}
function draw(t) {
  requestAnimationFrame(draw);
  const dt = Math.min((t - lastDraw) / 1000, 0.1);
  lastDraw = t;
  ctx.clearRect(0, 0, 960, 600);
  ctx.fillStyle = "#191f2e";
  ctx.fillRect(0, 0, 960, 600);
  ctx.strokeStyle = "#293246";
  ctx.lineWidth = 1;
  for (let x = 0; x < 960; x += 48) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 600);
    ctx.stroke();
  }
  for (let y = 0; y < 600; y += 48) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(960, y);
    ctx.stroke();
  }
  ctx.strokeStyle = "#47546b";
  ctx.lineWidth = 3;
  rounded(10, 10, 940, 580, 15);
  ctx.stroke();
  ctx.save();
  ctx.globalAlpha = 0.12;
  ctx.fillStyle = "#c5ff62";
  ctx.font = "900 100px Impact,sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("BOMB TAG", 480, 330);
  ctx.restore();
  if (!state) return;
  const now = Date.now() + offset,
    remain = Math.max(0, (state.deadline - now) / 1000);
  $("timer").textContent =
    state.phase === "playing"
      ? remain.toFixed(1) + "s"
      : state.phase === "countdown"
        ? Math.ceil(remain)
        : state.phase === "finished"
          ? "GG"
          : "WAIT";
  $("timer").style.color =
    state.phase === "playing" && remain < 3 ? "#ff806c" : "#c5ff62";
  const me = state.players.find((p) => p.id === myId),
    cool = me ? Math.max(0, (me.dashReady - now) / 1000) : 0;
  $("dash").style.opacity = cool > 0 ? ".45" : "1";
  $("dash").querySelector("small").textContent =
    cool > 0 ? cool.toFixed(1) + "s" : "READY";
  if (state.phase === "countdown")
    $("overlaytitle").textContent = Math.max(1, Math.ceil(remain));
  for (const p of state.players) {
    if (!p.alive && state.phase === "playing") continue;
    let d = drawn.get(p.id);
    if (!d) {
      d = { x: p.x, y: p.y };
      drawn.set(p.id, d);
    }
    const blend = 1 - Math.exp(-22 * dt);
    d.x += (p.x - d.x) * blend;
    d.y += (p.y - d.y) * blend;
    const bomb = p.id === state.holder;
    ctx.save();
    ctx.translate(d.x, d.y);
    if (p.id === myId) {
      ctx.strokeStyle = "#ffffff80";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 29, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (bomb) {
      ctx.shadowColor = "#ff725c";
      ctx.shadowBlur = 25;
      ctx.fillStyle = "#ff806c";
      ctx.beginPath();
      ctx.arc(0, 0, 25 + Math.sin(t / 100) * 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      if (now < state.retag) {
        ctx.strokeStyle = "#fff9";
        ctx.setLineDash([5, 4]);
        ctx.beginPath();
        ctx.arc(0, 0, 35, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    } else {
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(0, 0, 21, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "#17212d";
    ctx.beginPath();
    ctx.arc(-7, -3, 3, 0, Math.PI * 2);
    ctx.arc(7, -3, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#17212d";
    ctx.beginPath();
    ctx.arc(0, 2, 8, 0.15, Math.PI - 0.15);
    ctx.stroke();
    if (bomb) {
      ctx.fillStyle = "#f4f3ed";
      ctx.font = "bold 24px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("✦", 13, -28);
    }
    ctx.font = "bold 13px sans-serif";
    ctx.textAlign = "center";
    ctx.fillStyle = "#11141ecc";
    rounded(
      -ctx.measureText(p.name).width / 2 - 7,
      34,
      ctx.measureText(p.name).width + 14,
      22,
      5,
    );
    ctx.fill();
    ctx.fillStyle = p.id === myId ? "#fff" : p.color;
    ctx.fillText(p.name, 0, 50);
    ctx.restore();
  }
  for (const id of drawn.keys())
    if (!state.players.some((p) => p.id === id)) drawn.delete(id);
}
requestAnimationFrame(draw);
