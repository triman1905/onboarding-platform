import { test } from "node:test";
import assert from "node:assert/strict";
import { EMAIL_RE, analyseRows, normalizeIndianPhone, parseDelimited, resolveHeader } from "./csvImport.js";

const VALID_ROWS_CSV = [
  "candidate_id,name,email,phone,batch",
  "V001,Aarav Nair,trimankaur1905@gmail.com,7303803252,October 2026",
  "V002,Isha Kapoor,aakashimportant15@gmail.com,+917303803252,October 2026",
  "V003,Rohan Menon,03917702723_cse@vipstc.edu.in,919876500101,October 2026",
  "V004,Sara Shah,sara.shah@example.com,+91 9876500101,October 2026",
  "V005,Kabir Rao,kabir.rao@example.com,9876543210,October 2026",
  "V006,Meera Iyer,meera.iyer@example.com,8123456789,October 2026",
  "V007,Nikhil Joshi,nikhil.joshi@example.com,7000000001,October 2026",
  "V008,Divya Rao,divya.rao@example.com,6123456789,October 2026",
  "V009,Arjun Singh,arjun.singh@example.com,9000000009,October 2026",
  "V010,Pooja Verma,pooja.verma@example.com,9111111111,October 2026",
].join("\n");

// 1. email + phone (the exact header shape reported as broken)
test("candidate_id,name,email,phone,batch — 10 valid rows", () => {
  const rows = parseDelimited(VALID_ROWS_CSV);
  const result = analyseRows(rows);
  assert.equal(result.valid.length, 10);
  assert.equal(result.missingEmail, 0);
  assert.equal(result.invalidPhone, 0);
  assert.equal(result.duplicates, 0);
  // Name is split into First/Last for batch creation (useVanguard.createBatch).
  assert.equal(result.valid[0]["First Name"], "Aarav");
  assert.equal(result.valid[0]["Last Name"], "Nair");
});

// 2. email_address + phone_number
test("candidate_id,name,email_address,phone_number,batch — recognized as aliases", () => {
  const csv = [
    "candidate_id,name,email_address,phone_number,batch",
    "V101,Test User,test.user@example.com,7303803252,October 2026",
  ].join("\n");
  const rows = parseDelimited(csv);
  assert.equal(Object.keys(rows[0]).sort().join(","), "Batch,Candidate ID,Email,Name,Phone");
  const result = analyseRows(rows);
  assert.equal(result.valid.length, 1);
});

// 3. "Email Address" + "Mobile Number" (title-case, spaced headers)
test('"Candidate ID","Name","Email Address","Mobile Number","Batch" — recognized as aliases', () => {
  const csv = [
    "Candidate ID,Name,Email Address,Mobile Number,Batch",
    "V102,Another User,another.user@example.com,9876500101,October 2026",
  ].join("\n");
  const rows = parseDelimited(csv);
  const result = analyseRows(rows);
  assert.equal(result.valid.length, 1);
  assert.equal(result.valid[0]["Phone"], "+919876500101");
});

test("header normalization: Email Address / email_address / Mobile Number all resolve to canonical fields", () => {
  assert.equal(resolveHeader("Email Address"), "Email");
  assert.equal(resolveHeader("email_address"), "Email");
  assert.equal(resolveHeader("Mobile Number"), "Phone");
  assert.equal(resolveHeader("Phone"), "Phone");
  assert.equal(resolveHeader("Candidate ID"), "Candidate ID");
  assert.equal(resolveHeader("candidateId"), "Candidate ID");
  assert.equal(resolveHeader("MCA"), "MCA");
  assert.equal(resolveHeader("Batch Name"), "Batch");
});

// 4. 10-digit Indian phone
test("10-digit Indian mobile number normalizes to E.164", () => {
  assert.equal(normalizeIndianPhone("7303803252"), "+917303803252");
});

// 5. +91 Indian phone (and other already-prefixed / spaced forms)
test("already-prefixed Indian numbers normalize to E.164", () => {
  assert.equal(normalizeIndianPhone("+917303803252"), "+917303803252");
  assert.equal(normalizeIndianPhone("919876500101"), "+919876500101");
  assert.equal(normalizeIndianPhone("+91 9876500101"), "+919876500101");
});

// 6. invalid email
test("invalid email is rejected", () => {
  assert.equal(EMAIL_RE.test("not-an-email"), false);
  assert.equal(EMAIL_RE.test("missing-domain@"), false);
  assert.equal(EMAIL_RE.test(""), false);

  const csv = [
    "candidate_id,name,email,phone,batch",
    "V201,Bad Email,not-an-email,7303803252,October 2026",
  ].join("\n");
  const result = analyseRows(parseDelimited(csv));
  assert.equal(result.valid.length, 0);
  assert.equal(result.missingEmail, 1);
});

// 7. invalid phone
test("invalid phone number is rejected", () => {
  assert.equal(normalizeIndianPhone("12345"), null);
  assert.equal(normalizeIndianPhone("0000000000"), null); // not a valid [6-9] mobile prefix
  assert.equal(normalizeIndianPhone(""), null);

  const csv = [
    "candidate_id,name,email,phone,batch",
    "V202,Bad Phone,bad.phone@example.com,12345,October 2026",
  ].join("\n");
  const result = analyseRows(parseDelimited(csv));
  assert.equal(result.valid.length, 0);
  assert.equal(result.invalidPhone, 1);
});

test("valid real-world email formats", () => {
  for (const email of [
    "trimankaur1905@gmail.com",
    "aakashimportant15@gmail.com",
    "03917702723_cse@vipstc.edu.in",
  ]) {
    assert.equal(EMAIL_RE.test(email), true, `expected ${email} to be valid`);
  }
});

test("duplicate candidate IDs are flagged and excluded", () => {
  const csv = [
    "candidate_id,name,email,phone,batch",
    "V301,First,first@example.com,7303803252,October 2026",
    "V301,Second,second@example.com,7303803253,October 2026",
  ].join("\n");
  const result = analyseRows(parseDelimited(csv));
  assert.equal(result.duplicates, 1);
  assert.equal(result.valid.length, 1);
});
