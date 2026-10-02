// @ts-check
import { constants } from "node:fs";
import { copyFile, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";

/** Installs the portable agent skill without replacing an existing file. @param {string} [directory] */
export async function skill(directory = ".github/skills/prismal") {
  const root = resolve(directory);
  const target = join(root, "SKILL.md");
  await mkdir(root, { recursive: true });
  try {
    await copyFile(new URL("../skill/SKILL.md", import.meta.url), target, constants.COPYFILE_EXCL);
  } catch (error) {
    if (error.code === "EEXIST") throw new Error(`Skill already exists: ${target}`);
    throw error;
  }
  return target;
}
