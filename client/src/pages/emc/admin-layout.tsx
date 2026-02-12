import { useState, useEffect, useMemo, useRef } from "react";
import { Switch, Route, useLocation, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { HierarchyTree } from "@/components/admin/hierarchy-tree";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useEmc } from "@/lib/emc-context";
import { getAuthHeaders } from "@/lib/queryClient";
import { usePosWebSocket } from "@/hooks/use-pos-websocket";
import type { Enterprise, Property, Rvc } from "@shared/schema";
import {
  Building2,
  Store,
  LayoutGrid,
  Users,
  UtensilsCrossed,
  Receipt,
  Monitor,
  LogOut,
  Loader2,
  Settings2,
  Printer,
  Percent,
  CreditCard,
  DollarSign,
  MonitorSmartphone,
  Tv2,
  Wrench,
  Clock,
  CalendarDays,
  Timer,
  BarChart3,
  Coins,
  Briefcase,
  Scale,
  Wallet,
  ClipboardCheck,
  Calendar,
  Banknote,
  ShoppingBag,
  Package,
  TrendingUp,
  Bell,
  CheckCircle,
  FileText,
  Wifi,
  Coffee,
  AlertCircle,
  Baby,
  Shield,
  ChefHat,
  ChevronLeft,
  ChevronRight,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";

import EnterprisesPage from "../admin/enterprises";
import PropertiesPage from "../admin/properties";
import RvcsPage from "../admin/rvcs";
import SlusPage from "../admin/slus";
import MenuItemsPage from "../admin/menu-items";
import ModifiersPage from "../admin/modifiers";
import ModifierGroupsPage from "../admin/modifier-groups";
import EmployeesPage from "../admin/employees";
import RolesPage from "../admin/roles";
import TaxGroupsPage from "../admin/tax-groups";
import TendersPage from "../admin/tenders";
import DiscountsPage from "../admin/discounts";
import ServiceChargesPage from "../admin/service-charges";
import PrintClassesPage from "../admin/print-classes";
import OrderDevicesPage from "../admin/order-devices";
import WorkstationsPage from "../admin/workstations";
import PrintersPage from "../admin/printers";
import KdsDevicesPage from "../admin/kds-devices";
import PosLayoutsPage from "../admin/pos-layouts";
import MajorGroupsPage from "../admin/major-groups";
import FamilyGroupsPage from "../admin/family-groups";
import UtilitiesPage from "../admin/utilities";
import ReportsPage from "../admin/reports";
import DevicesPage from "../admin/devices";
import TimecardsPage from "../admin/timecards";
import SchedulingPage from "../admin/scheduling";
import LineUpPage from "../admin/line-up";
import TipPoolingPage from "../admin/tip-pooling";
import LaborAnalyticsPage from "../admin/labor-analytics";
import JobsPage from "../admin/jobs";
import OvertimeRulesPage from "../admin/overtime-rules";
import PaymentProcessorsPage from "../admin/payment-processors";
import TerminalDevicesPage from "../admin/terminal-devices";
import OnboardingPage from "../admin/onboarding";
import GiftCardsPage from "../admin/gift-cards";
import LoyaltyPage from "../admin/loyalty";
import FiscalClosePage from "../admin/fiscal-close";
import CashManagementPage from "../admin/cash-management";
import OnlineOrderingPage from "../admin/online-ordering";
import InventoryPage from "../admin/inventory";
import ForecastingPage from "../admin/forecasting";
import ManagerAlertsPage from "../admin/manager-alerts";
import ItemAvailabilityPage from "../admin/item-availability";
import AccountingExportPage from "../admin/accounting-export";
import PrintAgentsPage from "../admin/print-agents";
import DescriptorsPage from "../admin/descriptors";
import TipRulesPage from "../admin/tip-rules";
import TimecardReportPage from "../admin/timecard-report";
import BreakRulesPage from "../admin/break-rules";
import BreakMonitoringPage from "../admin/break-monitoring";
import BreakViolationsPage from "../admin/break-violations";
import MinorLaborPage from "../admin/minor-labor";
import { cn } from "@/lib/utils";

interface NavItem {
  title: string;
  url: string;
  icon: React.ComponentType<{ className?: string }>;
  requiresProperty?: boolean;
  enterpriseOnly?: boolean;
  propertyOnly?: boolean;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const navGroups: NavGroup[] = [
  {
    label: "Hierarchy",
    items: [
      { title: "Enterprises", url: "/emc/enterprises", icon: Building2, enterpriseOnly: true },
      { title: "Properties", url: "/emc/properties", icon: Store },
      { title: "Revenue Centers", url: "/emc/rvcs", icon: LayoutGrid },
    ],
  },
  {
    label: "Menu Setup",
    items: [
      { title: "SLUs (Categories)", url: "/emc/slus", icon: LayoutGrid },
      { title: "Menu Items", url: "/emc/menu-items", icon: UtensilsCrossed },
      { title: "Modifiers", url: "/emc/modifiers", icon: Settings2 },
      { title: "Modifier Groups", url: "/emc/modifier-groups", icon: LayoutGrid },
    ],
  },
  {
    label: "Devices & Routing",
    items: [
      { title: "Workstations", url: "/emc/workstations", icon: MonitorSmartphone, requiresProperty: true },
      { title: "Terminal Devices", url: "/emc/terminal-devices", icon: CreditCard, requiresProperty: true },
      { title: "Printers", url: "/emc/printers", icon: Printer, requiresProperty: true },
      { title: "Print Agents", url: "/emc/print-agents", icon: Wifi, requiresProperty: true },
      { title: "KDS Devices", url: "/emc/kds-devices", icon: Tv2, requiresProperty: true },
      { title: "Order Devices", url: "/emc/order-devices", icon: Monitor },
      { title: "Print Classes", url: "/emc/print-classes", icon: LayoutGrid },
      { title: "Descriptors", url: "/emc/descriptors", icon: Receipt },
      { title: "POS Layouts", url: "/emc/pos-layouts", icon: LayoutGrid },
    ],
  },
  {
    label: "Financial",
    items: [
      { title: "Tax Groups", url: "/emc/tax-groups", icon: Receipt },
      { title: "Discounts", url: "/emc/discounts", icon: Percent },
      { title: "Tenders", url: "/emc/tenders", icon: CreditCard },
      { title: "Payment Processors", url: "/emc/payment-processors", icon: Wallet },
      { title: "Service Charges", url: "/emc/service-charges", icon: DollarSign },
      { title: "Major Groups", url: "/emc/major-groups", icon: LayoutGrid },
      { title: "Family Groups", url: "/emc/family-groups", icon: LayoutGrid },
    ],
  },
  {
    label: "Customer",
    items: [
      { title: "Gift Cards", url: "/emc/gift-cards", icon: CreditCard },
      { title: "Loyalty Program", url: "/emc/loyalty", icon: Coins },
    ],
  },
  {
    label: "Staff",
    items: [
      { title: "Employees", url: "/emc/employees", icon: Users },
      { title: "Jobs", url: "/emc/jobs", icon: Briefcase },
      { title: "Roles & Privileges", url: "/emc/roles", icon: Shield },
      { title: "Overtime Rules", url: "/emc/overtime-rules", icon: Scale },
      { title: "Break Rules", url: "/emc/break-rules", icon: Coffee },
      { title: "Tip Rules", url: "/emc/tip-rules", icon: Coins },
    ],
  },
  {
    label: "Time & Attendance",
    items: [
      { title: "Timecards", url: "/emc/timecards", icon: Timer, requiresProperty: true },
      { title: "Scheduling", url: "/emc/scheduling", icon: CalendarDays, requiresProperty: true },
      { title: "Line Up", url: "/emc/line-up", icon: Clock, requiresProperty: true },
      { title: "Break Monitoring", url: "/emc/break-monitoring", icon: Bell, requiresProperty: true },
      { title: "Break Violations", url: "/emc/break-violations", icon: AlertCircle, requiresProperty: true },
      { title: "Minor Labor", url: "/emc/minor-labor", icon: Baby, requiresProperty: true },
    ],
  },
  {
    label: "Reports",
    items: [
      { title: "Reports Dashboard", url: "/emc/reports", icon: LayoutGrid },
      { title: "Timecard Report", url: "/emc/timecard-report", icon: Timer },
      { title: "Tip Pooling", url: "/emc/tip-pooling", icon: Coins },
      { title: "Labor Analytics", url: "/emc/labor-analytics", icon: BarChart3 },
      { title: "Forecasting", url: "/emc/forecasting", icon: TrendingUp },
    ],
  },
  {
    label: "Operations",
    items: [
      { title: "Fiscal Close", url: "/emc/fiscal-close", icon: Calendar, requiresProperty: true },
      { title: "Cash Management", url: "/emc/cash-management", icon: Banknote, requiresProperty: true },
      { title: "Online Ordering", url: "/emc/online-ordering", icon: ShoppingBag },
      { title: "Inventory", url: "/emc/inventory", icon: Package },
      { title: "Item Availability", url: "/emc/item-availability", icon: CheckCircle },
      { title: "Manager Alerts", url: "/emc/manager-alerts", icon: Bell },
      { title: "Accounting Export", url: "/emc/accounting-export", icon: FileText },
    ],
  },
  {
    label: "System",
    items: [
      { title: "Utilities", url: "/emc/utilities", icon: Wrench },
      { title: "Onboarding Checklist", url: "/emc/onboarding", icon: ClipboardCheck },
    ],
  },
];

function EmcDashboard() {
  const { selectedEnterpriseId } = useEmc();
  const enterpriseParam = selectedEnterpriseId ? `?enterpriseId=${selectedEnterpriseId}` : "";

  const { data: stats } = useQuery<{
    enterprises: number;
    properties: number;
    rvcs: number;
    employees: number;
    menuItems: number;
    activeChecks: number;
  }>({
    queryKey: ["/api/admin/stats", { enterpriseId: selectedEnterpriseId }],
    queryFn: async () => {
      const res = await fetch(`/api/admin/stats${enterpriseParam}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch stats");
      return res.json();
    },
  });

  const cards = [
    { title: "Enterprises", value: stats?.enterprises || 0, icon: Building2, href: "/emc/enterprises" },
    { title: "Properties", value: stats?.properties || 0, icon: Store, href: "/emc/properties" },
    { title: "Revenue Centers", value: stats?.rvcs || 0, icon: LayoutGrid, href: "/emc/rvcs" },
    { title: "Employees", value: stats?.employees || 0, icon: Users, href: "/emc/employees" },
    { title: "Menu Items", value: stats?.menuItems || 0, icon: UtensilsCrossed, href: "/emc/menu-items" },
    { title: "Active Checks", value: stats?.activeChecks || 0, icon: Receipt, href: "/emc/reports?tab=open-checks" },
  ];

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-emc-title">Enterprise Management Console</h1>
        <p className="text-muted-foreground">Configure your Cloud POS system</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <Link key={card.title} href={card.href}>
              <Card className="hover-elevate cursor-pointer">
                <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2 space-y-0">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    {card.title}
                  </CardTitle>
                  <Icon className="w-4 h-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold tabular-nums">{card.value}</div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-2">
            <Link href="/emc/menu-items">
              <Button variant="outline" className="w-full justify-start">
                <UtensilsCrossed className="w-4 h-4 mr-2" />
                Manage Menu
              </Button>
            </Link>
            <Link href="/emc/employees">
              <Button variant="outline" className="w-full justify-start">
                <Users className="w-4 h-4 mr-2" />
                Manage Staff
              </Button>
            </Link>
            <Link href="/emc/order-devices">
              <Button variant="outline" className="w-full justify-start">
                <Monitor className="w-4 h-4 mr-2" />
                Configure KDS
              </Button>
            </Link>
            <Link href="/emc/tax-groups">
              <Button variant="outline" className="w-full justify-start">
                <Receipt className="w-4 h-4 mr-2" />
                Tax Settings
              </Button>
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">System Status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm">Database</span>
              <span className="flex items-center gap-2 text-sm text-green-600">
                <div className="w-2 h-2 rounded-full bg-green-500" />
                Connected
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm">WebSocket</span>
              <span className="flex items-center gap-2 text-sm text-green-600">
                <div className="w-2 h-2 rounded-full bg-green-500" />
                Active
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm">KDS Sync</span>
              <span className="flex items-center gap-2 text-sm text-green-600">
                <div className="w-2 h-2 rounded-full bg-green-500" />
                Real-time
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ScopeBadge({ selectedPropertyId, selectedRvcId, properties, rvcs, selectedEnterprise }: {
  selectedPropertyId: string | null;
  selectedRvcId: string | null;
  properties: Property[];
  rvcs: Rvc[];
  selectedEnterprise: Enterprise | null;
}) {
  if (selectedRvcId) {
    const rvc = rvcs.find(r => r.id === selectedRvcId);
    return (
      <div className="px-3 py-2 border-t bg-muted/30">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1">Scope</div>
        <div className="flex items-center gap-1.5">
          <LayoutGrid className="w-3 h-3 text-muted-foreground" />
          <span className="text-xs font-medium truncate">{rvc?.name || "RVC"}</span>
        </div>
      </div>
    );
  }
  if (selectedPropertyId) {
    const prop = properties.find(p => p.id === selectedPropertyId);
    return (
      <div className="px-3 py-2 border-t bg-muted/30">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1">Scope</div>
        <div className="flex items-center gap-1.5">
          <Store className="w-3 h-3 text-muted-foreground" />
          <span className="text-xs font-medium truncate">{prop?.name || "Property"}</span>
        </div>
      </div>
    );
  }
  if (selectedEnterprise) {
    return (
      <div className="px-3 py-2 border-t bg-muted/30">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1">Scope</div>
        <div className="flex items-center gap-1.5">
          <Building2 className="w-3 h-3 text-muted-foreground" />
          <span className="text-xs font-medium truncate">{selectedEnterprise.name}</span>
        </div>
      </div>
    );
  }
  return null;
}

export default function EmcAdminLayout() {
  const [location, navigate] = useLocation();
  const { user, isAuthenticated, logout, isLoading, selectedEnterpriseId, setSelectedEnterpriseId, selectedPropertyId, setSelectedPropertyId, selectedRvcId, setSelectedRvcId } = useEmc();
  const [treeCollapsed, setTreeCollapsed] = useState(false);

  usePosWebSocket();

  const isSystemAdmin = user?.accessLevel === "system_admin" || user?.accessLevel === "super_admin";
  const effectiveEnterpriseId = isSystemAdmin
    ? selectedEnterpriseId
    : user?.enterpriseId || null;

  const { data: allEnterprises = [] } = useQuery<Enterprise[]>({
    queryKey: ["/api/enterprises"],
    enabled: isAuthenticated,
  });

  const enterprises = useMemo(() => {
    if (isSystemAdmin) return allEnterprises;
    return allEnterprises.filter(e => e.id === user?.enterpriseId);
  }, [allEnterprises, isSystemAdmin, user?.enterpriseId]);

  const { data: allProperties = [] } = useQuery<Property[]>({
    queryKey: ["/api/properties"],
    enabled: isAuthenticated,
  });

  const properties = useMemo(() => {
    if (!effectiveEnterpriseId) return [];
    let filtered = allProperties.filter(p => p.enterpriseId === effectiveEnterpriseId);
    if (user?.accessLevel === "property_admin" && user?.propertyId) {
      filtered = filtered.filter(p => p.id === user.propertyId);
    }
    return filtered;
  }, [allProperties, effectiveEnterpriseId, user?.accessLevel, user?.propertyId]);

  const { data: allRvcs = [] } = useQuery<Rvc[]>({
    queryKey: ["/api/rvcs"],
    enabled: isAuthenticated,
  });

  const rvcs = useMemo(() => {
    const propertyIds = new Set(properties.map(p => p.id));
    return allRvcs.filter(r => propertyIds.has(r.propertyId));
  }, [allRvcs, properties]);

  const selectedEnterprise = useMemo(() => {
    return enterprises.find(e => e.id === effectiveEnterpriseId) || null;
  }, [enterprises, effectiveEnterpriseId]);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      navigate("/emc/login");
    }
  }, [isAuthenticated, isLoading, navigate]);

  const handleSelectEnterprise = (id: string) => {
    if (isSystemAdmin) {
      setSelectedEnterpriseId(id);
    }
    setSelectedPropertyId(null);
    setSelectedRvcId(null);
  };

  const handleSelectProperty = (id: string | null) => {
    if (id) {
      const prop = properties.find(p => p.id === id);
      if (prop && isSystemAdmin && prop.enterpriseId !== effectiveEnterpriseId) {
        setSelectedEnterpriseId(prop.enterpriseId);
      }
    }
    setSelectedPropertyId(id);
    setSelectedRvcId(null);
  };

  const handleSelectRvc = (id: string | null) => {
    if (id) {
      const rvc = rvcs.find(r => r.id === id);
      if (rvc && rvc.propertyId !== selectedPropertyId) {
        setSelectedPropertyId(rvc.propertyId);
      }
    }
    setSelectedRvcId(id);
  };

  const handleLogout = () => {
    logout();
    setSelectedEnterpriseId(null);
    navigate("/emc/login");
  };

  const filteredNavGroups = useMemo(() => {
    const hasProperty = !!selectedPropertyId;

    return navGroups.map(group => ({
      ...group,
      items: group.items.filter(item => {
        if (item.enterpriseOnly && hasProperty) return false;
        if (item.requiresProperty && !hasProperty) return false;
        return true;
      }),
    })).filter(group => group.items.length > 0);
  }, [selectedPropertyId]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isAuthenticated) return null;

  const currentPageTitle = (() => {
    for (const group of navGroups) {
      for (const item of group.items) {
        if (location === item.url || location.startsWith(item.url + "/")) {
          return item.title;
        }
      }
    }
    if (location === "/emc" || location === "/emc/dashboard") return "Dashboard";
    return null;
  })();

  return (
    <div className="flex h-screen w-full bg-background">
      <div
        className={cn(
          "flex flex-col border-r bg-muted/20 transition-all duration-200 shrink-0",
          treeCollapsed ? "w-0 overflow-hidden" : "w-64"
        )}
      >
        <div className="flex items-center gap-2 p-3 border-b">
          <div className="w-7 h-7 rounded-md bg-primary flex items-center justify-center shrink-0">
            <ChefHat className="w-4 h-4 text-primary-foreground" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold text-xs">Cloud POS</h2>
            <p className="text-[10px] text-muted-foreground truncate">Enterprise Management</p>
          </div>
        </div>

        <div className="px-3 py-2 border-b">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1">Hierarchy</div>
        </div>
        <HierarchyTree
          enterprises={enterprises}
          properties={properties}
          rvcs={rvcs}
          selectedEnterpriseId={effectiveEnterpriseId}
          selectedPropertyId={selectedPropertyId}
          selectedRvcId={selectedRvcId}
          onSelectEnterprise={handleSelectEnterprise}
          onSelectProperty={handleSelectProperty}
          onSelectRvc={handleSelectRvc}
          isSystemAdmin={isSystemAdmin}
        />

        <ScopeBadge
          selectedPropertyId={selectedPropertyId}
          selectedRvcId={selectedRvcId}
          properties={properties}
          rvcs={rvcs}
          selectedEnterprise={selectedEnterprise}
        />
      </div>

      <div className="flex flex-col flex-1 min-w-0">
        <header className="flex items-center justify-between gap-4 px-4 py-2 border-b shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setTreeCollapsed(!treeCollapsed)}
              data-testid="button-toggle-tree"
            >
              {treeCollapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
            </Button>
            {effectiveEnterpriseId && selectedEnterprise && (
              <div className="flex items-center gap-2 min-w-0">
                <Building2 className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className="text-sm font-medium truncate">{selectedEnterprise.name}</span>
                {selectedPropertyId && (
                  <>
                    <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />
                    <Store className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <span className="text-sm truncate">{properties.find(p => p.id === selectedPropertyId)?.name}</span>
                  </>
                )}
                {selectedRvcId && (
                  <>
                    <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />
                    <LayoutGrid className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <span className="text-sm truncate">{rvcs.find(r => r.id === selectedRvcId)?.name}</span>
                  </>
                )}
              </div>
            )}
            {currentPageTitle && (
              <>
                <Separator orientation="vertical" className="h-5" />
                <span className="text-sm text-muted-foreground">{currentPageTitle}</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs text-muted-foreground hidden md:inline">
              {user?.email}
            </span>
            <ThemeToggle />
            <Button variant="ghost" size="icon" onClick={handleLogout} data-testid="button-emc-logout">
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </header>

        <div className="flex flex-1 min-h-0">
          <nav className="w-52 border-r shrink-0 overflow-y-auto bg-muted/10">
            <div className="py-1">
              <Link href="/emc">
                <div
                  className={cn(
                    "flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer hover-elevate mx-1 rounded-md",
                    (location === "/emc" || location === "/emc/dashboard") && "bg-accent text-accent-foreground"
                  )}
                  data-testid="nav-dashboard"
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                  <span>Dashboard</span>
                </div>
              </Link>
            </div>
            {filteredNavGroups.map((group) => (
              <div key={group.label} className="py-1">
                <div className="px-3 py-1 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                  {group.label}
                </div>
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = location === item.url || location.startsWith(item.url + "/");
                  return (
                    <Link key={item.url} href={item.url}>
                      <div
                        className={cn(
                          "flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer hover-elevate mx-1 rounded-md",
                          isActive && "bg-accent text-accent-foreground"
                        )}
                        data-testid={`nav-${item.url.replace("/emc/", "")}`}
                      >
                        <Icon className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">{item.title}</span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            ))}
          </nav>

          <main className="flex-1 overflow-auto min-w-0">
            {isSystemAdmin && !effectiveEnterpriseId ? (
              <div className="flex items-center justify-center h-full">
                <Card className="max-w-md">
                  <CardContent className="pt-6 text-center space-y-4">
                    <Building2 className="w-12 h-12 mx-auto text-muted-foreground" />
                    <div>
                      <h2 className="text-xl font-semibold">Select an Enterprise</h2>
                      <p className="text-muted-foreground mt-2">
                        Select an enterprise from the hierarchy tree on the left to view and manage its configuration.
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </div>
            ) : (
              <Switch>
                <Route path="/emc" component={EmcDashboard} />
                <Route path="/emc/dashboard" component={EmcDashboard} />
                <Route path="/emc/enterprises" component={EnterprisesPage} />
                <Route path="/emc/properties" component={PropertiesPage} />
                <Route path="/emc/rvcs" component={RvcsPage} />
                <Route path="/emc/slus" component={SlusPage} />
                <Route path="/emc/menu-items" component={MenuItemsPage} />
                <Route path="/emc/modifiers" component={ModifiersPage} />
                <Route path="/emc/modifier-groups" component={ModifierGroupsPage} />
                <Route path="/emc/employees" component={EmployeesPage} />
                <Route path="/emc/roles" component={RolesPage} />
                <Route path="/emc/tax-groups" component={TaxGroupsPage} />
                <Route path="/emc/tenders" component={TendersPage} />
                <Route path="/emc/payment-processors" component={PaymentProcessorsPage} />
                <Route path="/emc/discounts" component={DiscountsPage} />
                <Route path="/emc/service-charges" component={ServiceChargesPage} />
                <Route path="/emc/print-classes" component={PrintClassesPage} />
                <Route path="/emc/order-devices" component={OrderDevicesPage} />
                <Route path="/emc/workstations" component={WorkstationsPage} />
                <Route path="/emc/terminal-devices" component={TerminalDevicesPage} />
                <Route path="/emc/printers" component={PrintersPage} />
                <Route path="/emc/kds-devices" component={KdsDevicesPage} />
                <Route path="/emc/pos-layouts" component={PosLayoutsPage} />
                <Route path="/emc/major-groups" component={MajorGroupsPage} />
                <Route path="/emc/family-groups" component={FamilyGroupsPage} />
                <Route path="/emc/utilities" component={UtilitiesPage} />
                <Route path="/emc/reports" component={ReportsPage} />
                <Route path="/emc/devices" component={DevicesPage} />
                <Route path="/emc/timecards" component={TimecardsPage} />
                <Route path="/emc/scheduling" component={SchedulingPage} />
                <Route path="/emc/line-up" component={LineUpPage} />
                <Route path="/emc/tip-pooling" component={TipPoolingPage} />
                <Route path="/emc/labor-analytics" component={LaborAnalyticsPage} />
                <Route path="/emc/jobs" component={JobsPage} />
                <Route path="/emc/overtime-rules" component={OvertimeRulesPage} />
                <Route path="/emc/tip-rules" component={TipRulesPage} />
                <Route path="/emc/timecard-report" component={TimecardReportPage} />
                <Route path="/emc/break-rules" component={BreakRulesPage} />
                <Route path="/emc/break-monitoring" component={BreakMonitoringPage} />
                <Route path="/emc/break-violations" component={BreakViolationsPage} />
                <Route path="/emc/minor-labor" component={MinorLaborPage} />
                <Route path="/emc/onboarding" component={OnboardingPage} />
                <Route path="/emc/gift-cards" component={GiftCardsPage} />
                <Route path="/emc/loyalty" component={LoyaltyPage} />
                <Route path="/emc/fiscal-close" component={FiscalClosePage} />
                <Route path="/emc/cash-management" component={CashManagementPage} />
                <Route path="/emc/online-ordering" component={OnlineOrderingPage} />
                <Route path="/emc/inventory" component={InventoryPage} />
                <Route path="/emc/forecasting" component={ForecastingPage} />
                <Route path="/emc/manager-alerts" component={ManagerAlertsPage} />
                <Route path="/emc/item-availability" component={ItemAvailabilityPage} />
                <Route path="/emc/accounting-export" component={AccountingExportPage} />
                <Route path="/emc/print-agents" component={PrintAgentsPage} />
                <Route path="/emc/descriptors" component={DescriptorsPage} />
              </Switch>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
