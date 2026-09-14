import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2, Send, TriangleAlert, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { useVanguard } from "@/lib/vanguard/store";
import { fmtDate } from "@/lib/vanguard/mock-data";
import { DataCard, EmptyState, KpiCard, PageHeader, SectionTitle } from "@/components/vanguard/primitives";
import { DaysBadge, IssueStatusBadge, Pill, PriorityBadge } from "@/components/vanguard/status";
import { ConfirmDialog } from "@/components/vanguard/confirm-dialog";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { KeyValue } from "@/components/vanguard/primitives";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { IssueType, Priority } from "@/lib/vanguard/types";

export const Route = createFileRoute("/needs-attention")({
  head: () => ({
    meta: [
      { title: "Needs Attention · ABC Automation" },
      { name: "description", content: "Exception queue for candidates blocked in the onboarding verification workflow." },
      { property: "og:title", content: "Needs Attention · ABC Automation" },
      { property: "og:description", content: "Triage, assign, resolve and escalate onboarding exceptions." },
    ],
  }),
  component: NeedsAttention,
});

const TYPE_LABEL: Record<IssueType, string> = {
  MISSING_DOCUMENT: "Missing document",
  NAME_MISMATCH: "Name mismatch",
  INVALID_DATA: "Invalid data",
  VERIFICATION_INCOMPLETE: "Verification incomplete",
  CANDIDATE_QUERY: "Candidate query",
  COMMUNICATION_FAILURE: "Communication failure",
  DFMS_ERROR: "DFMS error",
  OTHER: "Other",
};

const PRIORITIES: Priority[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];

