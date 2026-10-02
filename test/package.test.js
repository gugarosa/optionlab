// @ts-check
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

test("package has no runtime dependencies and supports Node 20", async () => {
  const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(pkg.dependencies, undefined);
  assert.equal(pkg.engines.node, ">=20");
  assert.equal(pkg.peerDependenciesMeta.playwright.optional, true);
});
test("dependency locks use public, integrity-checked package sources", async () => {
  const lock = JSON.parse(await readFile(new URL("../package-lock.json", import.meta.url), "utf8"));
  for (const [path, entry] of Object.entries(lock.packages)) {
    if (!path) continue;
    const source = new URL(entry.resolved);
    assert.equal(source.origin, "https://registry.npmjs.org", path);
    assert.equal(source.username + source.password + source.search + source.hash, "", path);
    assert.match(entry.integrity, /^sha(?:1|256|384|512)-[a-zA-Z0-9+/]+={0,2}$/, path);
  }
});
test("a packed install builds without dependencies and resolves optional checkers from the host project", async (t) => {
  const exec = promisify(execFile);
  const root = await mkdtemp(join(tmpdir(), "optionlab-installed-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const project = join(root, "app");
  await mkdir(project);
  const repository = fileURLToPath(new URL("..", import.meta.url));
  const packed = await exec("npm", ["pack", "--json", "--pack-destination", root], { cwd: repository });
  const archive = join(root, JSON.parse(packed.stdout)[0].filename);
  await writeFile(join(project, "package.json"), '{"name":"fictional-app","private":true}');
  await exec(
    "npm",
    [
      "install",
      archive,
      "--offline",
      "--ignore-scripts",
      "--omit=dev",
      "--omit=optional",
      "--no-audit",
      "--no-fund",
    ],
    { cwd: project },
  );
  const cli = join(project, "node_modules/optionlab/bin/optionlab.js");
  const run = (args) => exec(process.execPath, [cli, ...args], { cwd: project });
  await run(["init"]);
  await run(["build"]);
  assert.match(await readFile(join(project, "optionlab/lab.html"), "utf8"), /optionlab-data/);
  await run(["skill"]);
  assert.match(
    await readFile(join(project, ".github/skills/optionlab/SKILL.md"), "utf8"),
    /You propose. The user decides/,
  );
  await assert.rejects(
    run(["check"]),
    (error) =>
      error.code === 1 &&
      error.stderr.includes("check needs Playwright: npm i -D playwright && npx playwright install chromium"),
  );
  for (const [name, sentinel] of [
    ["playwright-core", "host core"],
    ["playwright", "host playwright"],
  ]) {
    const dependency = join(project, "node_modules", name);
    await mkdir(dependency);
    await writeFile(join(dependency, "package.json"), JSON.stringify({ name, main: "index.js" }));
    await writeFile(
      join(dependency, "index.js"),
      `exports.chromium={launch:async(options)=>{if(${JSON.stringify(name)}==="playwright-core"&&options?.channel!=="chrome")throw new Error("missing chrome channel");throw new Error(${JSON.stringify(sentinel)});}};`,
    );
    await assert.rejects(
      run(["check"]),
      (error) => error.code === 1 && error.stderr.includes(`could not launch Chromium: ${sentinel}`),
    );
  }
  await writeFile(
    join(project, "node_modules/playwright/index.js"),
    'throw new Error("broken host checker");',
  );
  await assert.rejects(
    run(["check"]),
    (error) => error.code === 1 && error.stderr.includes("broken host checker"),
  );
});
test("the package contains only intended files, including every required build input", async () => {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const { stdout } = await promisify(execFile)("npm", ["pack", "--dry-run", "--json"], { cwd: root });
  const files = JSON.parse(stdout)[0].files.map((file) => file.path);
  const allowed = new Set([
    "bin",
    "lib",
    "shell",
    "client",
    "schema",
    "skill",
    "README.md",
    "LICENSE",
    "package.json",
  ]);
  assert.ok(files.every((file) => allowed.has(file.split("/")[0])));
  for (const file of [
    "bin/optionlab.js",
    "shell/lab.html",
    "shell/lab.css",
    "client/optionlab.js",
    "skill/SKILL.md",
    "schema/optionlab.schema.json",
    "schema/choices.schema.json",
  ])
    assert.ok(files.includes(file), file);
  assert.ok((await readFile(new URL("../README.md", import.meta.url), "utf8")).split("\n").length <= 200);
  const skill = await readFile(new URL("../skill/SKILL.md", import.meta.url), "utf8");
  assert.ok(skill.split("\n").length <= 120);
  assert.ok(skill.match(/^description: (.*)$/m)[1].length <= 1024);
});
