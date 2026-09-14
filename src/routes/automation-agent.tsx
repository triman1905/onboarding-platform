import { createFileRoute, Link } from "@tanstack/react-router";
import { Bot, CircleDot, Cpu, ShieldAlert, Workflow } from "lucide-react";
import { useVanguard } from "@/lib/vanguard/store";
import { fmtTime } from "@/lib/vanguard/mock-data";
import { DataCard, KpiCard, PageHeader, SectionTitle } from "@/components/vanguard/primitives";
import { Pill } from "@/components/vanguard/status";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  ACTIONS_EXCEPTIONS,
  ACTIONS_SUCCESSFUL,
  ACTIONS_TODAY,
  AGENT_CAPABILITIES,
  AGENT_TRACE,
  ARCHITECTURE_LAYERS,
  LAYER_LABEL,
  activityLayer,
  activityOutcome,
  type AutomationOutcome,
  type CapabilityState,
} from "@/lib/vanguard/automation";

export const Route = createFileRoute("/automation-agent")({
  head: () => ({
    meta: [
      { title: "Automation Agent · ABC Automation" },
      {
        name: "description",
        content:
          "Workflow orchestrator monitoring candidate onboarding, executing routine actions and escalating exceptions.",
      },
      { property: "og:title", content: "Automation Agent · ABC Automation" },
      { property: "og:description", content: "Agent capabilities, live decision trace and orchestration architecture." },
    ],
  }),
  component: AgentPage,
});

const OUTCOME_TONE: Record<AutomationOutcome, "success" | "warning" | "danger" | "info"> = {
  SUCCESS: "success",
  WARNING: "warning",
  FAILED: "danger",
  PENDING: "info",
};

const CAPABILITY: Record<CapabilityState, { label: string; tone: "success" | "warning" | "neutral" }> = {
  ENABLED: { label: "Enabled", tone: "success" },
  COMING_SOON: { label: "Coming soon", tone: "warning" },
  NOT_CONNECTED: { label: "Not connected", tone: "neutral" },
};

