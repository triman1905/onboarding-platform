/**
 * Client for the LOCAL Express backend (server/).
 *
 * The backend runs independently of Lovable at http://localhost:3001 and owns
 * SQLite storage, Gmail SMTP sending and the node-cron reminder scheduler.
 * Every hook here degrades gracefully when the backend is not running.
 */
import { useCallback, useEffect, useState } from "react";
import { clearToken, getToken } from "../auth/token";
import {
  hostedBatch,
  hostedBatches,
  hostedCancelReminder,
  hostedCheckDuplicates,
  hostedCreateReminder,
  hostedDuplicateTemplate,
  hostedExistingEmails,
  hostedHistory,
  hostedImportBatch,
  hostedLogs,
  hostedPreview,
  hostedReminder,
  hostedReminderPreview,
  hostedReminders,
  hostedRetry,
  hostedRunReminder,
  hostedSaveTemplate,
  hostedSendBatch,
  hostedSendTestEmail,
  hostedStatus,
  hostedTemplates,
  hostedTestConnection,
  hostedUpdateSettings,
} from "./hosted.functions";

export const API_BASE =
  (import.meta.env["VITE_API_URL"] as string | undefined) ?? "http://localhost:3001";

export class ApiError extends Error {}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  const isForm = init?.body instanceof FormData;
  const token = getToken();
  const headers: Record<string, string> = {
    ...(isForm ? {} : { "Content-Type": "application/json" }),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...((init?.headers as Record<string, string>) ?? {}),
  };
  try {
    res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  } catch {
    throw new ApiError(
      `Cannot reach the local backend at ${API_BASE}. Start it with "npm run server".`,
    );
  }

  if (res.status === 401 && path !== "/api/auth/login") {
    clearToken();
    if (typeof window !== "undefined" && window.location.pathname !== "/login") {
      window.location.href = "/login";
    }
    throw new ApiError("Session expired — please log in again.");
  }

  const text = await res.text();
  const data = text ? (JSON.parse(text) as unknown) : null;
  if (!res.ok) {
    const message =
      (data as { message?: string } | null)?.message ?? `Request failed (${res.status})`;
    throw new ApiError(message);
  }
  return data as T;
}

export type ExecutionEnvironment = "LOCAL" | "LOVABLE_HOSTED";

export type ChannelName = "EMAIL" | "WHATSAPP" | "SMS";

export interface ChannelConfig {
  configured: boolean;
  provider: string;
}

export interface EmailStatus {
  provider: string;
  configured: boolean;
  sender: string;
  testMode: boolean;
  /** Which execution environment answered this request. */
  environment: ExecutionEnvironment;
  /** Hosted only: real sends happen only when live mode is on. */
  liveMode?: boolean;
  senderVerified?: boolean;
  connectionMessage?: string;
  testRecipient?: string;
  /** Local backend only — undefined under the hosted (Lovable) environment. */
  channels?: Record<"email" | "whatsapp" | "sms", ChannelConfig>;
  stats: {
    candidates: number;
    welcomeSent: number;
    reminderSent: number;
    remindersScheduled: number;
    failed: number;
    today: number;
    pending?: number;
    channels?: Record<"email" | "whatsapp" | "sms", { sent: number; failed: number }>;
  };
}

export interface EmailTemplate {
  id: string;
  name: string;
  category: string;
  subject: string;
  body: string;
  active: number;
  /** Seeded templates (Welcome/Reminder) — cannot be archived or deleted. */
  is_system: number;
  created_at: string;
  updated_at: string;
}

export interface LocalCandidate {
  id: string;
  candidate_id: string;
  batch_id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  /** Normalized E.164 phone (e.g. "+919311838864"), or null if missing/unrecognized. */
  phone_e164: string | null;
  department: string | null;
  role: string | null;
  joining_date: string | null;
  location: string | null;
  verification_link: string | null;
  verification_status: string;
  source: "CSV" | "MANUAL";
}

