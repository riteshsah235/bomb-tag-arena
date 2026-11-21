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
const W = 960, H = 600, DPR = Math.min(window.devicePixelRatio || 1, 2);
canvas.width = W * DPR;
canvas.height = H * DPR;
let muted = false, parts = [], waves = [], floats = [], trails = new Map(), shake = 0, flash = 0, flashCol = "#fff",
  fuseTotal = 1, lastDeadline = 0, prev = null, lastTick = 0, confetti = 0, bgPhase = 0;
try { muted = localStorage.getItem("bombtag-mute") === "1"; } catch {}
let AC;
function audio() {
  if (muted) return null;
  try {
    AC = AC || new (window.AudioContext || window.webkitAudioContext)();
    if (AC.state === "suspended") AC.resume();
    return AC;
  } catch { return null; }
}
function tone(f, d = 0.12, type = "square", v = 0.05, slide = 0, when = 0) {
  const a = audio(); if (!a) return;
  const o = a.createOscillator(), g = a.createGain(), t0 = a.currentTime + when;
  o.type = type; o.frequency.setValueAtTime(f, t0);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f + slide), t0 + d);
  g.gain.setValueAtTime(v, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
  o.connect(g); g.connect(a.destination); o.start(t0); o.stop(t0 + d + 0.02);
}
function noise(d = 0.5, v = 0.2) {
  const a = audio(); if (!a) return;
  const n = a.sampleRate * d, b = a.createBuffer(1, n, a.sampleRate), c = b.getChannelData(0);
  for (let i = 0; i < n; i++) c[i] = (Math.random() * 2 - 1) * (1 - i / n) ** 2;
  const s = a.createBufferSource(), g = a.createGain(), f = a.createBiquadFilter();
  f.type = "lowpass"; f.frequency.value = 900; g.gain.value = v;
  s.buffer = b; s.connect(f); f.connect(g); g.connect(a.destination); s.start();
}
const sfx = {
  tag() { tone(520, 0.1, "square", 0.07, 500); tone(260, 0.15, "sawtooth", 0.05, -120, 0.05); },
  boom() { noise(0.7, 0.35); tone(120, 0.5, "sawtooth", 0.12, -90); },
  dash() { tone(300, 0.14, "triangle", 0.06, 700); },
  tick(hi) { tone(hi ? 1200 : 800, 0.05, "square", 0.04); },
  count() { tone(660, 0.12, "square", 0.06); },
  go() { tone(990, 0.25, "square", 0.07, 400); },
  join() { tone(500, 0.08, "triangle", 0.05); tone(750, 0.1, "triangle", 0.05, 0, 0.08); },
  win() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.22, "triangle", 0.07, 0, i * 0.12)); },
};
const buzz = (p) => { try { navigator.vibrate && navigator.vibrate(p); } catch {} };
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
      detect(prev, m);
      state = m;
      prev = m;
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
const feed = document.createElement("div");
feed.id = "feed";
$("canvasbox").appendChild(feed);
function say(t, cls = "") {
  const d = document.createElement("div");
  d.className = "feedrow " + cls;
  d.textContent = t;
  feed.appendChild(d);
  while (feed.children.length > 4) feed.firstChild.remove();
  setTimeout(() => d.remove(), 5000);
}
const mb = document.createElement("button");
mb.id = "mute";
mb.setAttribute("aria-label", "Toggle sound");
const paintMute = () => (mb.textContent = muted ? "🔇" : "🔊");
paintMute();
mb.onclick = () => { muted = !muted; try { localStorage.setItem("bombtag-mute", muted ? "1" : "0"); } catch {} paintMute(); if (!muted) sfx.join(); };
const hw = document.createElement("div");
hw.className = "hright";
const nw = $("network");
nw.replaceWith(hw);
hw.append(mb, nw);
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
        n.textContent = (p.id === state.holder && playing ? "💣 " : "") + p.name + (p.id === myId ? " (you)" : "");
        const tag = document.createElement("small");
        tag.textContent = p.id === state.host ? "HOST" : "";
        const wins = document.createElement("span");
        wins.className = "wins";
        wins.textContent = p.wins + " ★";
        if (p.id === state.holder && playing) row.classList.add("holder");
        if (p.id === myId) row.classList.add("me");
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

