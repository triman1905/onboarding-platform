-- Local SQLite schema for the ABC / Vanguard email automation MVP.

CREATE TABLE IF NOT EXISTS batches (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  joining_date TEXT,
  project TEXT,
  location TEXT,
  owner TEXT,
  status TEXT NOT NULL DEFAULT 'IMPORTED',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS candidates (
  id TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL,
  batch_id TEXT REFERENCES batches(id) ON DELETE CASCADE,
  first_name TEXT NOT NULL,
  last_name TEXT,
  email TEXT NOT NULL,
  phone TEXT,
  phone_e164 TEXT,
  department TEXT,
  role TEXT,
  joining_date TEXT,
  location TEXT,
  verification_link TEXT,
  verification_status TEXT NOT NULL DEFAULT 'NOT_STARTED',
  source TEXT NOT NULL DEFAULT 'CSV',
  assigned_to_user_id TEXT,
  bgv_client_status TEXT NOT NULL DEFAULT 'PENDING',
  bgv_ey_status TEXT NOT NULL DEFAULT 'PENDING',
  overall_bgv_status TEXT NOT NULL DEFAULT 'NOT_READY',
  communication_medium TEXT NOT NULL DEFAULT 'EMAIL',
  remarks TEXT,
  documents_status TEXT NOT NULL DEFAULT 'PENDING',
  next_action TEXT,
  education TEXT,
  highest_qualification TEXT,
  mca TEXT,
  graduation TEXT,
  previous_employer TEXT,
  experience TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (batch_id, candidate_id)
);

CREATE TABLE IF NOT EXISTS email_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Welcome',
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  is_system INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS email_communications (
  id TEXT PRIMARY KEY,
  candidate_id TEXT REFERENCES candidates(id) ON DELETE CASCADE,
  batch_id TEXT,
  template_id TEXT,
  template_name TEXT,
  reminder_id TEXT,
  type TEXT NOT NULL DEFAULT 'WELCOME',
  channel TEXT NOT NULL DEFAULT 'EMAIL',
  provider TEXT NOT NULL DEFAULT 'GMAIL',
  provider_message_id TEXT,
  recipient TEXT NOT NULL,
  subject TEXT,
  body TEXT,
  status TEXT NOT NULL DEFAULT 'QUEUED',
  error_code TEXT,
  error_message TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  scheduled_at TEXT,
  sent_at TEXT,
  failed_at TEXT,
  failure_reason TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS reminder_schedules (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  batch_id TEXT REFERENCES batches(id) ON DELETE CASCADE,
  template_id TEXT,
  scheduled_at TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  target_condition TEXT NOT NULL DEFAULT 'NOT_STARTED',
  execution_mode TEXT NOT NULL DEFAULT 'NOTIFY_RECRUITER',
  channels TEXT NOT NULL DEFAULT 'EMAIL',
  status TEXT NOT NULL DEFAULT 'SCHEDULED',
  attempted INTEGER NOT NULL DEFAULT 0,
  sent INTEGER NOT NULL DEFAULT 0,
  failed INTEGER NOT NULL DEFAULT 0,
  skipped INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  executed_at TEXT
);

CREATE TABLE IF NOT EXISTS automation_logs (
  id TEXT PRIMARY KEY,
  level TEXT NOT NULL DEFAULT 'INFO',
  source TEXT NOT NULL DEFAULT 'SYSTEM',
  message TEXT NOT NULL,
  detail TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_comm_candidate ON email_communications(candidate_id);
CREATE INDEX IF NOT EXISTS idx_comm_status ON email_communications(status);
CREATE INDEX IF NOT EXISTS idx_reminders_status ON reminder_schedules(status, scheduled_at);

-- Multi-user candidate management (teams, users, sessions, candidate assignment/BGV/remarks).
CREATE TABLE IF NOT EXISTS teams (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  manager_id TEXT,
  signature TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'TEAM_MEMBER',
  team_id TEXT REFERENCES teams(id),
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS candidate_audit_log (
  id TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  field TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  changed_by TEXT,
  changed_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
CREATE INDEX IF NOT EXISTS idx_users_team ON users(team_id);
CREATE INDEX IF NOT EXISTS idx_audit_candidate ON candidate_audit_log(candidate_id);
