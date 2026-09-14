import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Bot, Send, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useVanguard } from "@/lib/vanguard/store";
import { fmtDate } from "@/lib/vanguard/mock-data";
import { DataCard, EmptyState, KpiCard, PageHeader, SectionTitle } from "@/components/vanguard/primitives";
import { Pill, PriorityBadge } from "@/components/vanguard/status";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/ai-assistant")({
  head: () => ({
    meta: [
      { title: "AI Assistant · ABC Automation" },
      { name: "description", content: "Review AI-classified candidate queries and approve suggested responses before sending." },
      { property: "og:title", content: "AI Assistant · ABC Automation" },
      { property: "og:description", content: "Human-in-the-loop review of AI drafted candidate responses." },
    ],
  }),
  component: AiAssistant,
});

function AiAssistant() {
  const { queries, answerQuery, escalateQuery } = useVanguard();
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const open = useMemo(() => queries.filter((q) => q.status === "OPEN"), [queries]);
  const answered = useMemo(() => queries.filter((q) => q.status === "ANSWERED"), [queries]);
  const escalated = useMemo(() => queries.filter((q) => q.status === "ESCALATED"), [queries]);
  const avgConfidence = queries.length
    ? Math.round(queries.reduce((a, q) => a + q.confidence, 0) / queries.length)
    : 0;

  const renderList = (list: typeof queries, readOnly?: boolean) =>
    list.length === 0 ? (
      <DataCard>
        <EmptyState title="Nothing here" description="Queries appear as candidates ask questions." />
      </DataCard>
    ) : (
      <div className="space-y-3">
        {list.map((q) => {
          const draft = drafts[q.id] ?? q.suggestedResponse;
          return (
            <DataCard key={q.id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Pill tone="info">{q.category}</Pill>
                    <Pill>{q.intent}</Pill>
                    <PriorityBadge priority={q.priority} />
                    <Pill tone={q.confidence >= 90 ? "success" : q.confidence >= 75 ? "warning" : "danger"}>
                      {q.confidence}% confidence
                    </Pill>
                  </div>
                  <p className="mt-2 text-sm font-medium">“{q.question}”</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    <Link
                      to="/candidates/$candidateId"
                      params={{ candidateId: q.candidateId }}
                      className="underline-offset-2 hover:underline"
                    >
                      {q.candidateName}
                    </Link>{" "}
                    · {fmtDate(q.createdAt)} · Assigned to {q.assignedTo}
                  </p>
                </div>
              </div>

              <div className="mt-3 rounded-lg border border-border bg-muted/50 p-3">
                <SectionTitle>
                  <span className="flex items-center gap-1.5">
                    <Sparkles className="size-3.5" /> AI suggested response
                  </span>
                </SectionTitle>
                {readOnly ? (
                  <p className="text-sm whitespace-pre-wrap">{q.answer ?? q.suggestedResponse}</p>
                ) : (
                  <>
                    <Textarea
                      value={draft}
                      rows={4}
                      onChange={(e) => setDrafts({ ...drafts, [q.id]: e.target.value })}
                      className="bg-card text-sm"
                    />
                    <div className="mt-3 flex flex-wrap justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => { escalateQuery(q.id); toast.success("Query escalated to a recruiter"); }}>
                        Escalate to human
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => {
                          answerQuery(q.id, draft);
                          toast.success(`Response sent to ${q.candidateName} (simulated)`);
                        }}
                      >
                        <Send className="size-4" /> Approve &amp; send
                      </Button>
                    </div>
                  </>
                )}
              </div>
            </DataCard>
          );
        })}
      </div>
    );

  return (
    <>
      <PageHeader
        title="AI Assistant"
        description="Candidate questions are auto-classified and drafted. A recruiter always approves before anything is sent."
      />

      <div className="mb-4 flex items-start gap-3 rounded-xl border border-info/30 bg-info-soft p-4">
        <Bot className="mt-0.5 size-4 text-info" />
        <p className="text-xs text-info">
          Human-in-the-loop by design: the assistant never replies to a candidate automatically. Low-confidence queries
          are flagged for review and can be escalated to the recruitment team.
        </p>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Awaiting review" value={open.length} tone="warning" />
        <KpiCard label="Answered" value={answered.length} tone="success" />
        <KpiCard label="Escalated" value={escalated.length} tone="danger" />
        <KpiCard label="Average confidence" value={`${avgConfidence}%`} tone="info" />
      </div>

      <Tabs defaultValue="open">
        <TabsList>
          <TabsTrigger value="open">Awaiting review ({open.length})</TabsTrigger>
          <TabsTrigger value="answered">Answered ({answered.length})</TabsTrigger>
          <TabsTrigger value="escalated">Escalated ({escalated.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="open" className={cn("mt-4")}>{renderList(open)}</TabsContent>
        <TabsContent value="answered" className="mt-4">{renderList(answered, true)}</TabsContent>
        <TabsContent value="escalated" className="mt-4">{renderList(escalated, true)}</TabsContent>
      </Tabs>
    </>
  );
}
