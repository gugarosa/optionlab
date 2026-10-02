// @ts-check
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { normalizeManifest } from "../lib/manifest.js";

const manifestSchema = JSON.parse(
  await readFile(new URL("../schema/prismal.schema.json", import.meta.url), "utf8"),
);
const choicesSchema = JSON.parse(
  await readFile(new URL("../schema/choices.schema.json", import.meta.url), "utf8"),
);

/** @param {unknown} left @param {unknown} right */
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);

/** @param {string} reference @param {Record<string, any>} root */
function dereference(reference, root) {
  return reference
    .slice(2)
    .split("/")
    .reduce((value, part) => value[part.replaceAll("~1", "/").replaceAll("~0", "~")], root);
}

/** @param {unknown} value @param {string} type */
function hasType(value, type) {
  if (type === "null") return value === null;
  if (type === "array") return Array.isArray(value);
  if (type === "object") return value !== null && typeof value === "object" && !Array.isArray(value);
  if (type === "integer") return Number.isInteger(value);
  if (type === "number") return typeof value === "number" && Number.isFinite(value);
  return typeof value === type;
}

/** Small evaluator for the structural keywords used by these schemas. @param {any} schema @param {unknown} value @param {any} root */
function valid(schema, value, root = schema) {
  if (typeof schema === "boolean") return schema;
  if (schema.$ref && !valid(dereference(schema.$ref, root), value, root)) return false;
  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((type) => hasType(value, type))) return false;
  }
  if ("const" in schema && !same(value, schema.const)) return false;
  if (schema.enum && !schema.enum.some((item) => same(value, item))) return false;
  if (typeof value === "string") {
    if (schema.minLength !== undefined && value.length < schema.minLength) return false;
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) return false;
    if (
      schema.format === "date-time" &&
      (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(value) ||
        Number.isNaN(Date.parse(value)))
    ) {
      return false;
    }
  }
  if (typeof value === "number" && schema.minimum !== undefined && value < schema.minimum) return false;
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    const object = /** @type {Record<string, unknown>} */ (value);
    if (schema.required?.some((key) => !Object.hasOwn(object, key))) return false;
    if (
      schema.properties &&
      Object.entries(schema.properties).some(
        ([key, child]) => Object.hasOwn(object, key) && !valid(child, object[key], root),
      )
    ) {
      return false;
    }
    if (schema.propertyNames && Object.keys(object).some((key) => !valid(schema.propertyNames, key, root))) {
      return false;
    }
    if (schema.additionalProperties !== undefined) {
      const known = new Set(Object.keys(schema.properties ?? {}));
      for (const [key, child] of Object.entries(object)) {
        if (known.has(key)) continue;
        if (schema.additionalProperties === false || !valid(schema.additionalProperties, child, root)) {
          return false;
        }
      }
    }
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) return false;
    if (schema.maxItems !== undefined && value.length > schema.maxItems) return false;
    if (
      schema.prefixItems?.some((child, index) => index < value.length && !valid(child, value[index], root))
    ) {
      return false;
    }
    const offset = schema.prefixItems?.length ?? 0;
    if (schema.items === false && value.length > offset) return false;
    if (schema.items && value.slice(offset).some((child) => !valid(schema.items, child, root))) {
      return false;
    }
    if (schema.contains) {
      const count = value.filter((child) => valid(schema.contains, child, root)).length;
      if (count < (schema.minContains ?? 1) || count > (schema.maxContains ?? Infinity)) return false;
    }
  }
  if (schema.not && valid(schema.not, value, root)) return false;
  if (schema.allOf?.some((child) => !valid(child, value, root))) return false;
  if (schema.anyOf && !schema.anyOf.some((child) => valid(child, value, root))) return false;
  if (schema.oneOf && schema.oneOf.filter((child) => valid(child, value, root)).length !== 1) return false;
  if (schema.if) {
    const branch = valid(schema.if, value, root) ? schema.then : schema.else;
    if (branch && !valid(branch, value, root)) return false;
  }
  return true;
}

