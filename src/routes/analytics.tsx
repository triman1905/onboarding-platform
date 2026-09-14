import { createFileRoute } from "@tanstack/react-router";
import { useVanguard } from "@/lib/vanguard/store";
import { COMPLETE_STATES } from "@/lib/vanguard/mock-data";
import { DataCard, KpiCard, PageHeader, ProgressBar, SectionTitle } from "@/components/vanguard/primitives";
import { verificationLabel } from "@/components/vanguard/status";
import type { VerificationStatus } from "@/lib/vanguard/types";

export const Route = createFileRoute("/analytics")({
  head: () => ({
    meta: [
      { title: "Analytics · ABC Automation" },
      { name: "description", content: "Onboarding funnel, batch throughput and communication performance metrics." },
      { property: "og:title", content: "Analytics · ABC Automation" },
      { property: "og:description", content: "Track completion rates and bottlenecks across ABC batches." },
    ],
  }),
  component: Analytics,
});

function Analytics() {
  const { candidates, batches, communications, issues } = useVanguard();

  const byStatus = new Map<VerificationStatus, number>();
  for (const c of candidates) byStatus.set(c.verificationStatus, (byStatus.get(c.verificationStatus) ?? 0) + 1);
  const statusRows = [...byStatus.entries()].sort((a, b) => b[1] - a[1]);

  const complete = candidates.filter((c) => COMPLETE_STATES.includes(c.verificationStatus)).length;
  const completion = candidates.length ? Math.round((complete / candidates.length) * 100) : 0;
  const delivered = communications.filter((m) => m.status === "DELIVERED").length;
  const deliveryRate = communications.length ? Math.round((delivered / communications.length) * 100) : 0;
  const avgDays = candidates.length
    ? Math.round((candidates.reduce((a, c) => a + c.daysPending, 0) / candidates.length) * 10) / 10
    : 0;

  return (
    <>
      <PageHeader title="Analytics" description="Aggregate view across all batches. Figures are derived from prototype data." />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Verification completion" value={`${completion}%`} tone="success" hint={`${complete.toLocaleString()} of ${candidates.length.toLocaleString()}`} />
        <KpiCard label="Communication delivery" value={`${deliveryRate}%`} tone="info" />
        <KpiCard label="Average days pending" value={avgDays} tone="warning" />
        <KpiCard label="Open exceptions" value={issues.filter((i) => i.status !== "RESOLVED").length} tone="danger" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <DataCard className="p-5">
          <SectionTitle>Candidates by verification status</SectionTitle>
          <div className="space-y-3">
            {statusRows.map(([status, count]) => (
              <div key={status}>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span>{verificationLabel(status)}</span>
                  <span className="tabular text-muted-foreground">{count.toLocaleString()}</span>
                </div>
                <ProgressBar value={candidates.length ? (count / candidates.length) * 100 : 0} />
              </div>
            ))}
          </div>
        </DataCard>

        <DataCard className="p-5">
          <SectionTitle>Batch completion</SectionTitle>
          <div className="space-y-3">
            {batches.map((b) => {
              const list = candidates.filter((c) => c.batchId === b.id);
              const done = list.filter((c) => COMPLETE_STATES.includes(c.verificationStatus)).length;
              const pct = list.length ? Math.round((done / list.length) * 100) : 0;
              return (
                <div key={b.id}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span>{b.name}</span>
                    <span className="tabular text-muted-foreground">{pct}%</span>
                  </div>
                  <ProgressBar value={pct} />
                </div>
              );
            })}
          </div>
        </DataCard>
      </div>
    </>
  );
}
