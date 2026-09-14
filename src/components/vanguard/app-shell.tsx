import { useMemo, useState } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Bell,
  Bot,
  BarChart3,
  Building2,
  FileText,
  FlaskConical,
  History as HistoryIcon,
  LayoutDashboard,
  Layers,
  Mail,
  MessageSquare,
  Plug,
  Search,
  Settings,
  ShieldAlert,
  Users,
  Users2,
  Workflow,
  Menu,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Pill } from "./status";
import { ChangePasswordDialog } from "./change-password-dialog";
import { useVanguard } from "@/lib/vanguard/store";
import { useAuth } from "@/lib/auth/store";
import { emailApi, useLocalApi } from "@/lib/email/api";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { fmtTime } from "@/lib/vanguard/mock-data";

const NAV_SECTIONS = [
  {
    label: null,
    items: [{ to: "/", label: "Dashboard", icon: LayoutDashboard }],
  },
  {
    label: "Workflows",
    items: [
      { to: "/batches", label: "Batches", icon: Layers },
      { to: "/automation-agent", label: "Automation Agent", icon: Bot },
      { to: "/automation-rules", label: "Automation Rules", icon: Workflow },
      { to: "/simulator", label: "Simulation Mode", icon: FlaskConical },
    ],
  },
  {
    label: "Operations",
    items: [
      { to: "/candidates", label: "Candidates", icon: Users },
      { to: "/team", label: "Team", icon: Users2, managerOnly: true },
      { to: "/needs-attention", label: "Needs Attention", icon: ShieldAlert },
      { to: "/communications", label: "Communications", icon: MessageSquare },
      { to: "/email-automation", label: "Email Automation", icon: Mail },

      { to: "/queries", label: "Candidate Queries", icon: FileText },
      { to: "/ai-assistant", label: "AI Assistant", icon: Bot },
    ],
  },
  {
    label: "Insights",
    items: [
      { to: "/analytics", label: "Analytics", icon: BarChart3 },
      { to: "/activity", label: "Activity & Audit", icon: HistoryIcon },
    ],
  },
  {
    label: "Configuration",
    items: [
      { to: "/templates", label: "Templates", icon: FileText },
      { to: "/integrations", label: "Integrations", icon: Plug },
      { to: "/settings", label: "Settings", icon: Settings },
    ],
  },
] as const;

