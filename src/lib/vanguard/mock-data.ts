/**
 * Deterministic mock dataset for the ABC prototype.
 *
 * NOTE: This is fictional demo data. No external system (ABC, DFMS,
 * HRMS, email or WhatsApp) is connected. Replace this module with API calls
 * when real services are approved — the shapes match `types.ts`.
 */
import type {
  ActivityEvent,
  AuditLog,
  AutomationConfig,
  AutomationExecution,
  AppUser,
  Batch,
  Candidate,
  CandidateDocument,
  CandidateIssue,
  CandidateQuery,
  Communication,
  CommunicationTemplate,
  AutomationRule,
  Integration,
  Priority,
  VerificationStatus,
} from "./types";

/** Fixed "today" so SSR and client render identical values. */
export const TODAY = new Date("2026-08-13T10:00:00Z");

export function seededRandom(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const FIRST = [
  "Rahul","Priya","Aman","Neha","Vikram","Ananya","Karthik","Sneha","Rohit","Divya",
  "Arjun","Meera","Siddharth","Pooja","Nikhil","Ishita","Varun","Kavya","Manish","Ritika",
  "Aditya","Shreya","Harsh","Tanvi","Gaurav","Nandini","Abhishek","Swati","Rajat","Aarti",
];
const LAST = [
  "Sharma","Mehta","Singh","Verma","Nair","Iyer","Reddy","Kapoor","Joshi","Bose",
  "Patel","Gupta","Chopra","Rao","Malhotra","Banerjee","Desai","Pillai","Sinha","Kulkarni",
];
const LOCATIONS = ["Bengaluru", "Gurugram", "Hyderabad", "Kochi", "Chennai", "Pune"];
const EMPLOYERS = ["Meridian Tech", "Northwind Systems", "Calypso Labs", "Orbit Consulting", "Fresher"];
const QUALIFICATIONS = ["MCA", "B.Tech", "MBA", "B.Sc", "M.Tech"];

const DOC_DEFS: { key: string; label: string; required: boolean }[] = [
  { key: "identity", label: "Identity Proof", required: true },
  { key: "graduation", label: "Graduation Certificate", required: true },
  { key: "mca", label: "MCA Certificate", required: false },
  { key: "experience", label: "Experience Letter", required: false },
  { key: "payslip", label: "Latest Payslip", required: false },
];

export const DEFAULT_AUTOMATION: AutomationConfig = {
  sendEmail: true,
  sendWhatsApp: false,
  verificationLink: "https://abc.internal/verify/{{candidate_id}}",
  emailTemplateId: "tpl-initial-email",
  whatsAppTemplateId: "tpl-initial-wa",
  remindersEnabled: true,
  reminderDays: [3, 7, 10],
  missingDocFollowUp: true,
  escalationEnabled: true,
  escalateAfterDays: 10,
  escalationRecipient: "Recruitment Team",
};

export function daysAgoIso(days: number) {
  return new Date(TODAY.getTime() - days * 86400000).toISOString();
}

export function fmtDate(iso?: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
}

export function fmtDateShort(iso?: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", timeZone: "UTC" });
}

export function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
}


/** Mask PII — recruiters only see full values on the candidate detail page. */
export function maskEmail(email: string) {
  const [user, domain] = email.split("@");
  if (!user || !domain) return email;
  return `${user.slice(0, 2)}${"•".repeat(Math.max(3, user.length - 2))}@${domain}`;
}

export function maskPhone(phone: string) {
  return `${phone.slice(0, 4)} ••••• ${phone.slice(-3)}`;
}

interface BatchSpec {
  id: string;
  name: string;
  joiningDate: string;
  createdAt: string;
  status: Batch["status"];
  total: number;
  complete: number;
  inProgress: number;
  docsPending: number;
  needsAttention: number;
  seed: number;
}

