import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const loaderSource = readFileSync(
  new URL("../js/00-html-partials-loader.js", import.meta.url),
  "utf8",
);

function fakeDocument(scriptSources) {
  const events = [];
  const head = { appendChild: (node) => events.push(["preload", node.href]) };
  const body = {
    pending: false,
    appendChild(node) {
      if (this.pending) events.push(["overlap", node.src]);
      this.pending = true;
      events.push(["execute", node.src]);
      // Finish each script on a later tick so overlapping execution would show.
      setTimeout(() => {
        this.pending = false;
        node.onload();
      }, 5);
    },
  };
  const bootNodes = scriptSources.map((src) => ({
    getAttribute: (name) => (name === "src" ? src : null),
  }));
  const document = {
    readyState: "interactive",
    head,
    body,
    getElementById: () => ({
      insertAdjacentHTML: () => events.push(["partials"]),
      remove() {},
    }),
    querySelectorAll: (selector) =>
      selector === "script[data-atlas-boot]" ? bootNodes : [],
    createElement: (tag) => ({ tag }),
    addEventListener() {},
  };
  return { document, events };
}

async function runLoader(scriptSources) {
  const { document, events } = fakeDocument(scriptSources);
  const fetches = [];
  const context = vm.createContext({
    document,
    window: {},
    setTimeout,
    fetch: async (file, options) => {
      fetches.push({ file, options });
      return {
        ok: true,
        headers: { get: () => "text/html" },
        text: async () => "<section></section>",
      };
    },
  });
  vm.runInContext(loaderSource, context);
  for (let i = 0; i < 100; i += 1) {
    if (
      events.filter(([kind]) => kind === "execute").length ===
      scriptSources.length
    )
      break;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  await new Promise((resolve) => setTimeout(resolve, 20));
  return { events, fetches };
}

test("boot preloads every script before executing them strictly in order", async () => {
  const sources = ["./js/a.js", "./js/b.js", "./js/c.js"];
  const { events } = await runLoader(sources);
  const preloads = events
    .filter(([kind]) => kind === "preload")
    .map(([, src]) => src);
  const executions = events
    .filter(([kind]) => kind === "execute")
    .map(([, src]) => src);
  assert.deepEqual(preloads, sources);
  assert.deepEqual(executions, sources);
  const firstExecute = events.findIndex(([kind]) => kind === "execute");
  const lastPreload = events.findLastIndex(([kind]) => kind === "preload");
  const partials = events.findIndex(([kind]) => kind === "partials");
  assert.ok(lastPreload < firstExecute, "all preloads start before execution");
  assert.deepEqual(
    events.filter(([kind]) => kind === "overlap"),
    [],
    "each script loads only after the previous one finished",
  );
  assert.ok(
    partials < firstExecute,
    "partials are in the page before scripts run",
  );
});

test("partials revalidate with the server instead of bypassing the cache", async () => {
  const { fetches } = await runLoader(["./js/a.js"]);
  assert.ok(fetches.length > 0);
  for (const { options } of fetches) assert.equal(options.cache, "no-cache");
});
