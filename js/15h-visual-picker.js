/**
 * Shared, persistence-free Visual Picker foundation.
 *
 * The component owns picker rendering, search, sorting, selection UI, and
 * keyboard/focus behavior. Callers remain responsible for supplying entries
 * and for handling the selected value in `onSelect`.
 *
 * Required markup:
 * - A host with id `atlas-visual-picker-root`.
 * - The child IDs referenced by `element()` below, as provided by the shared
 *   Visual Picker HTML partial.
 *
 * Basic usage:
 *
 *   window.ATLASVisualPicker.open({
 *     mode: "field",
 *     title: "Choose Field",
 *     guidance: "Select an available field.",
 *     entries: [
 *       {
 *         key: "source-key::field-name",
 *         label: "Friendly field name",
 *         rawName: "field_name",
 *         sourceKey: "source-key",
 *         sourceLabel: "Source name",
 *         sourceColor: "#667085",
 *         custom: false,
 *         disabled: false,
 *       },
 *     ],
 *     onSelect(originalEntry, key) {
 *       // Persist or apply the selection in the calling workflow.
 *     },
 *   });
 *
 * Public API:
 * - open(config): configure, render, and open the picker.
 * - close(reason): close the picker and restore focus.
 * - refresh(): re-render from the current internal state.
 * - isOpen(): report whether the shared host is visible.
 */
