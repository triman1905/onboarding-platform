/**
 * ABC Onboarding Automation — domain model.
 *
 * These types mirror the eventual backend schema (User, Batch, Candidate,
 * CandidateEducation/Employment/Document, Verification, Communication,
 * CommunicationTemplate, AutomationRule, AutomationExecution, CandidateIssue,
 * CandidateQuery, Escalation, Integration, AuditLog, Notification).
 *
 * Everything is currently served by an in-memory mock repository
 * (`src/lib/vanguard/store.tsx`). Swapping in a real API only requires
 * replacing the repository actions — components never talk to data sources.
 */

export type VerificationStatus =
  | "IMPORTED"
  | "INVITATION_PENDING"
  | "INVITATION_SENT"
  | "NOT_STARTED"
  | "IN_PROGRESS"
  | "SUBMITTED"
  | "DOCUMENTS_PENDING"
  | "VERIFICATION_COMPLETE"
  | "DFMS_SUBMITTED"
  | "BGV_IN_PROGRESS"
  | "BGV_COMPLETE"
  | "NEEDS_ATTENTION";

export type DocumentStatus = "NOT_STARTED" | "PARTIAL" | "PENDING" | "COMPLETE";
export type CommunicationStatus = "QUEUED" | "SENT" | "DELIVERED" | "FAILED" | "BOUNCED";
export type BgvStatus = "NOT_STARTED" | "DFMS_SUBMITTED" | "IN_PROGRESS" | "COMPLETE" | "ERROR";
export type IssueStatus =
  | "OPEN"
  | "IN_PROGRESS"
  | "WAITING_FOR_CANDIDATE"
  | "WAITING_FOR_RECRUITER"
  | "RESOLVED"
  | "ESCALATED";
export type Priority = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
export type Channel = "EMAIL" | "WHATSAPP";

export type IssueType =
  | "MISSING_DOCUMENT"
  | "NAME_MISMATCH"
  | "INVALID_DATA"
  | "VERIFICATION_INCOMPLETE"
  | "CANDIDATE_QUERY"
  | "COMMUNICATION_FAILURE"
  | "DFMS_ERROR"
  | "OTHER";

export type BatchStatus = "DRAFT" | "IMPORTED" | "AUTOMATION_RUNNING" | "PAUSED" | "COMPLETED";

export interface AutomationConfig {
  sendEmail: boolean;
  sendWhatsApp: boolean;
  verificationLink: string;
  emailTemplateId: string;
  whatsAppTemplateId: string;
  remindersEnabled: boolean;
  reminderDays: number[];
  missingDocFollowUp: boolean;
  escalationEnabled: boolean;
  escalateAfterDays: number;
  escalationRecipient: string;
}

export interface Batch {
  id: string;
  name: string;
  joiningDate: string;
  createdAt: string;
  project: string;
  location: string;
  payrollEntity: string;
  owner: string;
  status: BatchStatus;
  automation: AutomationConfig;
}

export interface CandidateDocument {
  key: string;
  label: string;
  required: boolean;
  uploaded: boolean;
  uploadedAt?: string | undefined;
}

export interface Candidate {
  id: string;
  candidateId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  joiningDate: string;
  location: string;
  batchId: string;
  verificationStatus: VerificationStatus;
  documentStatus: DocumentStatus;
  communicationStatus: CommunicationStatus;
  bgvStatus: BgvStatus;
  createdAt: string;
  updatedAt: string;
  /** CandidateEducation */
  education: {
    highestQualification: string;
    graduation: string;
    mcaDeclared: boolean;
    otherQualifications: string[];
  };
  /** CandidateEmployment */
  employment: {
    previousEmployer: string;
    experienceYears: number;
  };
  documents: CandidateDocument[];
  verificationLink: string;
  invitationSentAt?: string | undefined;
  verificationStartedAt?: string | undefined;
  formSubmittedAt?: string | undefined;
  documentsReviewedAt?: string | undefined;
  daysPending: number;
  lastActivity: string;
  lastAction: string;
  nextAction: string;
  owner: string;
}

export interface Communication {
  id: string;
  candidateId: string;
  candidateName: string;
  batchId: string;
  channel: Channel;
  templateName: string;
  subject: string;
  body: string;
  status: CommunicationStatus;
  sentAt: string;
  scheduledFor?: string | undefined;
  failureReason?: string | undefined;
}

export interface CommunicationTemplate {
  id: string;
  name: string;
  category:
    | "Initial Verification"
    | "Reminder"
    | "Missing Document"
    | "Deadline Reminder"
    | "Escalation"
    | "Verification Complete"
    | "DFMS Update";
  channel: Channel;
  subject: string;
  body: string;
  variables: string[];
  active: boolean;
  updatedAt: string;
}

export interface RuleCondition {
  field: string;
  operator: string;
  value: string;
}

export interface AutomationRule {
  id: string;
  name: string;
  description: string;
  conditions: RuleCondition[];
  actions: string[];
  enabled: boolean;
  executions: number;
  lastRunAt: string;
}

export interface AutomationExecution {
  id: string;
  ruleId: string;
  ruleName: string;
  candidateId: string;
  candidateName: string;
  outcome: string;
  at: string;
}

export interface CandidateIssue {
  id: string;
  candidateId: string;
  candidateName: string;
  batchId: string;
  type: IssueType;
  title: string;
  priority: Priority;
  status: IssueStatus;
  daysPending: number;
  automatedActions: string[];
  recommendedAction: string;
  owner: string;
  createdAt: string;
  lastCommunication: string;
}

export type QueryAiStatus = "ANSWERED" | "NEEDS_REVIEW" | "ESCALATED" | "UNKNOWN";

export interface CandidateQuery {
  id: string;
  candidateId: string;
  candidateName: string;
  question: string;
  category:
    | "Form Filling"
    | "Documents"
    | "Verification"
    | "Deadline"
    | "Technical Issue"
    | "General"
    | "Other";
  intent: string;
  confidence: number;
  suggestedResponse: string;
  aiStatus: QueryAiStatus;
  priority: Priority;
  assignedTo: string;
  status: "OPEN" | "ANSWERED" | "ESCALATED";
  createdAt: string;
  answer?: string | undefined;
}

export interface ActivityEvent {
  id: string;
  candidateId?: string;
  actor: "SYSTEM" | "RECRUITER" | "CANDIDATE" | "AI_AGENT";
  message: string;
  at: string;
}

export interface AuditLog {
  id: string;
  actor: string;
  role: string;
  action: string;
  entity: string;
  at: string;
  ip: string;
}

export interface Integration {
  key: string;
  name: string;
  description: string;
  method: string;
  status: "NOT_CONNECTED" | "MOCK";
  note: string;
}

export interface AppUser {
  id: string;
  name: string;
  email: string;
  role: "Admin" | "Recruiter" | "Recruitment Manager" | "Viewer";
  lastActive: string;
}