const BATCH_SPECS: BatchSpec[] = [
  {
    id: "batch-oct-2026",
    name: "ABC October 2026",
    joiningDate: "2026-10-15",
    createdAt: daysAgoIso(20),
    status: "AUTOMATION_RUNNING",
    total: 875,
    complete: 621,
    inProgress: 142,
    docsPending: 67,
    needsAttention: 45,
    seed: 101,
  },
  {
    id: "batch-nov-2026",
    name: "ABC November 2026",
    joiningDate: "2026-11-15",
    createdAt: daysAgoIso(9),
    status: "AUTOMATION_RUNNING",
    total: 640,
    complete: 270,
    inProgress: 315,
    docsPending: 0,
    needsAttention: 55,
    seed: 202,
  },
  {
    id: "batch-dec-2026",
    name: "ABC December 2026",
    joiningDate: "2026-12-15",
    createdAt: daysAgoIso(2),
    status: "IMPORTED",
    total: 920,
    complete: 0,
    inProgress: 0,
    docsPending: 0,
    needsAttention: 0,
    seed: 303,
  },
];

export const COMPLETE_STATES: VerificationStatus[] = [
  "VERIFICATION_COMPLETE",
  "DFMS_SUBMITTED",
  "BGV_IN_PROGRESS",
  "BGV_COMPLETE",
];
export const IN_PROGRESS_STATES: VerificationStatus[] = [
  "INVITATION_SENT",
  "NOT_STARTED",
  "IN_PROGRESS",
  "SUBMITTED",
];

function buildDocuments(mcaDeclared: boolean, status: VerificationStatus, rnd: () => number): CandidateDocument[] {
  const complete = COMPLETE_STATES.includes(status);
  return DOC_DEFS.filter((d) => (d.key === "mca" ? mcaDeclared : true)).map((d) => {
    const uploaded = complete ? true : status === "IMPORTED" || status === "NOT_STARTED" ? false : rnd() > 0.35;
    return {
      ...d,
      required: d.key === "mca" ? mcaDeclared : d.required,
      uploaded,
      uploadedAt: uploaded ? daysAgoIso(Math.floor(rnd() * 12) + 1) : undefined,
    };
  });
}

function statusMeta(status: VerificationStatus) {
  switch (status) {
    case "IMPORTED":
      return { lastAction: "Batch imported", nextAction: "Send invitation" };
    case "INVITATION_SENT":
      return { lastAction: "Invitation email delivered", nextAction: "Reminder in 3 days" };
    case "NOT_STARTED":
      return { lastAction: "Reminder 1 sent", nextAction: "Reminder 2 scheduled" };
    case "IN_PROGRESS":
      return { lastAction: "Candidate opened verification form", nextAction: "Await submission" };
    case "SUBMITTED":
      return { lastAction: "Form submitted", nextAction: "Document review" };
    case "DOCUMENTS_PENDING":
      return { lastAction: "Missing document email sent", nextAction: "Follow-up in 2 days" };
    case "VERIFICATION_COMPLETE":
      return { lastAction: "Verification approved", nextAction: "Submit to DFMS" };
    case "DFMS_SUBMITTED":
      return { lastAction: "Submitted to DFMS (mock)", nextAction: "Await BGV start" };
    case "BGV_IN_PROGRESS":
      return { lastAction: "BGV initiated (mock)", nextAction: "Await BGV clearance" };
    case "BGV_COMPLETE":
      return { lastAction: "BGV complete (mock)", nextAction: "Ready for onboarding" };
    default:
      return { lastAction: "Exception raised", nextAction: "Recruiter review" };
  }
}

