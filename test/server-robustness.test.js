import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { cookieValue, refreshAccessToken } from "../src/studioshare-client.js";

const malformed = { headers: { cookie: "theme=dark; access_token=%E0%A4%A" } };

test("a malformed access_token cookie reads as signed out instead of throwing", () => {
  assert.equal(cookieValue(malformed, "access_token"), "");
  assert.equal(refreshAccessToken(malformed), "");
});

test("token readers still decode cookies and prefer bearer tokens", () => {
  const cookie = { headers: { cookie: "access_token=a%2Bb" } };
  assert.equal(cookieValue(cookie, "access_token"), "a+b");
  assert.equal(refreshAccessToken(cookie), "a+b");
  assert.equal(
    refreshAccessToken({
      headers: { authorization: "Bearer xyz", cookie: "access_token=a" },
    }),
    "xyz",
  );
});

test("the database pool handles idle client errors so the process survives", () => {
  const source = readFileSync(new URL("../server.js", import.meta.url), "utf8");
  assert.match(source, /pool\.on\("error"/);
});

test("Excel features lazy-load ExcelJS instead of requiring it preloaded", () => {
  const jsDir = new URL("../js/", import.meta.url);
  for (const file of readdirSync(jsDir).filter((name) =>
    name.endsWith(".js"),
  )) {
    if (file === "00-exceljs-loader.js") continue;
    const source = readFileSync(new URL(file, jsDir), "utf8");
    assert.doesNotMatch(source, /if \(!window\.ExcelJS\)/, file);
  }
});
