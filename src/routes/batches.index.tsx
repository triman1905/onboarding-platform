import { createFileRoute, Link } from "@tanstack/react-router";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth/store";
import { emailApi, useLocalApi } from "@/lib/email/api";
import { fmtDate } from "@/lib/vanguard/mock-data";
import { DataCard, EmptyState, PageHeader, ProgressBar } from "@/components/vanguard/primitives";
import { Pill } from "@/components/vanguard/status";
import { ConfirmDialog } from "@/components/vanguard/confirm-dialog";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/batches/")({
  head: () => ({
    meta: [
      { title: "Batches · ABC Automation" },
      { name: "description", content: "Create, monitor and manage ABC candidate batches." },
      { property: "og:title", content: "Batches · ABC Automation" },
      {
        property: "og:description",
        content: "Batch import, validation and candidate onboarding tracking.",
      },
    ],
  }),
  component: BatchesList,
});

/** Every batch this backend creates is status "IMPORTED" today — mapped generically in case that grows. */
const STATUS_TONE: Record<string, "neutral" | "success" | "warning" | "info"> = {
  IMPORTED: "info",
  COMPLETED: "success",
};

function BatchesList() {
  const { currentUser } = useAuth();
  const isManager = currentUser?.role === "MANAGER";
  const batches = useLocalApi(() => emailApi.batches(), []);

  const rows = batches.data ?? [];

  const handleDelete = async (id: string, name: string) => {
    try {
      const result = await emailApi.deleteBatch(id);
      toast.success(`Batch "${name}" deleted (${result.candidatesRemoved} candidate(s) removed)`);
      void batches.reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete batch");
    }
  };

  return (
    <>
      <PageHeader
        title="Batches"
        description="Each batch groups the candidates imported together for onboarding and BGV tracking."
        actions={
          isManager ? (
            <Button asChild>
              <Link to="/batches/new">
                <Plus className="size-4" /> Create Batch
              </Link>
            </Button>
          ) : undefined
        }
      />

      <DataCard>
        {batches.loading ? (
          <EmptyState title="Loading batches…" />
        ) : batches.offline ? (
          <EmptyState
            title="Cannot reach the backend"
            description="Start it with `npm run server` to load real batch data."
          />
        ) : rows.length === 0 ? (
          <EmptyState
            title="No batches yet"
            description="Create a batch to import candidates and start onboarding."
            action={
              isManager ? (
                <Button asChild>
                  <Link to="/batches/new">
                    <Plus className="size-4" /> Create Batch
                  </Link>
                </Button>
              ) : undefined
            }
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Batch name</TableHead>
                <TableHead>Joining date</TableHead>
                <TableHead>Created on</TableHead>
                <TableHead className="text-right">Candidates</TableHead>
                <TableHead className="w-[200px]">Completion</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((b) => {
                const total = b.candidate_count ?? 0;
                const ready = b.induction_ready_count ?? 0;
                const pct = total ? Math.round((ready / total) * 100) : 0;
                return (
                  <TableRow key={b.id}>
                    <TableCell className="font-medium">{b.name}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {fmtDate(b.joining_date ?? undefined)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{fmtDate(b.created_at)}</TableCell>
                    <TableCell className="tabular text-right">{total.toLocaleString()}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <ProgressBar value={pct} />
                        <span className="tabular w-9 text-right text-xs font-semibold">{pct}%</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Pill tone={STATUS_TONE[b.status] ?? "neutral"}>
                        {b.status.replaceAll("_", " ").toLowerCase()}
                      </Pill>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" asChild>
                          <Link to="/candidates" search={{ batch: b.id }}>
                            View
                          </Link>
                        </Button>
                        {isManager ? (
                          <ConfirmDialog
                            trigger={
                              <Button variant="outline" size="sm">
                                <Trash2 className="size-3.5" /> Delete
                              </Button>
                            }
                            title={`Delete "${b.name}"?`}
                            description={
                              <>
                                <p>
                                  This permanently removes{" "}
                                  <strong>{total.toLocaleString()} candidate(s)</strong> in this
                                  batch, along with their BGV status, remarks, assignment and
                                  communication history.
                                </p>
                                <p>This cannot be undone.</p>
                              </>
                            }
                            confirmLabel="Delete batch"
                            destructive
                            onConfirm={() => void handleDelete(b.id, b.name)}
                          />
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </DataCard>
    </>
  );
}
