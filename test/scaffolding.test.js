// @ts-check
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";
import { init } from "../lib/init.js";
import { skill } from "../lib/skill.js";
import { loadManifest } from "../lib/manifest.js";

const exec = promisify(execFile);
const cli = fileURLToPath(new URL("../bin/optionlab.js", import.meta.url));
async function workspace(t) {
  const root = await mkdtemp(join(tmpdir(), "optionlab-scaffold-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}
test("init preserves existing files and creates a valid editable round", async (t) => {
  const root = await workspace(t);
  await writeFile(join(root, ".gitignore"), "keep-this");
  const path = await init(root);
  const { manifest } = await loadManifest(path);
  assert.equal(manifest.decisions.length, 1);
  assert.deepEqual(
    manifest.decisions[0].options.map((option) => option.id),
    ["now", "a", "b"],
  );
  assert.deepEqual(
    manifest.decisions[0].views.map((view) => view.device),
    ["laptop", "phone"],
  );
  assert.equal(await readFile(join(root, ".gitignore"), "utf8"), "keep-this\nlab.html\n");
  const before = await readFile(path, "utf8");
  await assert.rejects(init(root), /Manifest already exists/);
  assert.equal(await readFile(path, "utf8"), before);
  assert.equal(await readFile(join(root, ".gitignore"), "utf8"), "keep-this\nlab.html\n");
});
test("CLI installs the exact skill in default and custom directories without overwriting", async (t) => {
  const root = await workspace(t);
  await exec(process.execPath, [cli, "init"], { cwd: root });
  assert.equal((await loadManifest(join(root, "optionlab/optionlab.json"))).manifest.round, 1);
  await exec(process.execPath, [cli, "skill"], { cwd: root });
  const original = await readFile(new URL("../skill/SKILL.md", import.meta.url), "utf8");
  assert.equal(await readFile(join(root, ".github/skills/optionlab/SKILL.md"), "utf8"), original);
  const custom = await skill(join(root, ".claude/skills/optionlab"));
  assert.equal(await readFile(custom, "utf8"), original);
  await assert.rejects(skill(join(root, ".claude/skills/optionlab")), /Skill already exists/);
});
test(
  "open passes a single literal output path to the native opener",
  { skip: process.platform === "win32" },
  async (t) => {
    const root = await workspace(t);
    const bin = join(root, "bin");
    await mkdir(bin);
    const recorder = join(root, "opened.json");
    const opener = process.platform === "darwin" ? "open" : "xdg-open";
    await writeFile(
      join(bin, opener),
      '#!/usr/bin/env node\nrequire("node:fs").writeFileSync(process.env.OPEN_RECORD,JSON.stringify(process.argv.slice(2)));\n',
      { mode: 0o755 },
    );
    const manifest = await init(join(root, "round"));
    const output = join(root, "folder & space", "lab.html");
    await exec(process.execPath, [cli, "build", manifest, "-o", output, "--open"], {
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, OPEN_RECORD: recorder },
    });
    assert.deepEqual(JSON.parse(await readFile(recorder, "utf8")), [output]);
  },
);
