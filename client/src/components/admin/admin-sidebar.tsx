import { Link, useLocation } from "wouter";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import {
  Building2,
  Store,
  Users,
  UtensilsCrossed,
  LayoutGrid,
  Settings2,
  Printer,
  Monitor,
  Receipt,
  DollarSign,
  Percent,
  CreditCard,
  Shield,
  LogOut,
  ChefHat,
  MonitorSmartphone,
  Tv2,
  Wrench,
} from "lucide-react";

interface AdminSidebarProps {
  onLogout: () => void;
}

const menuGroups = [
  {
    label: "Hierarchy",
    items: [
      { title: "Enterprises", url: "/admin/enterprises", icon: Building2 },
      { title: "Properties", url: "/admin/properties", icon: Store },
      { title: "Revenue Centers", url: "/admin/rvcs", icon: LayoutGrid },
    ],
  },
  {
    label: "Menu Setup",
    items: [
      { title: "SLUs (Categories)", url: "/admin/slus", icon: LayoutGrid },
      { title: "Menu Items", url: "/admin/menu-items", icon: UtensilsCrossed },
      { title: "Modifiers", url: "/admin/modifiers", icon: Settings2 },
      { title: "Modifier Groups", url: "/admin/modifier-groups", icon: LayoutGrid },
    ],
  },
  {
    label: "Devices & Routing",
    items: [
      { title: "Workstations", url: "/admin/workstations", icon: MonitorSmartphone },
      { title: "Printers", url: "/admin/printers", icon: Printer },
      { title: "KDS Devices", url: "/admin/kds-devices", icon: Tv2 },
      { title: "Order Devices", url: "/admin/order-devices", icon: Monitor },
      { title: "Print Classes", url: "/admin/print-classes", icon: LayoutGrid },
      { title: "POS Layouts", url: "/admin/pos-layouts", icon: LayoutGrid },
    ],
  },
  {
    label: "Financial",
    items: [
      { title: "Tax Groups", url: "/admin/tax-groups", icon: Receipt },
      { title: "Discounts", url: "/admin/discounts", icon: Percent },
      { title: "Tenders", url: "/admin/tenders", icon: CreditCard },
      { title: "Service Charges", url: "/admin/service-charges", icon: DollarSign },
      { title: "Major Groups", url: "/admin/major-groups", icon: LayoutGrid },
      { title: "Family Groups", url: "/admin/family-groups", icon: LayoutGrid },
    ],
  },
  {
    label: "Staff",
    items: [
      { title: "Employees", url: "/admin/employees", icon: Users },
      { title: "Roles & Privileges", url: "/admin/roles", icon: Shield },
    ],
  },
  {
    label: "Reports",
    items: [
      { title: "Dashboard", url: "/admin/reports", icon: LayoutGrid },
      { title: "Sales Reports", url: "/admin/reports/sales", icon: DollarSign },
      { title: "Operations Reports", url: "/admin/reports/operations", icon: Receipt },
    ],
  },
  {
    label: "System",
    items: [
      { title: "Utilities", url: "/admin/utilities", icon: Wrench },
    ],
  },
];

export function AdminSidebar({ onLogout }: AdminSidebarProps) {
  const [location] = useLocation();

  return (
    <Sidebar>
      <SidebarHeader className="p-4">
        <Link href="/admin">
          <div className="flex items-center gap-2 cursor-pointer">
            <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center">
              <ChefHat className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <h2 className="font-semibold text-sm">Cloud POS</h2>
              <p className="text-xs text-muted-foreground">Administration</p>
            </div>
          </div>
        </Link>
      </SidebarHeader>

      <SidebarContent>
        {menuGroups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      isActive={location === item.url}
                    >
                      <Link href={item.url}>
                        <item.icon className="w-4 h-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="p-4">
        <Button
          variant="ghost"
          className="w-full justify-start"
          onClick={onLogout}
          data-testid="button-admin-logout"
        >
          <LogOut className="w-4 h-4 mr-2" />
          Sign Out
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