function makeCandidate(
  batch: BatchSpec,
  index: number,
  status: VerificationStatus,
  rnd: () => number,
): Candidate {
  const first = FIRST[Math.floor(rnd() * FIRST.length)]!;
  const last = LAST[Math.floor(rnd() * LAST.length)]!;
  const num = String(index + 1).padStart(3, "0");
  const prefix = batch.id.includes("oct") ? "V" : batch.id.includes("nov") ? "N" : "D";
  const candidateId = `${prefix}${num}`;
  const mcaDeclared = rnd() > 0.55;
  const docs = buildDocuments(mcaDeclared, status, rnd);
  const missing = docs.filter((d) => d.required && !d.uploaded).length;
  const documentStatus =
    status === "IMPORTED" ? "NOT_STARTED" : missing === 0 ? "COMPLETE" : missing < 2 ? "PENDING" : "PARTIAL";
  const daysPending = status === "IMPORTED" ? 0 : Math.floor(rnd() * 12) + 1;
  const meta = statusMeta(status);
  const invited = status !== "IMPORTED";
  return {
    id: `${batch.id}-${candidateId}`,
    candidateId,
    firstName: first,
    lastName: last,
    email: `${first.toLowerCase()}.${last.toLowerCase()}${index}@example-mail.com`,
    phone: `+91 9${String(Math.floor(rnd() * 900000000) + 100000000)}`.slice(0, 17),
    joiningDate: batch.joiningDate,
    location: LOCATIONS[Math.floor(rnd() * LOCATIONS.length)]!,
    batchId: batch.id,
    verificationStatus: status,
    documentStatus,
    communicationStatus: rnd() > 0.02 ? "DELIVERED" : "FAILED",
    bgvStatus:
      status === "BGV_COMPLETE"
        ? "COMPLETE"
        : status === "BGV_IN_PROGRESS"
          ? "IN_PROGRESS"
          : status === "DFMS_SUBMITTED"
            ? "DFMS_SUBMITTED"
            : "NOT_STARTED",
    createdAt: batch.createdAt,
    updatedAt: daysAgoIso(Math.floor(rnd() * 5)),
    education: {
      highestQualification: mcaDeclared ? "MCA" : QUALIFICATIONS[Math.floor(rnd() * QUALIFICATIONS.length)]!,
      graduation: "B.Sc Computer Science, 2021",
      mcaDeclared,
      otherQualifications: rnd() > 0.7 ? ["PG Diploma in Data Science"] : [],
    },
    employment: {
      previousEmployer: EMPLOYERS[Math.floor(rnd() * EMPLOYERS.length)]!,
      experienceYears: Math.round(rnd() * 60) / 10,
    },
    documents: docs,
    verificationLink: `https://abc.internal/verify/${candidateId}`,
    invitationSentAt: invited ? daysAgoIso(daysPending + 4) : undefined,
    verificationStartedAt: ["IN_PROGRESS", "SUBMITTED", "DOCUMENTS_PENDING", ...COMPLETE_STATES].includes(status)
      ? daysAgoIso(daysPending + 2)
      : undefined,
    formSubmittedAt: ["SUBMITTED", "DOCUMENTS_PENDING", ...COMPLETE_STATES].includes(status)
      ? daysAgoIso(daysPending)
      : undefined,
    documentsReviewedAt: COMPLETE_STATES.includes(status) ? daysAgoIso(Math.max(0, daysPending - 1)) : undefined,
    daysPending,
    lastActivity: daysAgoIso(Math.floor(rnd() * 4)),
    lastAction: meta.lastAction,
    nextAction: meta.nextAction,
    owner: rnd() > 0.5 ? "S. Iyer" : "M. Dsouza",
  };
}

