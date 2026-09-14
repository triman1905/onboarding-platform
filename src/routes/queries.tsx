import { createFileRoute, Link } from "@tanstack/react-router";
import { useVanguard } from "@/lib/vanguard/store";
import { fmtDate } from "@/lib/vanguard/mock-data";
import { DataCard, EmptyState, PageHeader } from "@/components/vanguard/primitives";
import { Pill, PriorityBadge } from "@/components/vanguard/status";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/queries")({
  head: () => ({
    meta: [
      { title: "Candidate Queries · ABC Automation" },
      { name: "description", content: "Full log of candidate questions, AI classification and resolution status." },
      { property: "og:title", content: "Candidate Queries · ABC Automation" },
      { property: "og:description", content: "Track every candidate question raised during onboarding." },
    ],
  }),
  component: Queries,
});

function Queries() {
  const { queries } = useVanguard();
  return (
    <>
      <PageHeader
        title="Candidate Queries"
        description="Every question received from candidates, with its AI classification and current status."
        actions={
          <Button asChild>
            <Link to="/ai-assistant">Open AI Assistant</Link>
          </Button>
        }
      />
      <DataCard>
        {queries.length === 0 ? (
          <EmptyState title="No candidate queries yet" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Candidate</TableHead>
                <TableHead>Question</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Confidence</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Received</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {queries.map((q) => (
                <TableRow key={q.id}>
                  <TableCell className="font-medium">
                    <Link
                      to="/candidates/$candidateId"
                      params={{ candidateId: q.candidateId }}
                      className="underline-offset-2 hover:underline"
                    >
                      {q.candidateName}
                    </Link>
                  </TableCell>
                  <TableCell className="max-w-[280px] truncate text-xs">{q.question}</TableCell>
                  <TableCell><Pill tone="info">{q.category}</Pill></TableCell>
                  <TableCell>
                    <Pill tone={q.confidence >= 90 ? "success" : q.confidence >= 75 ? "warning" : "danger"}>
                      {q.confidence}%
                    </Pill>
                  </TableCell>
                  <TableCell><PriorityBadge priority={q.priority} /></TableCell>
                  <TableCell>
                    <Pill tone={q.status === "ANSWERED" ? "success" : q.status === "ESCALATED" ? "danger" : "warning"}>
                      {q.status.toLowerCase()}
                    </Pill>
                  </TableCell>
                  <TableCell className="text-xs whitespace-nowrap text-muted-foreground">{fmtDate(q.createdAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </DataCard>
    </>
  );
}
