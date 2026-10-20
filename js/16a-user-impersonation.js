/** Browser UI for server-authoritative user impersonation. */
(function () {
  "use strict";
  const API = "/api/impersonation";
  let timer = null;
  let renewalShownFor = "";

  function activeInfo() {
    return state.currentUser?.impersonation || {};
  }
  function hasInFlightSave() {
    return Boolean(
      globalThis.atlasHasPendingDatabaseWrite?.() ||
      state.auditPersistence?.saving,
    );
  }
  function captureNavigationHint() {
    try {
      sessionStorage.setItem(
        "atlasImpersonationNavigation",
        JSON.stringify({
          page: globalThis.atlasActivePage?.() || "my-audits",
          auditId: state.auditSelected ? state.audit?.id : null,
        }),
      );
    } catch (_error) {}
  }
  async function request(path, options = {}) {
    const response = await fetch(path, {
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      ...options,
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error || "The identity request failed.");
    }
    return response.status === 204 ? null : response.json();
  }
  function confirmSwitch(label) {
    const pending = hasInFlightSave()
      ? "\n\nAn audit save is pending or in progress. That request will finish under the identity that started it."
      : "";
    return globalThis.confirm(
      `Switch to ${label}?${pending}\n\nSelect OK to Switch User or Cancel to keep the current identity.`,
    );
  }
  let returnFocus = null;
  function closeDialog() {
    const dialog = document.getElementById("atlas-impersonation-dialog");
    if (!dialog) return;
    dialog.remove();
    returnFocus?.focus?.();
    returnFocus = null;
  }
  function profileLabel(profile) {
    return profile.fullName || profile.username || profile.id;
  }
  function renderCards(host, profiles, currentId, query, role) {
    const q = query.trim().toLowerCase();
    const filtered = profiles.filter((p) => {
      const roles = Array.isArray(p.roleSlugs) ? p.roleSlugs : [];
      return (
        (role === "All" || roles.includes(role)) &&
        (!q ||
          [p.fullName, p.email, p.username, p.id, ...roles]
            .join(" ")
            .toLowerCase()
            .includes(q))
      );
    });
    host.replaceChildren();
    for (const profile of filtered) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "atlas-impersonation-profile";
      const current = String(profile.id) === String(currentId);
      button.disabled = current;
      const title = document.createElement("strong");
      title.textContent = profileLabel(profile);
      const email = document.createElement("span");
      email.className = "atlas-impersonation-email";
      email.textContent = profile.email || profile.username || profile.id;
      const badges = document.createElement("span");
      badges.className = "atlas-impersonation-badges";
      for (const r of profile.roleSlugs || []) {
        const badge = document.createElement("span");
        badge.className = "badge atlas-impersonation-role";
        badge.textContent = r;
        badges.append(badge);
      }
      if (!(profile.roleSlugs || []).length) {
        const badge = document.createElement("span");
        badge.className = "badge atlas-impersonation-role";
        badge.textContent =
          profile.roleResolutionStatus === "resolved_empty"
            ? "No roles"
            : "Roles unavailable";
        badges.append(badge);
      }
      if (current) {
        const mark = document.createElement("span");
        mark.className = "badge";
        mark.textContent = "Current identity";
        badges.append(mark);
      }
      button.append(title, email, badges);
      button.addEventListener("click", async () => {
        if (!confirmSwitch(profileLabel(profile))) return;
        captureNavigationHint();
        try {
          await request(API, {
            method: "POST",
            body: JSON.stringify({ profileId: profile.id }),
          });
          location.reload();
        } catch (error) {
          globalThis.alert(error.message);
        }
      });
      host.append(button);
    }
    if (!filtered.length) host.textContent = "No matching profiles.";
  }
  async function openPicker() {
    if (!activeInfo().enabled) return;
    closeDialog();
    returnFocus = document.activeElement;
    const payload = await request(`${API}/profiles`);
    const profiles = (payload.items || []).slice().sort(
      (a, b) =>
        profileLabel(a).localeCompare(profileLabel(b), undefined, {
          sensitivity: "base",
        }) ||
        String(a.email || "").localeCompare(String(b.email || ""), undefined, {
          sensitivity: "base",
        }) ||
        String(a.id).localeCompare(String(b.id)),
    );
    const overlay = document.createElement("div");
    overlay.id = "atlas-impersonation-dialog";
    overlay.className = "atlas-impersonation-overlay";
    overlay.innerHTML =
      '<section class="atlas-impersonation-panel" role="dialog" aria-modal="true" aria-labelledby="atlas-impersonation-title"><header><div><h2 id="atlas-impersonation-title">Switch user profile</h2><p>Choose a persisted profile to test its server-authoritative access.</p></div><button type="button" class="btn" data-close aria-label="Close profile picker">Close</button></header><div class="atlas-impersonation-toolbar"><input type="search" placeholder="Search profiles" aria-label="Search profiles"><div class="atlas-impersonation-role-filters" aria-label="Filter by app role"></div></div><div class="atlas-impersonation-profiles"></div><footer></footer></section>';
    document.body.append(overlay);
    const input = overlay.querySelector("input"),
      filters = overlay.querySelector(".atlas-impersonation-role-filters"),
      host = overlay.querySelector(".atlas-impersonation-profiles");
    const roles = [
      "All",
      ...new Set(profiles.flatMap((p) => p.roleSlugs || [])),
    ].sort((a, b) => (a === "All" ? -1 : b === "All" ? 1 : a.localeCompare(b)));
    let role = "All";
    function refresh() {
      renderCards(host, profiles, payload.currentProfileId, input.value, role);
      [...filters.children].forEach((b) =>
        b.setAttribute("aria-pressed", String(b.textContent === role)),
      );
    }
    for (const r of roles) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "btn small";
      b.textContent = r;
      b.setAttribute("aria-pressed", String(r === "All"));
      b.onclick = () => {
        role = r;
        refresh();
      };
      filters.append(b);
    }
    if (activeInfo().active) {
      const back = document.createElement("button");
      back.type = "button";
      back.className = "btn danger";
      back.textContent = "Return to my Profile";
      back.onclick = async () => {
        if (!confirmSwitch("my profile")) return;
        captureNavigationHint();
        try {
          await request(API, { method: "DELETE" });
          location.reload();
        } catch (error) {
          alert(error.message);
        }
      };
      overlay.querySelector("footer").append(back);
    }
    input.addEventListener("input", refresh);
    overlay.querySelector("[data-close]").onclick = closeDialog;
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) closeDialog();
    });
    overlay.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeDialog();
      if (typeof globalThis.atlasTrapTabKey === "function")
        globalThis.atlasTrapTabKey(
          e,
          overlay.querySelector(".atlas-impersonation-panel"),
        );
    });
    refresh();
    input.focus();
  }
  function updateCountdown() {
    const info = activeInfo();
    if (!info.active || !info.expiresAt) return;
    const remaining = new Date(info.expiresAt).getTime() - Date.now();
    document
      .querySelector("[data-impersonation-countdown]")
      ?.replaceChildren(
        document.createTextNode(
          remaining > 0
            ? `${Math.max(0, Math.floor(remaining / 3600000))}h ${Math.max(0, Math.floor((remaining % 3600000) / 60000))}m remaining`
            : "Expired",
        ),
      );
    if (remaining <= 0) {
      clearInterval(timer);
      location.reload();
      return;
    }
    if (remaining <= 15 * 60 * 1000 && renewalShownFor !== info.expiresAt) {
      renewalShownFor = info.expiresAt;
      if (
        confirm(
          "This impersonation session expires in 15 minutes. Renew it for 24 hours?",
        )
      ) {
        request(`${API}/renew`, { method: "POST" })
          .then((data) => {
            state.currentUser.impersonation.expiresAt = data.expiresAt;
            renewalShownFor = "";
            updateCountdown();
          })
          .catch((error) => {
            alert(error.message);
            location.reload();
          });
      }
    }
  }
  function initialize() {
    const root = document.getElementById("currentUserProfile");
    if (!root) return;
    root.addEventListener("click", () => {
      if (activeInfo().enabled) openPicker().catch((e) => alert(e.message));
    });
    root.addEventListener("keydown", (e) => {
      if (activeInfo().enabled && (e.key === "Enter" || e.key === " ")) {
        e.preventDefault();
        openPicker().catch((x) => alert(x.message));
      }
    });
    timer = setInterval(updateCountdown, 30000);
    setTimeout(updateCountdown, 1000);
  }
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", initialize, { once: true });
  else initialize();
  globalThis.atlasOpenImpersonationPicker = openPicker;
})();
