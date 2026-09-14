import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

// DATABASE_PATH must be set before server/db/database.js is ever imported —
// its module-level `dbPath` is resolved once, at import time — so this test
// run never touches the real data/vanguard.sqlite.
const tmpDb = path.join(os.tmpdir(), `vanguard-rbac-test-${Date.now()}.sqlite`);
process.env.DATABASE_PATH = tmpDb;

let server;
let baseUrl;

before(async () => {
  const { initDb } = await import("../db/database.js");
  const { createApp } = await import("../app.js");
  await initDb();
  const app = createApp();
  server = createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  for (const suffix of ["", "-shm", "-wal"]) {
    try {
      fs.unlinkSync(tmpDb + suffix);
    } catch {
      // best-effort cleanup
    }
  }
});

async function api(path, { token, method = "GET", body } = {}) {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, body: json };
}

async function login(username, password) {
  const res = await api("/api/auth/login", { method: "POST", body: { username, password } });
  assert.equal(res.status, 200, `login as ${username} should succeed`);
  return res.body.token;
}

let amitToken, riyaToken, parulToken;

test("login: all 6 seeded users can authenticate with <username>@123", async () => {
  amitToken = await login("amit", "amit@123");
  riyaToken = await login("riya", "riya@123");
  parulToken = await login("parul", "parul@123");
  await login("abhay", "abhay@123");
  await login("raman", "raman@123");
  await login("sidharth", "sidharth@123");
});

test("login: wrong password is rejected", async () => {
  const res = await api("/api/auth/login", {
    method: "POST",
    body: { username: "amit", password: "wrong" },
  });
  assert.equal(res.status, 401);
});

test("manager candidate list contains all seeded candidates", async () => {
  const res = await api("/api/candidates", { token: amitToken });
  assert.equal(res.status, 200);
  const ids = res.body.map((c) => c.candidate_id);
  assert.ok(ids.includes("V001") && ids.includes("V002"));
});

test("team member sees nothing before assignment", async () => {
  const res = await api("/api/candidates", { token: riyaToken });
  assert.equal(res.status, 200);
  assert.equal(res.body.length, 0);
});

test("team member cannot assign candidates (403), manager can (200)", async () => {
  const denied = await api("/api/candidates/assign/bulk", {
    token: riyaToken,
    method: "POST",
    body: { candidateIds: ["cand-v001"], teamMemberId: "user-riya" },
  });
  assert.equal(denied.status, 403);

  const allowed = await api("/api/candidates/assign/bulk", {
    token: amitToken,
    method: "POST",
    body: { candidateIds: ["cand-v001"], teamMemberId: "user-riya" },
  });
  assert.equal(allowed.status, 200);
  assert.equal(allowed.body.assigned, 1);
});

test("after assignment: assignee sees the candidate, other team members don't", async () => {
  const riyaList = await api("/api/candidates", { token: riyaToken });
  assert.equal(riyaList.body.length, 1);
  assert.equal(riyaList.body[0].candidate_id, "V001");

  const parulList = await api("/api/candidates", { token: parulToken });
  assert.equal(parulList.body.length, 0);
});

test("candidate access is 403 for a non-owning team member, 200 for the owner and the manager", async () => {
  const asParul = await api("/api/candidates/cand-v001", { token: parulToken });
  assert.equal(asParul.status, 403);

  const asRiya = await api("/api/candidates/cand-v001", { token: riyaToken });
  assert.equal(asRiya.status, 200);

  const asAmit = await api("/api/candidates/cand-v001", { token: amitToken });
  assert.equal(asAmit.status, 200);
});

test("BGV precedence: DISCREPANT > INDUCTION_READY > IN_PROGRESS > NOT_READY", async () => {
  const setBgv = (field, value) =>
    api(`/api/candidates/cand-v001/bgv`, {
      token: riyaToken,
      method: "PATCH",
      body: { field, value },
    });

  // CLEAR + CLEAR -> INDUCTION_READY
  await setBgv("bgv_client_status", "CLEAR");
  let r = await setBgv("bgv_ey_status", "CLEAR");
  assert.equal(r.status, 200);
  assert.equal(r.body.overall_bgv_status, "INDUCTION_READY");

  // CLEAR + PENDING -> NOT_READY
  r = await setBgv("bgv_ey_status", "PENDING");
  assert.equal(r.body.overall_bgv_status, "NOT_READY");

  // IN_PROGRESS + CLEAR -> IN_PROGRESS
  await setBgv("bgv_ey_status", "CLEAR");
  r = await setBgv("bgv_client_status", "IN_PROGRESS");
  assert.equal(r.body.overall_bgv_status, "IN_PROGRESS");

  // DISCREPANT + CLEAR -> DISCREPANT
  r = await setBgv("bgv_client_status", "DISCREPANT");
  assert.equal(r.body.overall_bgv_status, "DISCREPANT");

  // CLEAR + DISCREPANT -> DISCREPANT
  await setBgv("bgv_client_status", "CLEAR");
  r = await setBgv("bgv_ey_status", "DISCREPANT");
  assert.equal(r.body.overall_bgv_status, "DISCREPANT");

  // PENDING + PENDING -> NOT_READY
  await setBgv("bgv_client_status", "PENDING");
  r = await setBgv("bgv_ey_status", "PENDING");
  assert.equal(r.body.overall_bgv_status, "NOT_READY");
});

