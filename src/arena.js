export class Arena {
  constructor(onEmpty = () => {}) {
    this.onEmpty = onEmpty;
    this.players = new Map();
    this.sockets = new Map();
    this.phase = "lobby";
    this.holder = null;
    this.deadline = 0;
    this.round = 0;
    this.timer = null;
    this.last = 0;
    this.frames = 0;
    this.retag = 0;
    this.event = "Invite a friend to get started.";
    this.winner = null;
  }
  join(ws, rawName) {
    if (this.players.size >= 8) {
      ws.close(1008, "Room is full");
      return;
    }
    const id = crypto.randomUUID().slice(0, 8);
    const name =
      (rawName || "Player")
        .replace(/[^\p{L}\p{N} _-]/gu, "")
        .slice(0, 14)
        .trim() || "Player";
    const p = {
      id,
      name,
      x: 0,
      y: 0,
      dx: 0,
      dy: 0,
      dashUntil: 0,
      dashReady: 0,
      alive: this.phase !== "playing",
      wins: 0,
      color: this.freeColor(),
      lastSeen: Date.now(),
      joined: Date.now(),
    };
    this.spawn(p);
    this.players.set(id, p);
    this.sockets.set(id, ws);
    ws.send(JSON.stringify({ type: "welcome", id }));
    ws.on("message", (data, binary) => {
      if (!binary) this.message(id, data.toString());
    });
    ws.on("close", () => this.leave(id));
    ws.on("error", () => this.leave(id));
    if (!this.timer) {
      this.last = Date.now();
      this.timer = setInterval(() => this.tick(), 1000 / 30);
    }
    this.broadcast();
  }
  freeColor() {
    const colors = [
      "#83f9cf",
      "#ff8e92",
      "#9aa7ff",
      "#ffcf76",
      "#d5a0ff",
      "#70ddff",
      "#ff99df",
      "#f1f59b",
    ];
    return (
      colors.find(
        (c) => ![...this.players.values()].some((p) => p.color === c),
      ) || colors[0]
    );
  }
  spawn(p) {
    const i = [...this.players.keys()].indexOf(p.id) + 1;
    const a = (i < 0 ? this.players.size : i) * 2.39996;
    p.x = 480 + Math.cos(a) * 290;
    p.y = 300 + Math.sin(a) * 180;
    p.dx = 0;
    p.dy = 0;
  }
  host() {
    return this.players.keys().next().value;
  }
  message(id, data) {
    const p = this.players.get(id);
    if (!p || typeof data !== "string" || data.length > 200) return;
    let m;
    try {
      m = JSON.parse(data);
    } catch {
      return;
    }
    const now = Date.now();
    p.lastSeen = now;
    if (m.type === "input") {
      if (p.inputAt && now - p.inputAt < 25) return;
      p.inputAt = now;
      p.dx = Number.isFinite(m.x) ? Math.max(-1, Math.min(1, m.x)) : 0;
      p.dy = Number.isFinite(m.y) ? Math.max(-1, Math.min(1, m.y)) : 0;
      const len = Math.hypot(p.dx, p.dy);
      if (len > 1) {
        p.dx /= len;
        p.dy /= len;
      }
      if (m.dash && now >= p.dashReady && p.alive && this.phase === "playing") {
        p.dashUntil = now + 190;
        p.dashReady = now + 3000;
      }
    }
    if (
      m.type === "start" &&
      id === this.host() &&
      this.players.size >= 2 &&
      this.phase !== "playing" &&
      this.phase !== "countdown"
    )
      this.prepare();
    if (m.type === "ping") this.send(id, { type: "pong", t: m.t });
  }
  prepare() {
    this.round++;
    this.phase = "countdown";
    this.deadline = Date.now() + 3500;
    this.winner = null;
    this.holder = null;
    this.event = "Get ready. Stay away from the bomb!";
    for (const p of this.players.values()) {
      this.spawn(p);
      p.alive = true;
      p.dashReady = 0;
    }
    this.broadcast();
  }
  start(now) {
    if (this.players.size < 2) {
      this.phase = "lobby";
      this.event = "Waiting for another player.";
      return;
    }
    this.phase = "playing";
    const alive = [...this.players.values()].filter((p) => p.alive);
    this.holder = alive[Math.floor(Math.random() * alive.length)].id;
    this.deadline = now + 10000;
    this.retag = now + 1200;
    this.event = "Bomb is live. Touch someone to pass it.";
  }
  leave(id) {
    if (!this.players.has(id)) return;
    this.players.delete(id);
    this.sockets.delete(id);
    if (!this.players.size) {
      clearInterval(this.timer);
      this.timer = null;
      this.phase = "lobby";
      this.holder = null;
      this.onEmpty();
      return;
    }
    if (this.phase === "playing") {
      if (this.checkWin()) return;
      if (this.holder === id) {
        this.holder = [...this.players.values()].find((p) => p.alive)?.id;
        this.deadline = Date.now() + 7000;
        this.retag = Date.now() + 1200;
      }
    }
    if (this.players.size < 2 && this.phase === "countdown") {
      this.phase = "lobby";
      this.deadline = 0;
    }
    this.broadcast();
  }
  checkWin() {
    const alive = [...this.players.values()].filter((p) => p.alive);
    if (alive.length <= 1) {
      this.phase = "finished";
      this.winner = alive[0]?.id || null;
      if (alive[0]) alive[0].wins++;
      this.holder = null;
      this.event = alive[0] ? `${alive[0].name} survived!` : "Round over.";
      this.broadcast();
      return true;
    }
    return false;
  }
  tick() {
    const now = Date.now(),
      dt = Math.min((now - this.last) / 1000, 0.08);
    this.last = now;
    for (const [id, p] of this.players) {
      if (now - p.lastSeen > 45000) {
        try {
          this.sockets.get(id)?.close(1000, "Inactive");
        } catch {}
        this.leave(id);
      }
    }
    if (this.phase === "countdown" && now >= this.deadline) this.start(now);
    if (this.phase === "playing") {
      for (const p of this.players.values()) {
        if (!p.alive) continue;
        if (now - (p.inputAt || 0) > 250) {
          p.dx = 0;
          p.dy = 0;
        }
        const speed = now < p.dashUntil ? 680 : 225;
        p.x = Math.max(23, Math.min(937, p.x + p.dx * speed * dt));
        p.y = Math.max(23, Math.min(577, p.y + p.dy * speed * dt));
      }
      const h = this.players.get(this.holder);
      if (h && now >= this.retag) {
        for (const p of this.players.values()) {
          if (
            p.id !== h.id &&
            p.alive &&
            Math.hypot(p.x - h.x, p.y - h.y) < 47
          ) {
            this.holder = p.id;
            this.retag = now + 1000;
            this.event = `${h.name} passed the bomb to ${p.name}!`;
            break;
          }
        }
      }
      if (now >= this.deadline) {
        const victim = this.players.get(this.holder);
        if (victim) {
          victim.alive = false;
          victim.dx = 0;
          victim.dy = 0;
          this.event = `${victim.name} went BOOM!`;
        }
        if (!this.checkWin()) {
          const alive = [...this.players.values()].filter((p) => p.alive);
          this.holder = alive[Math.floor(Math.random() * alive.length)].id;
          this.deadline =
            now +
            Math.max(6000, 10000 - (this.players.size - alive.length) * 750);
          this.retag = now + 1200;
        }
      }
    }
    if (++this.frames % 2 === 0) this.broadcast();
  }
  state() {
    return {
      type: "state",
      now: Date.now(),
      phase: this.phase,
      deadline: this.deadline,
      holder: this.holder,
      host: this.host(),
      round: this.round,
      event: this.event,
      winner: this.winner,
      retag: this.retag,
      players: [...this.players.values()].map(
        ({ id, name, x, y, alive, wins, color, dashReady, dashUntil }) => ({
          id,
          name,
          x,
          y,
          alive,
          wins,
          color,
          dashReady,
          dashUntil,
        }),
      ),
    };
  }
  send(id, m) {
    try {
      this.sockets.get(id)?.send(JSON.stringify(m));
    } catch {}
  }
  broadcast() {
    const data = JSON.stringify(this.state());
    for (const ws of this.sockets.values())
      try {
        ws.send(data);
      } catch {}
  }
}
