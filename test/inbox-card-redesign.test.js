import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const js = fs.readFileSync(
    new URL("../js/25-inbox.js", import.meta.url),
    "utf8",
  ),
  css = fs.readFileSync(new URL("../css/inbox.css", import.meta.url), "utf8"),
  html = fs.readFileSync(
    new URL("../sections/inbox.html", import.meta.url),
    "utf8",
  );
test("Inbox cards expose sender status and accessible unread state", () => {
  assert.match(js, /senderUsername/);
  assert.match(js, /Unread message/);
  assert.match(js, /inbox-workflow-badge/);
  assert.match(html, /atlasInboxCounts/);
});
test("Inbox grid is responsive and vertically flexible", () => {
  assert.match(css, /repeat\(auto-fit/);
  assert.match(css, /min-block-size: 17rem/);
  assert.match(css, /overflow-wrap: anywhere/);
  assert.match(css, /forced-colors/);
});

test("Inbox cards expose authoritative review counts and display-only terminology", () => {
  assert.match(js, /function reviewCounts/);
  assert.match(js, /counts\.requestChanges/);
  assert.match(js, /counts\.needsDiscussion/);
  assert.match(js, /counts\.reviewRequired/);
  assert.match(js, /function workflowLabel/);
  assert.match(js, /Submitted for Review/);
  assert.match(js, /Changes Requested/);
});
