// @ts-check
(() => {
  /** @typedef {{active:boolean, choice:(id:string)=>string, is:(id:string, option:string)=>boolean, state:Record<string, unknown>}} Client */
  /** @type {Window & typeof globalThis & {prismal?: Client}} */
  const win = window;
  if (win.prismal) return;
  /** @param {unknown} value @returns {value is Record<string, any>} */
  const record = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
  let config = {};
  try {
    const parsed = JSON.parse(window.name || "{}");
    if (record(parsed) && parsed.prismal === 1) config = parsed;
  } catch {
    // Other applications also use window.name; it is not necessarily JSON.
  }
  const active = parent !== window && config.prismal === 1;
  const choices = Object.create(null);
  const state = Object.create(null);
  for (const [key, value] of new URLSearchParams(location.search)) {
    if (/^prismal\.[a-z0-9-]+$/.test(key)) choices[key.slice("prismal.".length)] = value;
    if (key.startsWith("prismal.state.")) state[key.slice("prismal.state.".length)] = value;
  }
  if (record(config.choices)) Object.assign(choices, config.choices);
  if (record(config.state)) Object.assign(state, config.state);
  const choice = (id) => (typeof choices[id] === "string" ? choices[id] : "now");
  win.prismal = Object.freeze({ active, choice, is: (id, option) => choice(id) === option, state });
  for (const id of Object.keys(choices)) {
    if (/^[a-z0-9-]+$/.test(id)) document.documentElement.setAttribute(`data-prismal-${id}`, choice(id));
  }
  if (!active) return;
  if (typeof config.route === "string" && config.route.startsWith("#") && location.hash !== config.route) {
    location.hash = config.route;
  }
  const post = (type, payload = {}) => parent.postMessage({ prismal: 1, type, ...payload }, "*");
  const route = () => location.hash || location.pathname;
  const message = (value) => (value instanceof Error ? value.message : String(value));
  addEventListener("error", (event) =>
    post("error", { message: event.message || "A resource failed to load." }),
  );
  addEventListener("unhandledrejection", (event) => post("error", { message: message(event.reason) }));
  const originalError = console.error;
  console.error = (...args) => {
    originalError.apply(console, args);
    post("error", { message: args.map(message).join(" ") });
  };
  let focus = "";
  let lastWidth = 0;
  let lastHeight = 0;
  let pending = false;
  let inspecting = false;
  let elements = [];
  let selected = null;
  let hovered = null;
  let highlighted = null;
  let highlightRequest = null;
  let inventoryKey = "";
  const registry = document.createElement("style");
  registry.dataset.prismalOverlay = "";
  const rings = new Map();
  const visible = (element) =>
    element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) &&
    element.getClientRects().length > 0;
  const matches = (selector) => [...document.querySelectorAll(selector)].filter(visible);
  const registered = (element) => getComputedStyle(element).getPropertyValue("--prismal-element").trim();
  const copy = (element) =>
    (element.innerText || element.textContent || "").replace(/\s+/g, " ").trim().slice(0, 300);
  function readable(element) {
    const role =
      element.getAttribute("role") ||
      {
        A: "link",
        BUTTON: "button",
        INPUT: "input",
        SELECT: "select",
        TEXTAREA: "textbox",
        IMG: "image",
        SUMMARY: "disclosure",
      }[element.tagName] ||
      (/^H[1-6]$/.test(element.tagName) ? "heading" : element.tagName.toLowerCase());
    const labelled = (element.getAttribute("aria-labelledby") || "")
      .split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent || "")
      .join(" ")
      .trim();
    const label =
      element.getAttribute("aria-label") ||
      labelled ||
      element.getAttribute("alt") ||
      (element.labels ? [...element.labels].map(copy).join(" ") : "") ||
      copy(element) ||
      element.getAttribute("title") ||
      "";
    return role[0].toUpperCase() + role.slice(1) + (label ? ` "${label.slice(0, 80)}"` : "");
  }
  function describe(target) {
    for (let node = target; node; node = node.parentElement) {
      const index = registered(node);
      if (index !== "" && elements[Number(index)]) return { element: node, ...elements[Number(index)] };
    }
    const named = target.closest("[data-prismal-name]");
    if (named) return { element: named, name: named.getAttribute("data-prismal-name"), group: "", what: "" };
    const element =
      target.closest("button,a,input,select,textarea,[role],h1,h2,h3,h4,h5,h6,summary,img,label,p,li") ||
      target;
    return { element, name: readable(element), group: "", what: "" };
  }
  function members(name) {
    const index = elements.findIndex((element) => element.name === name);
    if (index >= 0)
      return matches(elements[index].selector).filter((element) => registered(element) === String(index));
    return [
      ...new Set(
        matches(
          "[data-prismal-name],button,a,input,select,textarea,[role],h1,h2,h3,h4,h5,h6,summary,img,label,p,li",
        )
          .map(describe)
          .filter((entry) => entry.name === name)
          .map((entry) => entry.element),
      ),
    ];
  }
  function inventory() {
    const names = [
      ...new Set([
        ...elements.map((entry) => entry.name),
        ...matches("[data-prismal-name]").map((element) => describe(element).name),
        ...(selected ? [selected.name] : []),
      ]),
    ];
    const items = names
      .map((name) => ({
        name,
        group: elements.find((entry) => entry.name === name)?.group || "Page",
        count: members(name).length,
      }))
      .filter((entry) => entry.count > 0);
    const key = JSON.stringify([route(), items]);
    if (inventoryKey !== key) {
      post("inventory", { items, route: route() });
      inventoryKey = key;
    }
  }
  function register(definitions) {
    elements = definitions;
    if (!registry.isConnected) (document.head || document.documentElement).append(registry);
    // The CSS cascade resolves specificity, including :is(), :where() and selector lists.
    registry.textContent = "*{--prismal-element:initial!important}";
    elements.forEach((entry, index) => {
      try {
        document.querySelectorAll(entry.selector);
        const rule = registry.sheet.insertRule(`${entry.selector}{}`, registry.sheet.cssRules.length);
        const inserted = registry.sheet.cssRules[rule];
        if (inserted instanceof CSSStyleRule)
          inserted.style.setProperty("--prismal-element", String(index), "important");
      } catch (error) {
        post("error", { message: `Invalid element selector: ${message(error)}` });
      }
    });
    inventoryKey = "";
    inventory();
  }
  function ring(kind, target, label) {
    let box = rings.get(kind);
    if (!box && target) {
      box = document.createElement("div");
      box.dataset.prismalOverlay = "";
      box.dataset.prismalRing = kind;
      box.style.cssText =
        "position:fixed;pointer-events:none;z-index:2147483647;box-sizing:border-box;border:2px solid #7f56d9;border-radius:5px;max-width:100vw;";
      const tag = document.createElement("span");
      tag.style.cssText =
        "position:absolute;left:0;bottom:100%;width:max-content;max-width:min(300px,90vw);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;background:#6941c6;color:white;padding:3px 7px;border-radius:4px 4px 0 0;font:12px/18px -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;";
      box.append(tag);
      document.body.append(box);
      rings.set(kind, box);
    }
    if (!box) return;
    box.hidden = !target?.isConnected || !visible(target);
    if (box.hidden) return;
    const rect = target.getBoundingClientRect();
    box.style.top = `${Math.max(0, rect.top)}px`;
    box.style.left = `${Math.max(0, rect.left)}px`;
    box.style.width = `${Math.max(0, Math.min(rect.right, innerWidth) - Math.max(0, rect.left))}px`;
    box.style.height = `${Math.max(0, Math.min(rect.bottom, innerHeight) - Math.max(0, rect.top))}px`;
    box.firstChild.textContent = label;
    box.firstChild.style.left = rect.left + 100 > innerWidth ? "auto" : "0";
    box.firstChild.style.right = rect.left + 100 > innerWidth ? "0" : "auto";
    box.firstChild.style.bottom = rect.top < 28 ? "auto" : "100%";
    box.firstChild.style.top = rect.top < 28 ? "0" : "auto";
  }
  function outlines() {
    ring("hover", inspecting ? hovered?.element : null, hovered?.name);
    ring("selection", inspecting ? selected?.element : null, selected?.name);
    ring("highlight", highlighted?.element, highlighted?.label);
  }
  function reveal(element) {
    element.scrollIntoView({ block: "center", behavior: "instant" });
    const header = [...document.querySelectorAll("header,nav")].find((node) =>
      ["sticky", "fixed"].includes(getComputedStyle(node).position),
    );
    if (header && element.getBoundingClientRect().top < header.getBoundingClientRect().bottom + 24)
      scrollBy(0, -header.getBoundingClientRect().height - 24);
  }
  function choose(element, scroll = false) {
    selected = describe(element);
    if (scroll) reveal(selected.element);
    const index = Math.max(0, members(selected.name).indexOf(selected.element));
    post("picked", {
      name: selected.name,
      group: selected.group || "",
      what: selected.what || "",
      text: copy(selected.element),
      route: route(),
      index,
    });
    inventory();
    outlines();
    if (scroll) {
      const rect = selected.element.getBoundingClientRect();
      post("rect", {
        top: rect.top + scrollY,
        left: rect.left + scrollX,
        width: rect.width,
        height: rect.height,
      });
    }
  }
  function highlight(value) {
    highlightRequest = value && typeof value.selector === "string" ? value : null;
    highlighted = null;
    if (value && typeof value.selector === "string") {
      try {
        const element = matches(value.selector)[0];
        if (element) {
          highlighted = { element, label: value.label || "" };
          reveal(element);
        }
      } catch (error) {
        highlightRequest = null;
        post("error", { message: `Invalid highlight selector: ${message(error)}` });
      }
    }
    outlines();
    schedule();
  }
  function measure(force = false) {
    const root = document.documentElement;
    const body = document.body;
    if (!body) return;
    if (highlightRequest && (!highlighted?.element.isConnected || !visible(highlighted.element))) {
      const element = matches(highlightRequest.selector)[0];
      if (element) {
        highlighted = { element, label: highlightRequest.label || "" };
        reveal(element);
      }
    }
    const width = Math.max(root.scrollWidth, body.scrollWidth);
    const height = Math.min(30000, Math.max(root.scrollHeight, body.scrollHeight));
    if (force || Math.abs(width - lastWidth) >= 2 || Math.abs(height - lastHeight) >= 2) {
      post("size", { width, height });
      lastWidth = width;
      lastHeight = height;
    }
    if (focus) {
      try {
        const target = matches(focus)[0];
        if (target) {
          const rect = target.getBoundingClientRect();
          post("rect", {
            top: rect.top + scrollY,
            left: rect.left + scrollX,
            width: rect.width,
            height: rect.height,
          });
        }
        outlines();
      } catch (error) {
        post("error", { message: `Invalid focus selector: ${message(error)}` });
        focus = "";
      }
    }
  }
  function schedule() {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      measure();
    });
  }
  addEventListener("message", (event) => {
    if (event.source !== parent || !record(event.data) || event.data.prismal !== 1) return;
    if (event.data.type === "init") {
      register(Array.isArray(event.data.elements) ? event.data.elements : []);
      inspecting = Boolean(event.data.inspect);
      focus = typeof event.data.focus === "string" ? event.data.focus : "";
      highlight(event.data.highlight);
      measure(true);
    } else if (event.data.type === "inspect") {
      inspecting = Boolean(event.data.on);
      hovered = null;
      outlines();
    } else if (event.data.type === "highlight") highlight(event.data);
    else if (event.data.type === "select") {
      if (!event.data.name) {
        selected = null;
        outlines();
        return;
      }
      const list = members(event.data.name);
      if (Number.isInteger(event.data.index) && list[event.data.index]) choose(list[event.data.index], true);
    }
  });
  for (const type of ["pointerdown", "mousedown", "click"])
    addEventListener(
      type,
      (event) => {
        if (
          !inspecting ||
          !(event.target instanceof Element) ||
          event.target.closest("[data-prismal-overlay]")
        )
          return;
        event.preventDefault();
        event.stopImmediatePropagation();
        if (type === "click") choose(event.target);
      },
      true,
    );
  addEventListener(
    "pointermove",
    (event) => {
      if (inspecting && event.target instanceof Element && !event.target.closest("[data-prismal-overlay]")) {
        hovered = describe(event.target);
        schedule();
      }
    },
    { passive: true },
  );
  addEventListener("pointerout", (event) => {
    if (!event.relatedTarget) {
      hovered = null;
      outlines();
    }
  });
  function ready() {
    post("ready", { title: document.title, route: route() });
    measure(true);
    const observer = new ResizeObserver(schedule);
    observer.observe(document.documentElement);
    if (document.body) observer.observe(document.body);
    new MutationObserver((records) => {
      if (
        records.every((entry) =>
          (entry.target instanceof Element ? entry.target : entry.target.parentElement)?.closest(
            "[data-prismal-overlay]",
          ),
        )
      )
        return;
      schedule();
      if (elements.length || inspecting) inventory();
    }).observe(document.documentElement, { childList: true, subtree: true });
    document.fonts.ready.then(() => measure(true));
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", ready, { once: true });
  else queueMicrotask(ready);
  addEventListener("load", () => measure(true));
  addEventListener("resize", schedule);
  addEventListener("scroll", schedule, { passive: true });
  addEventListener("hashchange", () => {
    selected = hovered = null;
    inventoryKey = "";
    post("ready", { title: document.title, route: route() });
    schedule();
  });
})();
