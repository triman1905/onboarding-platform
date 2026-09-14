import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useVanguard } from "@/lib/vanguard/store";
import { fmtDateShort, fmtTime } from "@/lib/vanguard/mock-data";
import { DataCard, EmptyState, KpiCard, PageHeader, Pager } from "@/components/vanguard/primitives";
import { Pill } from "@/components/vanguard/status";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LAYER_LABEL, activityLayer, activityOutcome, type AutomationOutcome } from "@/lib/vanguard/automation";

export const Route = createFileRoute("/activity")({
  head: () => ({
    meta: [
      { title: "Activity & Audit · ABC Automation" },
      {
        name: "description",
        content: "Complete audit trail of every automated and human action across ABC onboarding batches.",
      },
      { property: "og:title", content: "Activity & Audit · ABC Automation" },
      { property: "og:description", content: "Timestamped record of automation executions, communications and user actions." },
    ],
  }),
  component: ActivityPage,
});

const TONE: Record<AutomationOutcome, "success" | "warning" | "danger" | "info"> = {
  SUCCESS: "success",
  WARNING: "warning",
  FAILED: "danger",
  PENDING: "info",
};

const PAGE_SIZE = 20;

function ActivityPage() {
  const { activity, executions, audit, candidates, batches } = useVanguard();
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    const mapped = activity.map((a) => {
      const c = a.candidateId ? candidates.find((x) => x.id === a.candidateId) : undefined;
      const batch = c ? batches.find((b) => b.id === c.batchId) : undefined;
      return {
        id: a.id,
        at: a.at,
        candidate: c ? `${c.candidateId} · ${c.firstName} ${c.lastName}` : "—",
        batch: batch?.name.replace("ABC ", "") ?? "—",
        action: a.message,
        trigger: a.actor === "RECRUITER" ? "Manual · recruiter" : LAYER_LABEL[activityLayer(a)],
        outcome: activityOutcome(a),
      };
    });
    if (!term) return mapped;
    return mapped.filter((r) => `${r.candidate} ${r.action} ${r.batch} ${r.trigger}`.toLowerCase().includes(term));
  }, [activity, candidates, batches, q]);

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const current = Math.min(page, pageCount);
  const paged = rows.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  const automated = rows.filter((r) => r.trigger !== "Manual · recruiter").length;

  return (
    <>
      <PageHeader
        title="Activity & Audit"
        description="Every automated and human action is recorded with its trigger, rule and result."
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Recorded events" value={rows.length.toLocaleString()} />
        <KpiCard label="Automated" value={automated.toLocaleString()} tone="info" />
        <KpiCard label="Manual" value={(rows.length - automated).toLocaleString()} tone="warning" />
        <KpiCard label="Rule executions" value={executions.length.toLocaleString()} tone="success" />
      </div>

      <Tabs defaultValue="events">
        <TabsList>
          <TabsTrigger value="events">Automation events</TabsTrigger>
          <TabsTrigger value="rules">Rule executions</TabsTrigger>
          <TabsTrigger value="audit">User audit trail</TabsTrigger>
        </TabsList>

        <TabsContent value="events" className="mt-4">
          <DataCard className="mb-4 p-4">
            <Input
              placeholder="Search candidate, action or batch…"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
              className="h-9 max-w-sm"
            />
          </DataCard>
          <DataCard>
            {paged.length === 0 ? (
              <EmptyState title="No matching activity" />
            ) : (
              <>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Timestamp</TableHead>
                        <TableHead>Candidate</TableHead>
                        <TableHead>Batch</TableHead>
                        <TableHead>Action</TableHead>
                        <TableHead>Trigger</TableHead>
                        <TableHead>Result</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paged.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell className="tabular text-xs whitespace-nowrap text-muted-foreground">
                            {fmtDateShort(r.at)} {fmtTime(r.at)}
                          </TableCell>
                          <TableCell className="text-xs whitespace-nowrap">{r.candidate}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{r.batch}</TableCell>
                          <TableCell className="text-xs">{r.action}</TableCell>
                          <TableCell className="text-xs">
                            <Pill>{r.trigger}</Pill>
                          </TableCell>
                          <TableCell>
                            <Pill tone={TONE[r.outcome]}>{r.outcome.toLowerCase()}</Pill>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <Pager page={current} pageCount={pageCount} total={rows.length} onPage={setPage} />
              </>
            )}
          </DataCard>
        </TabsContent>

        <TabsContent value="rules" className="mt-4">
          <DataCard>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Rule</TableHead>
                  <TableHead>Candidate</TableHead>
                  <TableHead>Outcome</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {executions.slice(0, 40).map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="tabular text-xs whitespace-nowrap text-muted-foreground">
                      {fmtDateShort(e.at)} {fmtTime(e.at)}
                    </TableCell>
                    <TableCell className="text-xs font-medium">{e.ruleName}</TableCell>
                    <TableCell className="text-xs">{e.candidateName}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{e.outcome}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </DataCard>
        </TabsContent>

        <TabsContent value="audit" className="mt-4">
          <DataCard>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Entity</TableHead>
                  <TableHead>IP</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {audit.slice(0, 40).map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="tabular text-xs whitespace-nowrap text-muted-foreground">
                      {fmtDateShort(a.at)} {fmtTime(a.at)}
                    </TableCell>
                    <TableCell className="text-xs font-medium">{a.actor}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{a.role}</TableCell>
                    <TableCell className="text-xs">{a.action}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{a.entity}</TableCell>
                    <TableCell className="tabular text-xs text-muted-foreground">{a.ip}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </DataCard>
        </TabsContent>
      </Tabs>
    </>
  );
}