export interface NewCandidateInput {
  batchId: string;
  candidateId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string | undefined;
  joiningDate: string;
  location: string;
  department?: string | undefined;
  role?: string | undefined;
  verificationLink?: string | undefined;
  verificationStatus?: string | undefined;
}

export type ChannelReadiness = "READY" | "ALREADY_SENT" | "SKIPPED" | "NO_PHONE" | "NOT_SELECTED";

export interface ChannelTemplate {
  type: "WELCOME" | "REMINDER";
  id: string;
  label: string;
}

export interface ReminderReviewCandidate {
  id: string;
  candidateId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  verificationStatus: string;
  /** Per-channel readiness, keyed by the reminder's configured channels. */
  channels: Partial<Record<ChannelName, ChannelReadiness>>;
  /** Legacy single-column status (mirrors EMAIL when configured) — kept for older callers. */
  reminderStatus: ChannelReadiness;
}

export interface ReminderReview {
  reminder: ReminderSchedule;
  candidates: ReminderReviewCandidate[];
}

export interface LocalBatch {
  id: string;
  name: string;
  joining_date: string | null;
  project: string | null;
  location: string | null;
  status: string;
  created_at: string;
  candidate_count?: number;
  /** Candidates in this batch whose overall_bgv_status is INDUCTION_READY — the real completion signal. */
  induction_ready_count?: number;
  emails_sent?: number;
  candidates?: LocalCandidate[];
}

export interface EmailCommunication {
  id: string;
  candidate_id: string;
  batch_id: string | null;
  template_id: string | null;
  template_name: string | null;
  type: string;
  channel: ChannelName;
  provider: string | null;
  provider_message_id: string | null;
  recipient: string;
  subject: string | null;
  status: "QUEUED" | "SENDING" | "SENT" | "DELIVERED" | "READ" | "FAILED" | "SKIPPED";
  error_code: string | null;
  error_message: string | null;
  attempts: number;
  sent_at: string | null;
  failed_at: string | null;
  failure_reason: string | null;
  created_at: string;
  first_name: string | null;
  last_name: string | null;
  /** Set only for reminder communications — null for welcome/other one-off sends. */
  execution_mode: "AUTO_SEND" | "NOTIFY_RECRUITER" | null;
}

export interface ReminderSchedule {
  id: string;
  name: string;
  batch_id: string;
  batch_name: string | null;
  template_id: string;
  template_name: string | null;
  scheduled_at: string;
  timezone: string;
  target_condition: string;
  execution_mode: "AUTO_SEND" | "NOTIFY_RECRUITER";
  channels: ChannelName[];
  status: string;
  attempted: number;
  sent: number;
  failed: number;
  skipped: number;
  executed_at: string | null;
  eligibleCount?: number;
  completeCount?: number;
  communications?: EmailCommunication[];
}

export interface EmailPreview {
  candidateId: string;
  candidateName: string;
  to: string;
  templateName: string;
  subject: string;
  body: string;
  missingVariables: string[];
}

export interface ValidationIssue {
  row: number;
  candidate: string;
  email: string;
  issue: string;
  severity: "ERROR" | "WARNING";
}

export interface ValidationResult {
  total: number;
  validCount: number;
  invalidCount: number;
  duplicateCount: number;
  issues: ValidationIssue[];
  /** Canonical (snake_case) row data for records that passed validation — used for preview tables. */
  valid?: Array<Record<string, string>>;
}

export interface AutomationLog {
  id: string;
  level: string;
  source: string;
  message: string;
  created_at: string;
}

/* ------------------------------------------------------------------ *
 * Environment resolution
 *
 * LOCAL           → Express backend on localhost (Nodemailer / Gmail SMTP)
 * LOVABLE_HOSTED  → server functions on the Lovable runtime (Resend)
 *
 * The UI code below is identical in both environments; only the transport
 * and persistence layer changes.
 * ------------------------------------------------------------------ */
