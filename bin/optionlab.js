#!/usr/bin/env node
// @ts-check
import { parseArgs } from "node:util";
import { spawn } from "node:child_process";
import { watch } from "node:fs";
import { dirname, resolve } from "node:path";
import { build } from "../lib/build.js";

const help = `optionlab - live design options, one choices file

  optionlab build [manifest] [-o file] [--watch] [--open]
  optionlab check [manifest] [--shots dir]
  optionlab --help
  optionlab --version`;
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
  const [command, manifestPath] = positionals;
  if (!["build", "check"].includes(command))
    throw new Error(`Unknown command "${command}". Run optionlab --help.`);
  if (positionals.length > 2) throw new Error("Too many arguments.");
  const allowed = command === "build" ? ["output", "watch", "open"] : ["shots"];
  for (const flag of Object.keys(values)) {
    if (!["help", "version", ...allowed].includes(flag))
      throw new Error(`--${flag} is not available for ${command}.`);
  }
  if (command === "check") {
    const { check } = await import("../lib/check.js");
    const result = await check(manifestPath, { shots: values.shots });
    process.exitCode = result.failures ? 1 : 0;
    return;
  }
  async function rebuild() {
    const result = await build(manifestPath, { output: values.output });
    const { decisions, options, frames, bytes } = result.stats;
    const mark = process.stdout.isTTY ? "\u001b[32m\u2713\u001b[0m " : "";
    console.log(
      `${mark}${decisions} decisions, ${options} options, ${frames} frames -> ${result.output} (${Math.ceil(bytes / 1024)} KB)`,
    );
    return result;
  }
  const result = await rebuild();
  if (values.open) {
    const [program, args] =
      process.platform === "darwin"
        ? ["open", [result.output]]
        : process.platform === "win32"
          ? ["explorer.exe", [result.output]]
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
    let watchers = [];
    let timer;
    let working = false;
    let again = false;
    let stopped = false;
    const attach = (dependencies) => {
      if (stopped) return;
      for (const watcher of watchers) watcher.close();
      const files = new Set(dependencies);
      watchers = [...new Set(dependencies.map(dirname))].map((dir) => {
        const watcher = watch(dir, (_event, name) => {
          if (name && !files.has(resolve(dir, String(name)))) return;
          clearTimeout(timer);
          timer = setTimeout(update, 100);
        });
        watcher.on("error", (error) => console.error(`optionlab: watch: ${error.message}`));
        return watcher;
      });
    };
    const update = async () => {
      if (working) {
        again = true;
        return;
      }
      working = true;
      try {
        attach((await rebuild()).dependencies);
      } catch (error) {
        console.error(`optionlab: ${error.message}`);
      } finally {
        working = false;
        if (again && !stopped) {
          again = false;
          await update();
        }
      }
    };
    attach(result.dependencies);
    const close = () => {
      stopped = true;
      clearTimeout(timer);
      for (const watcher of watchers) watcher.close();
    };
    process.once("SIGINT", close);
    process.once("SIGTERM", close);
  }
}
main().catch((error) => {
  console.error(`optionlab: ${error.message}`);
  process.exitCode = 1;
});