function AgentPage() {
  const { batches, candidates, activity } = useVanguard();
  const currentBatch = batches[0];
  const monitored = currentBatch ? candidates.filter((c) => c.batchId === currentBatch.id).length : candidates.length;

  return (
    <>
      <PageHeader
        title="ABC Automation Agent"
        description="Monitoring candidate onboarding workflows and handling routine actions."
        actions={
          <>
            <Pill tone="success">
              <CircleDot className="size-3" /> Active
            </Pill>
            <Button variant="outline" asChild>
              <Link to="/automation-rules">View rules</Link>
            </Button>
            <Button asChild>
              <Link to="/simulator">Test automation</Link>
            </Button>
          </>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <KpiCard label="Current batch" value={currentBatch?.name.replace("ABC ", "") ?? "—"} icon={Workflow} />
        <KpiCard label="Candidates monitored" value={monitored.toLocaleString()} icon={Bot} tone="info" />
        <KpiCard label="Actions today" value={ACTIONS_TODAY.toLocaleString()} tone="info" hint="Simulated" />
        <KpiCard label="Successful actions" value={ACTIONS_SUCCESSFUL.toLocaleString()} tone="success" />
        <KpiCard label="Exceptions" value={ACTIONS_EXCEPTIONS} tone="danger" icon={ShieldAlert} />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2 space-y-6">
          <div>
            <SectionTitle>Agent activity — decision trace</SectionTitle>
            <div className="space-y-3">
              {AGENT_TRACE.map((t) => (
                <DataCard key={t.id} className="p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-semibold">{t.candidate}</h3>
                      <p className="text-xs text-muted-foreground">
                        {t.candidateCode} · {t.summary}
                      </p>
                    </div>
                  </div>
                  <ol className="mt-3 space-y-2">
                    {t.steps.map((s, i) => (
                      <li key={i} className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="tabular w-10 shrink-0 font-semibold text-muted-foreground">{s.time}</span>
                        <span className="w-[110px] shrink-0 font-medium">{s.kind}</span>
                        <span className="min-w-0 flex-1 text-muted-foreground">{s.detail}</span>
                        <Pill>{LAYER_LABEL[s.handledBy]}</Pill>
                        <Pill tone={OUTCOME_TONE[s.outcome]}>{s.outcome.toLowerCase()}</Pill>
                      </li>
                    ))}
                  </ol>
                </DataCard>
              ))}
            </div>
          </div>

          <div>
            <SectionTitle>Orchestration architecture</SectionTitle>
            <DataCard className="p-4">
              <div className="mb-4 flex flex-wrap items-center gap-2 text-[11px] font-semibold">
                <span className="rounded-md bg-muted px-2 py-1">Workflow Engine</span>
                <span className="text-muted-foreground">→</span>
                <span className="rounded-md bg-muted px-2 py-1">Rules · Scheduler · Communication</span>
                <span className="text-muted-foreground">→</span>
                <span className="rounded-md bg-primary/10 px-2 py-1 text-primary">Agent (reasoning &amp; exceptions)</span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {ARCHITECTURE_LAYERS.map((l) => (
                  <div key={l.layer} className="rounded-lg border border-border bg-muted/40 p-3">
                    <div className="flex items-center gap-2 text-xs font-semibold">
                      <Cpu className="size-3.5 text-muted-foreground" />
                      {LAYER_LABEL[l.layer]}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{l.responsibility}</p>
                    <ul className="mt-2 space-y-0.5">
                      {l.examples.map((e) => (
                        <li key={e} className="text-[11px] text-muted-foreground">
                          • {e}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-[11px] text-muted-foreground">
                Deterministic work (reminders, status checks, rule-based follow-ups) never runs through the language
                model — the agent is invoked only for ambiguous queries and exceptional cases.
              </p>
            </DataCard>
          </div>
        </div>

        <div className="space-y-6">
          <div>
            <SectionTitle>Agent capabilities</SectionTitle>
            <DataCard className="p-4">
              <ul className="space-y-2.5">
                {AGENT_CAPABILITIES.map((cap) => {
                  const meta = CAPABILITY[cap.state];
                  return (
                    <li key={cap.label} className="flex items-start gap-2">
                      <span
                        className={cn(
                          "mt-0.5 text-xs font-bold",
                          cap.state === "ENABLED" ? "text-success" : "text-muted-foreground/60",
                        )}
                      >
                        {cap.state === "ENABLED" ? "✓" : "○"}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-medium">{cap.label}</span>
                          <Pill tone={meta.tone}>{meta.label}</Pill>
                        </div>
                        <p className="text-[11px] text-muted-foreground">{cap.note}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </DataCard>
          </div>

          <div>
            <SectionTitle
              action={
                <Button variant="ghost" size="sm" asChild>
                  <Link to="/activity">View all</Link>
                </Button>
              }
            >
              Live event stream
            </SectionTitle>
            <DataCard className="p-4">
              <ol className="space-y-3">
                {activity.slice(0, 10).map((a) => (
                  <li key={a.id} className="flex gap-2 text-xs">
                    <span className="tabular w-10 shrink-0 font-semibold text-muted-foreground">{fmtTime(a.at)}</span>
                    <div className="min-w-0 flex-1">
                      <p>{a.message}</p>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        <Pill>{LAYER_LABEL[activityLayer(a)]}</Pill>
                        <Pill tone={OUTCOME_TONE[activityOutcome(a)]}>{activityOutcome(a).toLowerCase()}</Pill>
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            </DataCard>
          </div>
        </div>
      </div>

      <div className="mt-8 rounded-xl border border-dashed border-border bg-card/60 p-4 text-xs text-muted-foreground">
        <span className="font-semibold text-foreground">Prototype notice · </span>
        Agent decisions, counters and traces shown here are simulated. DFMS and ABC verification are not connected.
      </div>
    </>
  );
}