export function buildCandidates(): Candidate[] {
  const out: Candidate[] = [];
  for (const batch of BATCH_SPECS) {
    const rnd = seededRandom(batch.seed);
    const plan: VerificationStatus[] = [];
    for (let i = 0; i < batch.complete; i++) plan.push(COMPLETE_STATES[i % COMPLETE_STATES.length]!);
    for (let i = 0; i < batch.inProgress; i++) plan.push(IN_PROGRESS_STATES[i % IN_PROGRESS_STATES.length]!);
    for (let i = 0; i < batch.docsPending; i++) plan.push("DOCUMENTS_PENDING");
    for (let i = 0; i < batch.needsAttention; i++) plan.push("NEEDS_ATTENTION");
    const remaining = batch.total - plan.length;
    for (let i = 0; i < remaining; i++) plan.push("IMPORTED");
    // stable shuffle so statuses are mixed but deterministic
    for (let i = plan.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [plan[i], plan[j]] = [plan[j]!, plan[i]!];
    }
    plan.forEach((status, i) => out.push(makeCandidate(batch, i, status, rnd)));
  }

  // Named demo candidates used throughout the walkthrough.
  const oct = out.filter((c) => c.batchId === "batch-oct-2026");
  const fixtures: Array<[string, string, VerificationStatus]> = [
    ["Rahul", "Sharma", "DOCUMENTS_PENDING"],
    ["Priya", "Mehta", "NEEDS_ATTENTION"],
    ["Aman", "Singh", "NEEDS_ATTENTION"],
  ];
  fixtures.forEach(([first, last, status], i) => {
    const c = oct[i];
    if (!c) return;
    c.firstName = first;
    c.lastName = last;
    c.candidateId = `V00${i + 1}`;
    c.id = `batch-oct-2026-V00${i + 1}`;
    c.email = `${first.toLowerCase()}.${last.toLowerCase()}@example-mail.com`;
    c.verificationStatus = status;
    c.daysPending = [8, 6, 11][i]!;
    c.verificationLink = `https://abc.internal/verify/V00${i + 1}`;
    c.education.mcaDeclared = true;
    c.education.highestQualification = "MCA";
    if (i === 0) {
      c.documents = DOC_DEFS.map((d) => ({
        ...d,
        required: d.key !== "payslip",
        uploaded: d.key !== "mca" && d.key !== "payslip",
        uploadedAt: d.key !== "mca" && d.key !== "payslip" ? daysAgoIso(9) : undefined,
      }));
      c.documentStatus = "PENDING";
      c.lastAction = "Missing document email sent";
      c.nextAction = "Follow-up reminder in 2 days";
    }
  });
  return out;
}

export function buildBatches(): Batch[] {
  return BATCH_SPECS.map((b) => ({
    id: b.id,
    name: b.name,
    joiningDate: b.joiningDate,
    createdAt: b.createdAt,
    project: "ABC",
    location: "ABC",
    payrollEntity: "EY Payroll",
    owner: "S. Iyer",
    status: b.status,
    automation: { ...DEFAULT_AUTOMATION },
  }));
}

const ISSUE_TEMPLATES: Array<{ type: CandidateIssue["type"]; title: string; recommended: string }> = [
  { type: "MISSING_DOCUMENT", title: "MCA Certificate missing", recommended: "Send missing document reminder" },
  { type: "MISSING_DOCUMENT", title: "Graduation Certificate missing", recommended: "Send missing document reminder" },
  { type: "NAME_MISMATCH", title: "Name mismatch with offer letter", recommended: "Contact candidate to confirm name" },
  { type: "VERIFICATION_INCOMPLETE", title: "Verification incomplete", recommended: "Call candidate / escalate" },
  { type: "COMMUNICATION_FAILURE", title: "Email bounced", recommended: "Verify alternate contact details" },
  { type: "INVALID_DATA", title: "Invalid phone number", recommended: "Correct candidate record" },
  { type: "DFMS_ERROR", title: "DFMS submission error (mock)", recommended: "Retry submission after data fix" },
  { type: "CANDIDATE_QUERY", title: "Unanswered candidate query", recommended: "Respond to candidate" },
];

export function buildIssues(candidates: Candidate[]): CandidateIssue[] {
  const rnd = seededRandom(777);
  const flagged = candidates.filter((c) => c.verificationStatus === "NEEDS_ATTENTION");
  return flagged.map((c, i) => {
    const t = ISSUE_TEMPLATES[i % ISSUE_TEMPLATES.length]!;
    const priority: Priority = i % 8 === 0 ? "CRITICAL" : i % 8 < 4 ? "HIGH" : "MEDIUM";
    return {
      id: `issue-${c.id}`,
      candidateId: c.id,
      candidateName: `${c.firstName} ${c.lastName}`,
      batchId: c.batchId,
      type: t.type,
      title: t.title,
      priority,
      status: i % 5 === 0 ? "IN_PROGRESS" : "OPEN",
      daysPending: c.daysPending,
      automatedActions: ["Invitation sent", "Reminder 1 sent", "Reminder 2 sent"].slice(0, (i % 3) + 1),
      recommendedAction: t.recommended,
      owner: rnd() > 0.5 ? "S. Iyer" : "Unassigned",
      createdAt: daysAgoIso(c.daysPending),
      lastCommunication: daysAgoIso(Math.max(1, Math.floor(c.daysPending / 2))),
    };
  });
}

