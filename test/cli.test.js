// @ts-check
import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";

const cli = fileURLToPath(new URL("../bin/prismal.js", import.meta.url));
const exec = promisify(execFile);
const run = (args, cwd) => exec(process.execPath, [cli, ...args], { cwd, timeout: 15000 });
async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), "prismal cli "));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await writeFile(join(dir, "page.html"), "<!doctype html><h1>Alpha</h1>");
  await writeFile(
    join(dir, "prismal.json"),
    JSON.stringify({
      title: "CLI",
      round: 1,
      decisions: [
        {
          id: "page",
          title: "Page",
          question: "Which?",
          views: [{ caption: "Laptop", file: "page.html" }],
          options: [{ id: "a", name: "A" }],
        },
      ],
    }),
  );
  return dir;
}
test("CLI parses commands and flags, builds paths with spaces, and fails explicitly", async (t) => {
  const dir = await fixture(t);
  assert.equal((await run(["--version"], dir)).stdout.trim(), "0.1.0");
  assert.match((await run(["--help"], dir)).stdout, /prismal check/);
  assert.match(
    (await run(["build", "-o", "a folder/review.html"], dir)).stdout,
    /1 decisions, 2 options, 2 frames/,
  );
  assert.match(await readFile(join(dir, "a folder/review.html"), "utf8"), /Alpha/);
  for (const [args, error] of [
    [["mystery"], /Unknown command/],
    [["build", "--shots", "shots"], /--shots is not available for build/],
    [["check", "--watch"], /--watch is not available for check/],
    [["build", "one.json", "two.json"], /Too many arguments/],
    [["build", "--missing"], /Unknown option/],
    [["build", "missing.json"], /Could not read manifest/],
  ]) {
    await assert.rejects(
      run(args, dir),
      (failure) => failure.code === 1 && /^prismal: /.test(failure.stderr) && error.test(failure.stderr),
    );
  }
});
test("watch follows source edits and atomic replacement without watching its own output", async (t) => {
  const dir = await fixture(t);
  const child = spawn(process.execPath, [cli, "build", "--watch"], {
    cwd: dir,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "",
    errors = "";
  child.stdout.on("data", (chunk) => {
    output += chunk;
  });
  child.stderr.on("data", (chunk) => {
    errors += chunk;
  });
  t.after(() => {
    if (child.exitCode === null) child.kill("SIGTERM");
  });
  async function until(count) {
    if (output.split("\n").length - 1 >= count) return;
    await new Promise((done, fail) => {
      const timer = setTimeout(() => {
        child.stdout.off("data", changed);
        fail(new Error(`watch stalled: ${output} ${errors}`));
      }, 8000);
      const changed = () => {
        if (output.split("\n").length - 1 < count) return;
        clearTimeout(timer);
        child.stdout.off("data", changed);
        done(undefined);
      };
      child.stdout.on("data", changed);
    });
  }
  await until(1);
  await writeFile(join(dir, "replacement.html"), "<!doctype html><h1>Beta</h1>");
  await rename(join(dir, "replacement.html"), join(dir, "page.html"));
  await until(2);
  assert.match(await readFile(join(dir, "lab.html"), "utf8"), /Beta/);
  await writeFile(join(dir, "page.html"), "<!doctype html><h1>Gamma</h1>");
  await until(3);
  assert.match(await readFile(join(dir, "lab.html"), "utf8"), /Gamma/);
  assert.equal(errors, "");
  const exited = new Promise((done) => child.once("exit", done));
  child.kill("SIGTERM");
  await exited;
});
