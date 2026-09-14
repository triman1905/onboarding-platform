import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth/store";
import { useLocalApi } from "@/lib/email/api";
import { workspaceApi } from "@/lib/vanguard/workspaceApi";
import {
  DataCard,
  EmptyState,
  KpiCard,
  PageHeader,
  SectionTitle,
} from "@/components/vanguard/primitives";
import { Pill } from "@/components/vanguard/status";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/team")({
  head: () => ({ meta: [{ title: "Team · ABC Automation" }] }),
  component: TeamPage,
});

function TeamPage() {
  const { currentUser } = useAuth();
  const teams = useLocalApi(() => workspaceApi.getTeams(), []);
  const [addOpen, setAddOpen] = useState(false);
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(false);

  if (currentUser?.role !== "MANAGER") {
    return (
      <EmptyState
        title="Manager access only"
        description="Team management is only available to the team manager."
      />
    );
  }

  const team = teams.data?.[0];

  return (
    <>
      <PageHeader
        title="Team"
        description={team ? `${team.name} · Manager: ${team.managerName}` : ""}
        actions={
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button size="sm">Add Team Member</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add team member</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label>Name</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} className="mt-1" />
                </div>
                <div>
                  <Label>Username</Label>
                  <Input
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="mt-1"
                    placeholder="e.g. neha"
                  />
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Default password will be <code>{`${username || "username"}@123`}</code>.
                  </p>
                </div>
              </div>
              <DialogFooter>
                <Button
                  disabled={!name || !username || busy || !team}
                  onClick={async () => {
                    if (!team) return;
                    setBusy(true);
                    try {
                      await workspaceApi.addTeamMember(team.id, { name, username });
                      toast.success(`${name} added to the team`);
                      setName("");
                      setUsername("");
                      setAddOpen(false);
                      void teams.reload();
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : "Could not add team member");
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  {busy ? "Adding…" : "Add"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      {team ? (
        <div className="mb-6 grid gap-4 sm:grid-cols-3">
          <KpiCard label="Team Members" value={team.members.length} />
          <KpiCard
            label="Active"
            value={team.members.filter((m) => m.isActive).length}
            tone="success"
          />
          <KpiCard
            label="Total Assigned Candidates"
            value={team.members.reduce((sum, m) => sum + m.assignedCandidates, 0)}
            tone="info"
          />
        </div>
      ) : null}

      <DataCard>
        <div className="border-b border-border p-3">
          <SectionTitle>Team Members</SectionTitle>
        </div>
        {!team?.members.length ? (
          <EmptyState title="No team members yet" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Username</TableHead>
                <TableHead>Assigned Candidates</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {team.members.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="font-medium">{m.name}</TableCell>
                  <TableCell className="text-muted-foreground">{m.username}</TableCell>
                  <TableCell className="tabular">{m.assignedCandidates}</TableCell>
                  <TableCell>
                    <Pill tone={m.isActive ? "success" : "neutral"}>
                      {m.isActive ? "Active" : "Inactive"}
                    </Pill>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" asChild>
                        <Link to="/candidates" search={{ assignedTo: m.id }}>
                          View Candidates
                        </Link>
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={async () => {
                          try {
                            await workspaceApi.setMemberActive(team.id, m.id, !m.isActive);
                            void teams.reload();
                          } catch (e) {
                            toast.error(e instanceof Error ? e.message : "Could not update member");
                          }
                        }}
                      >
                        {m.isActive ? "Deactivate" : "Activate"}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </DataCard>
    </>
  );
}
