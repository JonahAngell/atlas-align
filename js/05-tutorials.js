/**
 * 05-tutorials.js
 *
 * Tutorial overlay engine. This file resolves tutorial definitions, positions guided cards, and handles tutorial navigation controls.
 * Auto-generated documentation comments explain function purpose, expected inputs, and module sections without changing runtime behavior.
 */

// -----------------------------------------------------------------------------
// Tutorial definitions and state
// -----------------------------------------------------------------------------
const defaultTutorials = {
  global: [
    {
      selector: "#helpBtn",
      title: "Open the site-wide tutorial",
      body: "Use this button to reopen the broad app walkthrough.",
      placement: "bottom",
    },
    {
      selector: ".app-sidebar",
      title: "Page navigation",
      body: "Use the left navigation to move through each ATLAS Align page.",
      placement: "right",
    },
  ],
};

const tutorialAliases = {
  audit: "auditLibrary",
  auditLibrary: "auditLibrary",
  fields: "fields",
  steps: "logicBuilder",
  logicBuilder: "logicBuilder",
};

const tutorials = Object.assign(
  {},
  defaultTutorials,
  window.ATLAS_TUTORIALS || {},
);
let tutorialState = null;
let tutorialRenderScheduled = false;
let tutorialIsRendering = false;

// -----------------------------------------------------------------------------
// Tutorial normalization helpers
// -----------------------------------------------------------------------------
/**
 * Resolves tutorial aliases into canonical tutorial keys.
 * @param {any} name - Name, filename, or key used by the operation.
 */
function normalizeTutorialName(name = "global") {
  return tutorialAliases[name] || name || "global";
}

/**
 * Normalizes list- or object-based tutorial step definitions.
 * @param {any} step - Logic step object being read or modified.
 */
function normalizeTutorialStep(step) {
  if (Array.isArray(step)) {
    const [selector, title, body] = step;
    return { selector, title, body, placement: "right" };
  }
  return { selector: "", title: "", body: "", placement: "right", ...step };
}

/**
 * Returns normalized steps for a tutorial.
 * @param {any} name - Name, filename, or key used by the operation.
 */
function tutorialSteps(name = "global") {
  const key = normalizeTutorialName(name);
  return (tutorials[key] || tutorials.global || []).map(normalizeTutorialStep);
}

/**
 * Infers which page should be shown for a tutorial selector.
 * @param {any} selector - CSS selector.
 * @param {any} explicitPage - Input used by sectionForTutorialSelector.
 */
function sectionForTutorialSelector(selector = "", explicitPage = "") {
  if (explicitPage) return explicitPage;
  if (selector.includes("my-audits") || selector.includes("auditLibrary"))
    return "my-audits";
  if (
    selector.includes("overview") ||
    selector.includes("auditName") ||
    selector.includes("auditPurpose")
  )
    return "overview";
  if (
    selector.includes("fields") ||
    selector.includes("sources") ||
    selector.includes("sourceField")
  )
    return "fields";
  if (
    selector.includes("steps") ||
    selector.includes("addStep") ||
    selector.includes("logic-rules") ||
    selector.includes("selectedStepDetails") ||
    selector.includes("logicBuilder")
  )
    return "steps";
  if (selector.includes("logicPreview") || selector.includes("preview"))
    return "preview";
  if (selector.includes("review") || selector.includes("validationPanel"))
    return "review";
  if (
    selector.includes("export") ||
    selector.includes("download")
  )
    return "export";
  return "overview";
}

/**
 * Maps tutorial section names to app pages.
 * @param {any} section - Section/page identifier.
 */
function tutorialPageFor(section) {
  if (typeof pageForSection === "function") return pageForSection(section);
  if (section === "audit") return "overview";
  if (section === "logic") return "steps";
  if (section === "publication" || section === "save") return "export";
  if (section === "sources") return "fields";
  return section || "my-audits";
}

/**
 * Shows a page without requiring the normal selected-audit gate.
 * @param {any} section - Section/page identifier.
 */
function showSectionForTutorial(section) {
  const page = tutorialPageFor(section);
  document.querySelectorAll(".navitem, .rail-item").forEach((button) => {
    const buttonPage = tutorialPageFor(
      button.dataset.section ||
        button.dataset.page ||
        button.dataset.panel ||
        "",
    );
    button.classList.toggle("active", buttonPage === page);
  });
  document.querySelectorAll(".page").forEach((panel) => {
    panel.classList.toggle(
      "active",
      panel.dataset.page === page ||
        panel.id === `page-${page}` ||
        panel.id === page,
    );
  });
  document.querySelectorAll(".setup-panel").forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.panel === page);
  });
  localStorage.setItem("atlasAlignActiveSection", page);
  if (typeof updateDashboardMetrics === "function") updateDashboardMetrics();
}

