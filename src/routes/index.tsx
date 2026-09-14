import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2, Clock, FileWarning, ShieldAlert, Users } from "lucide-react";
import { useAuth } from "@/lib/auth/store";
import { useLocalApi } from "@/lib/email/api";
import { workspaceApi } from "@/lib/vanguard/workspaceApi";
import {
  DataCard,
  EmptyState,
  KpiCard,
  PageHeader,
  Pager,
  ProgressBar,
  SectionTitle,
} from "@/components/vanguard/primitives";
import { Pill } from "@/components/vanguard/status";
import { DashboardEmailStats } from "@/components/vanguard/email/live-panels";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Onboarding Overview · ABC Automation" },
      {
        name: "description",
        content:
          "Monitor candidate verification, BGV and assignment across ABC onboarding batches.",
      },
    ],
  }),
  component: Dashboard,
});

function fmtDate(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtDateTime(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fieldLabel(field: string) {
  return field.replaceAll("_", " ").replace(/^\w/, (c) => c.toUpperCase());
}

function daysSince(value: string) {
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return 0;
  return Math.max(0, Math.floor((Date.now() - then) / 86_400_000));
}

function Dashboard() {
  const { currentUser } = useAuth();
  const isManager = currentUser?.role === "MANAGER";
  const [batchFilter, setBatchFilter] = useState("ALL");
  const [issuePage, setIssuePage] = useState(1);

  const summary = useLocalApi(
    () => workspaceApi.getDashboardSummary(batchFilter === "ALL" ? undefined : batchFilter),
    [batchFilter],
    15000,
  );
  const data = summary.data;

  const pageSize = 6;
  const attention = data?.needsAttention ?? [];
  const pageCount = Math.max(1, Math.ceil(attention.length / pageSize));
  const currentPage = Math.min(issuePage, pageCount);
  const pagedAttention = attention.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const batchName = useMemo(() => {
    const map = new Map((data?.batches ?? []).map((b) => [b.id, b.name]));
    return (id: string) => map.get(id) ?? "—";
  }, [data?.batches]);

  return (
    <>
      <PageHeader
        title="Onboarding Overview"
        description={
          isManager
            ? "Monitor verification, BGV and assignment across your whole team."
            : `Welcome, ${currentUser?.name} — your assigned candidates.`
        }
        actions={
          <>
            <Select value={batchFilter} onValueChange={setBatchFilter}>
              <SelectTrigger className="w-[220px]">
                <SelectValue placeholder="Batch" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All batches</SelectItem>
                {(data?.batches ?? []).map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {isManager ? (
              <Button asChild>
                <Link to="/batches/new">Create Batch</Link>
              </Button>
            ) : null}
          </>
        }
      />

      <DashboardEmailStats />

      {summary.loading ? (
        <EmptyState title="Loading dashboard…" />
      ) : !data ? (
        <EmptyState
          title="Cannot reach the backend"
          description="Start it with `npm run server` to load real dashboard data."
        />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-7">
            <KpiCard
              label={isManager ? "Total Candidates" : "My Candidates"}
              value={data.totalCandidates}
              icon={Users}
            />
            <KpiCard
              label="BGV Complete"
              value={data.bgvComplete}
              tone="success"
              icon={CheckCircle2}
            />
            <KpiCard label="BGV Pending" value={data.bgvPending} tone="warning" icon={Clock} />
            <KpiCard label="Discrepant" value={data.discrepant} tone="danger" icon={ShieldAlert} />
            <KpiCard
              label="Induction Ready"
              value={data.inductionReady}
              tone="success"
              icon={CheckCircle2}
            />
            <KpiCard label="In Progress" value={data.inProgress} tone="info" icon={Clock} />
            <KpiCard label="Not Ready" value={data.notReady} tone="warning" icon={FileWarning} />
          </div>

          <div className="mt-8">
            <SectionTitle>Verification status breakdown</SectionTitle>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-6">
              {data.verificationBreakdown.map((stage) => {
                const pct = data.totalCandidates
                  ? Math.round((stage.count / data.totalCandidates) * 100)
                  : 0;
                return (
                  <div key={stage.status} className="rounded-xl border border-border bg-card p-3">
                    <div className="text-[11px] font-medium text-muted-foreground">
                      {stage.status.replaceAll("_", " ").toLowerCase()}
                    </div>
                    <div className="tabular mt-1.5 text-lg font-semibold">
                      {stage.count.toLocaleString()}
                    </div>
                    <div className="tabular text-[11px] text-muted-foreground">{pct}% of total</div>
                    <div className="mt-2">
                      <ProgressBar value={pct} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-8 grid gap-6 xl:grid-cols-3">
            <div className="xl:col-span-2">
              <SectionTitle>Recent activity</SectionTitle>
              <DataCard>
                {data.recentActivity.length === 0 ? (
                  <EmptyState
                    title="No activity yet"
                    description="Changes to candidates will show up here."
                  />
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[110px]">Time</TableHead>
                          <TableHead>Candidate</TableHead>
                          <TableHead>Change</TableHead>
                          <TableHead>By</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.recentActivity.map((a) => (
                          <TableRow key={a.id}>
                            <TableCell className="tabular text-xs font-semibold text-muted-foreground">
                              {fmtDateTime(a.changed_at)}
                            </TableCell>
                            <TableCell className="text-xs whitespace-nowrap">
                              <Link
                                to="/candidates/$candidateId"
                                params={{ candidateId: a.candidate_id }}
                                className="hover:underline"
                              >
                                {a.first_name} {a.last_name} · {a.candidate_ref}
                              </Link>
                            </TableCell>
                            <TableCell className="text-xs">
                              {fieldLabel(a.field)}: {a.old_value ?? "—"} → {a.new_value ?? "—"}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {a.changed_by_name ?? "—"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </DataCard>
            </div>

            <div>
              <SectionTitle>Upcoming scheduled reminders</SectionTitle>
              <DataCard className="p-4">
                {data.upcomingReminders.length === 0 ? (
                  <EmptyState title="Nothing scheduled" />
                ) : (
                  <ol className="space-y-3">
                    {data.upcomingReminders.map((u) => (
                      <li
                        key={u.id}
                        className="flex gap-3 rounded-lg border border-border bg-muted/30 p-2.5"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-medium">{u.name}</div>
                          <div className="tabular text-[11px] text-muted-foreground">
                            {fmtDateTime(u.scheduled_at)}
                          </div>
                          <div className="mt-1.5 flex flex-wrap gap-1.5">
                            <Pill>{u.channels}</Pill>
                            <Pill tone="info">
                              {u.target_condition.replaceAll("_", " ").toLowerCase()}
                            </Pill>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </DataCard>
            </div>
          </div>

          <div className="mt-8">
            <SectionTitle
              action={
                <Button variant="ghost" size="sm" asChild>
                  <Link to="/batches">All batches</Link>
                </Button>
              }
            >
              Batch overview
            </SectionTitle>
            <DataCard>
              {(data.batches ?? []).length === 0 ? (
                <EmptyState title="No batches yet" />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Batch</TableHead>
                      <TableHead>Joining date</TableHead>
                      <TableHead className="text-right">Candidates</TableHead>
                      <TableHead className="text-right">Induction Ready</TableHead>
                      <TableHead className="text-right">Discrepant</TableHead>
                      <TableHead className="w-[190px]">Completion</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.batches.map((b) => {
                      const total = b.candidate_count ?? 0;
                      const ready = b.induction_ready_count ?? 0;
                      const discrepant = b.discrepant_count ?? 0;
                      const pct = total ? Math.round((ready / total) * 100) : 0;
                      return (
                        <TableRow key={b.id}>
                          <TableCell className="font-medium">{b.name}</TableCell>
                          <TableCell className="text-muted-foreground">
                            {fmtDate(b.joining_date)}
                          </TableCell>
                          <TableCell className="tabular text-right">
                            {total.toLocaleString()}
                          </TableCell>
                          <TableCell className="tabular text-right">
                            {ready.toLocaleString()}
                          </TableCell>
                          <TableCell className="tabular text-right">
                            {discrepant.toLocaleString()}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <ProgressBar value={pct} />
                              <span className="tabular w-9 text-right text-xs font-semibold">
                                {pct}%
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button variant="outline" size="sm" asChild>
                              <Link to="/candidates" search={{ batch: b.id }}>
                                View
                              </Link>
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </DataCard>
          </div>

          <div className="mt-8">
            <SectionTitle>Needs attention (BGV discrepant)</SectionTitle>
            <DataCard>
              {pagedAttention.length === 0 ? (
                <EmptyState
                  title="No open exceptions"
                  description="No candidates are currently BGV discrepant."
                />
              ) : (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Candidate</TableHead>
                        <TableHead>ID</TableHead>
                        <TableHead>Batch</TableHead>
                        <TableHead>BGV Client</TableHead>
                        <TableHead>BGV EY</TableHead>
                        <TableHead>Days pending</TableHead>
                        <TableHead />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pagedAttention.map((i) => (
                        <TableRow key={i.id}>
                          <TableCell className="font-medium">
                            {i.first_name} {i.last_name}
                          </TableCell>
                          <TableCell className="text-muted-foreground">{i.candidate_id}</TableCell>
                          <TableCell className="text-muted-foreground">
                            {batchName(i.batch_id)}
                          </TableCell>
                          <TableCell>
                            <Pill
                              tone={i.bgv_client_status === "DISCREPANT" ? "danger" : "neutral"}
                            >
                              {i.bgv_client_status.replaceAll("_", " ").toLowerCase()}
                            </Pill>
                          </TableCell>
                          <TableCell>
                            <Pill tone={i.bgv_ey_status === "DISCREPANT" ? "danger" : "neutral"}>
                              {i.bgv_ey_status.replaceAll("_", " ").toLowerCase()}
                            </Pill>
                          </TableCell>
                          <TableCell className="tabular text-xs font-semibold text-muted-foreground">
                            {daysSince(i.updated_at)} days
                          </TableCell>
                          <TableCell className="text-right">
                            <Button variant="outline" size="sm" asChild>
                              <Link to="/candidates/$candidateId" params={{ candidateId: i.id }}>
                                View
                              </Link>
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <Pager
                    page={currentPage}
                    pageCount={pageCount}
                    total={attention.length}
                    onPage={setIssuePage}
                  />
                </>
              )}
            </DataCard>
          </div>
        </>
      )}
    </>
  );
}
