import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useAuth } from "@/lib/auth/store";
import { emailApi, useLocalApi } from "@/lib/email/api";
import {
  workspaceApi,
  type OverallBgvStatus,
  type BgvStatus,
  type CommunicationMedium,
} from "@/lib/vanguard/workspaceApi";
import { DataCard, EmptyState, KpiCard, PageHeader, Pager } from "@/components/vanguard/primitives";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { BgvStatusSelect, OverallBgvPill } from "@/components/vanguard/candidates/bgv";
import { CommunicationMediumSelect } from "@/components/vanguard/candidates/communication-medium-select";
import { RemarksEditor } from "@/components/vanguard/candidates/remarks-editor";
import { DocumentsStatusSelect } from "@/components/vanguard/candidates/documents-status";
import { NextActionEditor } from "@/components/vanguard/candidates/next-action-editor";
import { AssignmentToolbar } from "@/components/vanguard/candidates/assignment-toolbar";
import { toast } from "sonner";

export const Route = createFileRoute("/candidates/")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { batch?: string; q?: string; assignedTo?: string; status?: string } => {
    const out: { batch?: string; q?: string; assignedTo?: string; status?: string } = {};
    if (typeof search["batch"] === "string") out.batch = search["batch"];
    if (typeof search["q"] === "string") out.q = search["q"];
    if (typeof search["assignedTo"] === "string") out.assignedTo = search["assignedTo"];
    // Accepted for backward compatibility with the mock dashboard's stage links
    // (`/` → goToStage) — the real candidate workspace doesn't have that
    // verification-stage taxonomy, so it isn't used for filtering here.
    if (typeof search["status"] === "string") out.status = search["status"];
    return out;
  },
  head: () => ({
    meta: [
      { title: "Candidates · ABC Automation" },
      {
        name: "description",
        content: "Search, filter and manage every candidate across ABC onboarding batches.",
      },
    ],
  }),
  component: CandidatesPage,
});

function fmtDate(value: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function verificationLabel(status: string) {
  return status
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/^\w/, (c) => c.toUpperCase());
}