// -----------------------------------------------------------------------------
// Tutorial lifecycle
// -----------------------------------------------------------------------------
/**
 * Starts a tutorial overlay sequence.
 * @param {any} name - Name, filename, or key used by the operation.
 */
function startTutorial(name = "global") {
  const key = normalizeTutorialName(name);
  const steps = tutorialSteps(key).filter(
    (step) => step && step.selector && step.title,
  );
  if (!steps.length) return;
  endTutorial({ silent: true });
  tutorialState = {
    name: key,
    steps,
    index: 0,
    root: null,
    highlight: null,
    card: null,
  };
  document.body.classList.add("tutorial-active");
  renderTutorial();
}

/**
 * Closes the tutorial overlay and clears tutorial state.
 * @param {any} options - Configuration/options object.
 */
function endTutorial(options = {}) {
  tutorialState?.root?.remove();
  document.querySelectorAll(".tutorial-root").forEach((root) => root.remove());
  document.body.classList.remove("tutorial-active");
  tutorialState = null;
  tutorialRenderScheduled = false;
  tutorialIsRendering = false;
  if (!options.silent)
    setTimeout(() => window.dispatchEvent(new Event("resize")), 0);
}

// -----------------------------------------------------------------------------
// Tutorial rendering
// -----------------------------------------------------------------------------
/**
 * Escapes and formats tutorial body text.
 * @param {any} step - Logic step object being read or modified.
 */
function renderTutorialBody(step) {
  return esc(step.body || "").replace(/\n/g, "<br>");
}

/**
 * Calculates the tutorial card position near the highlighted element.
 * @param {any} rect - Input used by tutorialCardPosition.
 * @param {any} placement - Preferred tutorial placement.
 */
function tutorialCardPosition(rect, placement = "right") {
  const cardWidth = Math.min(430, window.innerWidth - 28);
  const margin = 16;
  let left = rect.right + 18;
  let top = rect.top;
  if (placement === "left") left = rect.left - cardWidth - 18;
  if (placement === "bottom") {
    left = rect.left;
    top = rect.bottom + 18;
  }
  if (placement === "top") {
    left = rect.left;
    top = rect.top - 240;
  }
  left = Math.min(
    Math.max(margin, left),
    window.innerWidth - cardWidth - margin,
  );
  top = Math.min(Math.max(margin, top), window.innerHeight - 275);
  return { left, top, width: cardWidth };
}

/**
 * Renders optional extra tutorial action buttons.
 * @param {any} step - Logic step object being read or modified.
 */
function renderTutorialActions(step) {
  if (!Array.isArray(step.actions) || !step.actions.length) return "";
  return `<div class="tutorial-actions tutorial-extra-actions">${step.actions.map((action, index) => `<button type="button" class="${esc(action.className || "secondary")}" data-tutorial-action="${index}">${esc(action.label || "Open")}</button>`).join("")}</div>`;
}

/**
 * Executes a configured tutorial action.
 * @param {any} step - Logic step object being read or modified.
 * @param {any} actionIndex - Index of the tutorial action to run.
 */
function runTutorialAction(step, actionIndex) {
  const action = step.actions?.[Number(actionIndex)];
  if (!action) return;
  if (action.tutorial) {
    startTutorial(action.tutorial);
    return;
  }
  if (action.page) {
    showSectionForTutorial(action.page);
    scheduleTutorialRender();
  }
}

/**
 * Finds and measures the element highlighted by a tutorial step.
 * @param {any} step - Logic step object being read or modified.
 */
function getTutorialRect(step) {
  const target = document.querySelector(step.selector);
  if (!target)
    return {
      left: innerWidth / 2 - 60,
      top: innerHeight / 2 - 40,
      width: 120,
      height: 80,
      right: innerWidth / 2 + 60,
      bottom: innerHeight / 2 + 40,
    };
  target.scrollIntoView?.({
    block: "center",
    inline: "nearest",
    behavior: "instant",
  });
  return target.getBoundingClientRect();
}

/**
 * Moves to the previous or next tutorial step.
 * @param {any} direction - Direction to move a step.
 */
function moveTutorial(direction) {
  if (!tutorialState) return;
  const next = tutorialState.index + direction;
  if (next < 0) return;
  if (next >= tutorialState.steps.length) {
    endTutorial();
    return;
  }
  tutorialState.index = next;
  renderTutorial();
}

