import { useState, useEffect, useMemo } from "react";
import { Switch, Route, useLocation, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AdminSidebar } from "@/components/admin/admin-sidebar";
import { HierarchyBreadcrumb } from "@/components/admin/hierarchy-breadcrumb";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useEmc } from "@/lib/emc-context";
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
import DevicesHubPage from "../admin/devices-hub";
import TimecardsPage from "../admin/timecards";
import SchedulingPage from "../admin/scheduling";
import LineUpPage from "../admin/line-up";
import TipPoolingPage from "../admin/tip-pooling";
import LaborAnalyticsPage from "../admin/labor-analytics";
import JobsPage from "../admin/jobs";
import OvertimeRulesPage from "../admin/overtime-rules";
import PaymentProcessorsPage from "../admin/payment-processors";
import TerminalDevicesPage from "../admin/terminal-devices";
import RegisteredDevicesPage from "../admin/registered-devices";
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
import CalPackagesPage from "../admin/cal-packages";
import ServiceHostsPage from "../admin/service-hosts";
import ConnectivityTestPage from "../admin/connectivity-test";
import TipRulesPage from "../admin/tip-rules";
import TimecardReportPage from "../admin/timecard-report";
import BreakRulesPage from "../admin/break-rules";
import BreakMonitoringPage from "../admin/break-monitoring";
import BreakViolationsPage from "../admin/break-violations";
import MinorLaborPage from "../admin/minor-labor";

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
      const res = await fetch(`/api/admin/stats${enterpriseParam}`);
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