export function buildTemplates(): CommunicationTemplate[] {
  const vars = ["{{candidate_name}}", "{{candidate_id}}", "{{verification_link}}", "{{joining_date}}", "{{deadline}}"];
  return [
    {
      id: "tpl-initial-email",
      name: "Initial Verification Invite",
      category: "Initial Verification",
      channel: "EMAIL",
      subject: "Action Required: Complete ABC Verification",
      body: "Hi {{candidate_name}},\n\nPlease complete your ABC verification using the link below:\n{{verification_link}}\n\nDeadline: {{deadline}}\n\nRegards,\nABC Recruitment Team",
      variables: vars,
      active: true,
      updatedAt: daysAgoIso(30),
    },
    {
      id: "tpl-reminder",
      name: "Verification Reminder",
      category: "Reminder",
      channel: "EMAIL",
      subject: "Reminder: ABC verification pending",
      body: "Hi {{candidate_name}},\n\nOur records show your ABC verification is still pending. Please complete it here: {{verification_link}}\n\nDeadline: {{deadline}}\n\nRegards,\nABC Recruitment Team",
      variables: vars,
      active: true,
      updatedAt: daysAgoIso(24),
    },
    {
      id: "tpl-missing-doc",
      name: "Missing Document Follow-up",
      category: "Missing Document",
      channel: "EMAIL",
      subject: "Document pending: {{missing_document}}",
      body: "Hi {{candidate_name}},\n\nWe could not find your {{missing_document}} in the ABC portal. Please upload it here: {{verification_link}}\n\nRegards,\nABC Recruitment Team",
      variables: [...vars, "{{missing_document}}"],
      active: true,
      updatedAt: daysAgoIso(12),
    },
    {
      id: "tpl-deadline",
      name: "Deadline Reminder",
      category: "Deadline Reminder",
      channel: "EMAIL",
      subject: "Final reminder before {{deadline}}",
      body: "Hi {{candidate_name}},\n\nYour verification must be completed before {{deadline}} to stay on track for a {{joining_date}} joining date.\n\nRegards,\nABC Recruitment Team",
      variables: vars,
      active: true,
      updatedAt: daysAgoIso(18),
    },
    {
      id: "tpl-escalation",
      name: "Recruiter Escalation Notice",
      category: "Escalation",
      channel: "EMAIL",
      subject: "Escalation: {{candidate_name}} ({{candidate_id}}) pending verification",
      body: "Candidate {{candidate_name}} ({{candidate_id}}) has been pending for more than the configured threshold. Please review.",
      variables: vars,
      active: true,
      updatedAt: daysAgoIso(15),
    },
    {
      id: "tpl-complete",
      name: "Verification Complete",
      category: "Verification Complete",
      channel: "EMAIL",
      subject: "Your ABC verification is complete",
      body: "Hi {{candidate_name}},\n\nYour ABC verification is complete. Next step: EY background verification.\n\nRegards,\nABC Recruitment Team",
      variables: vars,
      active: true,
      updatedAt: daysAgoIso(10),
    },
    {
      id: "tpl-dfms",
      name: "DFMS Status Update",
      category: "DFMS Update",
      channel: "EMAIL",
      subject: "Background verification update",
      body: "Hi {{candidate_name}},\n\nYour file has moved to the EY background verification stage.\n\nRegards,\nABC Recruitment Team",
      variables: vars,
      active: false,
      updatedAt: daysAgoIso(6),
    },
    {
      id: "tpl-initial-wa",
      name: "Initial Verification (WhatsApp)",
      category: "Initial Verification",
      channel: "WHATSAPP",
      subject: "—",
      body: "Hi {{candidate_name}}, please complete your ABC verification: {{verification_link}}. Deadline {{deadline}}.",
      variables: vars,
      active: true,
      updatedAt: daysAgoIso(20),
    },
  ];
}