/**
 * Renders the active tutorial highlight and card.
 */
function renderTutorial() {
  if (!tutorialState || !tutorialState.steps.length) return;
  tutorialIsRendering = true;
  tutorialRenderScheduled = false;
  const step = tutorialState.steps[tutorialState.index];
  showSectionForTutorial(sectionForTutorialSelector(step.selector, step.page));
  requestAnimationFrame(() => {
    if (!tutorialState) return;
    document
      .querySelectorAll(".tutorial-root")
      .forEach((root) => root.remove());
    const activeStep = tutorialState.steps[tutorialState.index];
    const rect = getTutorialRect(activeStep);
    const card = tutorialCardPosition(rect, activeStep.placement || "right");
    const root = document.createElement("div");
    root.className = "tutorial-root";
    root.dataset.tutorialRoot = "true";
    root.style.pointerEvents = "auto";
    root.style.zIndex = "100000";
    root.innerHTML = `<div class="tutorial-highlight" style="pointer-events:none;left:${Math.max(8, rect.left - 8)}px;top:${Math.max(8, rect.top - 8)}px;width:${Math.min(rect.width + 16, innerWidth - 16)}px;height:${Math.min(rect.height + 16, innerHeight - 16)}px"></div><section class="tutorial-card" role="dialog" aria-modal="true" aria-live="polite" style="pointer-events:auto;left:${card.left}px;top:${card.top}px;width:${card.width}px"><div class="tutorial-step-count">Step ${tutorialState.index + 1} of ${tutorialState.steps.length}</div><h2>${esc(activeStep.title)}</h2><p>${renderTutorialBody(activeStep)}</p>${renderTutorialActions(activeStep)}<div class="tutorial-actions"><button type="button" class="secondary" data-prev ${tutorialState.index === 0 ? "disabled" : ""}>Back</button><button type="button" class="secondary" data-close>Close</button><button type="button" data-next>${tutorialState.index === tutorialState.steps.length - 1 ? "Done" : "Next"}</button></div></section>`;
    document.body.append(root);
    tutorialState.root = root;
    tutorialState.highlight = root.querySelector(".tutorial-highlight");
    tutorialState.card = root.querySelector(".tutorial-card");
    tutorialIsRendering = false;
  });
}

/**
 * Schedules a tutorial render without duplicate renders.
 */
function scheduleTutorialRender() {
  if (!tutorialState || tutorialIsRendering || tutorialRenderScheduled) return;
  tutorialRenderScheduled = true;
  setTimeout(() => {
    tutorialRenderScheduled = false;
    if (tutorialState && !tutorialIsRendering) renderTutorial();
  }, 50);
}

/**
 * Repositions the tutorial overlay after layout changes.
 */
function positionTutorial() {
  scheduleTutorialRender();
}

/**
 * Handles tutorial Back, Next, Close, and custom action buttons.
 * @param {any} event - Browser event object.
 */
function handleTutorialControlClick(event) {
  const card = event.target.closest?.(".tutorial-card");
  const root = event.target.closest?.(".tutorial-root");
  if (card || root) event.stopPropagation();
  if (!card) return;
  const close = event.target.closest("[data-close]");
  const next = event.target.closest("[data-next]");
  const prev = event.target.closest("[data-prev]");
  const actionButton = event.target.closest("[data-tutorial-action]");
  if (!close && !next && !prev && !actionButton) return;
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation?.();
  if (close) return endTutorial();
  if (next) return moveTutorial(1);
  if (prev) return moveTutorial(-1);
  if (actionButton && tutorialState)
    return runTutorialAction(
      tutorialState.steps[tutorialState.index],
      actionButton.dataset.tutorialAction,
    );
}

// -----------------------------------------------------------------------------
// Tutorial event handlers
// -----------------------------------------------------------------------------
document.addEventListener("click", handleTutorialControlClick, true);
document.addEventListener(
  "pointerdown",
  (event) => {
    if (event.target.closest?.(".tutorial-card")) event.stopPropagation();
  },
  true,
);

document.addEventListener(
  "keydown",
  (event) => {
    if (!tutorialState) return;
    if (event.key === "Escape") {
      event.preventDefault();
      endTutorial();
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      moveTutorial(1);
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      moveTutorial(-1);
    }
  },
  true,
);

document.addEventListener(
  "click",
  (event) => {
    const button = event.target.closest("[data-start-tutorial]");
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    startTutorial(button.dataset.startTutorial || "global");
  },
  true,
);