function CandidatesPage() {
  const search = Route.useSearch();
  const { currentUser } = useAuth();
  const isManager = currentUser?.role === "MANAGER";

  const [batch, setBatch] = useState(search.batch ?? "ALL");
  const [assignedTo, setAssignedTo] = useState(search.assignedTo ?? "ALL");
  const [bgvClient, setBgvClient] = useState<BgvStatus | "ALL">("ALL");
  const [bgvEy, setBgvEy] = useState<BgvStatus | "ALL">("ALL");
  const [overall, setOverall] = useState<OverallBgvStatus | "ALL">("ALL");
  const [medium, setMedium] = useState<CommunicationMedium | "ALL">("ALL");
  const [q, setQ] = useState(search.q ?? "");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const candidates = useLocalApi(() => workspaceApi.listCandidates(), [], 15000);
  const batches = useLocalApi(() => emailApi.batches(), []);
  const teams = useLocalApi(
    () => (isManager ? workspaceApi.getTeams() : Promise.resolve([])),
    [isManager],
  );
  const team = teams.data?.[0] ?? null;

  const rows = useMemo(() => candidates.data ?? [], [candidates.data]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return rows.filter((c) => {
      if (batch !== "ALL" && c.batch_id !== batch) return false;
      if (assignedTo === "UNASSIGNED" && c.assigned_to_user_id) return false;
      if (
        assignedTo !== "ALL" &&
        assignedTo !== "UNASSIGNED" &&
        c.assigned_to_user_id !== assignedTo
      ) {
        return false;
      }
      if (bgvClient !== "ALL" && c.bgv_client_status !== bgvClient) return false;
      if (bgvEy !== "ALL" && c.bgv_ey_status !== bgvEy) return false;
      if (overall !== "ALL" && c.overall_bgv_status !== overall) return false;
      if (medium !== "ALL" && c.communication_medium !== medium) return false;
      if (!term) return true;
      return (
        `${c.first_name} ${c.last_name}`.toLowerCase().includes(term) ||
        c.candidate_id.toLowerCase().includes(term) ||
        c.email.toLowerCase().includes(term) ||
        (c.phone ?? "").includes(term)
      );
    });
  }, [rows, batch, assignedTo, bgvClient, bgvEy, overall, medium, q]);

  const pageSize = 15;
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = Math.min(page, pageCount);
  const pageRows = filtered.slice((current - 1) * pageSize, current * pageSize);

  const kpis = useMemo(() => {
    const total = filtered.length;
    const assigned = filtered.filter((c) => c.assigned_to_user_id).length;
    const inductionReady = filtered.filter(
      (c) => c.overall_bgv_status === "INDUCTION_READY",
    ).length;
    const notReady = filtered.filter((c) => c.overall_bgv_status === "NOT_READY").length;
    const discrepant = filtered.filter((c) => c.overall_bgv_status === "DISCREPANT").length;
    const inProgress = filtered.filter((c) => c.overall_bgv_status === "IN_PROGRESS").length;
    return {
      total,
      assigned,
      unassigned: total - assigned,
      inductionReady,
      notReady,
      discrepant,
      inProgress,
    };
  }, [filtered]);

  const unassignedCount = rows.filter((c) => !c.assigned_to_user_id).length;

  const reload = () => {
    void candidates.reload();
    void teams.reload();
  };

  const patchLocal = async (id: string, patch: () => Promise<unknown>) => {
    try {
      await patch();
      void candidates.reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    }
  };

  const toggleAll = (checked: boolean) => {
    setSelected(checked ? new Set(pageRows.map((c) => c.id)) : new Set());
  };
  const toggleOne = (id: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  return (
    <>
      <PageHeader
        title="Candidates"
        description={
          isManager
            ? "All candidates across your team."
            : `Welcome, ${currentUser?.name} — candidates assigned to you.`
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label={isManager ? "Total Candidates" : "My Candidates"} value={kpis.total} />
        {isManager ? <KpiCard label="Assigned" value={kpis.assigned} tone="info" /> : null}
        {isManager ? <KpiCard label="Unassigned" value={kpis.unassigned} tone="warning" /> : null}
        <KpiCard label="Induction Ready" value={kpis.inductionReady} tone="success" />
        <KpiCard label="In Progress" value={kpis.inProgress} tone="info" />
        <KpiCard label="Not Ready" value={kpis.notReady} tone="warning" />
        <KpiCard label="Discrepant" value={kpis.discrepant} tone="danger" />
      </div>

      <DataCard>
        {isManager ? (
          <AssignmentToolbar
            team={team}
            selectedIds={[...selected]}
            unassignedCount={unassignedCount}
            onAssigned={() => {
              setSelected(new Set());
              reload();
            }}
            onClearSelection={() => setSelected(new Set())}
          />
        ) : null}

        <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
              placeholder="Search by name, candidate ID, email or phone"
              className="h-9 pl-8"
            />
          </div>
          <Select
            value={batch}
            onValueChange={(v) => {
              setBatch(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="h-9 min-w-[140px] flex-1 sm:w-[170px] sm:flex-none">
              <SelectValue placeholder="Batch" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All batches</SelectItem>
              {(batches.data ?? []).map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {isManager ? (
            <Select
              value={assignedTo}
              onValueChange={(v) => {
                setAssignedTo(v);
                setPage(1);
              }}
            >
              <SelectTrigger className="h-9 min-w-[140px] flex-1 sm:w-[160px] sm:flex-none">
                <SelectValue placeholder="Assigned to" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All assignees</SelectItem>
                <SelectItem value="UNASSIGNED">Unassigned</SelectItem>
                {(team?.members ?? []).map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
          <Select
            value={bgvClient}
            onValueChange={(v) => {
              setBgvClient(v as BgvStatus | "ALL");
              setPage(1);
            }}
          >
            <SelectTrigger className="h-9 min-w-[140px] flex-1 sm:w-[150px] sm:flex-none">
              <SelectValue placeholder="BGV Client" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">BGV Client: All</SelectItem>
              <SelectItem value="PENDING">Pending</SelectItem>
              <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
              <SelectItem value="CLEAR">Clear</SelectItem>
              <SelectItem value="DISCREPANT">Discrepant</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={bgvEy}
            onValueChange={(v) => {
              setBgvEy(v as BgvStatus | "ALL");
              setPage(1);
            }}
          >
            <SelectTrigger className="h-9 min-w-[140px] flex-1 sm:w-[150px] sm:flex-none">
              <SelectValue placeholder="BGV EY" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">BGV EY: All</SelectItem>
              <SelectItem value="PENDING">Pending</SelectItem>
              <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
              <SelectItem value="CLEAR">Clear</SelectItem>
              <SelectItem value="DISCREPANT">Discrepant</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={overall}
            onValueChange={(v) => {
              setOverall(v as OverallBgvStatus | "ALL");
              setPage(1);
            }}
          >
            <SelectTrigger className="h-9 min-w-[140px] flex-1 sm:w-[170px] sm:flex-none">
              <SelectValue placeholder="Overall BGV" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Overall BGV: All</SelectItem>
              <SelectItem value="INDUCTION_READY">Induction Ready</SelectItem>
              <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
              <SelectItem value="NOT_READY">Not Ready</SelectItem>
              <SelectItem value="DISCREPANT">Discrepant</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={medium}
            onValueChange={(v) => {
              setMedium(v as CommunicationMedium | "ALL");
              setPage(1);
            }}
          >
            <SelectTrigger className="h-9 min-w-[140px] flex-1 sm:w-[170px] sm:flex-none">
              <SelectValue placeholder="Communication" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Communication: All</SelectItem>
              <SelectItem value="EMAIL">Email</SelectItem>
              <SelectItem value="WHATSAPP">WhatsApp</SelectItem>
              <SelectItem value="SMS">SMS</SelectItem>
              <SelectItem value="EMAIL_WHATSAPP">Email + WhatsApp</SelectItem>
              <SelectItem value="EMAIL_SMS">Email + SMS</SelectItem>
              <SelectItem value="WHATSAPP_SMS">WhatsApp + SMS</SelectItem>
              <SelectItem value="ALL">All channels</SelectItem>
              <SelectItem value="NONE">None</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {candidates.loading ? (
          <EmptyState title="Loading candidates…" />
        ) : pageRows.length === 0 ? (
          <EmptyState
            title="No candidates match these filters"
            description="Adjust the filters or clear your search."
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {isManager ? (
                      <TableHead className="w-8">
                        <Checkbox
                          checked={pageRows.length > 0 && pageRows.every((c) => selected.has(c.id))}
                          onCheckedChange={(v) => toggleAll(Boolean(v))}
                        />
                      </TableHead>
                    ) : null}
                    <TableHead>ID</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Batch</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Joining</TableHead>
                    <TableHead>Verification</TableHead>
                    <TableHead>Documents</TableHead>
                    <TableHead>BGV by Client</TableHead>
                    <TableHead>BGV by EY</TableHead>
                    <TableHead>Overall BGV</TableHead>
                    <TableHead>Communication</TableHead>
                    <TableHead>Assigned To</TableHead>
                    <TableHead>Remarks</TableHead>
                    <TableHead>Last Action</TableHead>
                    <TableHead>Next Action</TableHead>
                    <TableHead>Last Activity</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pageRows.map((c) => {
                    const assignee = team?.members.find((m) => m.id === c.assigned_to_user_id);
                    return (
                      <TableRow key={c.id}>
                        {isManager ? (
                          <TableCell>
                            <Checkbox
                              checked={selected.has(c.id)}
                              onCheckedChange={(v) => toggleOne(c.id, Boolean(v))}
                            />
                          </TableCell>
                        ) : null}
                        <TableCell className="tabular font-medium">{c.candidate_id}</TableCell>
                        <TableCell className="font-medium whitespace-nowrap">
                          {c.first_name} {c.last_name}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-muted-foreground">
                          {batches.data?.find((b) => b.id === c.batch_id)?.name ?? "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground">{c.email}</TableCell>
                        <TableCell className="text-muted-foreground">{c.phone ?? "—"}</TableCell>
                        <TableCell className="whitespace-nowrap text-muted-foreground">
                          {fmtDate(c.joining_date)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                          {verificationLabel(c.verification_status)}
                        </TableCell>
                        <TableCell>
                          <DocumentsStatusSelect
                            value={c.documents_status}
                            onChange={(status) =>
                              patchLocal(c.id, () =>
                                workspaceApi.updateDocumentsStatus(c.id, status),
                              )
                            }
                          />
                        </TableCell>
                        <TableCell>
                          <BgvStatusSelect
                            value={c.bgv_client_status}
                            onChange={(value) =>
                              patchLocal(c.id, () =>
                                workspaceApi.updateBgv(c.id, "bgv_client_status", value),
                              )
                            }
                          />
                        </TableCell>
                        <TableCell>
                          <BgvStatusSelect
                            value={c.bgv_ey_status}
                            onChange={(value) =>
                              patchLocal(c.id, () =>
                                workspaceApi.updateBgv(c.id, "bgv_ey_status", value),
                              )
                            }
                          />
                        </TableCell>
                        <TableCell>
                          <OverallBgvPill status={c.overall_bgv_status} />
                        </TableCell>
                        <TableCell>
                          <CommunicationMediumSelect
                            value={c.communication_medium}
                            onChange={(value) =>
                              patchLocal(c.id, () =>
                                workspaceApi.updateCommunicationMedium(c.id, value),
                              )
                            }
                          />
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                          {assignee?.name ?? (c.assigned_to_user_id ? "—" : "Unassigned")}
                        </TableCell>
                        <TableCell>
                          <RemarksEditor
                            remarks={c.remarks}
                            onSave={async (value) => {
                              await workspaceApi.updateRemarks(c.id, value);
                              void candidates.reload();
                            }}
                          />
                        </TableCell>
                        <TableCell className="max-w-[190px] truncate text-xs text-muted-foreground">
                          {c.last_action_field
                            ? `${c.last_action_field.replaceAll("_", " ")} → ${c.last_action_value ?? "—"}`
                            : "—"}
                        </TableCell>
                        <TableCell>
                          <NextActionEditor
                            value={c.next_action}
                            onSave={async (value) => {
                              await workspaceApi.updateNextAction(c.id, value);
                              void candidates.reload();
                            }}
                          />
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                          {fmtDate(c.last_activity_at)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="outline" size="sm" asChild>
                            <Link to="/candidates/$candidateId" params={{ candidateId: c.id }}>
                              View
                            </Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            <Pager page={current} pageCount={pageCount} total={filtered.length} onPage={setPage} />
          </>
        )}
      </DataCard>
    </>
  );
}
