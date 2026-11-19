/**
 * "Runnable in File Utility" section of the Readiness & Review page.
 *
 * Runs the pure rules in 22a-file-utility-readiness.js against the shared
 * contract and shows a pass state or the list of steps File Utility cannot run.
 * The audit issue renderer calls render() after each of its own renders.
 */
(function initializeFileUtilityReadinessUi(global) {
  "use strict";

  const CONTRACT_URL = "./catalogs/file-utility/executable-steps.json";
  let contract = null;
  let contractError = false;
  let loading = null;

  function loadContract() {
    if (contract || contractError) return Promise.resolve(contract);
    if (!loading)
      loading = fetch(CONTRACT_URL, { cache: "no-store" })
        .then((response) => {
          if (!response.ok) throw new Error(String(response.status));
          return response.json();
        })
        .then((value) => {
          contract = value;
          return value;
        })
        .catch(() => {
          contractError = true;
          return null;
        })
        .then((value) => {
          render();
          return value;
        });
    return loading;
  }

  function visible(node) {
    for (; node; node = node.parentElement) {
      if (node.hidden) return false;
      const classes = String(node.className || "").split(/\s+/);
      if (classes.includes("page") && !classes.includes("active")) return false;
    }
    return true;
  }

  function sentence(message) {
    const text = String(message || "");
    return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
  }

  function add(parent, tag, text, className) {
    const child = document.createElement(tag);
    if (className) child.className = className;
    child.textContent = text;
    parent.appendChild(child);
    return child;
  }

  async function openStep(stepId) {
    if (typeof global.atlasNavigateToSection === "function")
      await global.atlasNavigateToSection("steps");
    else if (typeof global.showSection === "function")
      global.showSection("steps");
    global.atlasRevealLogicStep?.(stepId, {
      highlight: true,
      includeSelectedStep: true,
      includeLogicTable: true,
    });
  }

  function showState(elements, state) {
    elements.badge.className = `badge ${state.tone}`;
    elements.badge.textContent = state.badge;
    elements.summary.textContent = state.summary;
  }

  function blockerCard(blocker) {
    const card = document.createElement("article");
    card.className =
      "atlas-audit-issue-card atlas-audit-issue-card--critical file-utility-blocker";
    const heading = add(
      card,
      "h4",
      blocker.title || "Audit",
      "atlas-audit-issue-card__title",
    );
    add(heading, "span", " blocker", "atlas-audit-issue-card__severity");
    add(
      card,
      "p",
      sentence(blocker.message),
      "atlas-audit-issue-card__summary",
    );
    if (blocker.stepNumber) {
      add(
        card,
        "p",
        `Step ${blocker.stepNumber}`,
        "atlas-audit-issue-card__context",
      );
      const actions = document.createElement("div");
      actions.className = "atlas-audit-issue-card__actions";
      const link = add(
        actions,
        "button",
        `Go to step ${blocker.stepNumber}`,
        "btn secondary small",
      );
      link.type = "button";
      link.dataset.fileUtilityStep = blocker.stepId;
      card.appendChild(actions);
    }
    return card;
  }

  function render() {
    const root = document.getElementById("atlas-file-utility-readiness");
    if (!root || !visible(root)) return;
    const elements = {
      badge: document.getElementById("atlas-file-utility-badge"),
      summary: document.getElementById("atlas-file-utility-summary"),
      list: document.getElementById("atlas-file-utility-list"),
    };
    elements.list.replaceChildren();
    const active =
      typeof global.hasSelectedAudit === "function"
        ? global.hasSelectedAudit()
        : Boolean(global.state?.auditSelected);
    if (!active) {
      showState(elements, {
        tone: "blue",
        badge: "No audit",
        summary: "Select an audit to check it against File Utility.",
      });
      return;
    }
    if (contractError) {
      showState(elements, {
        tone: "amber",
        badge: "Unavailable",
        summary:
          "The File Utility step list could not be loaded, so this check did not run. Refresh the page to try again.",
      });
      return;
    }
    if (!contract) {
      showState(elements, {
        tone: "blue",
        badge: "Checking",
        summary: "Checking the audit against File Utility…",
      });
      loadContract();
      return;
    }
    let result;
    try {
      const audit = global.atlasDisplayDocument?.() || global.state?.audit;
      // Each step is checked with the definition version it renders with,
      // so a publication uses the versions it pins.
      const runtime = global.ATLASStepTypeRuntime;
      result = global.FileUtilityReadiness.check(audit || {}, contract, {
        definitionFor: runtime?.definitionFor,
      });
    } catch (error) {
      showState(elements, {
        tone: "amber",
        badge: "Unavailable",
        summary:
          "The audit could not be checked against File Utility. Refresh and try again.",
      });
      return;
    }
    if (result.runnable) {
      showState(elements, {
        tone: "green",
        badge: "Runnable",
        summary:
          "File Utility can run every step in this audit." +
          (result.warnings.length
            ? ` ${result.warnings.length} note${result.warnings.length === 1 ? "" : "s"} below.`
            : ""),
      });
    } else {
      const count = result.blockers.length;
      showState(elements, {
        tone: "red",
        badge: `${count} blocker${count === 1 ? "" : "s"}`,
        summary:
          "File Utility cannot run this audit yet. Fix each step below in ATLAS.",
      });
      result.blockers.forEach((blocker) =>
        elements.list.appendChild(blockerCard(blocker)),
      );
    }
    result.warnings.forEach((warning) => {
      const note = document.createElement("p");
      note.className = "atlas-audit-issue-card__context file-utility-note";
      note.textContent =
        (warning.stepNumber ? `Step ${warning.stepNumber}: ` : "") +
        sentence(warning.message);
      elements.list.appendChild(note);
    });
  }

  if (typeof document !== "undefined") {
    document.addEventListener("click", (event) => {
      const link = event.target.closest?.("[data-file-utility-step]");
      if (link) {
        openStep(link.dataset.fileUtilityStep);
        return;
      }
      if (event.target.closest?.("#atlas-readiness-issues-refresh")) render();
    });
    loadContract();
  }

  global.ATLASFileUtilityReadiness = Object.freeze({ render });
})(typeof window !== "undefined" ? window : globalThis);
