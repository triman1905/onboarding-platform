import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { useVanguard } from "@/lib/vanguard/store";
import { fmtDate } from "@/lib/vanguard/mock-data";
import { DataCard, KpiCard, PageHeader, SectionTitle } from "@/components/vanguard/primitives";
import { Pill } from "@/components/vanguard/status";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/automation-rules")({
  head: () => ({
    meta: [
      { title: "Automation Rules · ABC Automation" },
      { name: "description", content: "Condition-action rules that drive reminders, document checks and escalation." },
      { property: "og:title", content: "Automation Rules · ABC Automation" },
      { property: "og:description", content: "Inspect and toggle the rules powering onboarding automation." },
    ],
  }),
  component: Rules,
});

function Rules() {
  const { rules, executions, toggleRule } = useVanguard();
  const enabled = rules.filter((r) => r.enabled).length;
  const total = rules.reduce((a, r) => a + r.executions, 0);
  const impact = (ruleId: string) =>
    new Set(executions.filter((e) => e.ruleId === ruleId).map((e) => e.candidateId)).size;

  return (
    <>
      <PageHeader title="Automation Rules" description="Rules evaluate on candidate events and run without manual intervention." />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <KpiCard label="Rules configured" value={rules.length} />
        <KpiCard label="Enabled" value={enabled} tone="success" />
        <KpiCard label="Executions (30d)" value={total.toLocaleString()} tone="info" />
      </div>

      <div className="space-y-3">
        {rules.map((r) => (
          <DataCard key={r.id} className="p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold">{r.name}</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">{r.description}</p>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <Pill tone={r.enabled ? "success" : "neutral"}>{r.enabled ? "Enabled" : "Disabled"}</Pill>
                <Switch
                  checked={r.enabled}
                  onCheckedChange={() => {
                    toggleRule(r.id);
                    toast.success(r.enabled ? "Rule disabled" : "Rule enabled");
                  }}
                />
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-stretch gap-2 rounded-lg bg-muted/50 p-3">
              <div className="min-w-[200px] flex-1 rounded-md border border-border bg-card p-3">
                <SectionTitle>When</SectionTitle>
                <ul className="space-y-1">
                  {r.conditions.map((c, i) => (
                    <li key={i} className="font-mono text-[11px] text-muted-foreground">
                      {c.field} {c.operator} {c.value}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="flex items-center px-1 text-muted-foreground">→</div>
              <div className="min-w-[200px] flex-1 rounded-md border border-border bg-card p-3">
                <SectionTitle>Then</SectionTitle>
                <ul className="space-y-1">
                  {r.actions.map((a) => (
                    <li key={a} className="text-xs">• {a}</li>
                  ))}
                </ul>
              </div>
              <div className="flex items-center px-1 text-muted-foreground">→</div>
              <div className="min-w-[170px] rounded-md border border-border bg-card p-3">
                <SectionTitle>Impact</SectionTitle>
                <div className="tabular text-lg font-semibold">{impact(r.id).toLocaleString()}</div>
                <p className="text-[11px] text-muted-foreground">candidates affected recently</p>
              </div>
            </div>
            <p className="tabular mt-2 text-[11px] text-muted-foreground">

              {r.executions.toLocaleString()} executions · last run {fmtDate(r.lastRunAt)}
            </p>
          </DataCard>
        ))}
      </div>

      <div className="mt-8">
        <SectionTitle>Recent executions</SectionTitle>
        <DataCard>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Rule</TableHead>
                <TableHead>Candidate</TableHead>
                <TableHead>Outcome</TableHead>
                <TableHead>When</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {executions.slice(0, 20).map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="text-xs font-medium">{e.ruleName}</TableCell>
                  <TableCell className="text-xs">{e.candidateName}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{e.outcome}</TableCell>
                  <TableCell className="text-xs whitespace-nowrap text-muted-foreground">{fmtDate(e.at)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </DataCard>
      </div>
    </>
  );
}