let envPromise: Promise<ExecutionEnvironment> | null = null;

async function probeLocal(): Promise<ExecutionEnvironment> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    const res = await fetch(`${API_BASE}/api/email/status`, { signal: controller.signal });
    clearTimeout(timer);
    return res.ok ? "LOCAL" : "LOVABLE_HOSTED";
  } catch {
    return "LOVABLE_HOSTED";
  }
}

export function currentEnvironment(): Promise<ExecutionEnvironment> {
  envPromise ??= probeLocal();
  return envPromise;
}

export function resetEnvironment() {
  envPromise = null;
}

async function isLocal() {
  return (await currentEnvironment()) === "LOCAL";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asAny = (value: unknown) => value as any;

/** Hosted server functions can 500 on a cold start — retry briefly before giving up. */
async function withWarmupRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await fn();
    } catch (e) {
      lastError = e;
      await new Promise((r) => setTimeout(r, 800 * (i + 1)));
    }
  }
  throw lastError;
}

export const emailApi = {
  environment: currentEnvironment,

  status: async (): Promise<EmailStatus> => {
    if (await isLocal()) {
      const local = await api<Omit<EmailStatus, "environment">>("/api/email/status");
      return { ...local, environment: "LOCAL" };
    }
    const hosted = await withWarmupRetry(() => hostedStatus());

    return {
      provider: hosted.provider,
      configured: hosted.configured,
      sender: hosted.sender,
      testMode: !hosted.liveMode,
      environment: "LOVABLE_HOSTED",
      liveMode: hosted.liveMode,
      senderVerified: hosted.senderVerified,
      connectionMessage: hosted.connectionMessage,
      testRecipient: hosted.testRecipient,
      stats: hosted.stats,
    };
  },

  /** Hosted only: toggle Demo Mode ↔ Live email mode. */
  setLiveMode: (liveMode: boolean) => hostedUpdateSettings({ data: { liveMode } }),

  /** Hosted only: send one real test email to the configured test recipient. */
  sendTestEmail: (to?: string) => hostedSendTestEmail({ data: { to: to ?? "" } }),

  test: async () => {
    if (await isLocal()) {
      return api<{ ok: boolean; message: string; sender: string }>("/api/email/test", {
        method: "POST",
      });
    }
    return hostedTestConnection();
  },

  history: async (query = "") => {
    if (await isLocal()) return api<EmailCommunication[]>(`/api/email/history${query}`);
    const params = new URLSearchParams(query.startsWith("?") ? query.slice(1) : query);
    return asAny(
      await hostedHistory({
        data: {
          status: params.get("status") ?? "",
          type: params.get("type") ?? "",
          batchId: params.get("batchId") ?? "",
        },
      }),
    ) as EmailCommunication[];
  },

  logs: async () => {
    if (await isLocal()) return api<AutomationLog[]>("/api/email/logs");
    return asAny(await hostedLogs()) as AutomationLog[];
  },

  retry: async (id: string) => {
    if (await isLocal())
      return api<{ ok: boolean; message?: string }>(`/api/email/retry/${id}`, { method: "POST" });
    return hostedRetry({ data: { id } });
  },

  checkDuplicates: async (candidateIds: string[], templateId: string, type = "WELCOME") => {
    if (await isLocal()) {
      return api<{ duplicates: string[] }>("/api/email/check-duplicates", {
        method: "POST",
        body: JSON.stringify({ candidateIds, templateId, type }),
      });
    }
    return hostedCheckDuplicates({ data: { candidateIds, templateId, type } });
  },

  sendBatch: async (payload: {
    batchId?: string;
    candidateIds?: string[];
    templateId: string;
    type?: string;
    force?: boolean;
  }) => {
    if (await isLocal()) {
      return api<{ attempted: number; sent: number; failed: number; skipped: number }>(
        "/api/email/send-batch",
        {
          method: "POST",
          body: JSON.stringify({ ...payload, confirm: true }),
        },
      );
    }
    return hostedSendBatch({ data: { ...payload, confirm: true } });
  },

  batches: async () => {
    if (await isLocal()) return api<LocalBatch[]>("/api/batches");
    return asAny(await hostedBatches()) as LocalBatch[];
  },

  batch: async (id: string) => {
    if (await isLocal()) return api<LocalBatch>(`/api/batches/${id}`);
    return asAny(await hostedBatch({ data: { id } })) as LocalBatch;
  },

  /** Creates an empty batch (no candidates) — used by "Add Candidate Manually". Local backend only. */
  createBatch: async (payload: {
    name: string;
    joiningDate?: string;
    project?: string;
    location?: string;
    owner?: string;
  }) => {
    if (await isLocal())
      return api<LocalBatch>("/api/batches", { method: "POST", body: JSON.stringify(payload) });
    throw new ApiError(
      "Creating a batch without a file is only available when the local backend is running.",
    );
  },

  /**
   * Hard-deletes a batch and its candidates (cascades server-side — see
   * deleteBatch() in batchService.js). Manager-only: the backend rejects a
   * TEAM_MEMBER with 403 even if this is called directly. Local backend only.
   */
  deleteBatch: async (id: string) => {
    if (await isLocal())
      return api<{ message: string; id: string; name: string; candidatesRemoved: number }>(
        `/api/batches/${id}`,
        { method: "DELETE" },
      );
    throw new ApiError("Deleting a batch is only available when the local backend is running.");
  },

  /** Local backend only — candidates for a batch (or all candidates when omitted). */
  candidates: async (batchId?: string) => {
    if (await isLocal()) {
      const search = batchId ? `?batchId=${encodeURIComponent(batchId)}` : "";
      return api<LocalCandidate[]>(`/api/candidates${search}`);
    }
    throw new ApiError("Candidate lookup is only available when the local backend is running.");
  },

  /** Manual candidate entry — the alternative to CSV/XLSX upload. Local backend only. */
  createCandidate: async (payload: NewCandidateInput) => {
    if (await isLocal())
      return api<LocalCandidate>("/api/candidates", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    throw new ApiError(
      "Manual candidate entry is only available when the local backend is running.",
    );
  },

  /** Validation uses the SAME shared rules in both environments. */
  validateFile: async (file: File): Promise<ValidationResult> => {
    if (await isLocal()) {
      const form = new FormData();
      form.append("file", file);
      return api<ValidationResult>("/api/batches/validate", { method: "POST", body: form });
    }
    const { validation } = await parseAndValidate(file);
    return validation;
  },

  importFile: async (file: File, meta: Record<string, string>) => {
    if (await isLocal()) {
      const form = new FormData();
      form.append("file", file);
      for (const [key, value] of Object.entries(meta)) form.append(key, value);
      return api<{ batch: LocalBatch; validation: ValidationResult }>("/api/batches/import", {
        method: "POST",
        body: form,
      });
    }
    const { rows, validation } = await parseAndValidate(file);
    const batch = asAny(await hostedImportBatch({ data: { meta, rows } })) as LocalBatch;
    return { batch, validation };
  },

  /** `activeOnly` scopes the dropdowns to non-archived templates; the manager view wants everything. */
  templates: async (activeOnly = false) => {
    if (await isLocal())
      return api<{ templates: EmailTemplate[]; variables: string[] }>(
        `/api/templates${activeOnly ? "?activeOnly=1" : ""}`,
      );
    return asAny(await hostedTemplates()) as { templates: EmailTemplate[]; variables: string[] };
  },

  saveTemplate: async (id: string | null, payload: Partial<EmailTemplate>) => {
    if (await isLocal()) {
      return id
        ? api<EmailTemplate>(`/api/templates/${id}`, {
            method: "PUT",
            body: JSON.stringify(payload),
          })
        : api<EmailTemplate>("/api/templates", { method: "POST", body: JSON.stringify(payload) });
    }
    return asAny(await hostedSaveTemplate({ data: { id, payload } })) as EmailTemplate;
  },

  duplicateTemplate: async (id: string) => {
    if (await isLocal())
      return api<EmailTemplate>(`/api/templates/${id}/duplicate`, { method: "POST" });
    return asAny(await hostedDuplicateTemplate({ data: { id } })) as EmailTemplate;
  },

  /** Soft delete — local backend only, blocked server-side for seeded (is_system) templates. */
  archiveTemplate: async (id: string) => {
    if (await isLocal())
      return api<EmailTemplate>(`/api/templates/${id}/archive`, { method: "POST" });
    throw new ApiError("Archiving templates is only available when the local backend is running.");
  },

  preview: async (templateId: string, params: { batchId?: string; candidateId?: string }) => {
    if (await isLocal()) {
      const search = new URLSearchParams(params as Record<string, string>).toString();
      return api<EmailPreview[]>(`/api/templates/${templateId}/preview?${search}`);
    }
    return asAny(
      await hostedPreview({
        data: { templateId, batchId: params.batchId ?? "", candidateId: params.candidateId ?? "" },
      }),
    ) as EmailPreview[];
  },

  reminders: async () => {
    if (await isLocal()) return api<ReminderSchedule[]>("/api/reminders");
    return asAny(await hostedReminders()) as ReminderSchedule[];
  },

  reminder: async (id: string) => {
    if (await isLocal()) return api<ReminderSchedule>(`/api/reminders/${id}`);
    return asAny(await hostedReminder({ data: { id } })) as ReminderSchedule;
  },

  reminderPreview: async (batchId: string, targetCondition: string) => {
    if (await isLocal()) {
      return api<{ eligibleCount: number; completeCount: number }>(
        `/api/reminders/preview?batchId=${batchId}&targetCondition=${targetCondition}`,
      );
    }
    return hostedReminderPreview({ data: { batchId, targetCondition } });
  },

  createReminder: async (payload: Record<string, unknown>) => {
    if (await isLocal())
      return api<ReminderSchedule>("/api/reminders", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    return asAny(await hostedCreateReminder({ data: payload })) as ReminderSchedule;
  },

  cancelReminder: async (id: string) => {
    if (await isLocal())
      return api<ReminderSchedule>(`/api/reminders/${id}/cancel`, { method: "POST" });
    return asAny(await hostedCancelReminder({ data: { id } })) as ReminderSchedule;
  },

  runReminder: async (
    id: string,
  ): Promise<{
    status: string;
    attempted: number;
    sent: number;
    failed: number;
    skipped: number;
  }> => {
    if (await isLocal()) {
      return api<{
        status: string;
        attempted: number;
        sent: number;
        failed: number;
        skipped: number;
      }>(`/api/reminders/${id}/run`, { method: "POST" });
    }
    const result = asAny(await hostedRunReminder({ data: { id } }));
    return {
      status: "COMPLETED",
      attempted: result.attempted,
      sent: result.sent,
      failed: result.failed,
      skipped: result.skipped,
    };
  },

  /** Reminders currently READY_TO_SEND — polled by the notification bell. Local backend only. */
  readyReminders: async () => {
    if (await isLocal()) return api<ReminderSchedule[]>("/api/reminders/ready");
    return [];
  },

  /** Candidate-level detail for the Review & Send screen. Local backend only. */
  reminderReview: async (id: string) => {
    if (await isLocal()) return api<ReminderReview>(`/api/reminders/${id}/review`);
    throw new ApiError("Review & Send is only available when the local backend is running.");
  },

  /** Sends to the recruiter-selected candidates from the Review & Send screen. Local backend only. */
  sendReviewedReminder: async (id: string, candidateIds: string[], channels?: ChannelName[]) => {
    if (await isLocal()) {
      return api<{
        status: string;
        attempted: number;
        sent: number;
        failed: number;
        skipped: number;
      }>(`/api/reminders/${id}/send`, {
        method: "POST",
        body: JSON.stringify({ candidateIds, channels }),
      });
    }
    throw new ApiError("Review & Send is only available when the local backend is running.");
  },

  /** Twilio WhatsApp / SMS configuration status (booleans only — never credentials). Local backend only. */
  commStatus: async () => {
    if (await isLocal()) {
      return api<{
        testMode: boolean;
        channels: Record<"email" | "whatsapp" | "sms", ChannelConfig>;
      }>("/api/communications/status");
    }
    throw new ApiError("WhatsApp/SMS are only available when the local backend is running.");
  },

  /** WhatsApp/SMS/Email channel-template picklists (WELCOME/REMINDER) for the template dropdowns. Local backend only. */
  channelTemplates: async () => {
    if (await isLocal()) {
      return api<Record<ChannelName, ChannelTemplate[]>>("/api/communications/templates");
    }
    throw new ApiError("Channel templates are only available when the local backend is running.");
  },

  /** Preview a WhatsApp or SMS message body for one candidate. Local backend only. */
  previewChannel: async (
    candidateId: string,
    channel: "WHATSAPP" | "SMS",
    type: "WELCOME" | "REMINDER",
  ) => {
    if (await isLocal()) {
      const search = new URLSearchParams({ candidateId, channel, type }).toString();
      return api<{
        candidateId: string;
        candidateName: string;
        to: string | null;
        channel: string;
        templateName: string;
        body: string;
        missingDestination: boolean;
      }>(`/api/communications/preview?${search}`);
    }
    throw new ApiError("WhatsApp/SMS preview is only available when the local backend is running.");
  },

  /**
   * Multi-channel bulk send — the backing call for the "Communication
   * Channels" checkboxes (Welcome tab and Reminder Review & Send). Local
   * backend only: WhatsApp/SMS run through Twilio on the local Express
   * server. `templateId` is required only when `channels` includes EMAIL.
   */
  bulkSend: async (payload: {
    batchId?: string | undefined;
    candidateIds?: string[] | undefined;
    channels: ChannelName[];
    templateId?: string | undefined;
    type?: string | undefined;
    force?: boolean | undefined;
  }) => {
    if (await isLocal()) {
      return api<{
        attempted: number;
        sent: number;
        failed: number;
        skipped: number;
        byChannel: Record<
          ChannelName,
          { attempted: number; sent: number; failed: number; skipped: number }
        >;
      }>("/api/communications/bulk-send", {
        method: "POST",
        body: JSON.stringify({ ...payload, confirm: true }),
      });
    }
    throw new ApiError("WhatsApp/SMS sending is only available when the local backend is running.");
  },
};

/** Browser-side parse + validation using the shared email-core rules. */
async function parseAndValidate(file: File) {
  const [{ parseUpload, validateRows }, existing] = await Promise.all([
    import("../../../shared/email-core/csv.js"),
    hostedExistingEmails(),
  ]);
  const buffer = await file.arrayBuffer();
  const rows = parseUpload(buffer, file.name);
  const validation = validateRows(rows, existing as string[]);
  return { rows: validation.valid ?? rows, validation: validation as unknown as ValidationResult };
}

/** Generic polling loader that reports backend availability. */
export function useLocalApi<T>(loader: () => Promise<T>, deps: unknown[] = [], intervalMs = 0) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const result = await loader();
      setData(result);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    let active = true;
    void load();
    if (!intervalMs)
      return () => {
        active = false;
      };
    const timer = setInterval(() => {
      if (active) void load();
    }, intervalMs);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [load, intervalMs]);

  return { data, error, loading, reload: load, offline: Boolean(error?.includes("Cannot reach")) };
}
