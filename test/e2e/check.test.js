// @ts-check
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { promisify } from "node:util";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { check } from "../../lib/check.js";

const repository = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const fixtures = join(repository, "test/fixtures");

test("the Lumen example passes every source and generated-lab check", async () => {
  const lines = [];
  const report = await check(join(repository, "examples/lumen/optionlab.json"), {
    log: (line) => lines.push(line),
  });

  assert.deepEqual(report, { failures: 0, warnings: 0, frames: 32, problems: [] });
  assert.deepEqual(lines, ["Checked 32 frames: 0 failures, 0 warnings."]);
});

test("broken sources report independent browser failures and continue", async (t) => {
  const root = join(fixtures, "check-broken");
  t.after(() => rm(join(root, "lab.html"), { force: true }));
  const lines = [];
  const report = await check(join(root, "optionlab.json"), { log: (line) => lines.push(line) });
  const text = report.problems.map((problem) => `${problem.context}: ${problem.message}`).join("\n");

  assert.equal(report.frames, 14);
  assert.ok(report.failures > 8);
  assert.equal(report.warnings, 1);
  assert.match(text, /broken\/a\/Same as Now: Option screenshot is byte-identical to Now/);
  assert.match(text, /broken\/now\/Missing focus: Focus selector ".missing-focus" is missing/);
  assert.match(text, /journey\/missing-action\/1: Journey selector ".missing-journey" is missing/);
  assert.match(text, /fixture console error/);
  assert.match(text, /fixture page error/);
  assert.match(text, /broken\/now\/No ready: Page did not connect within 8 seconds/);
  assert.match(text, /Horizontal overflow is \d+px/);
  assert.match(text, /Rendered body is empty/);
  assert.match(text, /element\/Absent control: No inspect route matches its selector/);
  assert.equal(lines.length, report.problems.length + 1);
  assert.equal(
    (await readdir(root)).some((name) => name.startsWith(".optionlab-check-")),
    false,
  );
});

test("shots use stable decision-option-view filenames", async (t) => {
  const root = join(fixtures, "check-shots");
  const shots = await mkdtemp(join(repository, ".optionlab-shots-"));
  t.after(() => rm(shots, { recursive: true, force: true }));
  t.after(() => rm(join(root, "lab.html"), { force: true }));

  const report = await check(join(root, "optionlab.json"), { shots, log: () => {} });
  assert.equal(report.failures, 0);
  assert.deepEqual((await readdir(shots)).sort(), [
    "color-a-1.png",
    "color-a-2.png",
    "color-now-1.png",
    "color-now-2.png",
  ]);
  for (const name of await readdir(shots)) {
    assert.deepEqual(
      [...new Uint8Array((await readFile(join(shots, name))).subarray(0, 8))],
      [137, 80, 78, 71, 13, 10, 26, 10],
    );
  }
});
test("the CLI exits 1 for a broken option rather than reporting success", async (t) => {
  const root = await mkdtemp(join(repository, ".optionlab-cli-check-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, "page.html"), "<!doctype html><h1>Exactly the same</h1>");
  await writeFile(
    join(root, "optionlab.json"),
    JSON.stringify({
      title: "Same",
      round: 1,
      decisions: [
        {
          id: "same",
          title: "Same",
          question: "Different?",
          views: [{ caption: "Laptop", file: "page.html" }],
          options: [{ id: "a", name: "A" }],
        },
      ],
    }),
  );
  await assert.rejects(
    promisify(execFile)(process.execPath, [join(repository, "bin/optionlab.js"), "check"], { cwd: root }),
    (error) => error.code === 1 && /byte-identical to Now/.test(error.stdout),
  );
});
test("failed HTTP resources and disconnected requests fail the round", async (t) => {
  const root = await mkdtemp(join(repository, ".optionlab-network-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const server = createServer((request, response) => {
    if (request.url === "/disconnected") {
      request.socket.destroy();
      return;
    }
    response.writeHead(404);
    response.end("Missing fictional asset");
  });
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  t.after(() => new Promise((done) => server.close(done)));
  const base = `http://127.0.0.1:${server.address().port}`;
  await writeFile(
    join(root, "page.html"),
    `<!doctype html><style>html[data-ol-page=a]body{background:#ddd}</style><h1>Broken assets</h1><img src="${base}/missing"><img src="${base}/disconnected">`,
  );
  await writeFile(
    join(root, "optionlab.json"),
    JSON.stringify({
      title: "Network",
      round: 1,
      decisions: [
        {
          id: "page",
          title: "Page",
          question: "Loads?",
          views: [{ caption: "Laptop", file: "page.html" }],
          options: [{ id: "a", name: "A" }],
        },
      ],
    }),
  );
  const report = await check(join(root, "optionlab.json"), { log: () => {} });
  const messages = report.problems.map((entry) => entry.message).join("\n");
  assert.ok(report.failures > 0);
  assert.match(messages, /HTTP resource failed: 404/);
  assert.match(messages, /Network request failed:.*disconnected/);
  assert.match(messages, /images failed to load/);
});
