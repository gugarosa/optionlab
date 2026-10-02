// @ts-check
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const ID_PATTERN = /^[a-z0-9-]+$/;
const URL_SCHEME = /^[a-z][a-z0-9+.-]*:/i;
const ROOT_KEYS =
  "$schema title round about base devices defaults decisions questions words elements inspect journeys".split(
    " ",
  );
const DEFAULT_DEVICES = { laptop: [1440, 900], phone: [390, 844] };

/** @typedef {null | boolean | number | string | JsonValue[] | {[key: string]: JsonValue}} JsonValue */
/** @typedef {{caption: string, device: string, url?: string, file?: string, focus?: string, state?: {[key: string]: JsonValue}}} ManifestView */
/** @typedef {{id: string, name: string, kind?: "close" | "different" | "current", idea?: string, why?: string, tradeoff?: string}} ManifestOption */
/** @typedef {{id: string, title: string, question: string, views: ManifestView[], options: ManifestOption[]}} ManifestDecision */
/** @typedef {{label: string, device: string, url?: string, file?: string, state?: {[key: string]: JsonValue}}} ManifestInspect */
/** @typedef {{url?: string, file?: string, state?: {[key: string]: JsonValue}, selector: string, title: string, does?: string, ask?: string, device: string}} ManifestJourneyStep */
/** @typedef {{id: string, title: string, steps: ManifestJourneyStep[]}} ManifestJourney */
/** @typedef {{
 * $schema?: string, title: string, round: number, about?: string, base?: string,
 * devices: {[key: string]: [number, number]}, defaults: {[key: string]: string},
 * decisions: ManifestDecision[], inspect: ManifestInspect[], journeys: ManifestJourney[],
 * questions: {id: string, group?: string, question: string, why?: string, choices: string[]}[],
 * words: {id: string, group?: string, term: string, means: string, where?: string[], alternatives?: string[]}[],
 * elements: {name: string, group?: string, selector: string, what?: string}[],
 * }} Manifest */