function NeedsAttention() {
  const { issues, users, resolveIssue, escalateIssue, assignIssue, sendCommunication, candidates } = useVanguard();
  const [search, setSearch] = useState("");
  const [priority, setPriority] = useState<Priority | "ALL">("ALL");
  const [type, setType] = useState<IssueType | "ALL">("ALL");
  const [showResolved, setShowResolved] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  const filtered = useMemo(
    () =>
      issues.filter((i) => {
        if (!showResolved && i.status === "RESOLVED") return false;
        if (priority !== "ALL" && i.priority !== priority) return false;
        if (type !== "ALL" && i.type !== type) return false;
        const q = search.trim().toLowerCase();
        if (q && !(`${i.candidateName} ${i.title} ${i.candidateId}`.toLowerCase().includes(q))) return false;
        return true;
      }),
    [issues, priority, type, search, showResolved],
  );

  const open = issues.filter((i) => i.status !== "RESOLVED");
  const critical = open.filter((i) => i.priority === "CRITICAL").length;
  const high = open.filter((i) => i.priority === "HIGH").length;
  const medium = open.filter((i) => i.priority === "MEDIUM").length;
  const escalated = open.filter((i) => i.status === "ESCALATED").length;
  const unassigned = open.filter((i) => i.owner === "Unassigned").length;
  const detail = issues.find((i) => i.id === detailId) ?? null;
  const detailCandidate = detail ? candidates.find((c) => c.id === detail.candidateId) : undefined;

  const types = Object.keys(TYPE_LABEL) as IssueType[];

  return (
    <>
      <PageHeader
        title="Needs Attention"
        description="Every exception raised by the automation engine, with the recommended next action."
      />

      <div className="mb-4 rounded-xl border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
        The automation has already executed every action it can for these candidates. Only the cases below require
        human intervention.
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-3 xl:grid-cols-6">
        <KpiCard label="Critical" value={critical} tone="danger" />
        <KpiCard label="High" value={high} tone="danger" />
        <KpiCard label="Medium" value={medium} tone="warning" />
        <KpiCard label="Total open" value={open.length} tone="warning" icon={TriangleAlert} />
        <KpiCard label="Escalated" value={escalated} tone="danger" />
        <KpiCard label="Unassigned" value={unassigned} tone="info" />
      </div>

      <DataCard className="mb-4 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            placeholder="Search candidate or issue…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 max-w-xs"
          />
          <select
            className="h-9 rounded-md border border-input bg-card px-2 text-sm"
            value={priority}
            onChange={(e) => setPriority(e.target.value as Priority | "ALL")}
          >
            <option value="ALL">All priorities</option>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>{p.charAt(0) + p.slice(1).toLowerCase()}</option>
            ))}
          </select>
          <select
            className="h-9 rounded-md border border-input bg-card px-2 text-sm"
            value={type}
            onChange={(e) => setType(e.target.value as IssueType | "ALL")}
          >
            <option value="ALL">All issue types</option>
            {types.map((t) => (
              <option key={t} value={t}>{TYPE_LABEL[t]}</option>
            ))}
          </select>
          <Button variant={showResolved ? "default" : "outline"} size="sm" onClick={() => setShowResolved((v) => !v)}>
            {showResolved ? "Hiding nothing" : "Show resolved"}
          </Button>
          <span className="tabular ml-auto text-xs text-muted-foreground">{filtered.length} shown</span>
        </div>
      </DataCard>

      {filtered.length === 0 ? (
        <DataCard>
          <EmptyState title="No exceptions match these filters" description="Try clearing the search or filters." />
        </DataCard>
      ) : (
        <div className="space-y-3">
          {filtered.map((issue) => {
            const candidate = candidates.find((c) => c.id === issue.candidateId);
            return (
              <DataCard key={issue.id} className={cn("p-4", issue.priority === "CRITICAL" && "border-danger/40")}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <PriorityBadge priority={issue.priority} />
                      <Pill>{TYPE_LABEL[issue.type]}</Pill>
                      <IssueStatusBadge status={issue.status} />
                      <DaysBadge days={issue.daysPending} />
                    </div>
                    <h3 className="mt-2 text-sm font-semibold">{issue.title}</h3>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {issue.candidateName}
                      {candidate ? ` · ${candidate.candidateId}` : ""} · Owner {issue.owner} · Raised {fmtDate(issue.createdAt)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" onClick={() => setDetailId(issue.id)}>
                      View
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm">
                          <UserPlus className="size-4" /> Assign
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {users.map((u) => (
                          <DropdownMenuItem
                            key={u.id}
                            onClick={() => {
                              assignIssue(issue.id, u.name);
                              toast.success(`Assigned to ${u.name}`);
                            }}
                          >
                            {u.name} · {u.role}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>

                    <ConfirmDialog
                      trigger={
                        <Button variant="outline" size="sm">
                          <Send className="size-4" /> Send follow-up
                        </Button>
                      }
                      title="Send follow-up email?"
                      description={
                        <p>
                          A follow-up will be queued for <strong>{issue.candidateName}</strong>. Delivery is simulated in
                          this prototype.
                        </p>
                      }
                      confirmLabel="Queue email"
                      onConfirm={() => {
                        sendCommunication([issue.candidateId], "EMAIL", "tpl-missing-doc");
                        toast.success("Follow-up queued (simulated)");
                      }}
                    />

                    <Button variant="outline" size="sm" onClick={() => { escalateIssue(issue.id); toast.success("Issue escalated"); }}>
                      Escalate
                    </Button>
                    <Button size="sm" onClick={() => { resolveIssue(issue.id); toast.success("Issue resolved"); }}>
                      <CheckCircle2 className="size-4" /> Resolve
                    </Button>
                  </div>
                </div>

                <div className="mt-3 grid gap-3 rounded-lg bg-muted/50 p-3 sm:grid-cols-2">
                  <div>
                    <SectionTitle>Automated actions taken</SectionTitle>
                    <ul className="space-y-1">
                      {issue.automatedActions.map((a) => (
                        <li key={a} className="text-xs text-muted-foreground">• {a}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <SectionTitle>Recommended action</SectionTitle>
                    <p className="text-xs">{issue.recommendedAction}</p>
                    {candidate ? (
                      <Button variant="link" size="sm" className="mt-1 h-auto p-0 text-xs" asChild>
                        <Link to="/candidates/$candidateId" params={{ candidateId: candidate.id }}>
                          Open candidate profile →
                        </Link>
                      </Button>
                    ) : null}
                  </div>
                </div>
              </DataCard>
            );
          })}
        </div>
      )}

      <Sheet open={detail !== null} onOpenChange={(o) => !o && setDetailId(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          {detail ? (
            <>
              <SheetHeader>
                <SheetTitle>{detail.title}</SheetTitle>
                <SheetDescription>
                  {detail.candidateName}
                  {detailCandidate ? ` · ${detailCandidate.candidateId}` : ""} · raised {fmtDate(detail.createdAt)}
                </SheetDescription>
              </SheetHeader>
              <div className="space-y-5 px-4 pb-8">
                <div className="flex flex-wrap gap-2">
                  <PriorityBadge priority={detail.priority} />
                  <IssueStatusBadge status={detail.status} />
                  <Pill>{TYPE_LABEL[detail.type]}</Pill>
                  <DaysBadge days={detail.daysPending} />
                </div>

                <div>
                  <SectionTitle>Why this was flagged</SectionTitle>
                  <div>
                    <KeyValue
                      label="Candidate declaration"
                      value={detailCandidate?.education.mcaDeclared ? "MCA = Yes" : detailCandidate?.education.highestQualification ?? "—"}
                    />
                    <KeyValue
                      label="Required"
                      value={detailCandidate?.documents.filter((d) => d.required).map((d) => d.label).join(", ") ?? "—"}
                    />
                    <KeyValue
                      label="Current"
                      value={
                        detailCandidate && detailCandidate.documents.some((d) => d.required && !d.uploaded)
                          ? `Missing: ${detailCandidate.documents.filter((d) => d.required && !d.uploaded).map((d) => d.label).join(", ")}`
                          : "All required documents uploaded"
                      }
                    />
                    <KeyValue label="Current state" value={detail.status.replaceAll("_", " ").toLowerCase()} />
                    <KeyValue label="Owner" value={detail.owner} />
                  </div>
                </div>

                <div>
                  <SectionTitle>Automated actions already taken</SectionTitle>
                  <ul className="space-y-1">
                    {detail.automatedActions.map((a) => (
                      <li key={a} className="flex gap-2 text-xs">
                        <span className="text-success">✓</span> {a}
                      </li>
                    ))}
                  </ul>
                </div>

                <div>
                  <SectionTitle>Recommended next action</SectionTitle>
                  <p className="text-xs">{detail.recommendedAction}</p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      sendCommunication([detail.candidateId], "EMAIL", "tpl-missing-doc");
                      toast.success("Follow-up queued (simulated)");
                    }}
                  >
                    <Send className="size-4" /> Contact candidate
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      escalateIssue(detail.id);
                      toast.success("Issue escalated");
                    }}
                  >
                    Escalate
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => {
                      resolveIssue(detail.id);
                      setDetailId(null);
                      toast.success("Issue resolved");
                    }}
                  >
                    <CheckCircle2 className="size-4" /> Resolve issue
                  </Button>
                  {detailCandidate ? (
                    <Button size="sm" variant="ghost" asChild>
                      <Link to="/candidates/$candidateId" params={{ candidateId: detailCandidate.id }}>
                        Open profile →
                      </Link>
                    </Button>
                  ) : null}
                </div>
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </>
  );
}
