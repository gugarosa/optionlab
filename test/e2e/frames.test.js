// @ts-check
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { after, before, test } from "node:test";
import { launchBrowser } from "./browser.js";
import { build } from "../../lib/build.js";

let browser, server, origin, directory;
let inFlight = 0,
  maximum = 0,
  lateRequests = 0;
before(async () => {
  const client = await readFile(new URL("../../client/optionlab.js", import.meta.url), "utf8");
  const html =
    '<!doctype html><script src="/client"></script><style>body{margin:0}.hero{padding:16px}</style><main class="hero"><h1></h1></main><script>document.title=document.querySelector("h1").textContent=optionlab.choice("hero")</script>';
  server = createServer((request, response) => {
    if (request.url === "/client") {
      response.writeHead(200, { "Content-Type": "text/javascript" });
      response.end(client);
      return;
    }
    if (request.url === "/late") lateRequests++;
    const number = lateRequests;
    inFlight++;
    maximum = Math.max(maximum, inFlight);
    let closed = false;
    const finish = () => {
      if (!closed) {
        inFlight--;
        closed = true;
      }
    };
    response.once("finish", finish);
    response.once("close", finish);
    const timer = setTimeout(
      () => {
        response.writeHead(200, { "Content-Type": "text/html" });
        response.end(
          request.url === "/late" && number === 3 ? "<!doctype html><h1>No client here</h1>" : html,
        );
      },
      request.url === "/late" && number === 2 ? 5000 : 100,
    );
    response.once("close", () => clearTimeout(timer));
  });
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  origin = `http://127.0.0.1:${server.address().port}`;
  directory = await mkdtemp(join(tmpdir(), "optionlab-frames-"));
  browser = await launchBrowser();
});
after(async () => {
  await browser?.close();
  if (server) await new Promise((done) => server.close(done));
  if (directory) await rm(directory, { recursive: true, force: true });
});
async function openLab(endpoint, count) {
  const path = join(directory, `${endpoint}.json`);
  await writeFile(
    path,
    JSON.stringify({
      title: `Frames ${endpoint}`,
      round: 1,
      base: origin,
      devices: { laptop: [400, 260] },
      decisions: [
        {
          id: "hero",
          title: "Hero",
          question: "Which?",
          views: Array.from({ length: count }, (_, i) => ({
            caption: `View ${i + 1}`,
            url: endpoint === "queue" ? `/${endpoint}?view=${i}` : `/${endpoint}`,
            focus: ".hero",
          })),
          options: [
            { id: "a", name: "A" },
            { id: "b", name: "B" },
          ],
        },
      ],
    }),
  );
  const result = await build(path, { output: join(directory, `${endpoint}.html`) });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1200 } });
  await page.addInitScript(() => {
    window.readyTitles = new Map();
    addEventListener("message", (event) => {
      const frame = [...document.querySelectorAll("iframe")].find(
        (entry) => entry.contentWindow === event.source,
      );
      if (frame && event.data?.ol === 1 && event.data.type === "ready")
        window.readyTitles.set(frame, event.data.title);
    });
  });
  await page.goto(`${pathToFileURL(result.output).href}#/d/hero/now`);
  await ready(page, count);
  return page;
}
async function ready(page, count) {
  await page.waitForFunction((n) => {
    const cards = [...document.querySelectorAll(".frame-card")];
    return (
      cards.length === n &&
      cards.every(
        (card) =>
          card.getAttribute("aria-busy") === "false" &&
          card.querySelector(".frame-status").hidden &&
          card.querySelectorAll("iframe").length === 1,
      )
    );
  }, count);
}
test("lazy frames load two at a time, survive supersession, and reject foreign messages", async () => {
  maximum = 0;
  const page = await openLab("queue", 4);
  assert.equal(maximum, 2);
  for (const id of ["a", "b", "a"]) {
    await page.locator(`[data-action=option][data-option=${id}]`).click();
    await page.locator(`#tab-${id}[aria-selected=true]`).waitFor();
  }
  await ready(page, 4);
  const values = await page.evaluate(() =>
    [...document.querySelectorAll("iframe")].map((frame) => window.readyTitles.get(frame)),
  );
  assert.deepEqual(values, ["a", "a", "a", "a"]);
  await page.evaluate(() => window.postMessage({ ol: 1, type: "error", message: "Not an owned frame" }, "*"));
  await page.evaluate(() => new Promise(requestAnimationFrame));
  assert.equal(await page.locator(".frame-error").count(), 0);
  await page.goto(page.url().split("#")[0] + "#/start");
  assert.equal(await page.locator("iframe").count(), 0);
  await page.close();
});
test("old frames survive until the 3s swap; disconnected pages get the 8s recovery card", async () => {
  lateRequests = 0;
  const page = await openLab("late", 1);
  const old = await page.locator("iframe").elementHandle();
  const started = Date.now();
  await page.locator("[data-action=option][data-option=a]").click();
  await page.waitForFunction(() => document.querySelectorAll("iframe").length === 2);
  assert.equal(await old.evaluate((frame) => frame.isConnected && frame.style.opacity === "1"), true);
  await page.waitForFunction(() => document.querySelectorAll("iframe").length === 1);
  const swapped = Date.now() - started;
  assert.ok(swapped >= 2900 && swapped < 4500, `Swap happened at ${swapped}ms`);
  await ready(page, 1);
  assert.equal(await page.evaluate(() => window.readyTitles.get(document.querySelector("iframe"))), "a");
  const disconnected = Date.now();
  await page.locator("[data-action=option][data-option=b]").click();
  await page.locator(".frame-error").waitFor();
  const failed = Date.now() - disconnected;
  assert.ok(failed >= 7900 && failed < 10000, `Failure appeared at ${failed}ms`);
  assert.match(await page.locator(".frame-status").textContent(), /This page has not connected/);
  assert.equal(await page.locator(".frame-status li").count(), 3);
  assert.equal(await page.getByRole("button", { name: "Try again" }).count(), 1);
  await page.close();
});