/** @param {string} path @param {string} message @returns {never} */
function fail(path, message) {
  throw new Error(`${path}: ${message}`);
}
/** @param {unknown} value @param {string} path */
function record(value, path) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail(path, "expected object");
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) fail(path, "expected plain object");
  return /** @type {Record<string, unknown>} */ (value);
}
/** @param {Record<string, unknown>} value @param {readonly string[]} allowed @param {string} path */
function knownKeys(value, allowed, path) {
  const keys = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!keys.has(key)) fail(path, `unknown key "${key}"`);
  }
}
/** @param {unknown} value @param {string} path @param {boolean} [nonempty] */
function stringValue(value, path, nonempty = false) {
  if (typeof value !== "string" || (nonempty && value.trim() === "")) {
    fail(path, nonempty ? "expected nonempty string" : "expected string");
  }
  return value;
}
/** @param {unknown} value @param {string} path */
function positiveInteger(value, path) {
  if (!Number.isInteger(value) || /** @type {number} */ (value) < 1) {
    fail(path, "expected positive integer");
  }
  return /** @type {number} */ (value);
}
/** @param {unknown} value @param {string} path */
function list(value, path) {
  if (!Array.isArray(value)) fail(path, "expected array");
  return value;
}
/** @param {Record<string, unknown>} value @param {string} name */
function section(value, name) {
  return list(Object.hasOwn(value, name) ? value[name] : [], name);
}
/** @param {unknown} value @param {string} path */
function idValue(value, path) {
  const id = stringValue(value, path, true);
  if (!ID_PATTERN.test(id)) fail(path, "must match /^[a-z0-9-]+$/");
  return id;
}
/** @param {Set<string>} seen @param {string} value @param {string} path @param {string} [label] */
function uniqueValue(seen, value, path, label = "id") {
  if (seen.has(value)) fail(path, `duplicate ${label} "${value}"`);
  seen.add(value);
  return value;
}
/** @param {Record<string, unknown>} source @param {Record<string, unknown>} target @param {string} path @param {string[]} names */
function optionalStrings(source, target, path, names) {
  for (const name of names) {
    if (Object.hasOwn(source, name)) target[name] = stringValue(source[name], `${path}.${name}`);
  }
}
/** @param {unknown} value @param {string} path */
function stringList(value, path) {
  return list(value, path).map((item, index) => stringValue(item, `${path}[${index}]`, true));
}
/** @param {Record<string, unknown>} value @param {string} path @param {Set<string>} devices */
function deviceValue(value, path, devices) {
  const device = Object.hasOwn(value, "device")
    ? stringValue(value.device, `${path}.device`, true)
    : "laptop";
  if (!devices.has(device)) fail(`${path}.device`, `unknown device "${device}"`);
  return device;
}
/** @param {unknown} value @param {string} path @param {Set<unknown>} seen @returns {JsonValue} */
function jsonValue(value, path, seen) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) fail(path, "expected finite JSON number");
    return value;
  }
  if (typeof value !== "object") fail(path, "expected JSON value");
  if (seen.has(value)) fail(path, "must not contain cycles");
  seen.add(value);
  if (Array.isArray(value)) {
    const result = value.map((item, index) => jsonValue(item, `${path}[${index}]`, seen));
    if (result.length !== Object.keys(value).length) fail(path, "must not contain sparse arrays");
    seen.delete(value);
    return result;
  }
  const object = record(value, path);
  if (Object.getOwnPropertySymbols(object).length) fail(path, "expected string keys");
  const result = Object.fromEntries(
    Object.entries(object).map(([key, item]) => [key, jsonValue(item, `${path}.${key}`, seen)]),
  );
  seen.delete(value);
  return result;
}
/** @param {unknown} value @param {string} path */
function stateValue(value, path) {
  record(value, path);
  return /** @type {{[key: string]: JsonValue}} */ (jsonValue(value, path, new Set()));
}
/** @param {string} value @param {string} path */
function absoluteHttp(value, path) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    fail(path, "expected absolute http(s) URL");
  }
  if (!["http:", "https:"].includes(parsed.protocol)) fail(path, "expected absolute http(s) URL");
  return value;
}
/** @param {Record<string, unknown>} value @param {string} path @param {string | undefined} base */
function sourceValue(value, path, base) {
  const hasUrl = Object.hasOwn(value, "url");
  const hasFile = Object.hasOwn(value, "file");
  if (!hasUrl && !hasFile) fail(path, 'needs "url" or "file"');
  if (hasUrl && hasFile) fail(path, 'cannot have both "url" and "file"');
  if (hasFile) {
    const file = stringValue(value.file, `${path}.file`, true);
    const hash = file.indexOf("#");
    if ((hash < 0 ? file : file.slice(0, hash)).trim() === "") {
      fail(`${path}.file`, 'path before "#" must not be empty');
    }
    return { file };
  }

  const url = stringValue(value.url, `${path}.url`, true);
  if (URL_SCHEME.test(url)) {
    absoluteHttp(url, `${path}.url`);
  } else {
    if (!base) fail(`${path}.url`, 'relative URL needs "base"');
    let resolved;
    try {
      resolved = new URL(url, base);
    } catch {
      fail(`${path}.url`, "expected URL path");
    }
    if (!["http:", "https:"].includes(resolved.protocol)) fail(`${path}.url`, "expected http(s) URL");
  }
  return { url };
}
/** @param {unknown} raw @param {string | undefined} base @param {Set<string>} devices @param {string} path */
function normalizeView(raw, base, devices, path) {
  const value = record(raw, path);
  knownKeys(value, ["caption", "device", "url", "file", "focus", "state"], path);
  const device = deviceValue(value, path, devices);
  /** @type {Record<string, unknown>} */
  const result = {
    caption: stringValue(value.caption, `${path}.caption`, true),
    device,
    ...sourceValue(value, path, base),
  };
  if (Object.hasOwn(value, "focus")) result.focus = stringValue(value.focus, `${path}.focus`, true);
  if (Object.hasOwn(value, "state")) result.state = stateValue(value.state, `${path}.state`);
  return /** @type {ManifestView} */ (result);
}
/** @param {unknown} raw @param {string} path */
function normalizeOption(raw, path) {
  const value = record(raw, path);
  knownKeys(value, ["id", "name", "kind", "idea", "why", "tradeoff"], path);
  const id = idValue(value.id, `${path}.id`);
  /** @type {Record<string, unknown>} */
  const result = { id, name: stringValue(value.name, `${path}.name`, true) };
  if (Object.hasOwn(value, "kind")) {
    const kind = stringValue(value.kind, `${path}.kind`);
    if (!["close", "different", "current"].includes(kind)) {
      fail(`${path}.kind`, 'expected "close", "different", or "current"');
    }
    result.kind = kind;
  }
  if (id === "now") {
    if (result.kind !== undefined && result.kind !== "current") {
      fail(`${path}.kind`, '"now" must use kind "current"');
    }
    result.kind = "current";
  } else if (result.kind === "current") {
    fail(`${path}.kind`, 'kind "current" is reserved for "now"');
  } else {
    result.kind ??= "close";
  }
  optionalStrings(value, result, path, ["idea", "why", "tradeoff"]);
  return /** @type {ManifestOption} */ (result);
}
/** @param {unknown} raw @param {number} index @param {string | undefined} base @param {Set<string>} devices */
function normalizeDecision(raw, index, base, devices) {
  const path = `decisions[${index}]`;
  const value = record(raw, path);
  knownKeys(value, ["id", "title", "question", "views", "options"], path);
  const views = list(value.views, `${path}.views`);
  if (views.length === 0) fail(`${path}.views`, "must not be empty");
  const rawOptions = list(value.options, `${path}.options`);
  const optionIds = new Set();
  const options = rawOptions.map((option, optionIndex) => {
    const optionPath = `${path}.options[${optionIndex}]`;
    const normalized = normalizeOption(option, optionPath);
    uniqueValue(optionIds, normalized.id, `${optionPath}.id`);
    return normalized;
  });
  const optionCount = options.filter((option) => option.id !== "now").length;
  if (optionCount < 1 || optionCount > 6) fail(`${path}.options`, "needs 1 to 6 non-now options");
  if (!optionIds.has("now")) options.unshift({ id: "now", name: "Current", kind: "current" });
  else options.sort((a, b) => Number(b.id === "now") - Number(a.id === "now"));
  return {
    id: idValue(value.id, `${path}.id`),
    title: stringValue(value.title, `${path}.title`, true),
    question: stringValue(value.question, `${path}.question`, true),
    views: views.map((view, viewIndex) => normalizeView(view, base, devices, `${path}.views[${viewIndex}]`)),
    options,
  };
}
/** @param {unknown} raw @param {string | undefined} base @param {Set<string>} devices */
function normalizeInspect(raw, base, devices) {
  const labels = new Set();
  return list(raw, "inspect").map((item, index) => {
    const path = `inspect[${index}]`;
    const value = record(item, path);
    knownKeys(value, ["label", "device", "url", "file", "state"], path);
    const label = stringValue(value.label, `${path}.label`, true);
    uniqueValue(labels, label, `${path}.label`, "label");
    const device = deviceValue(value, path, devices);
    /** @type {Record<string, unknown>} */
    const result = { label, device, ...sourceValue(value, path, base) };
    if (Object.hasOwn(value, "state")) result.state = stateValue(value.state, `${path}.state`);
    return /** @type {ManifestInspect} */ (result);
  });
}
/** @param {unknown} raw @param {string | undefined} base @param {Set<string>} devices */
function normalizeJourneys(raw, base, devices) {
  const ids = new Set();
  return list(raw, "journeys").map((item, index) => {
    const path = `journeys[${index}]`;
    const value = record(item, path);
    knownKeys(value, ["id", "title", "steps"], path);
    const id = idValue(value.id, `${path}.id`);
    uniqueValue(ids, id, `${path}.id`);
    const steps = list(value.steps, `${path}.steps`);
    if (steps.length === 0) fail(`${path}.steps`, "must not be empty");
    return {
      id,
      title: stringValue(value.title, `${path}.title`, true),
      steps: steps.map((step, stepIndex) => {
        const stepPath = `${path}.steps[${stepIndex}]`;
        const stepValue = record(step, stepPath);
        knownKeys(
          stepValue,
          ["url", "file", "state", "selector", "title", "does", "ask", "device"],
          stepPath,
        );
        const device = deviceValue(stepValue, stepPath, devices);
        /** @type {Record<string, unknown>} */
        const result = {
          ...sourceValue(stepValue, stepPath, base),
          selector: stringValue(stepValue.selector, `${stepPath}.selector`, true),
          title: stringValue(stepValue.title, `${stepPath}.title`, true),
          device,
        };
        optionalStrings(stepValue, result, stepPath, ["does", "ask"]);
        if (Object.hasOwn(stepValue, "state")) {
          result.state = stateValue(stepValue.state, `${stepPath}.state`);
        }
        return /** @type {ManifestJourneyStep} */ (result);
      }),
    };
  });
}

