import { expect } from "@playwright/test";

export function isAuditCreateResponse(response) {
  const url = new URL(response.url());
  return (
    response.request().method() === "POST" && url.pathname === "/api/audits"
  );
}

export function isAuditSaveResponse(response, auditId) {
  const url = new URL(response.url());
  return (
    response.request().method() === "PUT" &&
    url.pathname === `/api/audits/${encodeURIComponent(auditId)}`
  );
}

export async function responseJson(response) {
  expect(
    response.ok(),
    `${response.request().method()} ${new URL(response.url()).pathname}`,
  ).toBeTruthy();
  return response.json();
}

export async function getAudit(request, auditId) {
  const path = `/api/audits/${encodeURIComponent(auditId)}`;
  const response = await request.get(path);
  expect(
    response.ok(),
    `GET ${path} returned ${response.status()} ${response.statusText()}`,
  ).toBeTruthy();
  return response.json();
}

export async function listAuditRevisions(request, auditId) {
  const response = await request.get(
    `/api/audits/${encodeURIComponent(auditId)}/revisions`,
  );
  expect(response.ok()).toBeTruthy();
  return response.json();
}

export function auditPayloadDocument(payload) {
  return payload.audit || payload.document || payload;
}

export function revisionMetadata(payload) {
  return (
    payload.revision ||
    payload.currentRevision ||
    payload.current_revision ||
    {}
  );
}
