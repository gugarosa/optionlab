#!/usr/bin/env node
// @ts-check
import { parseArgs } from "node:util";
import { spawn } from "node:child_process";
import { watch } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "../lib/build.js";
import { init } from "../lib/init.js";
import { skill } from "../lib/skill.js";

const help = `prismal - live design options, one choices file

  prismal init [dir]
  prismal build [manifest] [-o file] [--watch] [--open]
  prismal check [manifest] [--shots dir]
  prismal skill [dir]
  prismal --help
  prismal --version`;
async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      help: { type: "boolean", short: "h" },
      version: { type: "boolean" },
      output: { type: "string", short: "o" },
      watch: { type: "boolean" },
      open: { type: "boolean" },
      shots: { type: "string" },
    },
  });
  if (values.version) {
    console.log("0.1.0");
    return;
  }
  if (values.help || !positionals.length) {
    console.log(help);
    return;
  }
  const [command, input] = positionals;
  if (!["init", "build", "check", "skill"].includes(command))
    throw new Error(`Unknown command "${command}". Run prismal --help.`);
  if (positionals.length > 2) throw new Error("Too many arguments.");
  const allowed = { build: ["output", "watch", "open"], check: ["shots"], init: [], skill: [] }[command];
  for (const flag of Object.keys(values)) {
    if (!["help", "version", ...allowed].includes(flag))
      throw new Error(`--${flag} is not available for ${command}.`);
  }
  if (command === "init") {
    console.log(
      `Created ${await init(input)}\nCopy prismal/client into your app's public directory and include <script src="/prismal.js"></script> before app scripts, in development only.\nImplement the starter variants, then build and check the round.`,
    );
    return;
  }
  if (command === "skill") {
    console.log(`Installed ${await skill(input)}`);
    return;
  }
  if (command === "check") {
    const { check } = await import("../lib/check.js");
    const result = await check(input, { shots: values.shots });
    process.exitCode = result.failures ? 1 : 0;
    return;
  }
  /** @param {Awaited<ReturnType<typeof build>>} result */
  function reportBuild(result) {
    const { decisions, options, frames, bytes } = result.stats;
    const mark = process.stdout.isTTY ? "\u001b[32m\u2713\u001b[0m " : "";
    console.log(
      `${mark}${decisions} decisions, ${options} options, ${frames} frames -> ${result.output} (${Math.ceil(bytes / 1024)} KB)`,
    );
  }
  const result = await build(input, { output: values.output });
  if (!values.watch) reportBuild(result);
  if (values.open) {
    const [program, args] =
      process.platform === "darwin"
        ? ["open", [result.output]]
        : process.platform === "win32"
          ? ["rundll32.exe", ["url.dll,FileProtocolHandler", pathToFileURL(result.output).href]]
          : ["xdg-open", [result.output]];
    await new Promise((done, fail) => {
      const child = spawn(program, args, { stdio: "ignore" });
      child.once("error", fail);
      child.once("exit", (code) =>
        code === 0 ? done(undefined) : fail(new Error(`${program} exited with ${code}.`)),
      );
    });
  }
  if (values.watch) {
    /** @type {Map<string, import("node:fs").FSWatcher>} */
    const watchers = new Map();
    let files = new Set(result.dependencies);
    let timer;
    let working = false;
    let again = false;
    let stopped = false;
    /** @param {string[]} dependencies */
    const attach = (dependencies) => {
      if (stopped) return;
      files = new Set(dependencies);
      const directories = new Set(dependencies.map(dirname));
      for (const dir of directories) {
        if (watchers.has(dir)) continue;
        const watcher = watch(dir, (_event, name) => {
          if (name && !files.has(resolve(dir, String(name)))) return;
          clearTimeout(timer);
          timer = setTimeout(update, 100);
        });
        watcher.on("error", (error) => console.error(`prismal: watch: ${error.message}`));
        watchers.set(dir, watcher);
      }
      for (const [dir, watcher] of watchers) {
        if (directories.has(dir)) continue;
        watcher.close();
        watchers.delete(dir);
      }
    };
    const update = async () => {
      if (stopped) return;
      if (working) {
        again = true;
        return;
      }
      working = true;
      try {
        const rebuilt = await build(input, { output: values.output });
        attach(rebuilt.dependencies);
        if (!stopped) reportBuild(rebuilt);
      } catch (error) {
        console.error(`prismal: ${error.message}`);
      } finally {
        working = false;
        if (again && !stopped) {
          again = false;
          await update();
        }
      }
    };
    attach(result.dependencies);
    reportBuild(result);
    const close = () => {
      stopped = true;
      clearTimeout(timer);
      for (const watcher of watchers.values()) watcher.close();
    };
    process.once("SIGINT", close);
    process.once("SIGTERM", close);
  }
}
main().catch((error) => {
  console.error(`prismal: ${error.message}`);
  process.exitCode = 1;
});
