import { useMemo, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  UploadCloud,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { useVanguard, DEFAULT_AUTOMATION } from "@/lib/vanguard/store";
import { SAMPLE_COLUMNS } from "@/lib/vanguard/mock-data";
import { emailApi, type ValidationResult } from "@/lib/email/api";
import { useAuth } from "@/lib/auth/store";
import { DataCard, EmptyState, PageHeader, SectionTitle } from "@/components/vanguard/primitives";
import { Pill } from "@/components/vanguard/status";
import { ConfirmDialog } from "@/components/vanguard/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { AutomationConfig } from "@/lib/vanguard/types";

export const Route = createFileRoute("/batches/new")({
  head: () => ({
    meta: [
      { title: "Create Batch · ABC Automation" },
      {
        name: "description",
        content: "Upload a candidate file, validate the data and configure onboarding automation.",
      },
      { property: "og:title", content: "Create Batch · ABC Automation" },
      {
        property: "og:description",
        content: "Four-step batch import and automation configuration wizard.",
      },
    ],
  }),
  component: CreateBatch,
});

interface UploadedFile {
  name: string;
  size: number;
  validation: ValidationResult;
}

/**
 * Builds a real CSV (canonical backend headers) for the "Use demo file" affordance, so the
 * demo path exercises the exact same backend validate/import endpoints as a real upload —
 * there is no separate synthetic/mock candidate path anymore.
 */
function syntheticCsv(count: number): string {
  const headers = [
    "candidate_id",
    "first_name",
    "last_name",
    "email",
    "phone",
    "joining_date",
    "location",
    "verification_link",
  ];
  const rows = Array.from({ length: count }, (_, i) => {
    const id = `V${String(i + 1).padStart(4, "0")}`;
    return [
      id,
      ["Aarav", "Isha", "Rohan", "Sara", "Kabir"][i % 5]!,
      ["Nair", "Kapoor", "Menon", "Shah", "Rao"][i % 5]!,
      i % 87 === 0 ? "" : `candidate${i + 1}@example-mail.com`,
      i % 143 === 0 ? "12345" : `9${String(800000000 + i).slice(0, 9)}`,
      "2026-10-15",
      "Bengaluru",
      `https://abc.internal/verify/${id}`,
    ].join(",");
  });
  return [headers.join(","), ...rows].join("\n");
}

function CreateBatch() {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const { templates } = useVanguard();
  const [step, setStep] = useState(1);
  const [details, setDetails] = useState({
    name: "ABC October 2026",
    joiningDate: "2026-10-15",
    project: "ABC",
    location: "ABC",
    payrollEntity: "EY Payroll",
    owner: "S. Iyer",
  });
  const [file, setFile] = useState<UploadedFile | null>(null);
  const [rawFile, setRawFile] = useState<File | null>(null);
  const [validating, setValidating] = useState(false);
  const [validated, setValidated] = useState(false);
  const [automation, setAutomation] = useState<AutomationConfig>({ ...DEFAULT_AUTOMATION });
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  /**
   * Validates against the real backend (`POST /api/batches/validate`) — the same
   * endpoint /email-automation's importer uses — so what the wizard previews here is
   * exactly what will be persisted on import, never a separate/local parser.
   */
  const runValidate = async (f: File) => {
    setValidating(true);
    try {
      const validation = await emailApi.validateFile(f);
      setFile({ name: f.name, size: f.size, validation });
      setRawFile(f);
      setValidated(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not validate file");
    } finally {
      setValidating(false);
    }
  };

  const handleFiles = async (files: FileList | null) => {
    const f = files?.[0];
    if (!f) return;
    await runValidate(f);
  };

  const useSample = async () => {
    const f = new File([syntheticCsv(875)], "abc-october-2026.csv", { type: "text/csv" });
    await runValidate(f);
    toast.success("Sample candidate file loaded");
  };

  const downloadTemplate = () => {
    const csv = SAMPLE_COLUMNS.join(",") + "\n";
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "abc-candidate-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const errorReport = () => {
    if (!file) return;
    const csv = [
      "Row,Candidate,Email,Issue,Severity",
      ...file.validation.issues.map(
        (i) => `${i.row},"${i.candidate}","${i.email}","${i.issue}",${i.severity}`,
      ),
    ].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "abc-import-errors.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const emailTemplates = useMemo(() => templates.filter((t) => t.channel === "EMAIL"), [templates]);
  const waTemplates = useMemo(() => templates.filter((t) => t.channel === "WHATSAPP"), [templates]);

  const steps = ["Batch details", "Upload file", "Validation", "Automation", "Preview & start"];

  if (currentUser && currentUser.role !== "MANAGER") {
    return (
      <>
        <PageHeader
          title="Create Batch"
          description="Import a candidate batch and start onboarding automation."
        />
        <EmptyState
          title="Manager access required"
          description="Creating batches and uploading candidate CSVs is restricted to managers."
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Create Batch"
        description="Import a candidate batch and start onboarding automation."
      />

      <ol className="mb-6 flex flex-wrap gap-2">
        {steps.map((label, i) => {
          const n = i + 1;
          return (
            <li
              key={label}
              className={cn(
                "flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium",
                step === n
                  ? "border-primary bg-accent text-accent-foreground"
                  : "border-border bg-card text-muted-foreground",
              )}
            >
              <span
                className={cn(
                  "tabular flex size-5 items-center justify-center rounded-full text-[11px] font-bold",
                  step > n
                    ? "bg-success text-success-foreground"
                    : step === n
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted",
                )}
              >
                {step > n ? "✓" : n}
              </span>
              {label}
            </li>
          );
        })}
      </ol>

      {step === 1 ? (
        <DataCard className="max-w-2xl p-6">
          <SectionTitle>Step 1 — Batch details</SectionTitle>
          <div className="grid gap-4 sm:grid-cols-2">
            {(
              [
                ["Batch name", "name"],
                ["Joining date", "joiningDate"],
                ["Project", "project"],
                ["Location", "location"],
                ["Payroll entity", "payrollEntity"],
                ["Recruitment owner", "owner"],
              ] as const
            ).map(([label, key]) => (
              <div key={key} className="space-y-1.5">
                <Label className="text-xs">{label}</Label>
                <Input
                  type={key === "joiningDate" ? "date" : "text"}
                  value={details[key]}
                  onChange={(e) => setDetails({ ...details, [key]: e.target.value })}
                />
              </div>
            ))}
          </div>
          <div className="mt-6 flex justify-end">
            <Button onClick={() => setStep(2)} disabled={!details.name || !details.joiningDate}>
              Continue
            </Button>
          </div>
        </DataCard>
      ) : null}

      {step === 2 ? (
        <DataCard className="max-w-2xl p-6">
          <SectionTitle>Step 2 — Upload candidate file</SectionTitle>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              void handleFiles(e.dataTransfer.files);
            }}
            onClick={() => inputRef.current?.click()}
            className={cn(
              "flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed p-10 text-center transition-colors",
              dragging
                ? "border-primary bg-accent"
                : "border-border hover:border-primary/50 hover:bg-accent/40",
            )}
          >
            <UploadCloud className="size-7 text-muted-foreground" />
            <p className="text-sm font-medium">Upload Candidate Excel / CSV</p>
            <p className="text-xs text-muted-foreground">
              Drag and drop, or click to browse · .xlsx .xls .csv
            </p>
            <input
              ref={inputRef}
              type="file"
              accept=".csv,.xls,.xlsx"
              className="hidden"
              onChange={(e) => void handleFiles(e.target.files)}
            />
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={downloadTemplate}>
              <Download className="size-4" /> Download sample template
            </Button>
            <Button variant="ghost" size="sm" onClick={useSample}>
              Use demo file (875 rows)
            </Button>
          </div>

          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5">
            {SAMPLE_COLUMNS.map((c) => (
              <span key={c} className="text-[11px] font-medium text-muted-foreground">
                • {c}
              </span>
            ))}
          </div>

          {file ? (
            <div className="mt-5 rounded-lg border border-border bg-muted/40 p-4">
              <div className="flex items-center gap-2 text-sm font-medium">
                <FileSpreadsheet className="size-4 text-primary" /> {file.name}
                <span className="text-xs text-muted-foreground">
                  ({Math.round(file.size / 1024)} KB)
                </span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
                <Stat label="Rows" value={file.validation.total} />
                <Stat label="Valid" value={file.validation.validCount} tone="success" />
                <Stat label="Invalid" value={file.validation.invalidCount} tone="danger" />
                <Stat label="Duplicates" value={file.validation.duplicateCount} tone="warning" />
              </div>
            </div>
          ) : null}

          <div className="mt-6 flex justify-between">
            <Button variant="outline" onClick={() => setStep(1)}>
              Back
            </Button>
            <Button
              disabled={!file || validating}
              onClick={() => {
                setValidated(true);
                setStep(3);
              }}
            >
              {validating ? "Validating…" : "Validate File"}
            </Button>
          </div>
        </DataCard>
      ) : null}

      {step === 3 && file ? (
        <DataCard className="max-w-3xl p-6">
          <SectionTitle>Step 3 — Data validation</SectionTitle>
          <div className="grid gap-3 sm:grid-cols-4">
            <Stat label="Total rows" value={file.validation.total} />
            <Stat label="Valid records" value={file.validation.validCount} tone="success" />
            <Stat label="Warnings" value={file.validation.duplicateCount} tone="warning" />
            <Stat label="Errors" value={file.validation.invalidCount} tone="danger" />
          </div>

          <div className="mt-5 space-y-2">
            <Row icon="ok" text={`${file.validation.validCount} records ready to import`} />
            {issueSummary(file.validation).map(([issue, { count, severity }]) => (
              <Row
                key={issue}
                icon={severity === "ERROR" ? "err" : "warn"}
                text={`${count} row(s) — ${issue}`}
              />
            ))}
          </div>

          <div className="mt-5 overflow-hidden rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Candidate ID</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(file.validation.valid ?? []).slice(0, 5).map((r, i) => (
                  <TableRow key={i}>
                    <TableCell>{r["candidate_id"]}</TableCell>
                    <TableCell>
                      {`${r["first_name"] ?? ""} ${r["last_name"] ?? ""}`.trim()}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{r["email"]}</TableCell>
                    <TableCell className="text-muted-foreground">{r["phone"]}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="mt-6 flex flex-wrap justify-between gap-2">
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(2)}>
                Back
              </Button>
              <Button variant="outline" onClick={errorReport}>
                <Download className="size-4" /> Download error report
              </Button>
            </div>
            <Button
              disabled={!validated || file.validation.validCount === 0}
              onClick={() => setStep(4)}
            >
              Import {file.validation.validCount.toLocaleString()} valid records
            </Button>
          </div>
        </DataCard>
      ) : null}

      {step === 4 && file ? (
        <DataCard className="max-w-2xl p-6">
          <SectionTitle>Step 4 — Configure candidate automation</SectionTitle>

          <Group title="Initial communication">
            <ToggleRow
              label="Send verification email"
              checked={automation.sendEmail}
              onChange={(v) => setAutomation({ ...automation, sendEmail: v })}
            />
            <ToggleRow
              label="Send WhatsApp message"
              hint="WhatsApp Business is not connected — sends are simulated"
              checked={automation.sendWhatsApp}
              onChange={(v) => setAutomation({ ...automation, sendWhatsApp: v })}
            />
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label className="text-xs">Verification link</Label>
                <Input
                  value={automation.verificationLink}
                  onChange={(e) =>
                    setAutomation({ ...automation, verificationLink: e.target.value })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Email template</Label>
                <select
                  className="h-9 w-full rounded-md border border-input bg-card px-2 text-sm"
                  value={automation.emailTemplateId}
                  onChange={(e) =>
                    setAutomation({ ...automation, emailTemplateId: e.target.value })
                  }
                >
                  {emailTemplates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">WhatsApp template</Label>
                <select
                  className="h-9 w-full rounded-md border border-input bg-card px-2 text-sm"
                  value={automation.whatsAppTemplateId}
                  onChange={(e) =>
                    setAutomation({ ...automation, whatsAppTemplateId: e.target.value })
                  }
                >
                  {waTemplates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </Group>

          <Group title="Reminders">
            <ToggleRow
              label="Enable automatic reminders"
              checked={automation.remindersEnabled}
              onChange={(v) => setAutomation({ ...automation, remindersEnabled: v })}
            />
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {automation.reminderDays.map((d, i) => (
                <div key={i} className="space-y-1.5">
                  <Label className="text-xs">Reminder {i + 1} (days)</Label>
                  <Input
                    type="number"
                    value={d}
                    disabled={!automation.remindersEnabled}
                    onChange={(e) => {
                      const next = [...automation.reminderDays];
                      next[i] = Number(e.target.value);
                      setAutomation({ ...automation, reminderDays: next });
                    }}
                  />
                </div>
              ))}
            </div>
          </Group>

          <Group title="Missing document follow-up">
            <ToggleRow
              label="Automatically notify candidates about missing documents"
              checked={automation.missingDocFollowUp}
              onChange={(v) => setAutomation({ ...automation, missingDocFollowUp: v })}
            />
          </Group>

          <Group title="Escalation">
            <ToggleRow
              label="Escalate unresolved candidates"
              checked={automation.escalationEnabled}
              onChange={(v) => setAutomation({ ...automation, escalationEnabled: v })}
            />
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Escalate after (days)</Label>
                <Input
                  type="number"
                  value={automation.escalateAfterDays}
                  disabled={!automation.escalationEnabled}
                  onChange={(e) =>
                    setAutomation({ ...automation, escalateAfterDays: Number(e.target.value) })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Escalation recipient</Label>
                <Input
                  value={automation.escalationRecipient}
                  disabled={!automation.escalationEnabled}
                  onChange={(e) =>
                    setAutomation({ ...automation, escalationRecipient: e.target.value })
                  }
                />
              </div>
            </div>
          </Group>

          <div className="mt-6 flex justify-between">
            <Button variant="outline" onClick={() => setStep(3)}>
              Back
            </Button>
            <Button onClick={() => setStep(5)}>Preview automation</Button>
          </div>
        </DataCard>
      ) : null}

      {step === 5 && file ? (
        <DataCard className="p-5">
          <SectionTitle>What will happen when you start this batch</SectionTitle>
          <ol className="mb-5 space-y-2">
            {[
              `Import ${file.validation.validCount.toLocaleString()} candidates into "${details.name || "this batch"}"`,
              `Day 0 · send invitation via ${[automation.sendEmail && "email", automation.sendWhatsApp && "WhatsApp"].filter(Boolean).join(" + ") || "no channel selected"}`,
              ...automation.reminderDays.map(
                (d) => `Day ${d} · send reminder to candidates who have not completed verification`,
              ),
              automation.missingDocFollowUp
                ? "On document mismatch · send automated missing-document request"
                : "Missing-document follow-up is disabled — exceptions will be raised for manual handling",
              automation.escalationEnabled
                ? `Day ${automation.escalateAfterDays} · escalate unresolved candidates to ${automation.escalationRecipient}`
                : "Escalation disabled — unresolved candidates stay in Needs Attention",
              "On verification complete · candidate marked ready for DFMS submission (not connected)",
            ].map((line, i) => (
              <li key={i} className="flex gap-3 text-sm">
                <span className="tabular mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold">
                  {i + 1}
                </span>
                <span>{line}</span>
              </li>
            ))}
          </ol>

          <div className="mb-5 grid gap-3 sm:grid-cols-4">
            <Stat label="Candidates" value={file.validation.validCount} tone="success" />
            <Stat label="Invitations queued" value={file.validation.validCount} />
            <Stat label="Reminder cycles" value={automation.reminderDays.length} tone="warning" />
            <Stat
              label="Channels"
              value={[automation.sendEmail, automation.sendWhatsApp].filter(Boolean).length}
            />
          </div>

          <div className="rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
            External providers are not connected in this prototype. All sends are simulated and
            logged in the Communication Center.
          </div>

          <div className="mt-6 flex justify-between">
            <Button variant="outline" onClick={() => setStep(4)}>
              Back
            </Button>
            <ConfirmDialog
              trigger={<Button>Start batch automation</Button>}
              title="Start automation?"
              description={
                <>
                  <p>
                    You are about to start automation for{" "}
                    <strong>{file.validation.validCount.toLocaleString()} candidates</strong>.
                  </p>
                  <p>
                    Invitations are queued as a background job — nothing is sent synchronously.
                    External providers are not connected, so all sends are simulated.
                  </p>
                </>
              }
              confirmLabel="Start automation"
              onConfirm={() => {
                if (!rawFile) return;
                void (async () => {
                  try {
                    const res = await emailApi.importFile(rawFile, {
                      name: details.name,
                      joiningDate: details.joiningDate,
                      project: details.project,
                      location: details.location,
                      owner: details.owner,
                    });
                    toast.success(
                      `Automation started · ${res.validation.validCount.toLocaleString()} invitations queued (simulated)`,
                    );
                    void navigate({ to: "/candidates", search: { batch: res.batch.id } });
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : "Import failed");
                  }
                })();
              }}
            />
          </div>
        </DataCard>
      ) : null}
    </>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "success" | "danger" | "warning";
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="text-[11px] font-medium text-muted-foreground">{label}</div>
      <div
        className={cn(
          "tabular mt-1 text-lg font-semibold",
          tone === "success" && "text-success",
          tone === "danger" && "text-danger",
          tone === "warning" && "text-warning",
        )}
      >
        {value.toLocaleString()}
      </div>
    </div>
  );
}

/** Groups the backend's per-row validation issues into one count per distinct message. */
function issueSummary(
  validation: ValidationResult,
): Array<[string, { count: number; severity: "ERROR" | "WARNING" }]> {
  const counts = new Map<string, { count: number; severity: "ERROR" | "WARNING" }>();
  for (const issue of validation.issues) {
    const existing = counts.get(issue.issue);
    if (existing) existing.count += 1;
    else counts.set(issue.issue, { count: 1, severity: issue.severity });
  }
  return [...counts.entries()];
}

function Row({ icon, text }: { icon: "ok" | "warn" | "err"; text: string }) {
  const Icon = icon === "ok" ? CheckCircle2 : icon === "warn" ? AlertTriangle : XCircle;
  return (
    <div className="flex items-center gap-2 text-sm">
      <Icon
        className={cn(
          "size-4",
          icon === "ok" ? "text-success" : icon === "warn" ? "text-warning" : "text-danger",
        )}
      />
      {text}
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-border py-4 first:border-0">
      <h3 className="section-label mb-2">{title}</h3>
      {children}
    </div>
  );
}

function ToggleRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5">
      <div>
        <div className="text-sm">{label}</div>
        {hint ? <div className="text-xs text-muted-foreground">{hint}</div> : null}
      </div>
      <div className="flex items-center gap-2">
        <Pill tone={checked ? "success" : "neutral"}>{checked ? "On" : "Off"}</Pill>
        <Switch checked={checked} onCheckedChange={onChange} />
      </div>
    </div>
  );
}
