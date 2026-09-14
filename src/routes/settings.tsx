import { createFileRoute } from "@tanstack/react-router";
import { useVanguard } from "@/lib/vanguard/store";
import { fmtDate, fmtTime } from "@/lib/vanguard/mock-data";
import { DataCard, KeyValue, PageHeader, SectionTitle } from "@/components/vanguard/primitives";
import { Pill } from "@/components/vanguard/status";
import { EmailSettingsPanel } from "@/components/vanguard/email/live-panels";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings · ABC Automation" },
      { name: "description", content: "Users, roles, platform defaults and the audit trail for the ABC platform." },
      { property: "og:title", content: "Settings · ABC Automation" },
      { property: "og:description", content: "Manage access, defaults and review the audit log." },
    ],
  }),
  component: Settings,
});

function Settings() {
  const { users, audit, currentUser } = useVanguard();
  return (
    <>
      <PageHeader title="Settings" description="Access control, platform defaults and audit trail." />
      <Tabs defaultValue="email">
        <TabsList>
          <TabsTrigger value="email">Email configuration</TabsTrigger>
          <TabsTrigger value="users">Users &amp; roles</TabsTrigger>
          <TabsTrigger value="platform">Platform</TabsTrigger>
          <TabsTrigger value="audit">Audit log</TabsTrigger>
        </TabsList>

        <TabsContent value="email" className="mt-4">
          <EmailSettingsPanel />
        </TabsContent>

        <TabsContent value="users" className="mt-4">
          <DataCard>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Last active</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">
                      {u.name}
                      {u.name === currentUser.name ? <Pill className="ml-2">You</Pill> : null}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{u.email}</TableCell>
                    <TableCell><Pill tone="info">{u.role}</Pill></TableCell>
                    <TableCell className="text-xs text-muted-foreground">{fmtDate(u.lastActive)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </DataCard>
        </TabsContent>

        <TabsContent value="platform" className="mt-4">
          <DataCard className="max-w-xl p-5">
            <SectionTitle>Platform defaults</SectionTitle>
            <KeyValue label="Environment" value={<Pill tone="warning">Prototype · mock data</Pill>} />
            <KeyValue label="Project" value="ABC" />
            <KeyValue label="Default reminder cadence" value="Day 3 · Day 7 · Day 10" />
            <KeyValue label="Escalation threshold" value="10 days" />
            <KeyValue label="Data retention" value="7 years (policy placeholder)" />
            <KeyValue label="PII masking" value={<Pill tone="success">Enabled in lists</Pill>} />
          </DataCard>
        </TabsContent>

        <TabsContent value="audit" className="mt-4">
          <DataCard>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Actor</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Entity</TableHead>
                  <TableHead>When</TableHead>
                  <TableHead>IP</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {audit.slice(0, 40).map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium">{a.actor}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{a.role}</TableCell>
                    <TableCell className="text-xs">{a.action}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{a.entity}</TableCell>
                    <TableCell className="text-xs whitespace-nowrap text-muted-foreground">
                      {fmtDate(a.at)} · {fmtTime(a.at)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{a.ip}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </DataCard>
        </TabsContent>
      </Tabs>
    </>
  );
}
