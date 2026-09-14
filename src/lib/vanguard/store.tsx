/**
 * In-memory application repository for the ABC prototype.
 *
 * INTEGRATION NOTE
 * ----------------
 * Every mutation below is a local simulation. In production these actions map
 * 1:1 onto backend endpoints that enqueue asynchronous jobs:
 *
 *   UI  ->  Backend API  ->  Batch processor  ->  Workflow engine
 *                                              ->  Communication service (Email/WhatsApp)
 *                                              ->  Validation + document rules -> issues -> escalation
 *
 * No bulk communication is ever executed synchronously from the UI: bulk
 * actions here only *queue* work items, exactly as the real service would.
 */
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  DEFAULT_AUTOMATION,
  INTEGRATIONS,
  TODAY,
  USERS,
  buildActivity,
  buildAuditLogs,
  buildBatches,
  buildCandidates,
  buildCommunications,
  buildExecutions,
  buildIssues,
  buildQueries,
  buildRules,
  buildTemplates,
} from "./mock-data";
import type {
  ActivityEvent,
  AuditLog,
  AutomationConfig,
  AutomationExecution,
  AutomationRule,
  Batch,
  Candidate,
  CandidateIssue,
  CandidateQuery,
  Channel,
  Communication,
  CommunicationTemplate,
  Priority,
  VerificationStatus,
} from "./types";

interface State {
  batches: Batch[];
  candidates: Candidate[];
  issues: CandidateIssue[];
  communications: Communication[];
  templates: CommunicationTemplate[];
  rules: AutomationRule[];
  executions: AutomationExecution[];
  queries: CandidateQuery[];
  activity: ActivityEvent[];
  audit: AuditLog[];
}

function initialState(): State {
  const batches = buildBatches();
  const candidates = buildCandidates();
  return {
    batches,
    candidates,
    issues: buildIssues(candidates),
    communications: buildCommunications(candidates),
    templates: buildTemplates(),
    rules: buildRules(),
    executions: buildExecutions(candidates),
    queries: buildQueries(candidates),
    activity: buildActivity(candidates),
    audit: buildAuditLogs(),
  };
}

let counter = 0;
const uid = (p: string) => `${p}-${++counter}-${Math.floor(Math.random() * 1e6)}`;
const nowIso = () => new Date().toISOString();

export interface NewBatchInput {
  name: string;
  joiningDate: string;
  project: string;
  location: string;
  payrollEntity: string;
  owner: string;
  automation: AutomationConfig;
  rows: Array<Record<string, string>>;
}

interface Store extends State {
  currentUser: { name: string; role: string; initials: string };
  integrations: typeof INTEGRATIONS;
  users: typeof USERS;
  getCandidate: (id: string) => Candidate | undefined;
  getBatch: (id: string) => Batch | undefined;
  sendCommunication: (
    candidateIds: string[],
    channel: Channel,
    templateId: string,
    opts?: { forceFail?: boolean },
  ) => number;
  updateCandidateStatus: (id: string, status: VerificationStatus) => void;
  createIssue: (
    candidateId: string,
    type: CandidateIssue["type"],
    title: string,
    priority: Priority,
    recommended: string,
  ) => void;
  resolveIssue: (id: string) => void;
  escalateIssue: (id: string) => void;
  assignIssue: (id: string, owner: string) => void;
  createBatch: (input: NewBatchInput) => Batch;
  setBatchStatus: (id: string, status: Batch["status"]) => void;
  updateBatchAutomation: (id: string, automation: AutomationConfig) => void;
  saveTemplate: (t: CommunicationTemplate) => void;
  toggleTemplate: (id: string) => void;
  saveRule: (r: AutomationRule) => void;
  toggleRule: (id: string) => void;
  answerQuery: (id: string, answer: string) => void;
  escalateQuery: (id: string) => void;
  assignQuery: (id: string, owner: string) => void;
  simulate: (event: SimEvent, candidateId: string) => string;
  addNote: (candidateId: string, note: string) => void;
}

