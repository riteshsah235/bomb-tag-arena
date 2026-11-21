import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
await mkdir("test-results", { recursive: true });
import assert from "node:assert/strict";
const target = process.env.TEST_URL || "http://127.0.0.1:3000";
const child = process.env.TEST_URL
  ? null
  : spawn(process.execPath, ["src/server.js"], { stdio: "inherit" });
let browser;
try {
  for (let n = 0; n < 40; n++) {
    try {
      if ((await fetch(target + "/health")).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  const a = await browser.newContext({
      viewport: { width: 1280, height: 900 },
    }),
    b = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
  const p = await a.newPage(),
    q = await b.newPage(),
    errors = [];
  for (const page of [p, q]) {
    page.on("pageerror", (e) => errors.push(e.message));
    await page.addInitScript(() => {
      const Original = window.WebSocket;
      window.WebSocket = class extends Original {
        constructor(...args) {
          super(...args);
          this.addEventListener("message", (e) => {
            try {
              const m = JSON.parse(e.data);
              if (m.type === "state") window.lastState = m;
              if (m.type === "welcome") window.playerId = m.id;
            } catch {}
          });
        }
      };
    });
  }
  await p.goto(target);
  await p.screenshot({
    path: "test-results/bomb-home-desktop.png",
    fullPage: true,
  });
  await q.goto(target);
  await q.screenshot({
    path: "test-results/bomb-home-phone.png",
    fullPage: true,
  });
  await p.locator("#name").fill("Mint");
  await p.locator("#create").click();
  await p.waitForFunction(() => window.lastState?.players.length === 1);
  const url = p.url();
  await q.goto(url);
  await q.locator("#name").fill("Peach");
  await q.locator("#join").click();
  await p.waitForFunction(() => window.lastState?.players.length === 2);
  await q.waitForFunction(() => window.lastState?.players.length === 2);
  await p.locator("#start").click();
  await p.waitForFunction(() => window.lastState.phase === "playing");
  await q.waitForFunction(() => window.lastState.phase === "playing");
  await p.screenshot({
    path: "test-results/bomb-live-desktop.png",
    fullPage: true,
  });
  await q.screenshot({
    path: "test-results/bomb-live-phone.png",
    fullPage: true,
  });
  await q.setViewportSize({ width: 320, height: 844 });
  await q.screenshot({
    path: "test-results/bomb-live-320.png",
    fullPage: true,
  });
  assert.ok(
    await q.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  );
  await q.setViewportSize({ width: 390, height: 844 });
  const before = await q.evaluate(
    () => window.lastState.players.find((x) => x.name === "Mint").x,
  );
  await p.keyboard.down("ArrowRight");
  await p.waitForTimeout(400);
  await p.keyboard.up("ArrowRight");
  await q.waitForFunction(
    (x) => window.lastState.players.find((p) => p.name === "Mint").x > x + 30,
    before,
  );
  // Move with the actual pointer thumbstick, then confirm the remote client sees it.
  const peachBefore = await p.evaluate(
      () => window.lastState.players.find((x) => x.name === "Peach").x,
    ),
    r = await q.locator("#stick").boundingBox();
  await q.mouse.move(r.x + r.width / 2, r.y + r.height / 2);
  await q.mouse.down();
  await q.mouse.move(r.x + r.width / 2 + 30, r.y + r.height / 2);
  await q.waitForTimeout(350);
  await q.mouse.up();
  await p.waitForFunction(
    (x) => window.lastState.players.find((p) => p.name === "Peach").x > x + 20,
    peachBefore,
  );
  const holderBefore = await p.evaluate(() => window.lastState.holder);
  for (let i = 0; i < 40; i++) {
    const positions = await p.evaluate(() => window.lastState.players);
    const mint = positions.find((x) => x.name === "Mint"),
      peach = positions.find((x) => x.name === "Peach");
    const dx = peach.x - mint.x,
      dy = peach.y - mint.y;
    for (const [key, on] of [
      ["ArrowRight", dx > 12],
      ["ArrowLeft", dx < -12],
      ["ArrowDown", dy > 12],
      ["ArrowUp", dy < -12],
    ]) {
      if (on) await p.keyboard.down(key);
      else await p.keyboard.up(key);
    }
    if ((await p.evaluate(() => window.lastState.holder)) !== holderBefore)
      break;
    await p.waitForTimeout(80);
  }
  for (const key of ["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp"])
    await p.keyboard.up(key);
  await p.waitForFunction((id) => window.lastState.holder !== id, holderBefore);
  await q.waitForFunction((id) => window.lastState.holder !== id, holderBefore);
  console.log("LIVE_TAG_TRANSFER_OK");
  await p.waitForFunction(() => window.lastState.phase === "finished", null, {
    timeout: 20000,
  });
  await q.waitForFunction(() => window.lastState.phase === "finished");
  const winnerA = await p.evaluate(() => window.lastState.winner),
    winnerB = await q.evaluate(() => window.lastState.winner);
  assert.equal(winnerA, winnerB);
  await p.locator("#start").click();
  await p.waitForFunction(() => window.lastState.round === 2);
  await q.waitForFunction(() => window.lastState.round === 2);
  await p.locator("#leave").click();
  await q.waitForFunction(() => window.lastState.host === window.playerId);
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      target,
      twoSessions: true,
      desktopMovementObservedRemotely: true,
      touchMovementObservedRemotely: true,
      agreedWinner: true,
      rematch: true,
      hostTransfer: true,
      pageErrors: errors,
    }),
  );
  for (const width of [320, 390, 1280]) {
    const c = await browser.newContext({ viewport: { width, height: 900 } }),
      t = await c.newPage();
    await t.goto(target);
    await t.screenshot({
      path: `test-results/bomb-home-${width}.png`,
      fullPage: true,
    });
    assert.ok(
      await t.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await c.close();
  }
} finally {
  await browser?.close();
  child?.kill("SIGTERM");
}
