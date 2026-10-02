// @ts-check
import assert from "node:assert/strict";
import test from "node:test";

test("browser tests use the optional Playwright peer", async () => {
  const { chromium } = await import("playwright");
  assert.equal(chromium.name(), "chromium");
});
