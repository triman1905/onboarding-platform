import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Play, Zap } from "lucide-react";
import { toast } from "sonner";
import { useVanguard, type SimEvent } from "@/lib/vanguard/store";
import { fmtDate, fmtTime } from "@/lib/vanguard/mock-data";
import { DataCard, PageHeader, SectionTitle } from "@/components/vanguard/primitives";
import { Pill } from "@/components/vanguard/status";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/simulator")({
  head: () => ({
    meta: [
      { title: "Automation Simulator · ABC Automation" },
      { name: "description", content: "Trigger candidate events to demonstrate the onboarding automation workflow end to end." },
      { property: "og:title", content: "Automation Simulator · ABC Automation" },
      { property: "og:description", content: "Simulate uploads, reminders, escalations and delivery failures." },
    ],
  }),
  component: Simulator,
});

const EVENTS: Array<{ key: SimEvent; label: string; description: string }> = [
  { key: "COMPLETE_VERIFICATION", label: "Candidate completes verification", description: "Marks the form submitted and documents complete" },
  { key: "UPLOAD_DOCUMENT", label: "Candidate uploads a document", description: "Fulfils the next pending required document" },
  { key: "MISS_DOCUMENT", label: "Required document missing", description: "Raises an issue and sends a follow-up email" },
  { key: "ASK_QUESTION", label: "Candidate asks a question", description: "Creates an AI-classified query awaiting review" },
  { key: "REMINDER_DUE", label: "Reminder becomes due", description: "Delivers the scheduled reminder template" },
  { key: "ESCALATE", label: "Escalation threshold reached", description: "Escalates the candidate to the recruitment team" },
  { key: "COMM_SUCCESS", label: "Delivery succeeds", description: "Simulates a successful delivery receipt" },
  { key: "COMM_FAIL", label: "Delivery fails", description: "Simulates a bounce and raises a communication issue" },
];

const SCENARIOS: Array<{ name: string; description: string; steps: SimEvent[] }> = [
  {
    name: "Happy path onboarding",
    description: "Invitation → document upload → verification complete → ready for DFMS",
    steps: ["COMM_SUCCESS", "UPLOAD_DOCUMENT", "COMPLETE_VERIFICATION"],
  },
  {
    name: "Missing document recovery",
    description: "Document mismatch detected → automated follow-up → candidate uploads → resolved",
    steps: ["MISS_DOCUMENT", "REMINDER_DUE", "UPLOAD_DOCUMENT"],
  },
  {
    name: "Unresponsive candidate",
    description: "Reminder cycle exhausted → escalation raised to the recruitment team",
    steps: ["REMINDER_DUE", "REMINDER_DUE", "ESCALATE"],
  },
  {
    name: "Delivery failure handling",
    description: "Email bounces → exception raised → candidate asks a question the agent classifies",
    steps: ["COMM_FAIL", "ASK_QUESTION"],
  },
];

function Simulator() {
  const { candidates, simulate, activity } = useVanguard();
  const [candidateId, setCandidateId] = useState(candidates[0]?.id ?? "");
  const [log, setLog] = useState<string[]>([]);

  const runScenario = (steps: SimEvent[], name: string) => {
    const results = steps.map((step) => simulate(step, candidateId));
    setLog(results);
    toast.success(`${name} · ${steps.length} automated steps executed`);
  };

  return (
    <>
      <PageHeader
        title="Automation Simulator"
        description="External systems are not connected. Use these triggers to demonstrate how the automation reacts to candidate events."
      />

      <div className="mb-4 flex items-start gap-3 rounded-xl border border-warning/30 bg-warning-soft p-4">
        <Zap className="mt-0.5 size-4 text-warning" />
        <p className="text-xs text-warning">
          Demo harness only. Each trigger updates candidate state, communications, issues and rule executions exactly as
          the production workflow engine would.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
        <DataCard className="p-5">
          <SectionTitle>Guided scenarios</SectionTitle>
          <p className="mb-3 text-xs text-muted-foreground">
            Run a full journey in one click and watch every automated step the platform takes.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {SCENARIOS.map((sc) => (
              <div key={sc.name} className="flex flex-col justify-between rounded-lg border border-border p-3">
                <div>
                  <p className="text-sm font-medium">{sc.name}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{sc.description}</p>
                </div>
                <Button
                  size="sm"
                  className="mt-3 self-start"
                  disabled={!candidateId}
                  onClick={() => runScenario([...sc.steps], sc.name)}
                >
                  <Play className="size-3.5" /> Run scenario
                </Button>
              </div>
            ))}
          </div>
          {log.length ? (
            <div className="mt-4 rounded-lg border border-border bg-muted/40 p-3">
              <div className="section-label mb-2">What the automation did</div>
              <ol className="space-y-1">
                {log.map((line, i) => (
                  <li key={i} className="flex gap-2 text-xs">
                    <span className="tabular text-muted-foreground">{i + 1}.</span> {line}
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
        </DataCard>

        <DataCard className="p-5">
          <SectionTitle>Trigger an event</SectionTitle>
          <div className="mb-4 space-y-1.5">
            <Label className="text-xs">Candidate</Label>
            <select
              className="h-9 w-full max-w-sm rounded-md border border-input bg-card px-2 text-sm"
              value={candidateId}
              onChange={(e) => setCandidateId(e.target.value)}
            >
              {candidates.slice(0, 60).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.firstName} {c.lastName} · {c.candidateId}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {EVENTS.map((e) => (
              <div key={e.key} className="flex flex-col justify-between rounded-lg border border-border p-3">
                <div>
                  <p className="text-sm font-medium">{e.label}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{e.description}</p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-3 self-start"
                  disabled={!candidateId}
                  onClick={() => {
                    const result = simulate(e.key, candidateId);
                    setLog([result]);
                    toast.success(result);
                  }}
                >
                  <Play className="size-3.5" /> Run
                </Button>
              </div>
            ))}
          </div>
        </DataCard>
        </div>

        <DataCard className="p-5">
          <SectionTitle>Live activity</SectionTitle>
          <ul className="space-y-3">
            {activity.slice(0, 20).map((a) => (
              <li key={a.id} className="border-b border-border/70 pb-3 last:border-0">
                <div className="flex items-center gap-2">
                  <Pill tone={a.actor === "SYSTEM" ? "info" : a.actor === "AI_AGENT" ? "success" : "neutral"}>
                    {a.actor.replace("_", " ").toLowerCase()}
                  </Pill>
                  <span className="text-[11px] text-muted-foreground">
                    {fmtDate(a.at)} · {fmtTime(a.at)}
                  </span>
                </div>
                <p className="mt-1 text-xs">{a.message}</p>
              </li>
            ))}
          </ul>
        </DataCard>
      </div>
    </>
  );
}