export default function EmcAdminLayout() {
  const [, navigate] = useLocation();
  const { user, isAuthenticated, logout, isLoading, selectedEnterpriseId, setSelectedEnterpriseId } = useEmc();

  // Real-time sync for all data changes across the system
  usePosWebSocket();

  // Determine the effective enterprise ID to use for filtering
  // - super_admin: can choose any enterprise, uses selectedEnterpriseId from context
  // - enterprise_admin: locked to their assigned enterprise
  // - property_admin: locked to their assigned enterprise (via property)
  const isSuperAdmin = user?.accessLevel === "super_admin";
  const effectiveEnterpriseId = isSuperAdmin 
    ? selectedEnterpriseId 
    : user?.enterpriseId || null;

  const { data: allEnterprises = [] } = useQuery<Enterprise[]>({
    queryKey: ["/api/enterprises"],
    enabled: isAuthenticated,
  });

  // Filter enterprises based on access level
  const enterprises = useMemo(() => {
    if (isSuperAdmin) {
      return allEnterprises;
    }
    // Non-super admins only see their assigned enterprise
    return allEnterprises.filter(e => e.id === user?.enterpriseId);
  }, [allEnterprises, isSuperAdmin, user?.enterpriseId]);

  const { data: allProperties = [] } = useQuery<Property[]>({
    queryKey: ["/api/properties"],
    enabled: isAuthenticated,
  });

  // Filter properties by effective enterprise
  const properties = useMemo(() => {
    if (!effectiveEnterpriseId) return [];
    return allProperties.filter(p => p.enterpriseId === effectiveEnterpriseId);
  }, [allProperties, effectiveEnterpriseId]);

  const { data: allRvcs = [] } = useQuery<Rvc[]>({
    queryKey: ["/api/rvcs"],
    enabled: isAuthenticated,
  });

  // Filter RVCs by filtered properties
  const rvcs = useMemo(() => {
    const propertyIds = new Set(properties.map(p => p.id));
    return allRvcs.filter(r => propertyIds.has(r.propertyId));
  }, [allRvcs, properties]);

  const [selectedEnterprise, setSelectedEnterprise] = useState<Enterprise | null>(null);
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);
  const [selectedRvc, setSelectedRvc] = useState<Rvc | null>(null);

  // Sync selectedEnterprise with effectiveEnterpriseId
  useEffect(() => {
    if (effectiveEnterpriseId && enterprises.length > 0) {
      const ent = enterprises.find(e => e.id === effectiveEnterpriseId);
      if (ent && selectedEnterprise?.id !== ent.id) {
        setSelectedEnterprise(ent);
        setSelectedProperty(null);
        setSelectedRvc(null);
      }
    }
  }, [effectiveEnterpriseId, enterprises, selectedEnterprise?.id]);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      navigate("/emc/login");
    }
  }, [isAuthenticated, isLoading, navigate]);

  const handleEnterpriseChange = (id: string | null) => {
    const ent = enterprises.find((e) => e.id === id) || null;
    setSelectedEnterprise(ent);
    setSelectedProperty(null);
    setSelectedRvc(null);
    // For super_admin, also update context
    if (isSuperAdmin) {
      setSelectedEnterpriseId(id);
    }
  };

  const handlePropertyChange = (id: string | null) => {
    const prop = properties.find((p) => p.id === id) || null;
    setSelectedProperty(prop);
    setSelectedRvc(null);
  };

  const handleRvcChange = (id: string | null) => {
    const rvc = rvcs.find((r) => r.id === id) || null;
    setSelectedRvc(rvc);
  };

  const handleLogout = () => {
    logout();
    setSelectedEnterpriseId(null);
    navigate("/emc/login");
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  const sidebarStyle = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  } as React.CSSProperties;

  return (
    <SidebarProvider style={sidebarStyle}>
      <div className="flex h-screen w-full">
        <AdminSidebar onLogout={handleLogout} basePath="/emc" />
        <div className="flex flex-col flex-1 overflow-hidden">
          <header className="flex items-center justify-between gap-4 px-4 py-2 border-b">
            <div className="flex items-center gap-4">
              <SidebarTrigger data-testid="button-sidebar-toggle" />
              {isSuperAdmin && (
                <div className="flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-muted-foreground" />
                  <Select
                    value={selectedEnterpriseId || ""}
                    onValueChange={(value) => handleEnterpriseChange(value || null)}
                  >
                    <SelectTrigger className="w-[220px]" data-testid="select-enterprise">
                      <SelectValue placeholder="Select Enterprise" />
                    </SelectTrigger>
                    <SelectContent>
                      {allEnterprises.map((ent) => (
                        <SelectItem key={ent.id} value={ent.id} data-testid={`select-enterprise-${ent.id}`}>
                          {ent.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="text-sm text-muted-foreground">
                Logged in as <span className="font-medium text-foreground">{user?.email}</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <ThemeToggle />
              <Button variant="ghost" size="icon" onClick={handleLogout} data-testid="button-emc-logout">
                <LogOut className="w-4 h-4" />
              </Button>
            </div>
          </header>

          <HierarchyBreadcrumb
            enterprises={enterprises}
            properties={properties}
            rvcs={rvcs}
            selectedEnterprise={selectedEnterprise}
            selectedProperty={selectedProperty}
            selectedRvc={selectedRvc}
            onEnterpriseChange={handleEnterpriseChange}
            onPropertyChange={handlePropertyChange}
            onRvcChange={handleRvcChange}
          />

          <main className="flex-1 overflow-auto">
            {isSuperAdmin && !effectiveEnterpriseId ? (
              <div className="flex items-center justify-center h-full">
                <Card className="max-w-md">
                  <CardContent className="pt-6 text-center space-y-4">
                    <Building2 className="w-12 h-12 mx-auto text-muted-foreground" />
                    <div>
                      <h2 className="text-xl font-semibold">Select an Enterprise</h2>
                      <p className="text-muted-foreground mt-2">
                        As a platform administrator, please select an enterprise from the dropdown above to view and manage its configuration.
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
              <Route path="/emc/registered-devices" component={RegisteredDevicesPage} />
              <Route path="/emc/printers" component={PrintersPage} />
              <Route path="/emc/kds-devices" component={KdsDevicesPage} />
              <Route path="/emc/pos-layouts" component={PosLayoutsPage} />
              <Route path="/emc/major-groups" component={MajorGroupsPage} />
              <Route path="/emc/family-groups" component={FamilyGroupsPage} />
              <Route path="/emc/utilities" component={UtilitiesPage} />
              <Route path="/emc/reports" component={ReportsPage} />
              <Route path="/emc/devices" component={DevicesPage} />
              <Route path="/emc/devices-hub" component={DevicesHubPage} />
              <Route path="/emc/cal-packages" component={CalPackagesPage} />
              <Route path="/emc/service-hosts" component={ServiceHostsPage} />
              <Route path="/emc/connectivity-test" component={ConnectivityTestPage} />
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
    </SidebarProvider>
  );
}