export function buildRules(): AutomationRule[] {
  return [
    {
      id: "rule-reminder-1",
      name: "Verification reminder — day 3",
      description: "Nudge candidates who have not started verification 3 days after invitation.",
      conditions: [
        { field: "verification_status", operator: "equals", value: "NOT_STARTED" },
        { field: "days_since_invitation", operator: "greater than", value: "3" },
      ],
      actions: ["Send Email · Verification Reminder"],
      enabled: true,
      executions: 412,
      lastRunAt: daysAgoIso(0),
    },
    {
      id: "rule-mca",
      name: "MCA declared but certificate missing",
      description: "Creates a missing-document issue and notifies the candidate.",
      conditions: [
        { field: "mca_declared", operator: "equals", value: "YES" },
        { field: "mca_certificate", operator: "equals", value: "MISSING" },
      ],
      actions: ["Create Missing Document Issue", "Send Email · Missing Document Follow-up"],
      enabled: true,
      executions: 118,
      lastRunAt: daysAgoIso(0),
    },
    {
      id: "rule-escalate",
      name: "Escalate stale candidates",
      description: "Escalates candidates pending 10+ days without completing verification.",
      conditions: [
        { field: "days_pending", operator: "greater than or equal", value: "10" },
        { field: "verification_status", operator: "not equals", value: "VERIFICATION_COMPLETE" },
      ],
      actions: ["Create Recruiter Escalation", "Notify Recruitment Team"],
      enabled: true,
      executions: 63,
      lastRunAt: daysAgoIso(1),
    },
    {
      id: "rule-grad",
      name: "Graduation certificate missing",
      description: "Flags submitted candidates without a graduation certificate.",
      conditions: [
        { field: "verification_status", operator: "equals", value: "SUBMITTED" },
        { field: "graduation_certificate", operator: "equals", value: "MISSING" },
      ],
      actions: ["Create Missing Document Issue", "Send Email · Missing Document Follow-up"],
      enabled: true,
      executions: 87,
      lastRunAt: daysAgoIso(1),
    },
    {
      id: "rule-bounce",
      name: "Retry failed communication",
      description: "Retries a failed send once, then raises a communication failure issue.",
      conditions: [{ field: "communication_status", operator: "equals", value: "FAILED" }],
      actions: ["Retry Send (1x)", "Create Communication Failure Issue"],
      enabled: false,
      executions: 12,
      lastRunAt: daysAgoIso(4),
    },
  ];
}

export function buildCommunications(candidates: Candidate[]): Communication[] {
  const rnd = seededRandom(555);
  const pool = candidates.filter((c) => c.verificationStatus !== "IMPORTED").slice(0, 120);
  const out: Communication[] = [];
  pool.forEach((c, i) => {
    const templates: Array<[string, string]> = [
      ["Initial Verification Invite", "Action Required: Complete ABC Verification"],
      ["Verification Reminder", "Reminder: ABC verification pending"],
      ["Missing Document Follow-up", "Document pending: MCA Certificate"],
    ];
    const count = 1 + Math.floor(rnd() * 3);
    for (let k = 0; k < count; k++) {
      const [name, subject] = templates[k]!;
      const failed = rnd() > 0.96;
      out.push({
        id: `comm-${c.id}-${k}`,
        candidateId: c.id,
        candidateName: `${c.firstName} ${c.lastName}`,
        batchId: c.batchId,
        channel: rnd() > 0.85 ? "WHATSAPP" : "EMAIL",
        templateName: name,
        subject,
        body: `Hi ${c.firstName}, please complete your ABC verification: ${c.verificationLink}`,
        status: failed ? "FAILED" : rnd() > 0.08 ? "DELIVERED" : "SENT",
        sentAt: daysAgoIso(12 - k * 4 + (i % 3)),
        failureReason: failed ? "Mailbox unavailable (mock)" : undefined,
      });
    }
  });
  return out.sort((a, b) => b.sentAt.localeCompare(a.sentAt));
}

