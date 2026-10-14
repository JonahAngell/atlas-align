import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";

class ClassList {
  constructor() {
    this.values = new Set();
  }
  add(value) {
    this.values.add(value);
  }
  remove(value) {
    this.values.delete(value);
  }
  contains(value) {
    return this.values.has(value);
  }
  toggle(value, force) {
    force ? this.add(value) : this.remove(value);
  }
}
class Element {
  constructor(selectors = [], options = {}) {
    this.selectors = new Set(selectors);
    this.dataset = { ...(options.dataset || {}) };
    this.attributes = new Map(Object.entries(options.attributes || {}));
    this.classList = new ClassList();
    this.disabled = Boolean(options.disabled);
    this.draggable = Boolean(options.draggable);
    if (options.draggable !== undefined)
      this.attributes.set("draggable", String(options.draggable));
  }
  closest(selector) {
    if (selector === "[data-workflow-action]")
      return this.dataset.workflowAction ? this : null;
    return this.selectors.has(selector) ? this : null;
  }
  hasAttribute(name) {
    return this.attributes.has(name);
  }
  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }
  setAttribute(name, value) {
    this.attributes.set(name, String(value));
    if (name === "draggable") this.draggable = String(value) === "true";
  }
  removeAttribute(name) {
    this.attributes.delete(name);
  }
  append() {}
  prepend() {}
  remove() {}
}
class Document {
  constructor(elements) {
    this.elements = elements;
    this.listeners = new Map();
    this.body = new Element();
    this.body.append = () => {};
  }
  addEventListener(type, handler, capture = false) {
    const values = this.listeners.get(type) || [];
    values.push({ handler, capture });
    this.listeners.set(type, values);
  }
  async dispatch(type, target, data = {}) {
    const event = {
      type,
      target,
      key: data.key,
      defaultPrevented: false,
      stopped: false,
      preventDefault() {
        this.defaultPrevented = true;
      },
      stopImmediatePropagation() {
        this.stopped = true;
      },
    };
    const listeners = this.listeners.get(type) || [];
    for (const { handler } of listeners) {
      if (event.stopped) break;
      await handler(event);
    }
    return event;
  }
  querySelectorAll(selector) {
    if (selector === "[data-atlas-workflow-locked='true']")
      return this.elements.filter(
        (element) => element.dataset.atlasWorkflowLocked === "true",
      );
    return this.elements.filter((element) => element.selectors.has(selector));
  }
  getElementById() {
    return null;
  }
  createElement() {
    return new Element();
  }
}

const ui = readFileSync(
  new URL("../js/24-audit-workflow-ui.js", import.meta.url),
  "utf8",
);
const start = ui.indexOf("const ATLAS_WORKFLOW_LOCK_DESCRIPTION_ID");
const end = ui.indexOf(
  'document\n  .getElementById("atlasWorkflowRefresh")',
  start,
);
const lockSource = ui.slice(start, end);

function contextFor(elements) {
  const calls = { view: 0, rescind: 0, history: 0, publications: 0, status: 0 };
  const document = new Document(elements);
  const context = vm.createContext({
    document,
    window: {
      ATLASHistory: {
        open: async () => {
          calls.publications += 1;
        },
      },
    },
    Set,
    atlasWorkflowSummary: { workflowStatus: "Pending Approval" },
    atlasLoadWorkflowSummary: async () => ({
      workflowStatus: "Pending Approval",
    }),
    atlasWorkflowCan: () => true,
    atlasWorkflowFeature: () => true,
    atlasRenderWorkflowCard: () => {},
    atlasAuditIsPublishedLocked: () => false,
    atlasAuditIsWorkflowLocked: () => true,
    atlasSubmitForApproval: async () => {},
    atlasShowApprovalReview: async () => {
      calls.view += 1;
    },
    atlasRescindApprovalRequest: async () => {
      calls.rescind += 1;
    },
    atlasUnlockAudit: async () => {},
    atlasOpenAuditHistory: async () => {
      calls.history += 1;
    },
    showSection: () => {},
    status: () => {
      calls.status += 1;
    },
  });
  vm.runInContext(lockSource, context);
  return { context, document, calls };
}