/** Strictly validates and normalizes an optionlab manifest. @param {unknown} raw @returns {Manifest} */
export function normalizeManifest(raw) {
  const value = record(raw, "manifest");
  knownKeys(value, ROOT_KEYS, "manifest");
  const base = Object.hasOwn(value, "base")
    ? absoluteHttp(stringValue(value.base, "base", true), "base")
    : undefined;

  const rawDevices = Object.hasOwn(value, "devices") ? record(value.devices, "devices") : {};
  const deviceEntries = Object.entries(DEFAULT_DEVICES);
  for (const [name, dimensions] of Object.entries(rawDevices)) {
    if (name.trim() === "") fail("devices", "device names must be nonempty");
    if (
      !Array.isArray(dimensions) ||
      dimensions.length !== 2 ||
      dimensions.some((size) => !Number.isInteger(size) || size < 1)
    ) {
      fail(`devices.${name}`, "expected [positive width, positive height]");
    }
    deviceEntries.push([name, /** @type {[number, number]} */ ([dimensions[0], dimensions[1]])]);
  }
  const devices = /** @type {{[key: string]: [number, number]}} */ (Object.fromEntries(deviceEntries));
  const deviceNames = new Set(Object.keys(devices));

  const rawDefaults = Object.hasOwn(value, "defaults") ? record(value.defaults, "defaults") : {};
  const defaults = Object.fromEntries(
    Object.entries(rawDefaults).map(([id, option]) => [
      idValue(id, `defaults.${id}`),
      idValue(option, `defaults.${id}`),
    ]),
  );

  const decisions = list(value.decisions, "decisions");
  const decisionIds = new Set();
  const normalizedDecisions = decisions.map((decision, index) => {
    const normalized = normalizeDecision(decision, index, base, deviceNames);
    uniqueValue(decisionIds, normalized.id, `decisions[${index}].id`);
    return normalized;
  });
  const inspect = normalizeInspect(section(value, "inspect"), base, deviceNames);
  const inspectLabels = new Set(inspect.map((route) => route.label));

  const questionIds = new Set();
  const questions = section(value, "questions").map((item, index) => {
    const path = `questions[${index}]`;
    const question = record(item, path);
    knownKeys(question, ["id", "group", "question", "why", "choices"], path);
    const id = uniqueValue(questionIds, idValue(question.id, `${path}.id`), `${path}.id`);
    const choices = stringList(question.choices, `${path}.choices`);
    if (choices.length === 0) fail(`${path}.choices`, "must not be empty");
    /** @type {Record<string, unknown>} */
    const result = {
      id,
      question: stringValue(question.question, `${path}.question`, true),
      choices,
    };
    optionalStrings(question, result, path, ["group", "why"]);
    return /** @type {Manifest["questions"][number]} */ (result);
  });

  const wordIds = new Set();
  const words = section(value, "words").map((item, index) => {
    const path = `words[${index}]`;
    const word = record(item, path);
    knownKeys(word, ["id", "group", "term", "means", "where", "alternatives"], path);
    const id = uniqueValue(wordIds, idValue(word.id, `${path}.id`), `${path}.id`);
    /** @type {Record<string, unknown>} */
    const result = {
      id,
      term: stringValue(word.term, `${path}.term`, true),
      means: stringValue(word.means, `${path}.means`, true),
    };
    optionalStrings(word, result, path, ["group"]);
    if (Object.hasOwn(word, "where")) {
      result.where = list(word.where, `${path}.where`).map((label, labelIndex) => {
        const normalized = stringValue(label, `${path}.where[${labelIndex}]`, true);
        if (!inspectLabels.has(normalized)) {
          fail(`${path}.where[${labelIndex}]`, `unknown inspect label "${normalized}"`);
        }
        return normalized;
      });
    }
    if (Object.hasOwn(word, "alternatives")) {
      result.alternatives = stringList(word.alternatives, `${path}.alternatives`);
    }
    return /** @type {Manifest["words"][number]} */ (result);
  });

  const elementNames = new Set();
  const elements = section(value, "elements").map((item, index) => {
    const path = `elements[${index}]`;
    const element = record(item, path);
    knownKeys(element, ["name", "group", "selector", "what"], path);
    const name = stringValue(element.name, `${path}.name`, true);
    uniqueValue(elementNames, name, `${path}.name`, "name");
    /** @type {Record<string, unknown>} */
    const result = {
      name,
      selector: stringValue(element.selector, `${path}.selector`, true),
    };
    optionalStrings(element, result, path, ["group", "what"]);
    return /** @type {Manifest["elements"][number]} */ (result);
  });

  /** @type {Record<string, unknown>} */
  const result = {
    title: stringValue(value.title, "title", true),
    round: positiveInteger(value.round, "round"),
    devices,
    defaults,
    decisions: normalizedDecisions,
    questions,
    words,
    elements,
    inspect,
    journeys: normalizeJourneys(section(value, "journeys"), base, deviceNames),
  };
  if (Object.hasOwn(value, "$schema")) result.$schema = stringValue(value.$schema, "$schema");
  if (Object.hasOwn(value, "about")) result.about = stringValue(value.about, "about");
  if (base) result.base = base;
  return /** @type {Manifest} */ (result);
}

/** Loads and validates a manifest, using the standard lookup locations when omitted. @param {string} [inputPath] */
export async function loadManifest(inputPath) {
  const paths =
    inputPath === undefined
      ? [resolve("optionlab/optionlab.json"), resolve("optionlab.json")]
      : [resolve(inputPath)];
  /** @type {string | undefined} */
  let path;
  /** @type {string | undefined} */
  let source;
  for (const candidate of paths) {
    try {
      source = await readFile(candidate, "utf8");
      path = candidate;
      break;
    } catch (error) {
      if (
        inputPath === undefined &&
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        continue;
      }
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`Could not read manifest ${candidate}: ${detail}`, { cause: error });
    }
  }
  if (path === undefined || source === undefined) {
    throw new Error(`Manifest not found. Looked for ${paths.join(" and ")}`);
  }
  let raw;
  try {
    raw = JSON.parse(source);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid JSON in manifest ${path}: ${detail}`, { cause: error });
  }
  try {
    return { manifest: normalizeManifest(raw), path };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid manifest ${path}: ${detail}`, { cause: error });
  }
}