function playerById(s, id) { return s && s.players.find((p) => p.id === id); }
function burst(x, y, col, n = 18, sp = 260, life = 0.7, size = 4) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * 6.283, v = sp * (0.35 + Math.random() * 0.65);
    parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life, max: life, col, size: size * (0.6 + Math.random() * 0.8) });
  }
}
function pos(id) { const d = drawn.get(id); return d || { x: W / 2, y: H / 2 }; }
function wave(x, y, col, r = 90) { waves.push({ x, y, col, t: 0, r }); }
function floatText(x, y, text, col) { floats.push({ x, y, text, col, t: 0 }); }
function detect(a, b) {
  if (!a) return;
  const me = b.players.find((p) => p.id === myId);
  // joins / leaves
  for (const p of b.players) if (!playerById(a, p.id) && p.id !== myId) { say(p.name + " joined the room", "join"); sfx.join(); }
  for (const p of a.players) if (!playerById(b, p.id)) say(p.name + " left", "leave");
  // phase changes
  if (a.phase !== b.phase) {
    if (b.phase === "countdown") { confetti = 0; trails.clear(); }
    if (b.phase === "playing") { sfx.go(); buzz(60); flash = 0.5; flashCol = "#c5ff62"; say("ROUND " + b.round + " · GO!", "go"); }
    if (b.phase === "finished") {
      const w = playerById(b, b.winner);
      if (w) { sfx.win(); confetti = 4; say("🏆 " + w.name + " wins the round", "win"); if (w.id === myId) buzz([80, 40, 80, 40, 160]); }
    }
  }
  if (b.phase === "countdown") {
    const n = Math.max(1, Math.ceil((b.deadline - b.now) / 1000));
    if (a.phase !== "countdown" || lastTick !== n) { lastTick = n; sfx.count(); buzz(20); }
  }
  if (b.phase !== "playing") return;
  // fuse length
  if (Math.abs(b.deadline - lastDeadline) > 400 || a.phase !== "playing") { fuseTotal = Math.max(1000, b.deadline - b.now); lastDeadline = b.deadline; }
  // bomb passed
  if (a.holder && b.holder && a.holder !== b.holder) {
    const to = playerById(b, b.holder), from = playerById(a, a.holder);
    const p = pos(b.holder);
    wave(p.x, p.y, "#ff806c", 110); burst(p.x, p.y, "#ffd2c9", 16, 300, 0.5);
    floatText(p.x, p.y - 44, "TAGGED!", "#ff806c");
    shake = Math.max(shake, 7); sfx.tag();
    say((from ? from.name : "?") + " tagged " + (to ? to.name : "?"), "tag");
    if (b.holder === myId) { buzz([70, 40, 70]); flash = 0.35; flashCol = "#ff4d4d"; }
    else if (a.holder === myId) { buzz(25); floatText(p.x, p.y - 70, "PHEW", "#c5ff62"); }
  }
  // explosions
  for (const p of a.players) {
    const q = playerById(b, p.id);
    if (q && p.alive && !q.alive) {
      const d = pos(p.id);
      burst(d.x, d.y, "#ff725c", 46, 520, 1.0, 6); burst(d.x, d.y, "#ffd36a", 30, 380, 0.8, 5); burst(d.x, d.y, p.color, 20, 300, 0.9, 5);
      wave(d.x, d.y, "#ffb04a", 180); wave(d.x, d.y, "#ff725c", 120);
      shake = 18; flash = 0.6; flashCol = "#ffb04a"; sfx.boom();
      floatText(d.x, d.y - 40, "BOOM!", "#ffb04a");
      say("💥 " + p.name + " blew up", "boom");
      buzz(p.id === myId ? [200, 60, 300] : 90);
    }
    // dash
    if (q && q.dashReady > p.dashReady + 1000) {
      const d = pos(p.id);
      burst(d.x, d.y, p.color, 12, 220, 0.35, 3);
      if (p.id === myId) { sfx.dash(); buzz(15); } 
    }
  }
}
function rounded(x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}
const hex = (c, a) => c + Math.round(a * 255).toString(16).padStart(2, "0");
function bg(t, danger, remain) {
  const g = ctx.createRadialGradient(480, 300, 60, 480, 300, 640);
  g.addColorStop(0, "#1f2740"); g.addColorStop(1, "#0b0e18");
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  // moving grid
  ctx.lineWidth = 1;
  const off = (t / 40) % 48;
  ctx.strokeStyle = "#2a3550";
  ctx.globalAlpha = 0.55;
  ctx.beginPath();
  for (let x = -48 + off; x < W; x += 48) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
  for (let y = -48 + off; y < H; y += 48) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
  ctx.stroke();
  ctx.globalAlpha = 1;
  // centre ring + logo
  ctx.strokeStyle = "#c5ff6226"; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(480, 300, 130, 0, 6.283); ctx.stroke();
  ctx.beginPath(); ctx.arc(480, 300, 8, 0, 6.283); ctx.fillStyle = "#c5ff6233"; ctx.fill();
  ctx.save(); ctx.globalAlpha = 0.07; ctx.fillStyle = "#c5ff62"; ctx.font = "900 110px Impact,sans-serif"; ctx.textAlign = "center"; ctx.fillText("BOMB TAG", 480, 335); ctx.restore();
  // border glows red as fuse burns down
  const pulse = 0.5 + 0.5 * Math.sin(t / (danger ? 90 : 500));
  ctx.lineWidth = 5;
  ctx.strokeStyle = danger ? hex("#ff4d4d", 0.5 + pulse * 0.5) : "#c5ff6288";
  ctx.shadowColor = danger ? "#ff4d4d" : "#c5ff62"; ctx.shadowBlur = 14 + pulse * 10;
  rounded(10, 10, 940, 580, 18); ctx.stroke();
  ctx.shadowBlur = 0;
  // corner brackets
  ctx.strokeStyle = "#ffffff55"; ctx.lineWidth = 3;
  for (const [cx, cy, sx, sy] of [[10, 10, 1, 1], [950, 10, -1, 1], [10, 590, 1, -1], [950, 590, -1, -1]]) {
    ctx.beginPath(); ctx.moveTo(cx + sx * 40, cy); ctx.lineTo(cx, cy); ctx.lineTo(cx, cy + sy * 40); ctx.stroke();
  }
}
function drawPlayer(p, d, t, now, holder, remain) {
  const bomb = p.id === holder, me = p.id === myId, r = bomb ? 25 : 21;
  // trail
  let tr = trails.get(p.id); if (!tr) trails.set(p.id, (tr = []));
  tr.push({ x: d.x, y: d.y }); if (tr.length > 10) tr.shift();
  for (let i = 0; i < tr.length - 1; i++) {
    ctx.fillStyle = hex(bomb ? "#ff806c" : p.color, (i / tr.length) * 0.28);
    ctx.beginPath(); ctx.arc(tr[i].x, tr[i].y, r * (0.35 + i / tr.length * 0.5), 0, 6.283); ctx.fill();
  }
  ctx.save(); ctx.translate(d.x, d.y);
  // ground shadow
  ctx.fillStyle = "#0006"; ctx.beginPath(); ctx.ellipse(0, r - 2, r * 0.9, 7, 0, 0, 6.283); ctx.fill();
  if (me) {
    ctx.strokeStyle = "#ffffffaa"; ctx.lineWidth = 2; ctx.setLineDash([6, 6]);
    ctx.beginPath(); ctx.arc(0, 0, 33, t / 600, t / 600 + 6.283); ctx.stroke(); ctx.setLineDash([]);
  }
  if (bomb) {
    const rate = remain < 3 ? 70 : 140, pulse = Math.sin(t / rate);
    ctx.shadowColor = "#ff4d3d"; ctx.shadowBlur = 28 + pulse * 8;
    ctx.fillStyle = "#ff806c";
    ctx.beginPath(); ctx.arc(0, 0, r + pulse * 2.5, 0, 6.283); ctx.fill(); ctx.shadowBlur = 0;
    // fuse timer ring
    const frac = Math.max(0, Math.min(1, (remain * 1000) / fuseTotal));
    ctx.lineWidth = 5; ctx.lineCap = "round";
    ctx.strokeStyle = "#ffffff30"; ctx.beginPath(); ctx.arc(0, 0, 38, 0, 6.283); ctx.stroke();
    ctx.strokeStyle = frac < 0.3 ? "#ff4d4d" : "#ffd36a";
    ctx.beginPath(); ctx.arc(0, 0, 38, -1.5708, -1.5708 + 6.283 * frac); ctx.stroke(); ctx.lineCap = "butt";
    // sparking fuse
    ctx.strokeStyle = "#f4f3ed"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(8, -r + 4); ctx.quadraticCurveTo(18, -r - 8, 12, -r - 16); ctx.stroke();
    ctx.fillStyle = Math.sin(t / 40) > 0 ? "#ffe27a" : "#ff9d4a";
    ctx.beginPath(); ctx.arc(12, -r - 17, 4 + Math.random() * 2, 0, 6.283); ctx.fill();
    if (Math.random() < 0.5) parts.push({ x: d.x + 12, y: d.y - r - 17, vx: (Math.random() - 0.5) * 90, vy: -40 - Math.random() * 80, life: 0.4, max: 0.4, col: "#ffd36a", size: 2.5 });
    if (now < state.retag) {
      ctx.strokeStyle = "#ffffffcc"; ctx.lineWidth = 2; ctx.setLineDash([5, 4]);
      ctx.beginPath(); ctx.arc(0, 0, 46, -t / 300, -t / 300 + 6.283); ctx.stroke(); ctx.setLineDash([]);
    }
  } else {
    ctx.shadowColor = p.color; ctx.shadowBlur = 14;
    ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(0, 0, r, 0, 6.283); ctx.fill(); ctx.shadowBlur = 0;
    ctx.fillStyle = "#ffffff30"; ctx.beginPath(); ctx.arc(-6, -8, 8, 0, 6.283); ctx.fill();
  }
  // face looks toward motion
  const look = Math.max(-3, Math.min(3, (d.vx || 0) * 0.02)), lookY = Math.max(-2, Math.min(2, (d.vy || 0) * 0.02));
  const scared = bomb ? 1 : 0;
  ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(-7, -3, 5.5 + scared, 0, 6.283); ctx.arc(7, -3, 5.5 + scared, 0, 6.283); ctx.fill();
  ctx.fillStyle = "#17212d"; ctx.beginPath(); ctx.arc(-7 + look, -3 + lookY, 2.6, 0, 6.283); ctx.arc(7 + look, -3 + lookY, 2.6, 0, 6.283); ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = "#17212d"; ctx.beginPath();
  if (bomb) ctx.ellipse(0, 9, 5, 4 + Math.abs(Math.sin(t / 90)) * 2, 0, 0, 6.283);
  else ctx.arc(0, 3, 8, 0.15, Math.PI - 0.15);
  ctx.stroke();
  // dash ring for me
  if (me) {
    const cool = Math.max(0, (p.dashReady - now) / 1000);
    if (cool > 0) {
      ctx.strokeStyle = "#ffffff55"; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, 0, 28, -1.5708, -1.5708 + 6.283 * (1 - Math.min(1, cool / 3))); ctx.stroke();
    }
    ctx.fillStyle = "#c5ff62"; ctx.beginPath(); ctx.moveTo(0, -r - 22 - (bomb ? 16 : 0) + Math.sin(t / 200) * 3); ctx.lineTo(-6, -r - 32 - (bomb ? 16 : 0) + Math.sin(t / 200) * 3); ctx.lineTo(6, -r - 32 - (bomb ? 16 : 0) + Math.sin(t / 200) * 3); ctx.fill();
  }
  // name tag
  ctx.font = "bold 13px sans-serif"; ctx.textAlign = "center";
  const w = ctx.measureText(p.name).width;
  ctx.fillStyle = "#0b0e18cc"; rounded(-w / 2 - 8, 33, w + 16, 22, 7); ctx.fill();
  if (bomb) { ctx.strokeStyle = "#ff806c"; ctx.lineWidth = 1.5; rounded(-w / 2 - 8, 33, w + 16, 22, 7); ctx.stroke(); }
  ctx.fillStyle = me ? "#fff" : p.color; ctx.fillText(p.name, 0, 49);
  ctx.restore();
}
function draw(t) {
  requestAnimationFrame(draw);
  const dt = Math.min((t - lastDraw) / 1000, 0.1);
  lastDraw = t;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  const now = Date.now() + offset, remain = state ? Math.max(0, (state.deadline - now) / 1000) : 0;
  const playing = state && state.phase === "playing";
  const myBomb = !!state && playing && state.holder === myId;
  // screen shake
  shake = Math.max(0, shake - dt * 30);
  ctx.save();
  if (shake > 0.2) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
  bg(t, myBomb && remain < 5 || (playing && remain < 3), remain);
  if (state) {
    $("timer").textContent =
      state.phase === "playing" ? remain.toFixed(1) + "s"
      : state.phase === "countdown" ? Math.ceil(remain)
      : state.phase === "finished" ? "GG" : "WAIT";
    $("timer").style.color = state.phase === "playing" && remain < 3 ? "#ff806c" : "#c5ff62";
    $("timer").classList.toggle("hot", state.phase === "playing" && remain < 3);
    const me = state.players.find((p) => p.id === myId), cool = me ? Math.max(0, (me.dashReady - now) / 1000) : 0;
    $("dash").style.opacity = cool > 0 ? ".45" : "1";
    $("dash").querySelector("small").textContent = cool > 0 ? cool.toFixed(1) + "s" : "READY";
    if (state.phase === "countdown") {
      const n = Math.max(1, Math.ceil(remain));
      if ($("overlaytitle").textContent !== String(n)) { $("overlaytitle").textContent = n; $("overlaytitle").classList.remove("pop"); void $("overlaytitle").offsetWidth; $("overlaytitle").classList.add("pop"); }
    }
    // low fuse ticking
    if (playing && remain < 5) { const k = Math.ceil(remain * (remain < 2 ? 4 : 2)); if (k !== drawLastK) { drawLastK = k; sfx.tick(remain < 2); } }
    for (const p of state.players) {
      if (!p.alive && playing) { trails.delete(p.id); continue; }
      let d = drawn.get(p.id);
      if (!d) { d = { x: p.x, y: p.y, vx: 0, vy: 0 }; drawn.set(p.id, d); }
      const blend = 1 - Math.exp(-22 * dt), ox = d.x, oy = d.y;
      d.x += (p.x - d.x) * blend; d.y += (p.y - d.y) * blend;
      d.vx = (d.x - ox) / Math.max(dt, 0.001); d.vy = (d.y - oy) / Math.max(dt, 0.001);
    }
    // holder last so the bomb is on top
    const order = state.players.filter((p) => p.alive || !playing).sort((a, b) => (a.id === state.holder) - (b.id === state.holder));
    for (const p of order) { const d = drawn.get(p.id); if (d) drawPlayer(p, d, t, now, playing || state.phase === "countdown" ? state.holder : null, remain); }
    for (const id of drawn.keys()) if (!state.players.some((p) => p.id === id)) { drawn.delete(id); trails.delete(id); }
    // spectator banner
    if (me && !me.alive && playing) { ctx.fillStyle = "#0b0e18cc"; rounded(330, 540, 300, 36, 18); ctx.fill(); ctx.fillStyle = "#c5ff62"; ctx.font = "800 14px sans-serif"; ctx.textAlign = "center"; ctx.fillText("👀 YOU ARE SPECTATING", 480, 563); }
  }
  // shockwaves
  for (let i = waves.length - 1; i >= 0; i--) {
    const w = waves[i]; w.t += dt * 2.2; if (w.t >= 1) { waves.splice(i, 1); continue; }
    ctx.strokeStyle = hex(w.col, 1 - w.t); ctx.lineWidth = 6 * (1 - w.t) + 1;
    ctx.beginPath(); ctx.arc(w.x, w.y, 20 + w.r * w.t, 0, 6.283); ctx.stroke();
  }
  // particles
  for (let i = parts.length - 1; i >= 0; i--) {
    const q = parts[i]; q.life -= dt; if (q.life <= 0) { parts.splice(i, 1); continue; }
    q.x += q.vx * dt; q.y += q.vy * dt; q.vx *= 0.96; q.vy = q.vy * 0.96 + 90 * dt;
    ctx.globalAlpha = Math.max(0, q.life / q.max); ctx.fillStyle = q.col;
    ctx.beginPath(); ctx.arc(q.x, q.y, q.size * (0.4 + 0.6 * q.life / q.max), 0, 6.283); ctx.fill();
  }
  ctx.globalAlpha = 1;
  if (parts.length > 220) parts.splice(0, parts.length - 220);
  // confetti
  if (confetti > 0) {
    confetti -= dt;
    for (let i = 0; i < 3; i++) parts.push({ x: Math.random() * W, y: -10, vx: (Math.random() - 0.5) * 120, vy: 80 + Math.random() * 120, life: 2.2, max: 2.2, col: ["#c5ff62", "#ff806c", "#6cd2ff", "#ffd36a", "#c88bff"][(Math.random() * 5) | 0], size: 5 });
  }
  // floating text
  for (let i = floats.length - 1; i >= 0; i--) {
    const f = floats[i]; f.t += dt; if (f.t > 1) { floats.splice(i, 1); continue; }
    ctx.globalAlpha = 1 - f.t; ctx.fillStyle = f.col; ctx.font = "900 " + (22 + (1 - f.t) * 8) + "px Impact,sans-serif"; ctx.textAlign = "center";
    ctx.lineWidth = 4; ctx.strokeStyle = "#0b0e18"; ctx.strokeText(f.text, f.x, f.y - f.t * 40); ctx.fillText(f.text, f.x, f.y - f.t * 40);
  }
  ctx.globalAlpha = 1;
  // flash
  if (flash > 0) { ctx.fillStyle = hex(flashCol, Math.min(0.5, flash)); ctx.fillRect(-20, -20, W + 40, H + 40); flash = Math.max(0, flash - dt * 2.2); }
  ctx.restore();
  // danger vignette (cheap: CSS class)
  $("canvasbox").classList.toggle("danger", myBomb);
  $("canvasbox").classList.toggle("urgent", myBomb && remain < 3);
}
let lastTickT = 0, drawLastK = -1;
requestAnimationFrame(draw);
