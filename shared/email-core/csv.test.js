import { test } from "node:test";
import assert from "node:assert/strict";
import { parseUpload, validateRows } from "./csv.js";

// Root cause of the "Create Batch" regression: once wired to the real backend, the
// exact reported CSV (a single combined "name" column, no first_name/last_name) has
// to import cleanly through this shared parser — it's the one both /email-automation
// and /batches/new now go through.
const REPORTED_CSV = [
  "candidate_id,name,email,phone,batch",
  "B101,Aarav Nair,aarav.nair@example.com,7303803252,November 2026",
  "B102,Isha Kapoor,isha.kapoor@example.com,9876543210,November 2026",
].join("\n");

test("a single combined Name column is split into first_name/last_name", () => {
  const rows = parseUpload(REPORTED_CSV, "candidates.csv");
  assert.equal(rows[0].first_name, "Aarav");
  assert.equal(rows[0].last_name, "Nair");

  const result = validateRows(rows, []);
  assert.equal(result.validCount, 2);
  assert.equal(result.invalidCount, 0);
});

test("existing first_name/last_name columns are unaffected by the name-splitting fallback", () => {
  const csv = [
    "candidate_id,first_name,last_name,email,phone",
    "B201,Rohan,Menon,rohan.menon@example.com,9876500101",
  ].join("\n");
  const rows = parseUpload(csv, "candidates.csv");
  assert.equal(rows[0].first_name, "Rohan");
  assert.equal(rows[0].last_name, "Menon");
});

test("a single-word Name still produces a valid candidate (empty last name)", () => {
  const csv = ["candidate_id,name,email,phone", "B301,Cher,cher@example.com,9876500102"].join("\n");
  const rows = parseUpload(csv, "candidates.csv");
  assert.equal(rows[0].first_name, "Cher");
  assert.equal(rows[0].last_name, "");
  const result = validateRows(rows, []);
  assert.equal(result.validCount, 1);
});

test('"Full Name" / "Candidate Name" header variants are also recognized', () => {
  for (const header of ["Full Name", "Candidate Name"]) {
    const csv = [
      `candidate_id,${header},email,phone`,
      "B401,Meera Iyer,meera.iyer@example.com,9876500103",
    ].join("\n");
    const rows = parseUpload(csv, "candidates.csv");
    assert.equal(rows[0].first_name, "Meera", `expected ${header} to split into first_name`);
    assert.equal(rows[0].last_name, "Iyer");
  }
});