function manifest() {
  return {
    title: "Review",
    round: 1,
    decisions: [
      {
        id: "navigation",
        title: "Navigation",
        question: "Which version?",
        views: [{ caption: "Home", file: "home.html" }],
        options: [{ id: "quiet", name: "Quiet" }],
      },
    ],
  };
}

test("manifest schema mirrors representative hand-validator constraints", () => {
  const cases = [
    ["minimal", () => {}, true],
    ["review only", (raw) => (raw.decisions = []), true],
    [
      "relative URL with base",
      (raw) => {
        raw.base = "https://example.test/app/";
        raw.decisions[0].views = [{ caption: "Home", url: "../home" }];
      },
      true,
    ],
    ["unknown key", (raw) => (raw.extra = true), false],
    ["missing question", (raw) => delete raw.decisions[0].question, false],
    ["empty views", (raw) => (raw.decisions[0].views = []), false],
    ["missing source", (raw) => (raw.decisions[0].views = [{ caption: "Home" }]), false],
    ["two sources", (raw) => (raw.decisions[0].views[0].url = "https://example.test"), false],
    [
      "relative URL without base",
      (raw) => (raw.decisions[0].views = [{ caption: "Home", url: "/home" }]),
      false,
    ],
    [
      "non-http URL",
      (raw) => (raw.decisions[0].views = [{ caption: "Home", url: "data:text/html,x" }]),
      false,
    ],
    [
      "empty URL",
      (raw) => {
        raw.base = "https://example.test/";
        raw.decisions[0].views = [{ caption: "Home", url: "   " }];
      },
      false,
    ],
    ["reserved current kind", (raw) => (raw.decisions[0].options[0].kind = "current"), false],
    [
      "now with wrong kind",
      (raw) => raw.decisions[0].options.push({ id: "now", name: "Current", kind: "different" }),
      false,
    ],
    ["no proposal", (raw) => (raw.decisions[0].options = [{ id: "now", name: "Current" }]), false],
    ["null section", (raw) => (raw.questions = null), false],
    ["empty file before route", (raw) => (raw.decisions[0].views[0].file = "#route"), false],
  ];

  for (const [name, change, expected] of cases) {
    const raw = manifest();
    change(raw);
    let hand = true;
    try {
      normalizeManifest(raw);
    } catch {
      hand = false;
    }
    assert.equal(hand, expected, `${name}: hand validator`);
    assert.equal(valid(manifestSchema, raw), expected, `${name}: JSON schema`);
  }
});

test("schemas use draft 2020-12 definitions and reject undeclared fields", () => {
  for (const schema of [manifestSchema, choicesSchema]) {
    assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
    assert.equal(schema.additionalProperties, false);
    assert.ok(schema.$defs);
  }
  assert.equal(manifestSchema.$defs.decision.additionalProperties, false);
  assert.equal(choicesSchema.$defs.element.additionalProperties, false);
});

test("choices schema mirrors the complete export contract", () => {
  const choices = {
    prismal: 1,
    title: "Review",
    round: 1,
    exported: "2026-10-02T01:38:32.632Z",
    decisions: [
      {
        id: "navigation",
        title: "Navigation",
        pick: "quiet",
        pickName: "Quiet",
        liked: ["quiet"],
        note: "",
      },
    ],
    questions: [{ id: "density", answer: null, note: "" }],
    words: [{ id: "saved", term: "Saved", choice: "Pinned", note: "" }],
    elements: [
      {
        name: "Primary note",
        route: "#inbox",
        verdict: "clear",
        text: "Saved",
        note: "",
        index: 0,
        group: "Content",
        what: "Main note card",
      },
    ],
    journeys: [
      {
        journey: "capture",
        step: 1,
        title: "Start",
        verdict: "obvious",
        note: "",
      },
    ],
    notes: "",
  };
  assert.equal(valid(choicesSchema, choices), true);
  assert.equal(valid(choicesSchema, { ...choices, prismal: 2 }), false);
  assert.equal(valid(choicesSchema, { ...choices, exported: "yesterday" }), false);
  assert.equal(valid(choicesSchema, { ...choices, extra: true }), false);
  assert.equal(
    valid(choicesSchema, {
      ...choices,
      elements: [{ ...choices.elements[0], verdict: "maybe" }],
    }),
    false,
  );
});
