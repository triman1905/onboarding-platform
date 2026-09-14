/**
 * Automation-layer view models for the ABC prototype.
 *
 * ARCHITECTURE NOTE
 * -----------------
 * The platform is deliberately split into three layers. The UI in this project
 * only *visualises* that split — nothing here executes real work:
 *
 *   Workflow Engine   → deterministic sequencing (invite → wait → remind → escalate)
 *   Rules / Scheduler → condition-action rules and time-based jobs
 *   Agent             → reasoning on candidate queries and exceptional cases only
 *
 * All values below are simulated prototype data.
 */
import type { ActivityEvent } from "./types";

export type AutomationOutcome = "SUCCESS" | "WARNING" | "FAILED" | "PENDING";

export type AutomationLayer = "WORKFLOW_ENGINE" | "RULE_ENGINE" | "SCHEDULER" | "AGENT";

export const LAYER_LABEL: Record<AutomationLayer, string> = {
  WORKFLOW_ENGINE: "Workflow Engine",
  RULE_ENGINE: "Rule Engine",
  SCHEDULER: "Scheduler",
  AGENT: "Agent",
};

export interface ScheduledAutomation {
  id: string;
  day: "Today" | "Tomorrow";
  time: string;
  action: string;
  audience: string;
  candidates: number;
  trigger: string;
  layer: AutomationLayer;
  status: "SCHEDULED" | "COMPLETED" | "FAILED";
}

export const UPCOMING_AUTOMATIONS: ScheduledAutomation[] = [
  {
    id: "sch-1",
    day: "Today",
    time: "16:00",
    action: "Verification Reminder #1",
    audience: "Not started > 3 days",
    candidates: 86,
    trigger: "Rule · REMINDER_D3",
    layer: "SCHEDULER",
    status: "SCHEDULED",
  },
  {
    id: "sch-2",
    day: "Today",
    time: "17:30",
    action: "Missing Document Follow-up",
    audience: "Required document missing",
    candidates: 24,
    trigger: "Rule · DOC_MISSING_FOLLOWUP",
    layer: "RULE_ENGINE",
    status: "SCHEDULED",
  },
  {
    id: "sch-3",
    day: "Tomorrow",
    time: "09:00",
    action: "Verification Reminder",
    audience: "Invitation sent, no activity",
    candidates: 142,
    trigger: "Workflow step 3 · Reminder cycle",
    layer: "WORKFLOW_ENGINE",
    status: "SCHEDULED",
  },
  {
    id: "sch-4",
    day: "Tomorrow",
    time: "09:30",
    action: "Missing Document Follow-up",
    audience: "Documents pending",
    candidates: 67,
    trigger: "Rule · MCA_CERT_MISSING",
    layer: "RULE_ENGINE",
    status: "SCHEDULED",
  },
  {
    id: "sch-5",
    day: "Tomorrow",
    time: "10:00",
    action: "Deadline Reminder",
    audience: "Joining date within 14 days",
    candidates: 31,
    trigger: "Scheduler · DEADLINE_T14",
    layer: "SCHEDULER",
    status: "SCHEDULED",
  },
  {
    id: "sch-6",
    day: "Tomorrow",
    time: "11:00",
    action: "Escalation sweep",
    audience: "Unresolved beyond 10 days",
    candidates: 12,
    trigger: "Rule · ESCALATE_D10",
    layer: "RULE_ENGINE",
    status: "SCHEDULED",
  },
];

export const AUTOMATION_IMPACT: Array<{ label: string; value: string; hint?: string }> = [
  { label: "Candidates processed", value: "875" },
  { label: "Emails automatically sent", value: "1,284" },
  { label: "WhatsApp messages", value: "742" },
  { label: "Reminders sent", value: "318" },
  { label: "Missing documents detected", value: "87" },
  { label: "Candidate queries handled", value: "61", hint: "48 auto-answered · 13 escalated" },
  { label: "Recruiter escalations", value: "23" },
  { label: "Estimated manual actions avoided", value: "2,400+", hint: "Simulated estimate" },
];

/** Deterministic "actions today" figure used across dashboard and agent page. */
export const ACTIONS_TODAY = 2341;
export const ACTIONS_SUCCESSFUL = 2298;
export const ACTIONS_EXCEPTIONS = 43;
export const ACTIONS_TREND = "+18% vs yesterday";

export type CapabilityState = "ENABLED" | "COMING_SOON" | "NOT_CONNECTED";

export const AGENT_CAPABILITIES: Array<{ label: string; state: CapabilityState; note: string }> = [
  { label: "Candidate communication", state: "ENABLED", note: "Workflow Engine executes, Agent only drafts exceptions" },
  { label: "Reminder scheduling", state: "ENABLED", note: "Handled deterministically by the Scheduler" },
  { label: "Candidate status monitoring", state: "ENABLED", note: "Workflow Engine polls verification state" },
  { label: "Missing document detection", state: "ENABLED", note: "Rule Engine compares declarations against uploads" },
  { label: "Rule-based follow-up", state: "ENABLED", note: "Rule Engine" },
  { label: "Recruiter escalation", state: "ENABLED", note: "Agent decides when a case is exceptional" },
  { label: "Candidate query classification", state: "ENABLED", note: "Agent reasoning with recruiter approval" },
  { label: "DFMS integration", state: "NOT_CONNECTED", note: "Pending API / authorised RPA access" },
  { label: "Advanced document intelligence", state: "COMING_SOON", note: "OCR and certificate validation planned" },
];