export function buildQueries(candidates: Candidate[]): CandidateQuery[] {
  const named = candidates.slice(0, 8);
  const seeds: Array<Partial<CandidateQuery> & { question: string }> = [
    {
      question: "What document should I upload for MCA?",
      category: "Documents",
      intent: "Document Requirement",
      confidence: 94,
      suggestedResponse:
        "Please upload your MCA degree certificate issued by your university. A provisional certificate is accepted if the final degree has not been issued yet.",
      aiStatus: "NEEDS_REVIEW",
      priority: "MEDIUM",
    },
    {
      question: "I cannot open the verification link on my phone.",
      category: "Technical Issue",
      intent: "Portal Access Issue",
      confidence: 88,
      suggestedResponse:
        "Please try opening the link in a desktop browser. If it still fails, share a screenshot of the error and the recruitment team will assist.",
      aiStatus: "NEEDS_REVIEW",
      priority: "HIGH",
    },
    {
      question: "Can I join two weeks later than the offered date?",
      category: "General",
      intent: "Joining Date Change",
      confidence: 41,
      suggestedResponse: "",
      aiStatus: "ESCALATED",
      priority: "HIGH",
    },
    {
      question: "What is the last date to complete verification?",
      category: "Deadline",
      intent: "Deadline Enquiry",
      confidence: 97,
      suggestedResponse:
        "Verification must be completed at least 30 days before your joining date. Your current deadline is 15 September 2026.",
      aiStatus: "ANSWERED",
      priority: "LOW",
    },
    {
      question: "My previous employer will not issue a relieving letter yet.",
      category: "Documents",
      intent: "Document Exception",
      confidence: 52,
      suggestedResponse: "",
      aiStatus: "ESCALATED",
      priority: "CRITICAL",
    },
    {
      question: "Which section do I fill for internship experience?",
      category: "Form Filling",
      intent: "Form Guidance",
      confidence: 91,
      suggestedResponse:
        "Internships are captured under the Employment section with employment type set to 'Internship'. Attach the internship completion letter as supporting proof.",
      aiStatus: "NEEDS_REVIEW",
      priority: "MEDIUM",
    },
    {
      question: "Do I need to submit payslips if I am a fresher?",
      category: "Documents",
      intent: "Document Requirement",
      confidence: 96,
      suggestedResponse: "No. Payslips are only required for candidates with prior full-time employment.",
      aiStatus: "ANSWERED",
      priority: "LOW",
    },
    {
      question: "Is the verification portal down today?",
      category: "Technical Issue",
      intent: "Portal Availability",
      confidence: 35,
      suggestedResponse: "",
      aiStatus: "UNKNOWN",
      priority: "MEDIUM",
    },
  ];
  return seeds.map((s, i) => {
    const c = named[i]!;
    return {
      id: `query-${i + 1}`,
      candidateId: c.id,
      candidateName: `${c.firstName} ${c.lastName}`,
      question: s.question,
      category: s.category ?? "General",
      intent: s.intent ?? "General Enquiry",
      confidence: s.confidence ?? 50,
      suggestedResponse: s.suggestedResponse ?? "",
      aiStatus: s.aiStatus ?? "NEEDS_REVIEW",
      priority: s.priority ?? "MEDIUM",
      assignedTo: i % 3 === 0 ? "S. Iyer" : "Unassigned",
      status: s.aiStatus === "ANSWERED" ? "ANSWERED" : s.aiStatus === "ESCALATED" ? "ESCALATED" : "OPEN",
      createdAt: daysAgoIso(i % 5),
    } as CandidateQuery;
  });
}

export function buildActivity(candidates: Candidate[]): ActivityEvent[] {
  const c0 = candidates[0]!;
  const c1 = candidates[1]!;
  return [
    { id: "act-1", candidateId: c0.id, actor: "SYSTEM", message: `Verification reminder sent to ${c0.firstName} ${c0.lastName}`, at: "2026-08-13T09:42:00Z" },
    { id: "act-2", candidateId: c1.id, actor: "CANDIDATE", message: `Candidate ${c1.firstName} ${c1.lastName} uploaded Graduation Certificate`, at: "2026-08-13T09:38:00Z" },
    { id: "act-3", actor: "SYSTEM", message: "45 candidates moved to Documents Pending", at: "2026-08-13T09:30:00Z" },
    { id: "act-4", actor: "RECRUITER", message: 'Batch "ABC October 2026" imported', at: "2026-08-13T09:15:00Z" },
    { id: "act-5", actor: "AI_AGENT", message: "AI assistant drafted 6 candidate responses awaiting review", at: "2026-08-13T08:55:00Z" },
  ];
}

