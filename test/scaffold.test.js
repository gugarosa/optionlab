// @ts-check
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("package has no runtime dependencies and supports Node 20", async () => {
  const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(pkg.dependencies, undefined);
  assert.equal(pkg.engines.node, ">=20");
  assert.equal(pkg.peerDependenciesMeta.playwright.optional, true);
});
