const form = document.querySelector("#replaceForm");
const result = document.querySelector("#result");
const signedInUser = document.querySelector("#signedInUser");

async function loadCurrentUser() {
  const response = await fetch("/api/me");
  if (!response.ok)
    throw new Error("Could not resolve the signed-in StudioShare user.");
  const user = await response.json();
  signedInUser.textContent = `Signed in as ${user.fullName || user.username} (${user.username})`;
}

async function loadSummary() {
  const response = await fetch("/api/field-library/summary");
  if (!response.ok) throw new Error("Could not load current summary.");
  const summary = await response.json();
  document.querySelector("#rowCount").textContent =
    summary.rowCount.toLocaleString();
  document.querySelector("#sourceCount").textContent =
    summary.sourceCount.toLocaleString();
  document.querySelector("#columnCount").textContent =
    summary.columnCount.toLocaleString();
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = form.querySelector("button");
  button.disabled = true;
  result.textContent = "Validating and replacing...";
  const body = new FormData();
  body.append("file", document.querySelector("#csvFile").files[0]);

  try {
    const response = await fetch("/api/admin/field-library/replace", {
      method: "POST",
      body,
    });
    const payload = await response.json();
    result.textContent = JSON.stringify(payload, null, 2);
    if (!response.ok) throw new Error(payload.error || "Replacement failed.");
    await loadSummary();
    form.reset();
  } catch (error) {
    if (!result.textContent.startsWith("{")) result.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

Promise.all([loadCurrentUser(), loadSummary()]).catch((error) => {
  result.textContent = error.message;
  form.querySelector("button").disabled = true;
});
