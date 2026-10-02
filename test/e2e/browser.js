// @ts-check
import { chromium, firefox, webkit } from "playwright";

export function launchBrowser() {
  const engine = { chromium, firefox, webkit }[process.env.OPTIONLAB_BROWSER || "chromium"];
  if (!engine) throw new Error("Unknown OPTIONLAB_BROWSER");
  return engine.launch({
    ...(process.env.OPTIONLAB_CHANNEL ? { channel: process.env.OPTIONLAB_CHANNEL } : {}),
    ...(process.env.OPTIONLAB_EXECUTABLE ? { executablePath: process.env.OPTIONLAB_EXECUTABLE } : {}),
  });
}

/** Stable Chromium channels report unscaled frame locator boxes; use the real viewport transform. */
export async function clickPreview(page, iframe, selector) {
  const target = iframe.contentFrame().locator(selector).first();
  await target.scrollIntoViewIfNeeded();
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
  await target.evaluate(
    () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
  );
  const rect = await target.evaluate((element) => {
    const box = element.getBoundingClientRect();
    return { x: box.x, y: box.y, width: box.width, height: box.height, viewport: innerWidth };
  });
  const box = await iframe.boundingBox();
  const scale = box.width / rect.viewport;
  await page.mouse.click(
    box.x + (rect.x + rect.width / 2) * scale,
    box.y + (rect.y + rect.height / 2) * scale,
  );
}
