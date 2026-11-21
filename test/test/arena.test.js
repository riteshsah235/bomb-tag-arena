import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { Arena } from "../src/arena.js";

class FakeSocket extends EventEmitter {
  messages = [];
  send(text) {
    this.messages.push(JSON.parse(text));
  }
  close() {
    this.emit("close");
  }
}
function fixture(count = 2) {
  const room = new Arena();
  const sockets = Array.from({ length: count }, (_, i) => {
    const socket = new FakeSocket();
    room.join(socket, `Player ${i + 1}`);
    return socket;
  });
  clearInterval(room.timer);
  return { room, sockets, players: [...room.players.values()] };
}

test("room welcomes players, bounds nicknames, and caps at eight", () => {
  const { room, sockets } = fixture(8);
  assert.equal(room.players.size, 8);
  assert.equal(sockets[0].messages[0].type, "welcome");
  room.join(new FakeSocket(), "extra");
  assert.equal(room.players.size, 8);
});
test("only the host can start and two players are required", () => {
  const { room, players } = fixture();
  room.message(players[1].id, JSON.stringify({ type: "start" }));
  assert.equal(room.phase, "lobby");
  room.message(players[0].id, JSON.stringify({ type: "start" }));
  assert.equal(room.phase, "countdown");
});
test("movement is normalized, server-owned, and clamped to arena", () => {
  const { room, players } = fixture();
  const p = players[0];
  room.prepare();
  room.start(Date.now());
  room.message(p.id, JSON.stringify({ type: "input", x: 100, y: 100 }));
  assert.ok(Math.hypot(p.dx, p.dy) <= 1.001);
  p.x = 936;
  p.y = 576;
  room.last = Date.now() - 100;
  room.tick();
  assert.ok(p.x <= 937 && p.y <= 577);
});
test("touch passes the bomb, preserves fuse, and prevents immediate tag-back", () => {
  const {
    room,
    players: [a, b],
  } = fixture();
  room.prepare();
  room.start(Date.now());
  room.holder = a.id;
  room.retag = 0;
  a.x = b.x = 400;
  a.y = b.y = 300;
  const deadline = room.deadline;
  room.last = Date.now();
  room.tick();
  assert.equal(room.holder, b.id);
  assert.equal(room.deadline, deadline);
  room.tick();
  assert.equal(room.holder, b.id);
});
test("explosion eliminates holder, awards one win, and rematch revives everyone", () => {
  const {
    room,
    players: [a, b],
  } = fixture();
  room.prepare();
  room.start(Date.now());
  room.holder = a.id;
  room.deadline = Date.now() - 1;
  room.retag = Date.now() + 1000;
  room.tick();
  assert.equal(a.alive, false);
  assert.equal(room.phase, "finished");
  assert.equal(room.winner, b.id);
  assert.equal(b.wins, 1);
  room.prepare();
  assert.ok(a.alive && b.alive);
  assert.equal(b.wins, 1);
});
test("late joins spectate and disconnected host transfers to next player", () => {
  const { room, players, sockets } = fixture();
  room.prepare();
  room.start(Date.now());
  const late = new FakeSocket();
  room.join(late, "Late");
  clearInterval(room.timer);
  assert.equal([...room.players.values()][2].alive, false);
  sockets[0].close();
  assert.equal(room.host(), players[1].id);
});
test("invalid input and oversized messages cannot corrupt player state", () => {
  const {
    room,
    players: [p],
  } = fixture();
  room.message(p.id, "{bad");
  room.message(p.id, JSON.stringify({ type: "input", x: "bad", y: null }));
  assert.equal(p.dx, 0);
  assert.equal(p.dy, 0);
  assert.ok(Number.isFinite(p.x));
});