const TITLES: Record<string, string> = {
  "/": "Dashboard",
  "/batches": "Batches",
  "/batches/new": "Create Batch",
  "/candidates": "Candidates",
  "/team": "Team",
  "/needs-attention": "Needs Attention",
  "/communications": "Communication Center",
  "/automation-rules": "Automation Rules",
  "/automation-agent": "Automation Agent",
  "/activity": "Activity & Audit",
  "/queries": "Candidate Queries",
  "/ai-assistant": "AI Assistant",
  "/analytics": "Analytics",
  "/templates": "Templates",
  "/simulator": "Automation Simulator",
  "/integrations": "Integrations",
  "/settings": "Settings",
};

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { activity, issues } = useVanguard();
  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const readyReminders = useLocalApi(() => emailApi.readyReminders(), [], 15000);
  const reminderNotifications = readyReminders.data ?? [];

  const title = useMemo(() => {
    if (TITLES[pathname]) return TITLES[pathname];
    if (pathname.startsWith("/candidates/")) return "Candidate Detail";
    if (pathname.startsWith("/batches/")) return "Batch Detail";
    return "ABC";
  }, [pathname]);

  const openIssues = issues.filter((i) => i.status !== "RESOLVED").length;
  const isManager = currentUser?.role === "MANAGER";
  const initials =
    currentUser?.name
      .split(" ")
      .map((p) => p[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() ?? "";

  if (!currentUser) return null;

  return (
    <div className="flex min-h-screen bg-background">
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-60 shrink-0 flex-col bg-sidebar text-sidebar-foreground transition-transform lg:static lg:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex items-center gap-2.5 border-b border-sidebar-border px-5 py-4">
          <div className="flex size-8 items-center justify-center rounded-md bg-sidebar-primary text-sm font-bold text-sidebar-primary-foreground">
            A
          </div>
          <div>
            <div className="text-sm font-semibold tracking-tight text-sidebar-accent-foreground">
              ABC
            </div>
            <div className="text-[11px] text-sidebar-foreground/70">Onboarding Automation</div>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 py-3">
          {NAV_SECTIONS.map((section, si) => (
            <div key={section.label ?? "root"} className={cn("space-y-0.5", si > 0 && "mt-4")}>
              {section.label ? (
                <div className="px-3 pb-1 text-[10px] font-semibold tracking-[0.12em] text-sidebar-foreground/45 uppercase">
                  {section.label}
                </div>
              ) : null}
              {section.items.map((item) => {
                if ("managerOnly" in item && item.managerOnly && !isManager) return null;
                const active = item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    onClick={() => setMobileOpen(false)}
                    className={cn(
                      "flex items-center gap-2.5 rounded-md px-3 py-2 text-[13px] font-medium transition-colors",
                      active
                        ? "bg-sidebar-accent text-sidebar-accent-foreground"
                        : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                    )}
                  >
                    <item.icon className={cn("size-4", active && "text-sidebar-primary")} />
                    {item.label}
                    {item.to === "/needs-attention" && openIssues > 0 ? (
                      <span className="tabular ml-auto rounded-full bg-danger/20 px-1.5 py-0.5 text-[10px] font-semibold text-danger">
                        {openIssues}
                      </span>
                    ) : null}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="border-t border-sidebar-border px-4 py-3 text-[11px] leading-relaxed text-sidebar-foreground/60">
          Prototype build · no external systems connected
        </div>
      </aside>

      {mobileOpen ? (
        <div
          className="fixed inset-0 z-30 bg-foreground/30 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border bg-card/95 px-4 backdrop-blur lg:px-6">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setMobileOpen((v) => !v)}
          >
            <Menu className="size-4" />
          </Button>
          <h2 className="text-sm font-semibold">{title}</h2>
          <Pill tone="warning" className="hidden sm:inline-flex">
            Prototype
          </Pill>
          <div className="ml-auto flex items-center gap-2">
            <div className="relative hidden md:block">
              <Search className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Search candidates, batches…" className="h-9 w-56 pl-8 text-sm" />
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="relative">
                  <Bell className="size-4" />
                  {reminderNotifications.length > 0 ? (
                    <span className="tabular absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full bg-danger text-[9px] font-semibold text-danger-foreground">
                      {reminderNotifications.length}
                    </span>
                  ) : (
                    <span className="absolute top-2 right-2 size-1.5 rounded-full bg-danger" />
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-80">
                <DropdownMenuLabel>Notifications</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {reminderNotifications.length > 0 ? (
                  <>
                    {reminderNotifications.map((r) => (
                      <DropdownMenuItem
                        key={r.id}
                        asChild
                        className="flex flex-col items-start gap-1"
                      >
                        <Link to="/email-automation" search={{ tab: "reminders", reminder: r.id }}>
                          <span className="text-xs font-medium">🔔 {r.name} is ready</span>
                          <span className="text-[11px] text-muted-foreground">
                            {r.eligibleCount ?? 0} candidate(s) are eligible.
                          </span>
                          <span className="text-[10px] font-medium text-primary">Review →</span>
                        </Link>
                      </DropdownMenuItem>
                    ))}
                    <DropdownMenuSeparator />
                  </>
                ) : null}
                {activity.slice(0, 6).map((a) => (
                  <DropdownMenuItem key={a.id} className="flex flex-col items-start gap-0.5">
                    <span className="text-xs">{a.message}</span>
                    <span className="text-[10px] text-muted-foreground">{fmtTime(a.at)}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2 rounded-full border border-border bg-card py-1 pr-3 pl-1 text-xs font-medium transition-colors hover:bg-accent">
                  <span className="flex size-6 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                    {initials}
                  </span>
                  <span className="hidden sm:inline">
                    {currentUser.role === "MANAGER" ? "Manager" : "Team Member"}
                  </span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>
                  {currentUser.name}
                  <div className="text-[11px] font-normal text-muted-foreground">
                    Role: {currentUser.role === "MANAGER" ? "Manager" : "Team Member"}
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to="/settings">
                    <Building2 className="mr-2 size-3.5" /> Organization settings
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={(e) => {
                    e.preventDefault();
                    setChangePasswordOpen(true);
                  }}
                >
                  Change password
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    void logout().then(() => void navigate({ to: "/login" }));
                  }}
                >
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <ChangePasswordDialog open={changePasswordOpen} onOpenChange={setChangePasswordOpen} />
        <main className="flex-1 px-4 py-6 lg:px-8">
          <div className="mx-auto max-w-[1400px]">{children}</div>
        </main>
      </div>
    </div>
  );
}
