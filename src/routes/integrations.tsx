import { createFileRoute } from "@tanstack/react-router";
import { PlugZap } from "lucide-react";
import { useVanguard } from "@/lib/vanguard/store";
import { DataCard, PageHeader } from "@/components/vanguard/primitives";
import { Pill } from "@/components/vanguard/status";

export const Route = createFileRoute("/integrations")({
  head: () => ({
    meta: [
      { title: "Integrations · ABC Automation" },
      { name: "description", content: "Status of external systems used by the ABC onboarding automation platform." },
      { property: "og:title", content: "Integrations · ABC Automation" },
      { property: "og:description", content: "DFMS, HRMS, email and WhatsApp connection status." },
    ],
  }),
  component: Integrations,
});

function Integrations() {
  const { integrations } = useVanguard();
  return (
    <>
      <PageHeader
        title="Integrations"
        description="No external system is connected in this prototype — every exchange below is simulated."
      />
      <div className="grid gap-4 md:grid-cols-2">
        {integrations.map((i) => (
          <DataCard key={i.key} className="p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <span className="flex size-9 items-center justify-center rounded-lg bg-muted">
                  <PlugZap className="size-4 text-muted-foreground" />
                </span>
                <div>
                  <h3 className="text-sm font-semibold">{i.name}</h3>
                  <p className="mt-0.5 text-xs text-muted-foreground">{i.description}</p>
                </div>
              </div>
              <Pill tone={i.status === "MOCK" ? "warning" : "neutral"}>
                {i.status === "MOCK" ? "Simulated" : "Not connected"}
              </Pill>
            </div>
            <div className="mt-4 space-y-1 rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
              <p><span className="font-medium text-foreground">Planned method:</span> {i.method}</p>
              <p>{i.note}</p>
            </div>
          </DataCard>
        ))}
      </div>
    </>
  );
}
