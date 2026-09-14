import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { openDatabase } from "./driver.js";
import { normalizePhone } from "../services/communication/phoneNumber.js";
import { hashPassword } from "../services/authService.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const dbPath = path.resolve(process.env.DATABASE_PATH || "./data/vanguard.sqlite");
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

let handle = null;

/** Shared database handle — always available after `initDb()` has run. */
export const db = {
  get driver() {
    return handle?.driver;
  },
  exec: (sql) => requireHandle().exec(sql),
  prepare: (sql) => requireHandle().prepare(sql),
  transaction: (fn) => requireHandle().transaction(fn),
};

function requireHandle() {
  if (!handle) throw new Error("Database not initialised — call initDb() first");
  return handle;
}

export async function initDb() {
  handle = await openDatabase(dbPath);
  const schema = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");
  db.exec(schema);
  runMigrations();
  seedTemplates();
  seedTestBatch();
  seedUsersAndTeam();
  backfillCommunicationProvider();
  backfillPhoneNumbers();
  return dbPath;
}

/** Idempotent ADD COLUMN migrations for databases created before a schema change. */
function runMigrations() {
  const addColumn = (table, ddl) => {
    try {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
    } catch {
      // Column already exists — no-op.
    }
  };
  addColumn("candidates", "source TEXT NOT NULL DEFAULT 'CSV'");
  addColumn("candidates", "phone_e164 TEXT");
  addColumn("reminder_schedules", "execution_mode TEXT NOT NULL DEFAULT 'NOTIFY_RECRUITER'");
  addColumn("reminder_schedules", "channels TEXT NOT NULL DEFAULT 'EMAIL'");
  addColumn("email_templates", "is_system INTEGER NOT NULL DEFAULT 0");
  addColumn("email_communications", "template_name TEXT");
  addColumn("email_communications", "provider TEXT NOT NULL DEFAULT 'GMAIL'");
  addColumn("email_communications", "provider_message_id TEXT");
  addColumn("email_communications", "error_code TEXT");
  addColumn("email_communications", "error_message TEXT");
  addColumn("candidates", "assigned_to_user_id TEXT");
  addColumn("candidates", "bgv_client_status TEXT NOT NULL DEFAULT 'PENDING'");
  addColumn("candidates", "bgv_ey_status TEXT NOT NULL DEFAULT 'PENDING'");
  addColumn("candidates", "overall_bgv_status TEXT NOT NULL DEFAULT 'NOT_READY'");
  addColumn("candidates", "communication_medium TEXT NOT NULL DEFAULT 'EMAIL'");
  addColumn("candidates", "remarks TEXT");
  addColumn("candidates", "documents_status TEXT NOT NULL DEFAULT 'PENDING'");
  addColumn("candidates", "next_action TEXT");
  addColumn("candidates", "education TEXT");
  addColumn("candidates", "highest_qualification TEXT");
  addColumn("candidates", "mca TEXT");
  addColumn("candidates", "graduation TEXT");
  addColumn("candidates", "previous_employer TEXT");
  addColumn("candidates", "experience TEXT");
}

/** Databases created before the `provider` column existed default every row to EMAIL/GMAIL. */
function backfillCommunicationProvider() {
  db.exec(
    `UPDATE email_communications SET provider='GMAIL' WHERE channel='EMAIL' AND (provider IS NULL OR provider='')`,
  );
}

/** Normalizes any candidate phone numbers stored before phone_e164 existed. */
function backfillPhoneNumbers() {
  const rows = db
    .prepare(
      `SELECT id, phone FROM candidates WHERE phone IS NOT NULL AND phone != '' AND (phone_e164 IS NULL OR phone_e164 = '')`,
    )
    .all();
  if (!rows.length) return;
  const update = db.prepare(`UPDATE candidates SET phone_e164 = ? WHERE id = ?`);
  for (const row of rows) {
    const normalized = normalizePhone(row.phone);
    if (normalized) update.run(normalized, row.id);
  }
}

export function uid(prefix) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export function log(message, { level = "INFO", source = "SYSTEM", detail = null } = {}) {
  db.prepare(
    `INSERT INTO automation_logs (id, level, source, message, detail) VALUES (?,?,?,?,?)`,
  ).run(uid("log"), level, source, message, detail);
}

