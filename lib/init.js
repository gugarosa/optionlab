// @ts-check
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

/** Creates a starter round without replacing an existing manifest. @param {string} [directory] */
export async function init(directory = "prismal") {
  const root = resolve(directory);
  const path = join(root, "prismal.json");
  const ignore = join(root, ".gitignore");
  await mkdir(root, { recursive: true });
  let ignored = "";
  try {
    ignored = await readFile(ignore, "utf8");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const manifest = {
    $schema: "https://raw.githubusercontent.com/gugarosa/prismal/main/schema/prismal.schema.json",
    title: "Your app",
    round: 1,
    about: "Explore the header options. Like what is worth keeping and pick the one to carry forward.",
    base: "http://localhost:5173",
    decisions: [
      {
        id: "header",
        title: "The page header",
        question: "What should the header emphasize?",
        views: [
          { caption: "Laptop", device: "laptop", url: "/" },
          { caption: "Phone", device: "phone", url: "/" },
        ],
        options: [
          { id: "now", name: "Current" },
          { id: "a", name: "More context", idea: "Give the header a useful second line." },
          { id: "b", name: "Less chrome", idea: "Let the page title do more of the work." },
        ],
      },
    ],
  };
  try {
    await writeFile(path, JSON.stringify(manifest, null, 2) + "\n", { flag: "wx" });
  } catch (error) {
    if (error.code === "EEXIST") throw new Error(`Manifest already exists: ${path}`);
    throw error;
  }
  if (!ignored.split(/\r?\n/).some((line) => ["lab.html", "/lab.html"].includes(line.trim()))) {
    await appendFile(ignore, `${ignored && !ignored.endsWith("\n") ? "\n" : ""}lab.html\n`);
  }
  return path;
}