export function buildExecutions(candidates: Candidate[]): AutomationExecution[] {
  return candidates.slice(0, 12).map((c, i) => ({
    id: `exec-${i}`,
    ruleId: i % 2 === 0 ? "rule-reminder-1" : "rule-mca",
    ruleName: i % 2 === 0 ? "Verification reminder — day 3" : "MCA declared but certificate missing",
    candidateId: c.id,
    candidateName: `${c.firstName} ${c.lastName}`,
    outcome: i % 2 === 0 ? "Reminder email queued" : "Missing document issue created",
    at: daysAgoIso(i % 4),
  }));
}

export function buildAuditLogs(): AuditLog[] {
  const actions = [
    ["S. Iyer", "Recruiter", "Started batch automation", "Batch · ABC October 2026"],
    ["M. Dsouza", "Recruiter", "Sent missing document reminder", "Candidate · V001"],
    ["A. Kulkarni", "Recruitment Manager", "Escalated candidate", "Candidate · V003"],
    ["S. Iyer", "Recruiter", "Imported candidate file", "Batch · ABC December 2026"],
    ["System", "Automation", "Executed rule: Escalate stale candidates", "Rule · rule-escalate"],
    ["A. Kulkarni", "Recruitment Manager", "Updated template", "Template · Missing Document Follow-up"],
  ];
  return actions.map((a, i) => ({
    id: `audit-${i}`,
    actor: a[0]!,
    role: a[1]!,
    action: a[2]!,
    entity: a[3]!,
    at: daysAgoIso(i % 6),
    ip: "10.42.11." + (20 + i),
  }));
}

export const INTEGRATIONS: Integration[] = [
  {
    key: "email",
    name: "Email (SMTP / Graph API)",
    description: "Outbound candidate email delivery and delivery-status callbacks.",
    method: "API",
    status: "MOCK",
    note: "Prototype sends are simulated locally. No email leaves this application.",
  },
  {
    key: "whatsapp",
    name: "WhatsApp Business",
    description: "Template-based candidate messaging on WhatsApp.",
    method: "API",
    status: "NOT_CONNECTED",
    note: "Requires approved WhatsApp Business account and message templates.",
  },
  {
    key: "vanguard",
    name: "ABC Verification",
    description: "Candidate verification form status and document upload events.",
    method: "API / RPA",
    status: "NOT_CONNECTED",
    note: "Integration is dependent on approved ABC API or authorized RPA access.",
  },
  {
    key: "dfms",
    name: "DFMS",
    description: "EY background verification case creation and status sync.",
    method: "API / RPA / Manual",
    status: "NOT_CONNECTED",
    note: "Integration is dependent on approved DFMS API access or authorized RPA access.",
  },
  {
    key: "hrms",
    name: "HRMS",
    description: "Employee record creation once BGV clears.",
    method: "API",
    status: "NOT_CONNECTED",
    note: "Requires HRMS integration approval and service account provisioning.",
  },
];

export const USERS: AppUser[] = [
  { id: "u1", name: "S. Iyer", email: "s.iyer@example-ey.com", role: "Recruiter", lastActive: daysAgoIso(0) },
  { id: "u2", name: "M. Dsouza", email: "m.dsouza@example-ey.com", role: "Recruiter", lastActive: daysAgoIso(0) },
  { id: "u3", name: "A. Kulkarni", email: "a.kulkarni@example-ey.com", role: "Recruitment Manager", lastActive: daysAgoIso(1) },
  { id: "u4", name: "R. Fernandes", email: "r.fernandes@example-ey.com", role: "Admin", lastActive: daysAgoIso(2) },
  { id: "u5", name: "T. Menon", email: "t.menon@example-ey.com", role: "Viewer", lastActive: daysAgoIso(3) },
];

export const SAMPLE_COLUMNS = [
  "Candidate ID","First Name","Last Name","Email","Phone","Joining Date","Location","Education",
  "Highest Qualification","MCA","Graduation","Previous Employer","Experience","Verification Link",
];
