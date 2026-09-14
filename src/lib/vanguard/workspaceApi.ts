/**
 * Client for the multi-user Candidate workspace endpoints (`/api/candidates/*`,
 * `/api/teams/*`). Built on the same shared `api()` fetch helper as
 * `src/lib/email/api.ts` — same auth header / error handling, not duplicated.
 */
import type { ChannelName, EmailCommunication } from "@/lib/email/api";
import { api } from "@/lib/email/api";

export type BgvStatus = "PENDING" | "IN_PROGRESS" | "CLEAR" | "DISCREPANT";
export type OverallBgvStatus = "DISCREPANT" | "INDUCTION_READY" | "IN_PROGRESS" | "NOT_READY";
export type DocumentsStatus = "PENDING" | "SUBMITTED" | "VERIFIED";
export type CommunicationMedium =
  "EMAIL" | "WHATSAPP" | "SMS" | "EMAIL_WHATSAPP" | "EMAIL_SMS" | "WHATSAPP_SMS" | "ALL" | "NONE";

export interface WorkspaceCandidate {
  id: string;
  candidate_id: string;
  batch_id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  phone_e164: string | null;
  department: string | null;
  role: string | null;
  joining_date: string | null;
  location: string | null;
  verification_link: string | null;
  verification_status: string;
  source: "CSV" | "MANUAL";
  assigned_to_user_id: string | null;
  bgv_client_status: BgvStatus;
  bgv_ey_status: BgvStatus;
  overall_bgv_status: OverallBgvStatus;
  communication_medium: CommunicationMedium;
  remarks: string | null;
  documents_status: DocumentsStatus;
  next_action: string | null;
  education: string | null;
  highest_qualification: string | null;
  mca: string | null;
  graduation: string | null;
  previous_employer: string | null;
  experience: string | null;
  last_action_field: string | null;
  last_action_value: string | null;
  last_activity_at: string | null;
  last_activity_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CandidateAuditEntry {
  id: string;
  candidate_id: string;
  field: string;
  old_value: string | null;
  new_value: string | null;
  old_value_label: string | null;
  new_value_label: string | null;
  changed_at: string;
  changed_by_name: string | null;
}

export interface DashboardSummary {
  totalCandidates: number;
  bgvComplete: number;
  bgvPending: number;
  discrepant: number;
  inductionReady: number;
  notReady: number;
  inProgress: number;
  verificationBreakdown: { status: string; count: number }[];
  recentActivity: {
    id: string;
    field: string;
    old_value: string | null;
    new_value: string | null;
    changed_at: string;
    changed_by_name: string | null;
    candidate_id: string;
    candidate_ref: string;
    first_name: string;
    last_name: string;
  }[];
  upcomingReminders: {
    id: string;
    name: string;
    scheduled_at: string;
    target_condition: string;
    channels: string;
  }[];
  needsAttention: {
    id: string;
    candidate_id: string;
    first_name: string;
    last_name: string;
    batch_id: string;
    bgv_client_status: BgvStatus;
    bgv_ey_status: BgvStatus;
    updated_at: string;
  }[];
  batches: DashboardBatchSummary[];
}

export interface DashboardBatchSummary {
  id: string;
  name: string;
  joining_date: string | null;
  project: string | null;
  location: string | null;
  owner: string | null;
  status: string;
  created_at: string;
  candidate_count: number;
  induction_ready_count: number;
  emails_sent: number;
  discrepant_count: number;
}

export interface TeamMember {
  id: string;
  name: string;
  username: string;
  role: "MANAGER" | "TEAM_MEMBER";
  isActive: boolean;
  assignedCandidates: number;
}

export interface Team {
  id: string;
  name: string;
  managerId: string;
  managerName: string | null;
  members: TeamMember[];
}

export interface CandidateSummary {
  candidate: WorkspaceCandidate;
  assignedTo: { id: string; name: string; role: string } | null;
  communications: EmailCommunication[];
  team: Team | null;
  lastActivity: CandidateAuditEntry | null;
}

export interface CsvAssignRow {
  candidate_id: string;
  assigned_to: string;
}

export interface CsvAssignValidRow {
  candidateId: string;
  teamMemberId: string;
  row: number;
}

export interface CsvAssignInvalidRow {
  row: number;
  candidate_id: string;
  assigned_to: string;
  reasons: string[];
}

export interface CsvAssignValidation {
  total: number;
  validCount: number;
  invalidCount: number;
  valid: CsvAssignValidRow[];
  invalid: CsvAssignInvalidRow[];
}

export const workspaceApi = {
  listCandidates: (params: { batchId?: string; search?: string; assignedTo?: string } = {}) => {
    const qs = new URLSearchParams();
    if (params.batchId) qs.set("batchId", params.batchId);
    if (params.search) qs.set("search", params.search);
    if (params.assignedTo) qs.set("assignedTo", params.assignedTo);
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return api<WorkspaceCandidate[]>(`/api/candidates${suffix}`);
  },

  getCandidate: (id: string) => api<WorkspaceCandidate>(`/api/candidates/${id}`),

  getCandidateSummary: (id: string) => api<CandidateSummary>(`/api/candidates/${id}/summary`),

  getCandidateCommunications: (id: string) =>
    api<EmailCommunication[]>(`/api/candidates/${id}/communications`),

  updateBgv: (id: string, field: "bgv_client_status" | "bgv_ey_status", value: BgvStatus) =>
    api<WorkspaceCandidate>(`/api/candidates/${id}/bgv`, {
      method: "PATCH",
      body: JSON.stringify({ field, value }),
    }),

  updateCommunicationMedium: (id: string, value: CommunicationMedium) =>
    api<WorkspaceCandidate>(`/api/candidates/${id}/communication`, {
      method: "PATCH",
      body: JSON.stringify({ value }),
    }),

  updateRemarks: (id: string, remarks: string) =>
    api<WorkspaceCandidate>(`/api/candidates/${id}/remarks`, {
      method: "PATCH",
      body: JSON.stringify({ remarks }),
    }),

  updateDocumentsStatus: (id: string, status: DocumentsStatus) =>
    api<WorkspaceCandidate>(`/api/candidates/${id}/documents-status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),

  updateNextAction: (id: string, value: string) =>
    api<WorkspaceCandidate>(`/api/candidates/${id}/next-action`, {
      method: "PATCH",
      body: JSON.stringify({ value }),
    }),

  getCandidateAudit: (id: string) => api<CandidateAuditEntry[]>(`/api/candidates/${id}/audit`),

  getDashboardSummary: (batchId?: string) =>
    api<DashboardSummary>(`/api/dashboard/summary${batchId ? `?batchId=${batchId}` : ""}`),

  assignBulk: (candidateIds: string[], teamMemberId: string) =>
    api<{ assigned: number }>("/api/candidates/assign/bulk", {
      method: "POST",
      body: JSON.stringify({ candidateIds, teamMemberId }),
    }),

  autoDistribute: (candidateIds?: string[], includeAssigned = false) =>
    api<{ distributed: number; perMember: Record<string, number> }>(
      "/api/candidates/assign/auto-distribute",
      { method: "POST", body: JSON.stringify({ candidateIds, includeAssigned }) },
    ),

  validateCsvAssignment: (rows: CsvAssignRow[]) =>
    api<CsvAssignValidation>("/api/candidates/assign/csv/validate", {
      method: "POST",
      body: JSON.stringify({ rows }),
    }),

  applyCsvAssignment: (rows: CsvAssignValidRow[]) =>
    api<{ assigned: number }>("/api/candidates/assign/csv/apply", {
      method: "POST",
      body: JSON.stringify({ rows }),
    }),

  getTeams: () => api<Team[]>("/api/teams"),

  getTeam: (id: string) => api<Team>(`/api/teams/${id}`),

  addTeamMember: (teamId: string, payload: { name: string; username: string; password?: string }) =>
    api<Team>(`/api/teams/${teamId}/members`, { method: "POST", body: JSON.stringify(payload) }),

  setMemberActive: (teamId: string, userId: string, isActive: boolean) =>
    api<Team>(`/api/teams/${teamId}/members/${userId}`, {
      method: "PATCH",
      body: JSON.stringify({ isActive }),
    }),
};

export type { ChannelName };