test("team member cannot update BGV for a candidate they don't own", async () => {
  const res = await api("/api/candidates/cand-v001/bgv", {
    token: parulToken,
    method: "PATCH",
    body: { field: "bgv_client_status", value: "CLEAR" },
  });
  assert.equal(res.status, 403);
});

test("remarks + audit: an edit is persisted and shows up in the audit trail", async () => {
  const patch = await api("/api/candidates/cand-v001/remarks", {
    token: riyaToken,
    method: "PATCH",
    body: { remarks: "Client BGV clarification requested." },
  });
  assert.equal(patch.status, 200);
  assert.equal(patch.body.remarks, "Client BGV clarification requested.");

  const audit = await api("/api/candidates/cand-v001/audit", { token: riyaToken });
  assert.equal(audit.status, 200);
  assert.ok(audit.body.some((row) => row.field === "remarks"));
  assert.ok(audit.body.some((row) => row.field === "assigned_to_user_id"));

  const auditAsOther = await api("/api/candidates/cand-v001/audit", { token: parulToken });
  assert.equal(auditAsOther.status, 403);
});

test("batch creation and CSV import are manager-only", async () => {
  const deniedCreate = await api("/api/batches", {
    token: riyaToken,
    method: "POST",
    body: { name: "Should be blocked" },
  });
  assert.equal(deniedCreate.status, 403);

  const allowedCreate = await api("/api/batches", {
    token: amitToken,
    method: "POST",
    body: { name: "RBAC test batch" },
  });
  assert.equal(allowedCreate.status, 200);
  const batchId = allowedCreate.body.id;

  const deniedImport = await api("/api/batches/import", {
    token: riyaToken,
    method: "POST",
    body: { name: "x", rows: [] },
  });
  assert.equal(deniedImport.status, 403);

  // Manager passes the RBAC gate — reaches the route body (400 for "no valid
  // rows", not 403), proving the permission check itself doesn't block them.
  const managerImportAttempt = await api("/api/batches/import", {
    token: amitToken,
    method: "POST",
    body: { name: "x", rows: [] },
  });
  assert.notEqual(managerImportAttempt.status, 403);

  const deniedDelete = await api(`/api/batches/${batchId}`, {
    token: riyaToken,
    method: "DELETE",
  });
  assert.equal(deniedDelete.status, 403);

  const allowedDelete = await api(`/api/batches/${batchId}`, {
    token: amitToken,
    method: "DELETE",
  });
  assert.equal(allowedDelete.status, 200);
});

test("CSV assignment validation: exact error wording, manager-only", async () => {
  const denied = await api("/api/candidates/assign/csv/validate", {
    token: riyaToken,
    method: "POST",
    body: { rows: [{ candidate_id: "V002", assigned_to: "parul" }] },
  });
  assert.equal(denied.status, 403);

  const res = await api("/api/candidates/assign/csv/validate", {
    token: amitToken,
    method: "POST",
    body: {
      rows: [
        { candidate_id: "V002", assigned_to: "parul" },
        { candidate_id: "B999", assigned_to: "parul" },
        { candidate_id: "V002", assigned_to: "nobody" },
        { candidate_id: "", assigned_to: "parul" },
        { candidate_id: "V002", assigned_to: "" },
      ],
    },
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.validCount, 1);
  assert.equal(res.body.invalidCount, 4);
  const reasons = res.body.invalid.flatMap((r) => r.reasons);
  assert.ok(reasons.includes('Candidate "B999" not found'));
  assert.ok(reasons.includes('"nobody" is not a member of your team'));
  assert.ok(reasons.includes("Missing candidate_id"));
  assert.ok(reasons.includes("Missing assigned_to"));
});

test("dashboard summary is role-scoped and reflects real data", async () => {
  const managerSummary = await api("/api/dashboard/summary", { token: amitToken });
  assert.equal(managerSummary.status, 200);
  assert.ok(managerSummary.body.totalCandidates >= 2);

  const riyaSummary = await api("/api/dashboard/summary", { token: riyaToken });
  assert.equal(riyaSummary.status, 200);
  assert.equal(riyaSummary.body.totalCandidates, 1);

  const parulSummary = await api("/api/dashboard/summary", { token: parulToken });
  assert.equal(parulSummary.body.totalCandidates, 0);
});