(function initializeAtlasVisualPicker(global) {
  "use strict";

  // The shared HTML partial provides one host with this ID.
  const ROOT_ID = "atlas-visual-picker-root";

  // Ephemeral UI state only. Audit or application persistence stays with callers.
  const state = {
    config: null,
    entries: [],
    query: "",
    sort: "source",
    vanityLabels: false,
    selectedKey: null,
    multiple: false,
    selectedKeys: new Set(),
    message: "",
    restoreFocus: null,
  };
  /** True when the entry is the active single selection or a checked multi selection. */
  function isEntrySelected(entry) {
    return state.multiple
      ? state.selectedKeys.has(entry.key)
      : entry.key === state.selectedKey;
  }

  /** Return the shared picker host, or null when the partial is unavailable. */
  function root() {
    return document.getElementById(ROOT_ID);
  }
  /** Look up a required picker element by its stable DOM ID. */
  function element(id) {
    return document.getElementById(id);
  }
  /** Convert a value to display text while preserving an explicit fallback. */
  function text(value, fallback = "") {
    return value == null ? fallback : String(value);
  }
  /**
   * Resolve the label currently shown for an entry.
   * `vanityLabels` switches between the Vanity Label/Field Display Name and Source Field Name.
   */
  function labelFor(entry) {
    const display = text(
      entry.label ?? entry.displayName,
      text(entry.rawName, text(entry.key)),
    );
    return state.vanityLabels ? display : text(entry.rawName, display);
  }
  /**
   * Normalize caller-provided entries into the component's internal shape.
   * Entries without a key are ignored, and duplicate keys keep the first item.
   * The original caller object is retained for the `onSelect` callback.
   */
  function normalizedEntries(entries) {
    const seen = new Set();
    return (Array.isArray(entries) ? entries : []).reduce((result, item) => {
      if (!item || item.key == null) return result;
      const key = String(item.key);
      if (seen.has(key)) return result;
      seen.add(key);
      result.push({
        key,
        label: text(item.label ?? item.displayName, text(item.rawName, key)),
        rawName: text(item.rawName, text(item.label ?? item.displayName, key)),
        sourceKey: text(item.sourceKey ?? item.source, "other"),
        sourceLabel: text(
          item.sourceLabel ?? item.sourceName ?? item.source,
          "Other",
        ),
        sourceColor: text(item.sourceColor ?? item.color, "#667085"),
        custom: Boolean(item.custom),
        badge: text(item.badge, item.custom ? "Custom" : ""),
        disabled: Boolean(item.disabled),
        disabledReason: text(item.disabledReason ?? item.ineligibilityReason),
        avatar: text(item.avatar),
        initials: text(item.initials),
        detail: text(item.detail),
        optionClass: text(item.optionClass),
        original: item,
      });
      return result;
    }, []);
  }
  /**
   * Return entries matching the current query, sorted by their visible label.
   * Search covers friendly labels, raw names, and source labels.
   */
  function visibleEntries() {
    const query = state.query.trim().toLocaleLowerCase();
    const matches = state.entries.filter(
      (entry) =>
        !query ||
        [entry.label, entry.rawName, entry.sourceLabel].some((value) =>
          value.toLocaleLowerCase().includes(query),
        ),
    );
    return matches.sort((a, b) =>
      labelFor(a).localeCompare(labelFor(b), undefined, {
        sensitivity: "base",
      }),
    );
  }
  /**
   * Build one selectable result button, including selected, disabled, color,
   * and optional badge presentation. The function only creates DOM elements.
   */
  function optionButton(entry) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `atlas-visual-picker-option${entry.custom ? " is-calculated-field" : ""}${entry.optionClass ? ` ${entry.optionClass}` : ""}`;
    button.role = "option";
    button.dataset.atlasPickerKey = entry.key;
    button.setAttribute("aria-disabled", String(entry.disabled));
    if (entry.disabledReason) button.title = entry.disabledReason;
    button.setAttribute("aria-selected", String(isEntrySelected(entry)));
    if (state.multiple) {
      const mark = document.createElement("span");
      mark.className = "atlas-visual-picker-check";
      mark.setAttribute("aria-hidden", "true");
      button.append(mark);
    }
    button.style.setProperty("--atlas-source-color", entry.sourceColor);
    if (entry.avatar || entry.initials) {
      const avatar = document.createElement("span");
      avatar.className = "atlas-visual-picker-user-avatar";
      avatar.textContent = entry.initials || "?";
      avatar.setAttribute("aria-hidden", "true");
      if (entry.avatar) {
        const image = document.createElement("img");
        image.src = entry.avatar;
        image.alt = "";
        image.loading = "lazy";
        image.referrerPolicy = "no-referrer";
        image.addEventListener("error", () => image.remove(), { once: true });
        avatar.append(image);
      }
      button.append(avatar);
    }
    const content = document.createElement("span");
    content.className = "atlas-visual-picker-option-content";
    const label = document.createElement("span");
    label.className = "atlas-visual-picker-option-label";
    label.textContent = labelFor(entry);
    content.append(label);
    if (entry.detail) {
      const detail = document.createElement("small");
      detail.className = "atlas-visual-picker-option-detail";
      detail.textContent = entry.detail;
      content.append(detail);
    }
    if (entry.disabledReason) {
      const reason = document.createElement("small");
      reason.className = "atlas-visual-picker-disabled-reason";
      reason.textContent = entry.disabledReason;
      content.append(reason);
      button.setAttribute("aria-description", entry.disabledReason);
    }
    button.append(content);
    if (entry.badge) {
      const badge = document.createElement("span");
      badge.className = "atlas-visual-picker-badge";
      badge.textContent = entry.badge;
      button.append(badge);
    }
    return button;
  }
  /** Keep catalog fields ahead of calculated fields inside one source group. */
  function calculatedFieldsLast(entries) {
    return [...entries].sort((a, b) => {
      if (Boolean(a.custom) !== Boolean(b.custom)) return a.custom ? 1 : -1;
      return labelFor(a).localeCompare(labelFor(b), undefined, {
        sensitivity: "base",
      });
    });
  }
  /** True when this open asked for bulk select controls in multi-select mode. */
  function selectAllEnabled() {
    return state.multiple && state.config?.selectAll === true;
  }
  /** Keys of the enabled entries in a list, which bulk selection may toggle. */
  function eligibleKeys(entries) {
    return entries.filter((entry) => !entry.disabled).map((entry) => entry.key);
  }
  /** Enabled entries visible under the current search, optionally for one source. */
  function eligibleVisibleKeys(sourceKey = null) {
    return eligibleKeys(
      visibleEntries().filter(
        (entry) => sourceKey == null || entry.sourceKey === sourceKey,
      ),
    );
  }
  /** Build the per-source "Select all" toggle shown in a group heading. */
  function groupSelectButton(sourceKey, heading) {
    const button = document.createElement("button");
    button.type = "button";
    button.className =
      "atlas-visual-picker-control atlas-visual-picker-group-select";
    button.dataset.atlasPickerGroupSelect = sourceKey;
    button.dataset.atlasPickerGroupName = heading;
    return button;
  }
  /** Render one source/result group and append all entry buttons to it. */
  function renderGroup(container, heading, color, entries, sourceKey = null) {
    const group = document.createElement("section");
    group.className = "atlas-visual-picker-group";
    const title = document.createElement("h3");
    title.className = "atlas-visual-picker-group-heading";
    title.style.setProperty("--atlas-source-color", color);
    const dot = document.createElement("span");
    dot.className = "atlas-visual-picker-source-dot";
    dot.setAttribute("aria-hidden", "true");
    const name = document.createElement("span");
    name.textContent = heading;
    const count = document.createElement("span");
    count.className = "atlas-visual-picker-count";
    count.textContent = `(${entries.length})`;
    title.append(dot, name, count);
    const options = document.createElement("div");
    options.className = "atlas-visual-picker-options";
    entries.forEach((entry) => options.append(optionButton(entry)));
    if (selectAllEnabled() && sourceKey != null) {
      const head = document.createElement("div");
      head.className = "atlas-visual-picker-group-head";
      head.append(title, groupSelectButton(sourceKey, heading));
      group.append(head, options);
    } else group.append(title, options);
    container.append(group);
  }
  /**
   * Re-render the result area from current state.
   * Use `ATLASVisualPicker.refresh()` after changing state through the public
   * lifecycle; callers normally do not need to call this directly.
   * Returns false if the shared results markup is unavailable.
   */
  function refresh() {
    const container = element("atlas-visual-picker-results");
    const empty = element("atlas-visual-picker-empty");
    if (!container || !empty) return false;
    const entries = visibleEntries();
    container.replaceChildren();
    if (state.sort === "alpha") {
      const groups = new Map();
      entries.forEach((entry) => {
        const letter = firstLetter(labelFor(entry));
        if (!groups.has(letter)) groups.set(letter, []);
        groups.get(letter).push(entry);
      });
      [...groups.entries()]
        .sort(([a], [b]) => {
          if (a === "#") return -1;
          if (b === "#") return 1;
          return a.localeCompare(b, undefined, { sensitivity: "base" });
        })
        .forEach(([letter, groupEntries]) =>
          renderGroup(container, letter, "#667085", groupEntries),
        );
    } else {
      const groups = new Map();
      entries.forEach((entry) => {
        if (!groups.has(entry.sourceKey))
          groups.set(entry.sourceKey, {
            sourceKey: entry.sourceKey,
            label: entry.sourceLabel,
            color: entry.sourceColor,
            entries: [],
          });
        const group = groups.get(entry.sourceKey);
        if (!group.color && entry.sourceColor) group.color = entry.sourceColor;
        group.entries.push(entry);
      });
      [...groups.values()]
        .sort((a, b) =>
          a.label.localeCompare(b.label, undefined, { sensitivity: "base" }),
        )
        .forEach((group) =>
          renderGroup(
            container,
            group.label,
            group.color,
            calculatedFieldsLast(group.entries),
            group.sourceKey,
          ),
        );
    }
    empty.textContent =
      state.message || state.config?.emptyMessage || "No matching options.";
    empty.classList.toggle("is-error", state.config?.messageKind === "error");
    empty.hidden = entries.length !== 0;
    container.hidden = entries.length === 0;
    syncMultipleChrome();
    return true;
  }
  /** Show the multi-select footer only when this open requested it. */
  function syncMultipleChrome() {
    const host = root();
    host?.classList.toggle("is-multiple", state.multiple);
    const results = element("atlas-visual-picker-results");
    if (state.multiple) results?.setAttribute("aria-multiselectable", "true");
    else results?.removeAttribute("aria-multiselectable");
    const footer = element("atlas-visual-picker-footer");
    const count = element("atlas-visual-picker-selection-count");
    const confirm = element("atlas-visual-picker-confirm");
    if (!footer || !count || !confirm) return;
    footer.hidden = !state.multiple;
    if (!state.multiple) {
      confirm.disabled = true;
      return;
    }
    const total = state.selectedKeys.size;
    const noun = text(state.config?.selectionNoun, "item");
    const plural = total === 1 ? noun : `${noun}s`;
    count.textContent = total
      ? `${total} ${plural} selected`
      : `No ${noun}s selected`;
    confirm.disabled = total === 0;
    confirm.textContent = total > 1 ? `Add ${total} ${noun}s` : `Add ${noun}`;
    syncSelectAllControls();
  }
  /**
   * Label each bulk toggle as "Select all" until every eligible key it covers
   * is checked, then as "Clear". Disable it when nothing is eligible.
   */
  function syncSelectAllControls() {
    const enabled = selectAllEnabled();
    const footerButton = element("atlas-visual-picker-select-all");
    const noun = text(state.config?.selectionNoun, "item");
    const sync = (button, keys, selectLabel, clearLabel, scope) => {
      const allSelected =
        keys.length > 0 && keys.every((key) => state.selectedKeys.has(key));
      button.disabled = keys.length === 0;
      button.textContent = allSelected ? clearLabel : selectLabel;
      button.setAttribute(
        "aria-label",
        allSelected
          ? `Clear selected ${noun}s ${scope}`
          : keys.length === 1
            ? `Select the 1 ${noun} ${scope}`
            : `Select all ${keys.length} ${noun}s ${scope}`,
      );
      button.dataset.atlasPickerSelectState = allSelected ? "clear" : "select";
    };
    if (footerButton) {
      footerButton.hidden = !enabled;
      if (enabled)
        sync(
          footerButton,
          eligibleVisibleKeys(),
          "Select all",
          "Clear all",
          state.query.trim() ? "matching this search" : "in all sources",
        );
    }
    if (!enabled) return;
    element("atlas-visual-picker-results")
      ?.querySelectorAll("[data-atlas-picker-group-select]")
      .forEach((button) =>
        sync(
          button,
          eligibleVisibleKeys(button.dataset.atlasPickerGroupSelect),
          "Select all",
          "Clear",
          `in ${button.dataset.atlasPickerGroupName}`,
        ),
      );
  }
  /** Check or uncheck many enabled options at once without committing. */
  function setKeysSelected(keys, on) {
    if (!state.multiple) return;
    const keySet = new Set(keys);
    keySet.forEach((key) =>
      on ? state.selectedKeys.add(key) : state.selectedKeys.delete(key),
    );
    element("atlas-visual-picker-results")
      ?.querySelectorAll("[data-atlas-picker-key]")
      .forEach((node) => {
        if (keySet.has(node.dataset.atlasPickerKey))
          node.setAttribute("aria-selected", String(on));
      });
    syncMultipleChrome();
  }
  /** Apply a bulk toggle: select every eligible key unless all are already checked. */
  function toggleKeys(keys) {
    if (!keys.length) return;
    setKeysSelected(
      keys,
      !keys.every((key) => state.selectedKeys.has(key)),
    );
  }
  /** Drop multi-select keys that are no longer enabled options. */
  function pruneSelection() {
    if (!state.multiple) return;
    const available = new Set(
      state.entries
        .filter((entry) => !entry.disabled)
        .map((entry) => entry.key),
    );
    for (const key of state.selectedKeys)
      if (!available.has(key)) state.selectedKeys.delete(key);
  }
  /**
   * Close the picker, remove the temporary document key handler, invoke the
   * optional `onClose(reason)` callback, and restore focus to the opener.
   * Returns false when the picker is already closed or the host is unavailable.
   */
  function close(reason = "close") {
    const host = root();
    if (!host || host.hidden) return false;
    host.hidden = true;
    document.removeEventListener("keydown", onDocumentKeydown, true);
    if (typeof state.config?.onClose === "function")
      state.config.onClose(reason);
    const restore = state.restoreFocus;
    state.config = null;
    state.restoreFocus = null;
    state.multiple = false;
    state.selectedKeys.clear();
    state.selectedKey = null;
    syncMultipleChrome();
    if (
      restore &&
      document.contains(restore) &&
      typeof restore.focus === "function"
    )
      restore.focus();
    return true;
  }
  /**
   * Handle modal keyboard behavior while open: Escape closes the picker and
   * Tab/Shift+Tab are wrapped within the picker controls.
   */
  function onDocumentKeydown(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      close("escape");
      return;
    }
    if (event.key !== "Tab") return;
    const host = root();
    const focusable = [
      ...host.querySelectorAll(
        'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ].filter((node) => !node.hidden && !node.closest("[hidden]"));
    if (!focusable.length) {
      event.preventDefault();
      element("atlas-visual-picker-dialog")?.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
  /**
   * Select an enabled entry by key, notify `onSelect(originalEntry, key)`, and
   * close unless the caller explicitly sets `closeOnSelect: false`.
   */
  function selectEntry(key) {
    const entry = state.entries.find((candidate) => candidate.key === key);
    if (!entry || entry.disabled) return;
    state.selectedKey = entry.key;
    // Re-render the selection only when the picker stays open.
    if (state.config?.closeOnSelect === false) refresh();
    if (typeof state.config?.onSelect === "function")
      state.config.onSelect(entry.original, entry.key);
    if (state.config?.closeOnSelect !== false) close("select");
  }
  /** Check or uncheck one option without committing the picker. */
  function toggleEntry(key) {
    const entry = state.entries.find((candidate) => candidate.key === key);
    if (!entry || entry.disabled || !state.multiple) return;
    if (state.selectedKeys.has(entry.key)) state.selectedKeys.delete(entry.key);
    else state.selectedKeys.add(entry.key);
    const button = [
      ...(element("atlas-visual-picker-results")?.querySelectorAll(
        "[data-atlas-picker-key]",
      ) || []),
    ].find((node) => node.dataset.atlasPickerKey === entry.key);
    if (button)
      button.setAttribute(
        "aria-selected",
        String(state.selectedKeys.has(entry.key)),
      );
    else refresh();
    syncMultipleChrome();
  }
  /** Commit every checked option. Single-select callers never reach this path. */
  function confirmSelection() {
    if (!state.multiple) return;
    const byKey = new Map(state.entries.map((entry) => [entry.key, entry]));
    const selected = [...state.selectedKeys]
      .map((key) => byKey.get(key))
      .filter((entry) => entry && !entry.disabled);
    if (!selected.length) return;
    const config = state.config;
    if (typeof config?.onSelect === "function")
      config.onSelect(
        selected.map((entry) => entry.original),
        selected.map((entry) => entry.key),
      );
    if (config?.closeOnSelect !== false && state.config) close("select");
  }
  /**
   * Bind host, search, label-mode, and sort events exactly once.
   * The `data-atlas-picker-bound` flag prevents duplicate listeners when the
   * same singleton picker is opened repeatedly.
   */
  function bindHost(host) {
    if (host.dataset.atlasPickerBound === "true") return;
    host.dataset.atlasPickerBound = "true";
    host.addEventListener("click", (event) => {
      if (event.target.closest("[data-atlas-picker-confirm]")) {
        confirmSelection();
        return;
      }
      if (event.target.closest("#atlas-visual-picker-select-all")) {
        if (selectAllEnabled()) toggleKeys(eligibleVisibleKeys());
        return;
      }
      const groupSelect = event.target.closest(
        "[data-atlas-picker-group-select]",
      );
      if (groupSelect) {
        if (selectAllEnabled())
          toggleKeys(
            eligibleVisibleKeys(groupSelect.dataset.atlasPickerGroupSelect),
          );
        return;
      }
      const closeControl = event.target.closest("[data-atlas-picker-close]");
      if (closeControl) {
        close("dismiss");
        return;
      }
      const option = event.target.closest("[data-atlas-picker-key]");
      if (!option) return;
      if (state.multiple) toggleEntry(option.dataset.atlasPickerKey);
      else selectEntry(option.dataset.atlasPickerKey);
    });
    element("atlas-visual-picker-search")?.addEventListener(
      "input",
      (event) => {
        state.query = event.target.value;
        refresh();
        if (typeof state.config?.onQueryChange === "function")
          state.config.onQueryChange(state.query);
      },
    );
    element("atlas-visual-picker-label-mode")?.addEventListener(
      "click",
      (event) => {
        if (typeof state.config?.onAction === "function") {
          state.config.onAction(state.query);
          return;
        }
        state.vanityLabels = !state.vanityLabels;
        if (state.config?.mode === "field") {
          localStorage.setItem(
            "atlasAlignVisualPickerFieldDisplayMode",
            state.vanityLabels ? "vanity" : "source",
          );
        }
        const nextLabel = state.vanityLabels
          ? "Display Source Field Name"
          : "Display Vanity Label/Field Display Name";
        event.currentTarget.setAttribute(
          "aria-pressed",
          String(state.vanityLabels),
        );
        event.currentTarget.setAttribute("aria-label", nextLabel);
        event.currentTarget.title = nextLabel;
        refresh();
      },
    );
    element("atlas-visual-picker-sort-source")?.addEventListener("click", () =>
      setSort("source"),
    );
    element("atlas-visual-picker-sort-alpha")?.addEventListener("click", () =>
      setSort("alpha"),
    );
  }
  /**
   * Set the active result organization (`source` or `alpha`), synchronize the
   * controls' aria-pressed states, and refresh the results.
   */
  function setSort(sort) {
    state.sort = sort;
    element("atlas-visual-picker-sort-source")?.setAttribute(
      "aria-pressed",
      String(sort === "source"),
    );
    element("atlas-visual-picker-sort-alpha")?.setAttribute(
      "aria-pressed",
      String(sort === "alpha"),
    );
    refresh();
  }
  /**
   * Configure and open the shared picker.
   *
   * Required config:
   * - entries: array of uniquely keyed caller entries.
   *
   * Common optional config:
   * - mode: `source` or `field`, used for the default title.
   * - title, guidance, searchPlaceholder: user-facing text.
   * - query: initial search text.
   * - sort: `alpha`; all other values default to `source`.
   * - vanityLabels: start in vanity-label mode when true. Field pickers otherwise use the independent persisted preference, falling back to the app-wide field display mode only when uninitialized.
   * - selectedKey: key to expose with aria-selected="true".
   * - multiple: when true, options toggle and Add commits the checked entries together. Other callers stay single-select.
   * - selectionNoun: singular label used by the multi-select footer. Defaults to "item".
   * - selectAll: with `multiple`, adds "Select all" toggles to each source heading
   *   (source sort only) and to the footer (every source). They check or clear the
   *   enabled entries visible under the current search; Add still commits.
   * - closeOnSelect: set false when the caller closes after a successful commit.
   * - onSelect(originalEntry, key): apply one selected entry. In multiple mode this receives the original entries array and their keys.
   * - onClose(reason): respond to `close`, `escape`, `dismiss`, or caller reasons.
   *
   * Returns true when opened, or false when required host/config data is absent.
   */
  function open(config = {}) {
    const host = root();
    if (!host) {
      console.error("ATLAS Visual Picker: host partial is not loaded.");
      return false;
    }
    if (!config || !Array.isArray(config.entries)) {
      console.error("ATLAS Visual Picker: open() requires an entries array.");
      return false;
    }
    bindHost(host);
    state.config = config;
    state.entries = normalizedEntries(config.entries);
    state.query = text(config.query);
    state.sort = config.sort === "alpha" ? "alpha" : "source";
    const storedFieldMode =
      config.mode === "field"
        ? localStorage.getItem("atlasAlignVisualPickerFieldDisplayMode")
        : null;
    state.vanityLabels =
      storedFieldMode === "vanity"
        ? true
        : storedFieldMode === "source"
          ? false
          : typeof config.vanityLabels === "boolean"
            ? config.vanityLabels
            : config.mode === "field" &&
                typeof global.fieldDisplayMode === "function"
              ? global.fieldDisplayMode() === "vanity"
              : false;
    state.selectedKey =
      config.selectedKey == null ? null : String(config.selectedKey);
    state.multiple = config.multiple === true;
    state.selectedKeys = new Set(
      state.multiple && Array.isArray(config.selectedKeys)
        ? config.selectedKeys.map((key) => String(key))
        : [],
    );
    pruneSelection();
    state.message = text(config.message);
    state.restoreFocus = document.activeElement;
    element("atlas-visual-picker-title").textContent = text(
      config.title,
      config.mode === "source" ? "Select a source" : "Select a field",
    );
    element("atlas-visual-picker-guidance").textContent = text(
      config.guidance,
      "Search or browse the available options.",
    );
    const search = element("atlas-visual-picker-search");
    search.value = state.query;
    search.placeholder = text(config.searchPlaceholder, "Search");
    const labelMode = element("atlas-visual-picker-label-mode");
    labelMode.hidden = config.hideLabelMode === true;
    labelMode.textContent = text(config.actionLabel, "Aa");
    labelMode.title = text(
      config.actionTitle,
      state.vanityLabels
        ? "Display Source Field Name"
        : "Display Vanity Label/Field Display Name",
    );
    labelMode.setAttribute(
      "aria-label",
      state.vanityLabels
        ? "Display Source Field Name"
        : "Display Vanity Label/Field Display Name",
    );
    labelMode.setAttribute("aria-pressed", String(state.vanityLabels));
    setSort(state.sort);
    host.hidden = false;
    document.addEventListener("keydown", onDocumentKeydown, true);
    requestAnimationFrame(() => search.focus());
    return true;
  }
  /** Replace picker entries without reopening or changing focus. */
  function setEntries(entries, options = {}) {
    if (!state.config || !Array.isArray(entries)) return false;
    state.entries = normalizedEntries(entries);
    pruneSelection();
    state.message = text(options.message);
    state.config.messageKind = text(options.kind);
    if (options.emptyMessage != null)
      state.config.emptyMessage = text(options.emptyMessage);
    return refresh();
  }
  /** Update the visible empty/loading/error message. */
  function setMessage(message, kind = "") {
    if (!state.config) return false;
    state.message = text(message);
    state.config.messageKind = text(kind);
    return refresh();
  }
  /** Return true only when the shared picker host exists and is visible. */
  function isOpen() {
    const host = root();
    return Boolean(host && !host.hidden);
  }

  // Publish one immutable singleton API without replacing an existing instance.
  if (!global.ATLASVisualPicker)
    global.ATLASVisualPicker = Object.freeze({
      open,
      close,
      refresh,
      setEntries,
      setMessage,
      isOpen,
    });
})(window);