export type SimEvent =
  | "COMPLETE_VERIFICATION"
  | "UPLOAD_DOCUMENT"
  | "MISS_DOCUMENT"
  | "ASK_QUESTION"
  | "REMINDER_DUE"
  | "ESCALATE"
  | "COMM_SUCCESS"
  | "COMM_FAIL";

const StoreContext = createContext<Store | null>(null);

export function VanguardProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>(initialState);

  const pushActivity = useCallback(
    (message: string, actor: ActivityEvent["actor"], candidateId?: string) => {
      setState((s) => ({
        ...s,
        activity: [
          { id: uid("act"), message, actor, at: nowIso(), ...(candidateId ? { candidateId } : {}) },
          ...s.activity,
        ].slice(0, 200),
      }));
    },
    [],
  );

  const pushAudit = useCallback((action: string, entity: string) => {
    setState((s) => ({
      ...s,
      audit: [
        { id: uid("audit"), actor: "S. Iyer", role: "Recruiter", action, entity, at: nowIso(), ip: "10.42.11.20" },
        ...s.audit,
      ].slice(0, 200),
    }));
  }, []);

  const getCandidate = useCallback((id: string) => state.candidates.find((c) => c.id === id), [state.candidates]);
  const getBatch = useCallback((id: string) => state.batches.find((b) => b.id === id), [state.batches]);

  const sendCommunication = useCallback<Store["sendCommunication"]>(
    (candidateIds, channel, templateId, opts) => {
      setState((s) => {
        const tpl = s.templates.find((t) => t.id === templateId) ?? s.templates[0]!;
        const comms: Communication[] = [];
        const acts: ActivityEvent[] = [];
        for (const cid of candidateIds) {
          const c = s.candidates.find((x) => x.id === cid);
          if (!c) continue;
          const failed = Boolean(opts?.forceFail);
          comms.push({
            id: uid("comm"),
            candidateId: c.id,
            candidateName: `${c.firstName} ${c.lastName}`,
            batchId: c.batchId,
            channel,
            templateName: tpl.name,
            subject: tpl.subject,
            body: tpl.body
              .replaceAll("{{candidate_name}}", c.firstName)
              .replaceAll("{{candidate_id}}", c.candidateId)
              .replaceAll("{{verification_link}}", c.verificationLink)
              .replaceAll("{{joining_date}}", c.joiningDate)
              .replaceAll("{{deadline}}", "15 Sep 2026")
              .replaceAll("{{missing_document}}", c.documents.find((d) => d.required && !d.uploaded)?.label ?? "document"),
            status: failed ? "FAILED" : "DELIVERED",
            sentAt: nowIso(),
            ...(failed ? { failureReason: "Mailbox unavailable (simulated)" } : {}),
          });
          acts.push({
            id: uid("act"),
            candidateId: c.id,
            actor: "SYSTEM" as const,
            message: `${channel === "EMAIL" ? "Email" : "WhatsApp"} "${tpl.name}" ${failed ? "failed for" : "sent to"} ${c.firstName} ${c.lastName}`,
            at: nowIso(),
          });
        }
        return {
          ...s,
          communications: [...comms, ...s.communications],
          activity: [...acts, ...s.activity].slice(0, 200),
          candidates: s.candidates.map((c) =>
            candidateIds.includes(c.id)
              ? { ...c, communicationStatus: opts?.forceFail ? "FAILED" : "DELIVERED", lastActivity: nowIso() }
              : c,
          ),
        };
      });
      pushAudit(`Queued ${channel.toLowerCase()} communication`, `${candidateIds.length} candidate(s)`);
      return candidateIds.length;
    },
    [pushAudit],
  );

  const updateCandidateStatus = useCallback<Store["updateCandidateStatus"]>((id, status) => {
    setState((s) => ({
      ...s,
      candidates: s.candidates.map((c) =>
        c.id === id ? { ...c, verificationStatus: status, updatedAt: nowIso(), lastActivity: nowIso() } : c,
      ),
    }));
  }, []);

  const createIssue = useCallback<Store["createIssue"]>((candidateId, type, title, priority, recommended) => {
    setState((s) => {
      const c = s.candidates.find((x) => x.id === candidateId);
      if (!c) return s;
      if (s.issues.some((i) => i.candidateId === candidateId && i.title === title && i.status !== "RESOLVED")) return s;
      const issue: CandidateIssue = {
        id: uid("issue"),
        candidateId,
        candidateName: `${c.firstName} ${c.lastName}`,
        batchId: c.batchId,
        type,
        title,
        priority,
        status: "OPEN",
        daysPending: c.daysPending,
        automatedActions: ["Invitation sent", "Reminder sent"],
        recommendedAction: recommended,
        owner: "Unassigned",
        createdAt: nowIso(),
        lastCommunication: nowIso(),
      };
      return {
        ...s,
        issues: [issue, ...s.issues],
        activity: [
          { id: uid("act"), candidateId, actor: "SYSTEM" as const, message: `Issue created: ${title}`, at: nowIso() },
          ...s.activity,
        ].slice(0, 200),
      };
    });
  }, []);

  const resolveIssue = useCallback<Store["resolveIssue"]>(
    (id) => {
      setState((s) => ({ ...s, issues: s.issues.map((i) => (i.id === id ? { ...i, status: "RESOLVED" } : i)) }));
      pushAudit("Resolved issue", `Issue · ${id}`);
    },
    [pushAudit],
  );

  const escalateIssue = useCallback<Store["escalateIssue"]>(
    (id) => {
      setState((s) => ({ ...s, issues: s.issues.map((i) => (i.id === id ? { ...i, status: "ESCALATED", priority: "CRITICAL" } : i)) }));
      pushAudit("Escalated issue", `Issue · ${id}`);
    },
    [pushAudit],
  );

  const assignIssue = useCallback<Store["assignIssue"]>((id, owner) => {
    setState((s) => ({ ...s, issues: s.issues.map((i) => (i.id === id ? { ...i, owner, status: "IN_PROGRESS" } : i)) }));
  }, []);

  const createBatch = useCallback<Store["createBatch"]>(
    (input) => {
      const id = `batch-${uid("b")}`;
      const batch: Batch = {
        id,
        name: input.name,
        joiningDate: input.joiningDate,
        createdAt: nowIso(),
        project: input.project,
        location: input.location,
        payrollEntity: input.payrollEntity,
        owner: input.owner,
        status: "AUTOMATION_RUNNING",
        automation: input.automation,
      };
      const candidates: Candidate[] = input.rows.map((r, i) => {
        const cid = r["Candidate ID"] || `NEW${String(i + 1).padStart(3, "0")}`;
        const mca = (r["MCA"] || "").toUpperCase() === "YES";
        return {
          id: `${id}-${cid}`,
          candidateId: cid,
          firstName: r["First Name"] || "Candidate",
          lastName: r["Last Name"] || String(i + 1),
          email: r["Email"] || `candidate${i}@example-mail.com`,
          phone: r["Phone"] || "+91 90000 00000",
          joiningDate: r["Joining Date"] || input.joiningDate,
          location: r["Location"] || input.location,
          batchId: id,
          verificationStatus: input.automation.sendEmail ? "INVITATION_SENT" : "IMPORTED",
          documentStatus: "NOT_STARTED",
          communicationStatus: input.automation.sendEmail ? "QUEUED" : "QUEUED",
          bgvStatus: "NOT_STARTED",
          createdAt: nowIso(),
          updatedAt: nowIso(),
          education: {
            highestQualification: r["Highest Qualification"] || "B.Tech",
            graduation: r["Graduation"] || "—",
            mcaDeclared: mca,
            otherQualifications: [],
          },
          employment: {
            previousEmployer: r["Previous Employer"] || "Fresher",
            experienceYears: Number(r["Experience"] || 0),
          },
          documents: [
            { key: "identity", label: "Identity Proof", required: true, uploaded: false },
            { key: "graduation", label: "Graduation Certificate", required: true, uploaded: false },
            ...(mca ? [{ key: "mca", label: "MCA Certificate", required: true, uploaded: false }] : []),
          ],
          verificationLink: r["Verification Link"] || `https://abc.internal/verify/${cid}`,
          invitationSentAt: input.automation.sendEmail ? nowIso() : undefined,
          daysPending: 0,
          lastActivity: nowIso(),
          lastAction: input.automation.sendEmail ? "Invitation queued" : "Imported",
          nextAction: input.automation.remindersEnabled
            ? `Reminder in ${input.automation.reminderDays[0] ?? 3} days`
            : "Await candidate action",
          owner: input.owner,
        };
      });
      setState((s) => ({
        ...s,
        batches: [batch, ...s.batches],
        candidates: [...candidates, ...s.candidates],
        activity: [
          {
            id: uid("act"),
            actor: "RECRUITER" as const,
            message: `Batch "${batch.name}" imported with ${candidates.length} candidates`,
            at: nowIso(),
          },
          {
            id: uid("act"),
            actor: "SYSTEM" as const,
            message: `Automation started · ${candidates.length} invitations queued for background delivery (simulated)`,
            at: nowIso(),
          },
          ...s.activity,
        ].slice(0, 200),
      }));
      pushAudit("Created batch and started automation", `Batch · ${batch.name}`);
      return batch;
    },
    [pushAudit],
  );

  const setBatchStatus = useCallback<Store["setBatchStatus"]>(
    (id, status) => {
      setState((s) => ({ ...s, batches: s.batches.map((b) => (b.id === id ? { ...b, status } : b)) }));
      pushAudit(`Batch automation set to ${status}`, `Batch · ${id}`);
    },
    [pushAudit],
  );

  const updateBatchAutomation = useCallback<Store["updateBatchAutomation"]>(
    (id, automation) => {
      setState((s) => ({ ...s, batches: s.batches.map((b) => (b.id === id ? { ...b, automation } : b)) }));
      pushAudit("Updated automation configuration", `Batch · ${id}`);
    },
    [pushAudit],
  );

  const saveTemplate = useCallback<Store["saveTemplate"]>(
    (t) => {
      setState((s) => ({
        ...s,
        templates: s.templates.some((x) => x.id === t.id)
          ? s.templates.map((x) => (x.id === t.id ? { ...t, updatedAt: nowIso() } : x))
          : [{ ...t, updatedAt: nowIso() }, ...s.templates],
      }));
      pushAudit("Saved template", `Template · ${t.name}`);
    },
    [pushAudit],
  );

  const toggleTemplate = useCallback<Store["toggleTemplate"]>((id) => {
    setState((s) => ({ ...s, templates: s.templates.map((t) => (t.id === id ? { ...t, active: !t.active } : t)) }));
  }, []);

  const saveRule = useCallback<Store["saveRule"]>(
    (r) => {
      setState((s) => ({
        ...s,
        rules: s.rules.some((x) => x.id === r.id) ? s.rules.map((x) => (x.id === r.id ? r : x)) : [r, ...s.rules],
      }));
      pushAudit("Saved automation rule", `Rule · ${r.name}`);
    },
    [pushAudit],
  );

  const toggleRule = useCallback<Store["toggleRule"]>((id) => {
    setState((s) => ({ ...s, rules: s.rules.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r)) }));
  }, []);

  const answerQuery = useCallback<Store["answerQuery"]>(
    (id, answer) => {
      setState((s) => ({
        ...s,
        queries: s.queries.map((q) =>
          q.id === id ? { ...q, answer, status: "ANSWERED", aiStatus: "ANSWERED" } : q,
        ),
      }));
      pushAudit("Answered candidate query", `Query · ${id}`);
    },
    [pushAudit],
  );

  const escalateQuery = useCallback<Store["escalateQuery"]>(
    (id) => {
      setState((s) => {
        const q = s.queries.find((x) => x.id === id);
        const next = {
          ...s,
          queries: s.queries.map((x) => (x.id === id ? { ...x, status: "ESCALATED" as const, aiStatus: "ESCALATED" as const } : x)),
        };
        if (!q) return next;
        const c = s.candidates.find((x) => x.id === q.candidateId);
        if (!c) return next;
        const issue: CandidateIssue = {
          id: uid("issue"),
          candidateId: c.id,
          candidateName: q.candidateName,
          batchId: c.batchId,
          type: "CANDIDATE_QUERY",
          title: `Escalated query: ${q.question.slice(0, 48)}`,
          priority: "HIGH",
          status: "ESCALATED",
          daysPending: c.daysPending,
          automatedActions: ["AI classification", "Knowledge base search"],
          recommendedAction: "Recruiter to respond to candidate directly",
          owner: "Recruitment Team",
          createdAt: nowIso(),
          lastCommunication: nowIso(),
        };
        return {
          ...next,
          issues: [issue, ...next.issues],
          activity: [
            { id: uid("act"), candidateId: c.id, actor: "AI_AGENT" as const, message: `Query escalated to recruiter: "${q.question}"`, at: nowIso() },
            ...next.activity,
          ].slice(0, 200),
        };
      });
      pushAudit("Escalated candidate query", `Query · ${id}`);
    },
    [pushAudit],
  );

  const assignQuery = useCallback<Store["assignQuery"]>((id, owner) => {
    setState((s) => ({ ...s, queries: s.queries.map((q) => (q.id === id ? { ...q, assignedTo: owner } : q)) }));
  }, []);

  const addNote = useCallback<Store["addNote"]>((candidateId, note) => {
    setState((s) => ({
      ...s,
      activity: [
        { id: uid("act"), candidateId, actor: "RECRUITER" as const, message: `Note: ${note}`, at: nowIso() },
        ...s.activity,
      ].slice(0, 200),
    }));
  }, []);

  /**
   * Simulation harness — stands in for real webhooks from ABC / the
   * communication service until those integrations are approved.
   */
  const simulate = useCallback<Store["simulate"]>(
    (event, candidateId) => {
      let message = "";
      setState((s) => {
        const c = s.candidates.find((x) => x.id === candidateId);
        if (!c) return s;
        const name = `${c.firstName} ${c.lastName}`;
        let candidates = s.candidates;
        let issues = s.issues;
        let communications = s.communications;
        let queries = s.queries;
        let executions = s.executions;
        const acts: ActivityEvent[] = [];
        const patch = (p: Partial<Candidate>) => {
          candidates = candidates.map((x) => (x.id === candidateId ? { ...x, ...p, updatedAt: nowIso() } : x));
        };

        switch (event) {
          case "COMPLETE_VERIFICATION": {
            patch({
              verificationStatus: "VERIFICATION_COMPLETE",
              documentStatus: "COMPLETE",
              documents: c.documents.map((d) => ({ ...d, uploaded: true, uploadedAt: nowIso() })),
              formSubmittedAt: nowIso(),
              documentsReviewedAt: nowIso(),
              lastAction: "Verification approved",
              nextAction: "Submit to DFMS",
            });
            issues = issues.map((i) => (i.candidateId === candidateId ? { ...i, status: "RESOLVED" } : i));
            acts.push({ id: uid("act"), candidateId, actor: "CANDIDATE" as const, message: `${name} completed ABC verification (simulated)`, at: nowIso() });
            message = `${name} marked as Verification Complete`;
            break;
          }
          case "UPLOAD_DOCUMENT": {
            const pending = c.documents.find((d) => !d.uploaded);
            if (!pending) {
              message = `${name} has no pending documents`;
              break;
            }
            const docs = c.documents.map((d) => (d.key === pending.key ? { ...d, uploaded: true, uploadedAt: nowIso() } : d));
            const stillMissing = docs.filter((d) => d.required && !d.uploaded).length;
            patch({
              documents: docs,
              documentStatus: stillMissing === 0 ? "COMPLETE" : "PENDING",
              verificationStatus: stillMissing === 0 ? "SUBMITTED" : c.verificationStatus,
              lastAction: `${pending.label} uploaded`,
            });
            issues = issues.map((i) =>
              i.candidateId === candidateId && i.title.includes(pending.label) ? { ...i, status: "RESOLVED" } : i,
            );
            acts.push({ id: uid("act"), candidateId, actor: "CANDIDATE" as const, message: `${name} uploaded ${pending.label} (simulated)`, at: nowIso() });
            message = `${pending.label} uploaded for ${name}`;
            break;
          }
          case "MISS_DOCUMENT": {
            const target = c.documents.find((d) => d.key === "mca") ?? c.documents[1] ?? c.documents[0]!;
            const docs = c.documents.map((d) => (d.key === target.key ? { ...d, uploaded: false, required: true, uploadedAt: undefined } : d));
            patch({
              documents: docs,
              documentStatus: "PENDING",
              verificationStatus: "DOCUMENTS_PENDING",
              lastAction: `${target.label} detected as missing`,
              nextAction: "Missing document follow-up",
            });
            const rule = s.rules.find((r) => r.id === "rule-mca");
            const title = `${target.label} missing`;
            if (!issues.some((i) => i.candidateId === candidateId && i.title === title && i.status !== "RESOLVED")) {
              issues = [
                {
                  id: uid("issue"),
                  candidateId,
                  candidateName: name,
                  batchId: c.batchId,
                  type: "MISSING_DOCUMENT",
                  title,
                  priority: "HIGH",
                  status: "OPEN",
                  daysPending: c.daysPending,
                  automatedActions: ["Document rule executed", "Missing document email sent"],
                  recommendedAction: "Await candidate upload, follow up in 2 days",
                  owner: "Unassigned",
                  createdAt: nowIso(),
                  lastCommunication: nowIso(),
                },
                ...issues,
              ];
            }
            const tpl = s.templates.find((t) => t.id === "tpl-missing-doc")!;
            communications = [
              {
                id: uid("comm"),
                candidateId,
                candidateName: name,
                batchId: c.batchId,
                channel: "EMAIL",
                templateName: tpl.name,
                subject: tpl.subject.replaceAll("{{missing_document}}", target.label),
                body: tpl.body
                  .replaceAll("{{candidate_name}}", c.firstName)
                  .replaceAll("{{missing_document}}", target.label)
                  .replaceAll("{{verification_link}}", c.verificationLink),
                status: "DELIVERED",
                sentAt: nowIso(),
              },
              ...communications,
            ];
            executions = [
              {
                id: uid("exec"),
                ruleId: rule?.id ?? "rule-mca",
                ruleName: rule?.name ?? "MCA declared but certificate missing",
                candidateId,
                candidateName: name,
                outcome: `Issue created + missing document email sent (${target.label})`,
                at: nowIso(),
              },
              ...executions,
            ];
            acts.push({ id: uid("act"), candidateId, actor: "SYSTEM" as const, message: `Rule matched: ${target.label} missing → issue created and email sent`, at: nowIso() });
            message = `${target.label} missing — issue created and follow-up email sent`;
            break;
          }
          case "ASK_QUESTION": {
            const q: CandidateQuery = {
              id: uid("query"),
              candidateId,
              candidateName: name,
              question: "What document should I upload for MCA?",
              category: "Documents",
              intent: "Document Requirement",
              confidence: 94,
              suggestedResponse:
                "Please upload your MCA degree certificate issued by your university. A provisional certificate is accepted if the final degree has not been issued yet.",
              aiStatus: "NEEDS_REVIEW",
              priority: "MEDIUM",
              assignedTo: "Unassigned",
              status: "OPEN",
              createdAt: nowIso(),
            };
            queries = [q, ...queries];
            acts.push({ id: uid("act"), candidateId, actor: "CANDIDATE" as const, message: `${name} submitted a query (simulated)`, at: nowIso() });
            acts.push({ id: uid("act"), candidateId, actor: "AI_AGENT" as const, message: "AI assistant classified query as 'Document Requirement' (94% confidence) — awaiting recruiter approval", at: nowIso() });
            message = `Query captured for ${name} — see AI Assistant`;
            break;
          }
          case "REMINDER_DUE": {
            const tpl = s.templates.find((t) => t.id === "tpl-reminder")!;
            communications = [
              {
                id: uid("comm"),
                candidateId,
                candidateName: name,
                batchId: c.batchId,
                channel: "EMAIL",
                templateName: tpl.name,
                subject: tpl.subject,
                body: tpl.body.replaceAll("{{candidate_name}}", c.firstName).replaceAll("{{verification_link}}", c.verificationLink),
                status: "DELIVERED",
                sentAt: nowIso(),
              },
              ...communications,
            ];
            patch({ lastAction: "Reminder sent", nextAction: "Escalate if unresolved" });
            acts.push({ id: uid("act"), candidateId, actor: "SYSTEM" as const, message: `Scheduled reminder delivered to ${name}`, at: nowIso() });
            message = `Reminder sent to ${name}`;
            break;
          }
          case "ESCALATE": {
            patch({ verificationStatus: "NEEDS_ATTENTION", lastAction: "Escalated to recruitment team" });
            issues = [
              {
                id: uid("issue"),
                candidateId,
                candidateName: name,
                batchId: c.batchId,
                type: "VERIFICATION_INCOMPLETE",
                title: "Escalated — verification incomplete beyond threshold",
                priority: "CRITICAL",
                status: "ESCALATED",
                daysPending: c.daysPending,
                automatedActions: ["Reminder 1", "Reminder 2", "Reminder 3"],
                recommendedAction: "Recruiter to call candidate",
                owner: "Recruitment Team",
                createdAt: nowIso(),
                lastCommunication: nowIso(),
              },
              ...issues,
            ];
            acts.push({ id: uid("act"), candidateId, actor: "SYSTEM" as const, message: `${name} escalated to Recruitment Team`, at: nowIso() });
            message = `${name} escalated`;
            break;
          }
          case "COMM_SUCCESS":
          case "COMM_FAIL": {
            const failed = event === "COMM_FAIL";
            communications = [
              {
                id: uid("comm"),
                candidateId,
                candidateName: name,
                batchId: c.batchId,
                channel: "EMAIL",
                templateName: "Verification Reminder",
                subject: "Reminder: ABC verification pending",
                body: "Simulated delivery event.",
                status: failed ? "FAILED" : "DELIVERED",
                sentAt: nowIso(),
                ...(failed ? { failureReason: "SMTP 550 mailbox unavailable (simulated)" } : {}),
              },
              ...communications,
            ];
            patch({ communicationStatus: failed ? "FAILED" : "DELIVERED" });
            if (failed) {
              issues = [
                {
                  id: uid("issue"),
                  candidateId,
                  candidateName: name,
                  batchId: c.batchId,
                  type: "COMMUNICATION_FAILURE",
                  title: "Email delivery failed",
                  priority: "HIGH",
                  status: "OPEN",
                  daysPending: c.daysPending,
                  automatedActions: ["Retry attempted (1x)"],
                  recommendedAction: "Verify alternate contact details",
                  owner: "Unassigned",
                  createdAt: nowIso(),
                  lastCommunication: nowIso(),
                },
                ...issues,
              ];
            }
            acts.push({ id: uid("act"), candidateId, actor: "SYSTEM" as const, message: `Delivery event simulated: ${failed ? "FAILED" : "DELIVERED"} for ${name}`, at: nowIso() });
            message = failed ? `Delivery failure simulated for ${name}` : `Successful delivery simulated for ${name}`;
            break;
          }
        }

        return {
          ...s,
          candidates,
          issues,
          communications,
          queries,
          executions,
          activity: [...acts, ...s.activity].slice(0, 200),
        };
      });
      return message;
    },
    [],
  );

  const value = useMemo<Store>(
    () => ({
      ...state,
      currentUser: { name: "S. Iyer", role: "Recruiter", initials: "SI" },
      integrations: INTEGRATIONS,
      users: USERS,
      getCandidate,
      getBatch,
      sendCommunication,
      updateCandidateStatus,
      createIssue,
      resolveIssue,
      escalateIssue,
      assignIssue,
      createBatch,
      setBatchStatus,
      updateBatchAutomation,
      saveTemplate,
      toggleTemplate,
      saveRule,
      toggleRule,
      answerQuery,
      escalateQuery,
      assignQuery,
      simulate,
      addNote,
    }),
    [
      state, getCandidate, getBatch, sendCommunication, updateCandidateStatus, createIssue, resolveIssue,
      escalateIssue, assignIssue, createBatch, setBatchStatus, updateBatchAutomation, saveTemplate,
      toggleTemplate, saveRule, toggleRule, answerQuery, escalateQuery, assignQuery, simulate, addNote,
    ],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useVanguard() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useVanguard must be used inside VanguardProvider");
  return ctx;
}

export { DEFAULT_AUTOMATION, TODAY };
