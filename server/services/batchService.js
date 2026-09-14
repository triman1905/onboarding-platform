import { db, log, uid } from "../db/database.js";
import { EMAIL_RE } from "../utils/csvParser.js";
import { normalizePhone } from "./communication/phoneNumber.js";

export function listBatches() {
  return db
    .prepare(
      `SELECT b.*,
              (SELECT COUNT(*) FROM candidates c WHERE c.batch_id = b.id) AS candidate_count,
              (SELECT COUNT(*) FROM candidates c WHERE c.batch_id = b.id AND c.overall_bgv_status = 'INDUCTION_READY') AS induction_ready_count,
              (SELECT COUNT(*) FROM email_communications e WHERE e.batch_id = b.id AND e.status = 'SENT') AS emails_sent
       FROM batches b ORDER BY b.created_at DESC`,
    )
    .all();
}

export function getBatch(id) {
  const batch = db.prepare(`SELECT * FROM batches WHERE id = ?`).get(id);
  if (!batch) return null;
  return { ...batch, candidates: listCandidates({ batchId: id }) };
}

export function listCandidates({ batchId, search, assignedToUserId } = {}) {
  const clauses = [];
  const params = [];
  if (batchId) {
    clauses.push("c.batch_id = ?");
    params.push(batchId);
  }
  if (assignedToUserId) {
    clauses.push("c.assigned_to_user_id = ?");
    params.push(assignedToUserId);
  }
  if (search) {
    clauses.push(
      "(c.first_name LIKE ? OR c.last_name LIKE ? OR c.email LIKE ? OR c.candidate_id LIKE ?)",
    );
    const like = `%${search}%`;
    params.push(like, like, like, like);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  return db
    .prepare(
      `SELECT c.*,
              (SELECT a.field FROM candidate_audit_log a WHERE a.candidate_id = c.id ORDER BY a.changed_at DESC LIMIT 1) AS last_action_field,
              (SELECT a.new_value FROM candidate_audit_log a WHERE a.candidate_id = c.id ORDER BY a.changed_at DESC LIMIT 1) AS last_action_value,
              (SELECT a.changed_at FROM candidate_audit_log a WHERE a.candidate_id = c.id ORDER BY a.changed_at DESC LIMIT 1) AS last_activity_at,
              (SELECT COALESCE(u.name, a.changed_by) FROM candidate_audit_log a LEFT JOIN users u ON u.id = a.changed_by WHERE a.candidate_id = c.id ORDER BY a.changed_at DESC LIMIT 1) AS last_activity_by
       FROM candidates c ${where}
       ORDER BY c.candidate_id ASC`,
    )
    .all(...params);
}

export function getCandidate(id) {
  return db.prepare(`SELECT * FROM candidates WHERE id = ? OR candidate_id = ?`).get(id, id);
}

export function existingEmails() {
  return db
    .prepare(`SELECT email FROM candidates`)
    .all()
    .map((r) => r.email);
}

function insertBatchRow({ name, joiningDate, project, location, owner, status = "IMPORTED" }) {
  const batchId = uid("batch");
  db.prepare(
    `INSERT INTO batches (id, name, joining_date, project, location, owner, status) VALUES (?,?,?,?,?,?,?)`,
  ).run(
    batchId,
    name || `Batch ${new Date().toISOString().slice(0, 10)}`,
    joiningDate || null,
    project || "ABC",
    location || null,
    owner || "Local Recruiter",
    status,
  );
  return batchId;
}

export function importBatch({ name, joiningDate, project, location, owner, rows }) {
  const insertCandidate = db.prepare(
    `INSERT INTO candidates (id, candidate_id, batch_id, first_name, last_name, email, phone, phone_e164, department, role, joining_date, location, verification_link, verification_status, source, education, highest_qualification, mca, graduation, previous_employer, experience)
     VALUES (@id, @candidate_id, @batch_id, @first_name, @last_name, @email, @phone, @phone_e164, @department, @role, @joining_date, @location, @verification_link, 'NOT_STARTED', 'CSV', @education, @highest_qualification, @mca, @graduation, @previous_employer, @experience)`,
  );

  let batchId;
  const run = db.transaction(() => {
    batchId = insertBatchRow({ name, joiningDate, project, location, owner });
    for (const row of rows) {
      insertCandidate.run({
        id: uid("cand"),
        candidate_id: row.candidate_id,
        batch_id: batchId,
        first_name: row.first_name,
        last_name: row.last_name || "",
        email: row.email,
        phone: row.phone || null,
        phone_e164: normalizePhone(row.phone),
        department: row.department || null,
        role: row.role || null,
        joining_date: row.joining_date || joiningDate || null,
        location: row.location || location || null,
        verification_link: row.verification_link || null,
        education: row.education || null,
        highest_qualification: row.highest_qualification || null,
        mca: row.mca || null,
        graduation: row.graduation || null,
        previous_employer: row.previous_employer || null,
        experience: row.experience || null,
      });
    }
  });
  run();

  log(`Imported batch "${name}" with ${rows.length} candidates`, { source: "IMPORT" });
  return getBatch(batchId);
}

/** Creates an empty batch with no candidates — used by the manual candidate entry flow. */
export function createBatch({ name, joiningDate, project, location, owner }) {
  if (!name || !String(name).trim()) throw new Error("Batch name is required");
  const batchId = insertBatchRow({
    name,
    joiningDate,
    project,
    location,
    owner,
    status: "IMPORTED",
  });
  log(`Batch "${name}" created`, { source: "IMPORT" });
  return getBatch(batchId);
}

/**
 * Hard-deletes a batch and everything that belongs exclusively to it.
 *
 * Safe because every related table cascades from `batches`/`candidates` via
 * `ON DELETE CASCADE` FKs (enforced — `PRAGMA foreign_keys = ON` in driver.js):
 *   batches -> candidates -> email_communications, candidate_audit_log
 *   batches -> reminder_schedules
 * Assignment (`assigned_to_user_id`), BGV status and remarks are columns on
 * `candidates` itself, not separate tables, so they cascade with the candidate
 * row — there is nothing that outlives the batch to orphan.
 */
export function deleteBatch(id) {
  const batch = db.prepare(`SELECT * FROM batches WHERE id = ?`).get(id);
  if (!batch) return null;
  const candidateCount = db
    .prepare(`SELECT COUNT(*) AS n FROM candidates WHERE batch_id = ?`)
    .get(id).n;

  const run = db.transaction(() => {
    db.prepare(`DELETE FROM batches WHERE id = ?`).run(id);
  });
  run();

  log(`Batch "${batch.name}" deleted (${candidateCount} candidate(s) removed)`, {
    source: "IMPORT",
  });
  return { id, name: batch.name, candidatesRemoved: candidateCount };
}

export function setVerificationStatus(candidateId, status) {
  db.prepare(
    `UPDATE candidates SET verification_status = ?, updated_at = datetime('now') WHERE id = ?`,
  ).run(status, candidateId);
  return getCandidate(candidateId);
}

/** Manually adds a single candidate to an existing batch. Validates the same shape the CSV importer enforces. */
export function createCandidate({
  batchId,
  candidateId,
  firstName,
  lastName,
  email,
  phone,
  joiningDate,
  location,
  department,
  role,
  verificationLink,
  verificationStatus,
  education,
  highestQualification,
  mca,
  graduation,
  previousEmployer,
  experience,
}) {
  if (!batchId) throw new Error("A batch is required");
  const batch = db.prepare(`SELECT id FROM batches WHERE id = ?`).get(batchId);
  if (!batch) throw new Error("Batch not found");

  const trimmed = (v) => (typeof v === "string" ? v.trim() : v);
  candidateId = trimmed(candidateId);
  firstName = trimmed(firstName);
  lastName = trimmed(lastName);
  email = trimmed(email);
  location = trimmed(location);
  joiningDate = trimmed(joiningDate);

  if (!candidateId) throw new Error("Candidate ID is required");
  if (!firstName) throw new Error("First name is required");
  if (!lastName) throw new Error("Last name is required");
  if (!email) throw new Error("Email is required");
  if (!EMAIL_RE.test(email)) throw new Error("Please enter a valid email address");
  if (!joiningDate) throw new Error("Joining date is required");
  if (!location) throw new Error("Location is required");

  const emailExists = db
    .prepare(`SELECT id FROM candidates WHERE lower(email) = lower(?)`)
    .get(email);
  if (emailExists) throw new Error("This email already exists in another candidate record.");

  const idExists = db
    .prepare(`SELECT id FROM candidates WHERE batch_id = ? AND candidate_id = ?`)
    .get(batchId, candidateId);
  if (idExists) throw new Error("This candidate ID already exists in this batch.");

  const id = uid("cand");
  db.prepare(
    `INSERT INTO candidates (id, candidate_id, batch_id, first_name, last_name, email, phone, phone_e164, department, role, joining_date, location, verification_link, verification_status, source, education, highest_qualification, mca, graduation, previous_employer, experience)
     VALUES (@id, @candidate_id, @batch_id, @first_name, @last_name, @email, @phone, @phone_e164, @department, @role, @joining_date, @location, @verification_link, @verification_status, 'MANUAL', @education, @highest_qualification, @mca, @graduation, @previous_employer, @experience)`,
  ).run({
    id,
    candidate_id: candidateId,
    batch_id: batchId,
    first_name: firstName,
    last_name: lastName,
    email,
    phone: phone || null,
    phone_e164: normalizePhone(phone),
    department: department || null,
    role: role || null,
    joining_date: joiningDate,
    location,
    verification_link: verificationLink || null,
    verification_status: verificationStatus || "NOT_STARTED",
    education: education || null,
    highest_qualification: highestQualification || null,
    mca: mca || null,
    graduation: graduation || null,
    previous_employer: previousEmployer || null,
    experience: experience || null,
  });

  log(`Candidate ${candidateId} (${firstName} ${lastName}) added manually`, { source: "IMPORT" });
  return getCandidate(id);
}
