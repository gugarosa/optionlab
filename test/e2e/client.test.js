// @ts-check
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { after, before, test } from "node:test";
import { launchBrowser } from "./browser.js";
import { build } from "../../lib/build.js";

let browser, server, origin;
before(async () => {
  const client = await readFile(new URL("../../client/optionlab.js", import.meta.url), "utf8");
  server = createServer((request, response) => {
    if (request.url.startsWith("/optionlab.js")) {
      response.writeHead(200, { "Content-Type": "text/javascript" });
      response.end(client);
      return;
    }
    response.writeHead(200, { "Content-Type": "text/html" });
    response.end(
      '<!doctype html><html><head><script src="/optionlab.js"></script><script src="/optionlab.js"></script><script>window.first={active:optionlab.active,choice:optionlab.choice("hero"),other:optionlab.choice("other"),state:optionlab.state};document.title="Live choice "+optionlab.choice("hero");</script><style>body{margin:0}header{height:80px}.hero{height:150px}</style></head><body><header>Header</header><main class="hero">A sample page</main><div id="grow"></div></body></html>',
    );
  });
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  origin = `http://127.0.0.1:${server.address().port}`;
  browser = await launchBrowser();
});
after(async () => {
  await browser?.close();
  if (server) await new Promise((done) => server.close(done));
});
test("outside a lab the client only resolves debug choices and is idempotent", async () => {
  const page = await browser.newPage();
  await page.goto(`${origin}/?ol.hero=a&ol.state.menu=open`);
  assert.deepEqual(await page.evaluate(() => window.first), {
    active: false,
    choice: "a",
    other: "now",
    state: { menu: "open" },
  });
  assert.equal(await page.locator("html").getAttribute("data-ol-hero"), "a");
  await page.evaluate(() => {
    window.previous = optionlab;
  });
  await page.addScriptTag({ url: `${origin}/optionlab.js` });
  assert.equal(await page.evaluate(() => optionlab === window.previous), true);
  await page.close();
});
test("live frames resolve name before query and report focus, size and errors", async () => {
  const page = await browser.newPage();
  await page.goto(origin);
  await page.evaluate((url) => {
    window.messages = [];
    const frame = document.createElement("iframe");
    frame.width = "800";
    frame.height = "250";
    frame.name = JSON.stringify({ ol: 1, choices: { hero: "b" }, state: { menu: "from-name" } });
    addEventListener("message", (event) => {
      if (event.source !== frame.contentWindow || event.data?.ol !== 1) return;
      window.messages.push(event.data);
      if (event.data.type === "ready")
        frame.contentWindow.postMessage({ ol: 1, type: "init", focus: ".hero" }, "*");
    });
    frame.src = `${url}/?ol.hero=a&ol.other=c&ol.state.menu=from-query&ol.state.filter=all`;
    document.body.append(frame);
  }, origin);
  await page.waitForFunction(() => window.messages.some((m) => m.type === "rect"));
  const frame = page.frames()[1];
  assert.deepEqual(await frame.evaluate(() => window.first), {
    active: true,
    choice: "b",
    other: "c",
    state: { menu: "from-name", filter: "all" },
  });
  const rect = await page.evaluate(() => window.messages.find((m) => m.type === "rect"));
  assert.equal(rect.top, 80);
  assert.equal(rect.height, 150);
  await frame.evaluate(() => {
    document.getElementById("grow").style.height = "900px";
  });
  await page.waitForFunction(() => window.messages.some((m) => m.type === "size" && m.height === 1130));
  await frame.evaluate(() => {
    console.error("A fictional console error");
    setTimeout(() => {
      throw new Error("A fictional runtime error");
    }, 0);
    Promise.reject(new Error("A fictional rejection"));
  });
  await page.waitForFunction(() => window.messages.filter((m) => m.type === "error").length === 3);
  const errors = await page.evaluate(() =>
    window.messages.filter((m) => m.type === "error").map((m) => m.message),
  );
  assert.ok(errors.some((e) => e.includes("console error")));
  assert.ok(errors.some((e) => e.includes("runtime error")));
  assert.ok(errors.some((e) => e.includes("rejection")));
  await frame.evaluate(() => {
    document.getElementById("grow").style.height = "40000px";
  });
  await page.waitForFunction(() => window.messages.some((m) => m.type === "size" && m.height === 30000));
  await page.close();
});
test("the generated file lab frames a live localhost page without a proxy", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "optionlab-live-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const manifest = join(directory, "optionlab.json");
  await writeFile(
    manifest,
    JSON.stringify({
      title: "Live",
      round: 1,
      base: origin,
      decisions: [
        {
          id: "hero",
          title: "Hero",
          question: "Which?",
          views: [{ caption: "Laptop", url: "/?ol.hero=a", focus: ".hero" }],
          options: [{ id: "b", name: "B" }],
        },
      ],
    }),
  );
  const result = await build(manifest);
  const page = await browser.newPage();
  await page.addInitScript(() => {
    window.readyTitles = [];
    addEventListener("message", (event) => {
      if (
        event.source === document.querySelector("iframe")?.contentWindow &&
        event.data?.ol === 1 &&
        event.data.type === "ready"
      )
        window.readyTitles.push(event.data.title);
    });
  });
  await page.goto(`${pathToFileURL(result.output).href}#/d/hero/b`);
  await page.waitForFunction(() => window.readyTitles.includes("Live choice b"));
  assert.equal(await page.locator(".frame-card").getAttribute("aria-busy"), "false");
  await page.close();
});
