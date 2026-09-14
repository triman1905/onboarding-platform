import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Mail, MessageSquare, Save } from "lucide-react";
import { toast } from "sonner";
import { useVanguard } from "@/lib/vanguard/store";
import { fmtDate } from "@/lib/vanguard/mock-data";
import { DataCard, PageHeader, SectionTitle } from "@/components/vanguard/primitives";
import { Pill } from "@/components/vanguard/status";
import { LocalTemplatesPanel } from "@/components/vanguard/email/live-panels";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { CommunicationTemplate } from "@/lib/vanguard/types";

export const Route = createFileRoute("/templates")({
  head: () => ({
    meta: [
      { title: "Templates · ABC Automation" },
      { name: "description", content: "Manage the email and WhatsApp templates used across onboarding automation." },
      { property: "og:title", content: "Templates · ABC Automation" },
      { property: "og:description", content: "Edit template copy, merge variables and activation state." },
    ],
  }),
  component: Templates,
});

function Templates() {
  const { templates, saveTemplate, toggleTemplate } = useVanguard();
  const [selectedId, setSelectedId] = useState(templates[0]?.id ?? "");
  const selected = templates.find((t) => t.id === selectedId) ?? templates[0];
  const [draft, setDraft] = useState<CommunicationTemplate | null>(selected ?? null);

  const pick = (t: CommunicationTemplate) => {
    setSelectedId(t.id);
    setDraft({ ...t });
  };

  const active = draft && draft.id === selected?.id ? draft : (selected ?? null);

  return (
    <>
      <PageHeader
        title="Communication Templates"
        description="Reusable email and WhatsApp copy with merge variables resolved per candidate at send time."
      />

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <DataCard className="h-fit">
          <div className="border-b border-border px-4 py-3">
            <SectionTitle>{templates.length} templates</SectionTitle>
          </div>
          <ul className="max-h-[640px] overflow-auto">
            {templates.map((t) => (
              <li key={t.id}>
                <button
                  onClick={() => pick(t)}
                  className={cn(
                    "flex w-full flex-col items-start gap-1 border-b border-border/70 px-4 py-3 text-left transition-colors hover:bg-accent/50",
                    t.id === active?.id && "bg-accent",
                  )}
                >
                  <span className="flex items-center gap-2 text-sm font-medium">
                    {t.channel === "EMAIL" ? <Mail className="size-3.5" /> : <MessageSquare className="size-3.5" />}
                    {t.name}
                  </span>
                  <span className="flex items-center gap-2">
                    <Pill>{t.category}</Pill>
                    <Pill tone={t.active ? "success" : "neutral"}>{t.active ? "Active" : "Inactive"}</Pill>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </DataCard>

        {active ? (
          <DataCard className="p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold">{active.name}</h2>
                <p className="text-xs text-muted-foreground">
                  {active.category} · {active.channel === "EMAIL" ? "Email" : "WhatsApp"} · updated {fmtDate(active.updatedAt)}
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs">
                Active
                <Switch
                  checked={active.active}
                  onCheckedChange={() => {
                    toggleTemplate(active.id);
                    toast.success(active.active ? "Template deactivated" : "Template activated");
                  }}
                />
              </div>
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Template name</Label>
                <Input value={active.name} onChange={(e) => setDraft({ ...active, name: e.target.value })} />
              </div>
              {active.channel === "EMAIL" ? (
                <div className="space-y-1.5">
                  <Label className="text-xs">Subject</Label>
                  <Input value={active.subject} onChange={(e) => setDraft({ ...active, subject: e.target.value })} />
                </div>
              ) : null}
              <div className="space-y-1.5">
                <Label className="text-xs">Body</Label>
                <Textarea rows={14} value={active.body} onChange={(e) => setDraft({ ...active, body: e.target.value })} />
              </div>
              <div>
                <SectionTitle>Available variables</SectionTitle>
                <div className="flex flex-wrap gap-2">
                  {active.variables.map((v) => (
                    <button
                      key={v}
                      className="rounded-md border border-border bg-muted px-2 py-1 font-mono text-[11px] hover:bg-accent"
                      onClick={() => setDraft({ ...active, body: `${active.body}${v}` })}
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDraft(selected ? { ...selected } : null)}>Reset</Button>
              <Button
                onClick={() => {
                  saveTemplate({ ...active, updatedAt: new Date().toISOString() });
                  toast.success("Template saved");
                }}
              >
                <Save className="size-4" /> Save template
              </Button>
            </div>
          </DataCard>
        ) : null}
      </div>
      <div className="mt-6">
        <LocalTemplatesPanel />
      </div>

    </>
  );
}