const WELCOME_BODY = `Hi {{first_name}},

Welcome to the ABC onboarding process.

We are excited to have you join us.

Please complete the required onboarding steps using the link below:

{{verification_link}}

Joining Date: {{joining_date}}
Location: {{location}}
Candidate ID: {{candidate_id}}

Please complete the required steps within the specified timeline.

Regards,
ABC Recruitment Team`;

const REMINDER_BODY = `Hi {{first_name}},

This is a reminder that your onboarding verification for ABC is still pending.

Please complete it using the link below:

{{verification_link}}

Joining Date: {{joining_date}}

If you have already completed this step, please ignore this message.

Regards,
ABC Recruitment Team`;

function seedTemplates() {
  const rows = [
    {
      id: "tpl-welcome",
      name: "ABC Welcome Email",
      category: "Welcome",
      subject: "Welcome to the ABC Onboarding Process",
      body: WELCOME_BODY,
    },
    {
      id: "tpl-verification-reminder",
      name: "Verification Reminder Email",
      category: "Reminder",
      subject: "Reminder: complete your ABC onboarding verification",
      body: REMINDER_BODY,
    },
  ];
  const insert = db.prepare(
    `INSERT OR IGNORE INTO email_templates (id, name, category, subject, body, active, is_system) VALUES (@id, @name, @category, @subject, @body, 1, 1)`,
  );
  for (const row of rows) insert.run(row);
  // Guarantee the seeded templates stay protected even if this row already existed
  // before the is_system column was introduced.
  db.prepare(
    `UPDATE email_templates SET is_system=1 WHERE id IN ('tpl-welcome','tpl-verification-reminder')`,
  ).run();
}

function seedTestBatch() {
  const existing = db.prepare(`SELECT id FROM batches WHERE id = 'batch-test'`).get();
  if (existing) return;
  db.prepare(
    `INSERT INTO batches (id, name, joining_date, project, location, owner, status)
     VALUES ('batch-test', 'Test Batch (October 2026)', '2026-10-15', 'ABC', 'Gurugram', 'Local Recruiter', 'IMPORTED')`,
  ).run();

  const insert = db.prepare(
    `INSERT INTO candidates (id, candidate_id, batch_id, first_name, last_name, email, joining_date, location, verification_link, verification_status)
     VALUES (@id, @candidate_id, 'batch-test', @first_name, @last_name, @email, '2026-10-15', 'Gurugram', @verification_link, @verification_status)`,
  );
  insert.run({
    id: "cand-v001",
    candidate_id: "V001",
    first_name: "Rahul",
    last_name: "Sharma",
    email: "tkkaur1905@gmail.com",
    verification_link: "https://example.com/verification/V001",
    verification_status: "NOT_STARTED",
  });
  insert.run({
    id: "cand-v002",
    candidate_id: "V002",
    first_name: "Priya",
    last_name: "Verma",
    email: "rehatkaur1905@gmail.com",
    verification_link: "https://example.com/verification/V002",
    verification_status: "NOT_STARTED",
  });
}

/**
 * Seeds the single prototype team + its 6 users (idempotent — INSERT OR IGNORE
 * on fixed ids). Default password for every seeded user is `<username>@123`
 * (e.g. amit@123, riya@123) — documented in README.md. Purely additive: never
 * touches candidates, batches, templates or communications.
 */
function seedUsersAndTeam() {
  const teamId = "team-bgv-ops";
  db.prepare(`INSERT OR IGNORE INTO teams (id, name, manager_id, signature) VALUES (?,?,?,?)`).run(
    teamId,
    "BGV Operations Team",
    "user-amit",
    "Regards,\nAmit Soni",
  );

  const users = [
    { id: "user-amit", name: "Amit Soni", username: "amit", role: "MANAGER" },
    { id: "user-riya", name: "Riya", username: "riya", role: "TEAM_MEMBER" },
    { id: "user-parul", name: "Parul", username: "parul", role: "TEAM_MEMBER" },
    { id: "user-abhay", name: "Abhay", username: "abhay", role: "TEAM_MEMBER" },
    { id: "user-raman", name: "Raman", username: "raman", role: "TEAM_MEMBER" },
    { id: "user-sidharth", name: "Sidharth", username: "sidharth", role: "TEAM_MEMBER" },
  ];
  const insert = db.prepare(
    `INSERT OR IGNORE INTO users (id, name, username, password_hash, role, team_id) VALUES (@id, @name, @username, @password_hash, @role, @team_id)`,
  );
  for (const u of users) {
    insert.run({
      ...u,
      password_hash: hashPassword(`${u.username}@123`),
      team_id: teamId,
    });
  }
}