export interface AgentTraceStep {
  time: string;
  kind: "Detected" | "Rule triggered" | "Action" | "Status" | "Reasoning" | "Escalated";
  detail: string;
  handledBy: AutomationLayer;
  outcome: AutomationOutcome;
}

export const AGENT_TRACE: Array<{
  id: string;
  candidate: string;
  candidateCode: string;
  summary: string;
  steps: AgentTraceStep[];
}> = [
  {
    id: "trace-1",
    candidate: "Rahul Sharma",
    candidateCode: "V001",
    summary: "MCA declared but certificate missing",
    steps: [
      { time: "10:42", kind: "Detected", detail: "MCA declared but certificate missing", handledBy: "RULE_ENGINE", outcome: "WARNING" },
      { time: "10:42", kind: "Rule triggered", detail: "MCA_CERT_MISSING", handledBy: "RULE_ENGINE", outcome: "SUCCESS" },
      { time: "10:43", kind: "Action", detail: "Missing document email sent", handledBy: "WORKFLOW_ENGINE", outcome: "SUCCESS" },
      { time: "10:45", kind: "Status", detail: "Waiting for candidate upload", handledBy: "WORKFLOW_ENGINE", outcome: "PENDING" },
    ],
  },
  {
    id: "trace-2",
    candidate: "Priya Mehta",
    candidateCode: "V014",
    summary: "Candidate asked a non-standard question",
    steps: [
      { time: "11:02", kind: "Detected", detail: "Inbound candidate query received", handledBy: "WORKFLOW_ENGINE", outcome: "SUCCESS" },
      { time: "11:02", kind: "Reasoning", detail: "Classified as DOCUMENT_REQUIREMENT · confidence 94%", handledBy: "AGENT", outcome: "SUCCESS" },
      { time: "11:03", kind: "Action", detail: "Draft response prepared for recruiter approval", handledBy: "AGENT", outcome: "PENDING" },
    ],
  },
  {
    id: "trace-3",
    candidate: "Aman Verma",
    candidateCode: "V037",
    summary: "Sensitive case escalated to recruiter",
    steps: [
      { time: "09:18", kind: "Detected", detail: "Third reminder unanswered · joining date in 9 days", handledBy: "SCHEDULER", outcome: "WARNING" },
      { time: "09:18", kind: "Reasoning", detail: "Case judged exceptional — no deterministic rule applies", handledBy: "AGENT", outcome: "WARNING" },
      { time: "09:19", kind: "Escalated", detail: "Assigned to Recruitment Team", handledBy: "AGENT", outcome: "FAILED" },
    ],
  },
];

export const ARCHITECTURE_LAYERS: Array<{
  layer: AutomationLayer;
  responsibility: string;
  examples: string[];
}> = [
  {
    layer: "WORKFLOW_ENGINE",
    responsibility: "Owns the deterministic candidate journey and sequencing.",
    examples: ["Send invitation", "Track verification state", "Advance to next stage"],
  },
  {
    layer: "SCHEDULER",
    responsibility: "Executes time-based jobs. No reasoning involved.",
    examples: ["Reminder after 3 days", "Deadline reminder T-14", "Nightly escalation sweep"],
  },
  {
    layer: "RULE_ENGINE",
    responsibility: "Evaluates condition-action rules against known candidate fields.",
    examples: ["MCA = YES and certificate missing", "Delivery failed → retry then flag"],
  },
  {
    layer: "AGENT",
    responsibility: "Handles reasoning: ambiguous queries and exceptional cases only.",
    examples: ["Classify a free-text candidate question", "Decide when a case needs a human"],
  },
];

/** Classify an activity line into a status indicator without changing stored data. */
export function activityOutcome(e: ActivityEvent): AutomationOutcome {
  const m = e.message.toLowerCase();
  if (m.includes("fail") || m.includes("bounce") || m.includes("escalat")) return "FAILED";
  if (m.includes("missing") || m.includes("issue created") || m.includes("mismatch")) return "WARNING";
  if (m.includes("scheduled") || m.includes("queued") || m.includes("awaiting") || m.includes("waiting")) return "PENDING";
  return "SUCCESS";
}

/** Best-effort mapping of an activity line to the layer that produced it. */
export function activityLayer(e: ActivityEvent): AutomationLayer {
  if (e.actor === "AI_AGENT") return "AGENT";
  const m = e.message.toLowerCase();
  if (m.includes("rule")) return "RULE_ENGINE";
  if (m.includes("reminder") || m.includes("scheduled")) return "SCHEDULER";
  return "WORKFLOW_ENGINE";
}