test("Pending Approval applies and restores native, custom, and draggable states", () => {
  const native = new Element(["#auditName"], { disabled: false });
  const alreadyDisabled = new Element(["#auditPurpose"], { disabled: true });
  const custom = new Element(["[data-open-assignment-picker]"], {
    attributes: { tabindex: "0" },
  });
  const draggable = new Element(["[data-display-field-row]"], {
    draggable: true,
  });
  const { context } = contextFor([native, alreadyDisabled, custom, draggable]);
  vm.runInContext("atlasApplyPublishedLock()", context);
  assert.equal(native.disabled, true);
  assert.equal(custom.getAttribute("aria-disabled"), "true");
  assert.equal(
    custom.getAttribute("aria-describedby"),
    "atlasWorkflowLockDescription",
  );
  assert.equal(draggable.draggable, false);
  assert.equal(native.classList.contains("atlas-workflow-lock-control"), true);
  context.atlasAuditIsWorkflowLocked = () => false;
  vm.runInContext("atlasApplyPublishedLock()", context);
  assert.equal(native.disabled, false);
  assert.equal(alreadyDisabled.disabled, true);
  assert.equal(custom.getAttribute("tabindex"), "0");
  assert.equal(draggable.draggable, true);
});

test("blocked pointer, keyboard, input, change, drag, and drop events never reach mutation handlers", async () => {
  const mutation = new Element(["[data-source-action]"]);
  const { document, calls } = contextFor([mutation]);
  const state = {
    audit: { name: "Locked", sources: ["source-a"], steps: ["step-a"] },
  };
  const before = structuredClone(state.audit);
  let mutationHandlers = 0;
  for (const type of [
    "click",
    "keydown",
    "input",
    "change",
    "dragstart",
    "dragover",
    "drop",
  ])
    document.addEventListener(type, () => {
      mutationHandlers += 1;
      state.audit.name = "Mutated";
    });
  for (const type of [
    "click",
    "keydown",
    "input",
    "change",
    "dragstart",
    "dragover",
    "drop",
  ]) {
    const event = await document.dispatch(type, mutation, { key: "Enter" });
    assert.equal(event.defaultPrevented, true, type);
    assert.equal(event.stopped, true, type);
  }
  assert.equal(calls.status, 7);
  assert.equal(mutationHandlers, 0);
  assert.deepEqual(state.audit, before);
});

test("allowed workflow actions bypass the lock guard and invoke their handlers", async () => {
  const view = new Element([], { dataset: { workflowAction: "view-request" } });
  const rescind = new Element([], { dataset: { workflowAction: "rescind" } });
  const history = new Element([], { dataset: { workflowAction: "history" } });
  const publications = new Element([], {
    dataset: { workflowAction: "publications" },
  });
  const { document, calls } = contextFor([
    view,
    rescind,
    history,
    publications,
  ]);
  for (const element of [view, rescind, history, publications]) {
    const event = await document.dispatch("click", element);
    assert.equal(event.defaultPrevented, false);
    assert.equal(event.stopped, false);
  }
  assert.deepEqual(calls, {
    view: 1,
    rescind: 1,
    history: 1,
    publications: 1,
    status: 0,
  });
});

test("Reviewer Mode controls remain operable inside locked audit-object containers", async () => {
  const reviewDecision = new Element([
    "[data-display-field-row]",
    "[data-review-decision]",
  ]);
  const reviewThread = new Element([
    "[data-editor-panel] button",
    "[data-review-thread]",
  ]);
  const { document, calls } = contextFor([reviewDecision, reviewThread]);
  let reached = 0;
  document.addEventListener("click", () => {
    reached += 1;
  });
  for (const element of [reviewDecision, reviewThread]) {
    const event = await document.dispatch("click", element);
    assert.equal(event.defaultPrevented, false);
    assert.equal(event.stopped, false);
  }
  assert.equal(reached, 2);
  assert.equal(calls.status, 0);
});

test("Reviewer Mode decorations remain visually active inside locked native objects", () => {
  const css = readFileSync(
    new URL("../css/audit-review.css", import.meta.url),
    "utf8",
  );
  assert.match(
    css,
    /\.review-inline-object\.atlas-workflow-lock-control[\s\S]*?opacity: 1 !important;[\s\S]*?filter: none/,
  );
  assert.match(
    css,
    /> :not\(\.review-inline-decoration\)[\s\S]*?opacity: 0\.52;[\s\S]*?filter: grayscale\(0\.65\)/,
  );
  assert.match(
    css,
    /\.review-inline-decoration button[\s\S]*?opacity: 1 !important;[\s\S]*?filter: none !important/,
  );
});
