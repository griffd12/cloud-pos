import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Link } from "wouter";
import {
  CheckCircle2,
  Circle,
  Building2,
  Store,
  LayoutGrid,
  Users,
  UtensilsCrossed,
  Printer,
  Tv2,
  CreditCard,
  Receipt,
  Shield,
  Wifi,
  Monitor,
  ArrowRight,
  Download,
  FileText,
  Rocket,
} from "lucide-react";

interface ChecklistItem {
  id: string;
  title: string;
  description: string;
  category: string;
  link?: string;
  autoCheck?: () => boolean;
}

const STORAGE_KEY = "pos-onboarding-checklist";
const IGNORE_AUTO_KEY = "pos-onboarding-ignore-auto";

export default function OnboardingPage() {
  const { data: stats } = useQuery<{
    enterprises: number;
    properties: number;
    rvcs: number;
    employees: number;
    menuItems: number;
  }>({
    queryKey: ["/api/admin/stats"],
  });

  const { data: printers = [] } = useQuery<{ id: string }[]>({
    queryKey: ["/api/printers"],
  });

  const { data: kdsDevices = [] } = useQuery<{ id: string }[]>({
    queryKey: ["/api/kds-devices"],
  });

  const { data: taxGroups = [] } = useQuery<{ id: string }[]>({
    queryKey: ["/api/tax-groups"],
  });

  const { data: tenders = [] } = useQuery<{ id: string }[]>({
    queryKey: ["/api/tenders"],
  });

  const checklistItems: ChecklistItem[] = [
    {
      id: "pre-1",
      title: "Sign customer contract",
      description: "Complete service agreement and payment terms with the customer",
      category: "Pre-Installation",
    },
    {
      id: "pre-2",
      title: "Collect customer information",
      description: "Business name, locations, contact details, menu data",
      category: "Pre-Installation",
    },
    {
      id: "pre-3",
      title: "Review hardware requirements",
      description: "Determine terminals, printers, KDS screens needed per location",
      category: "Pre-Installation",
    },
    {
      id: "pre-4",
      title: "Order/ship hardware to customer",
      description: "Tablets, printers, cash drawers, KDS displays, network equipment",
      category: "Pre-Installation",
    },
    {
      id: "hw-1",
      title: "Verify network connectivity",
      description: "Stable internet connection with backup (LTE failover recommended)",
      category: "Hardware Setup",
    },
    {
      id: "hw-2",
      title: "Install POS terminals/tablets",
      description: "Set up touchscreens, configure browser kiosk mode",
      category: "Hardware Setup",
    },
    {
      id: "hw-3",
      title: "Connect receipt printers",
      description: "Network printers preferred - assign static IP addresses",
      category: "Hardware Setup",
    },
    {
      id: "hw-4",
      title: "Install KDS displays",
      description: "Mount monitors, connect Chromebox/Android device, configure browser",
      category: "Hardware Setup",
    },
    {
      id: "hw-5",
      title: "Connect cash drawers",
      description: "Attach to receipt printer (printer-driven drawer kick)",
      category: "Hardware Setup",
    },
    {
      id: "hw-6",
      title: "Test all hardware connections",
      description: "Verify printers print, KDS displays show content, drawers open",
      category: "Hardware Setup",
    },
    {
      id: "cfg-1",
      title: "Create Enterprise",
      description: "Set up the customer's enterprise (parent organization)",
      category: "System Configuration",
      link: "/admin/enterprises",
      autoCheck: () => (stats?.enterprises || 0) > 0,
    },
    {
      id: "cfg-2",
      title: "Create Property (Location)",
      description: "Add each restaurant location under the enterprise",
      category: "System Configuration",
      link: "/admin/properties",
      autoCheck: () => (stats?.properties || 0) > 0,
    },
    {
      id: "cfg-3",
      title: "Create Revenue Center(s)",
      description: "Define RVCs for each property (e.g., Dine-In, Takeout, Bar)",
      category: "System Configuration",
      link: "/admin/rvcs",
      autoCheck: () => (stats?.rvcs || 0) > 0,
    },
    {
      id: "cfg-4",
      title: "Set up Tax Groups",
      description: "Configure tax rates for the location (sales tax, etc.)",
      category: "System Configuration",
      link: "/admin/tax-groups",
      autoCheck: () => taxGroups.length > 0,
    },
    {
      id: "cfg-5",
      title: "Configure Tender Types",
      description: "Set up payment methods (Cash, Credit, Debit, Gift Cards)",
      category: "System Configuration",
      link: "/admin/tenders",
      autoCheck: () => tenders.length > 0,
    },
    {
      id: "cfg-6",
      title: "Set up Payment Processor",
      description: "Configure Stripe, Elavon, or other payment gateway",
      category: "System Configuration",
      link: "/admin/payment-processors",
    },
    {
      id: "menu-1",
      title: "Create SLUs (Categories)",
      description: "Set up menu categories (Appetizers, Entrees, Drinks, etc.)",
      category: "Menu Setup",
      link: "/admin/slus",
    },
    {
      id: "menu-2",
      title: "Add Menu Items",
      description: "Enter all menu items with prices and categories",
      category: "Menu Setup",
      link: "/admin/menu-items",
      autoCheck: () => (stats?.menuItems || 0) > 0,
    },
    {
      id: "menu-3",
      title: "Create Modifier Groups",
      description: "Set up modifiers (sizes, toppings, temperatures, etc.)",
      category: "Menu Setup",
      link: "/admin/modifier-groups",
    },
    {
      id: "menu-4",
      title: "Assign Print Classes",
      description: "Define which items print to which kitchen stations",
      category: "Menu Setup",
      link: "/admin/print-classes",
    },
    {
      id: "staff-1",
      title: "Create Jobs",
      description: "Define job types (Server, Cashier, Manager, Cook)",
      category: "Staff Setup",
      link: "/admin/jobs",
    },
    {
      id: "staff-2",
      title: "Configure Roles & Privileges",
      description: "Set up permission levels for each role",
      category: "Staff Setup",
      link: "/admin/roles",
    },
    {
      id: "staff-3",
      title: "Add Employees",
      description: "Create employee accounts with PINs and job assignments",
      category: "Staff Setup",
      link: "/admin/employees",
      autoCheck: () => (stats?.employees || 0) > 0,
    },
    {
      id: "dev-1",
      title: "Configure Workstations",
      description: "Register each POS terminal in the system",
      category: "Device Configuration",
      link: "/admin/workstations",
    },
    {
      id: "dev-2",
      title: "Configure Printers",
      description: "Add printers with IP addresses and assign to properties",
      category: "Device Configuration",
      link: "/admin/printers",
      autoCheck: () => printers.length > 0,
    },
    {
      id: "dev-3",
      title: "Configure KDS Devices",
      description: "Set up kitchen display stations (Hot, Cold, Expo)",
      category: "Device Configuration",
      link: "/admin/kds-devices",
      autoCheck: () => kdsDevices.length > 0,
    },
    {
      id: "dev-4",
      title: "Set Up Order Device Routing",
      description: "Link print classes to printers and KDS displays",
      category: "Device Configuration",
      link: "/admin/order-devices",
    },
    {
      id: "test-1",
      title: "Test order entry",
      description: "Ring up test orders to verify menu and pricing",
      category: "Testing & Training",
    },
    {
      id: "test-2",
      title: "Test kitchen printing",
      description: "Verify orders print to correct kitchen printers",
      category: "Testing & Training",
    },
    {
      id: "test-3",
      title: "Test KDS display",
      description: "Confirm orders appear on kitchen display screens",
      category: "Testing & Training",
    },
    {
      id: "test-4",
      title: "Test payment processing",
      description: "Process test card transactions (use test mode)",
      category: "Testing & Training",
    },
    {
      id: "test-5",
      title: "Test receipt printing",
      description: "Verify customer receipts print correctly",
      category: "Testing & Training",
    },
    {
      id: "train-1",
      title: "Train managers on admin functions",
      description: "Menu updates, employee management, reports",
      category: "Testing & Training",
    },
    {
      id: "train-2",
      title: "Train cashiers on POS operations",
      description: "Order entry, payments, voids, discounts",
      category: "Testing & Training",
    },
    {
      id: "train-3",
      title: "Train kitchen staff on KDS",
      description: "Bumping orders, recalling, order priority",
      category: "Testing & Training",
    },
    {
      id: "go-1",
      title: "Disable test mode on payment processor",
      description: "Switch from sandbox to live payment processing",
      category: "Go Live",
    },
    {
      id: "go-2",
      title: "Run final system check",
      description: "Verify all devices online and functioning",
      category: "Go Live",
    },
    {
      id: "go-3",
      title: "Document support contacts",
      description: "Provide customer with support phone/email",
      category: "Go Live",
    },
    {
      id: "go-4",
      title: "Launch!",
      description: "System is live - first real transactions",
      category: "Go Live",
    },
  ];

  const [checkedItems, setCheckedItems] = useState<Set<string>>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? new Set(JSON.parse(saved) as string[]) : new Set();
  });

  const [ignoreAutoCheck, setIgnoreAutoCheck] = useState<boolean>(() => {
    const saved = localStorage.getItem(IGNORE_AUTO_KEY);
    return saved === "true";
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(checkedItems)));
  }, [checkedItems]);

  useEffect(() => {
    localStorage.setItem(IGNORE_AUTO_KEY, ignoreAutoCheck ? "true" : "false");
  }, [ignoreAutoCheck]);

  const toggleItem = (id: string) => {
    setCheckedItems((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const isItemChecked = (item: ChecklistItem) => {
    if (checkedItems.has(item.id)) return true;
    if (!ignoreAutoCheck && item.autoCheck && item.autoCheck()) return true;
    return false;
  };

  const categories = Array.from(new Set(checklistItems.map((item) => item.category)));
  const totalItems = checklistItems.length;
  const completedItems = checklistItems.filter((item) => isItemChecked(item)).length;
  const progressPercent = Math.round((completedItems / totalItems) * 100);

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case "Pre-Installation":
        return FileText;
      case "Hardware Setup":
        return Wifi;
      case "System Configuration":
        return Building2;
      case "Menu Setup":
        return UtensilsCrossed;
      case "Staff Setup":
        return Users;
      case "Device Configuration":
        return Printer;
      case "Testing & Training":
        return Monitor;
      case "Go Live":
        return Rocket;
      default:
        return Circle;
    }
  };

  const resetChecklist = () => {
    setCheckedItems(new Set());
    setIgnoreAutoCheck(true);
  };

  const exportChecklist = () => {
    const data = checklistItems.map((item) => ({
      category: item.category,
      task: item.title,
      description: item.description,
      status: isItemChecked(item) ? "Complete" : "Pending",
    }));
    const csv = [
      ["Category", "Task", "Description", "Status"],
      ...data.map((row) => [row.category, row.task, row.description, row.status]),
    ]
      .map((row) => row.map((cell) => `"${cell}"`).join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "onboarding-checklist.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-onboarding-title">
            Customer Onboarding Checklist
          </h1>
          <p className="text-muted-foreground">
            Step-by-step guide for new customer installation and setup
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={exportChecklist} data-testid="button-export">
            <Download className="w-4 h-4 mr-2" />
            Export CSV
          </Button>
          <Button variant="outline" size="sm" onClick={resetChecklist} data-testid="button-reset">
            Reset Checklist
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <CardTitle className="text-base">Overall Progress</CardTitle>
              <CardDescription>
                {completedItems} of {totalItems} tasks completed
              </CardDescription>
            </div>
            <Badge variant={progressPercent === 100 ? "default" : "secondary"}>
              {progressPercent}%
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <Progress value={progressPercent} className="h-3" />
        </CardContent>
      </Card>

      <div className="space-y-6">
        {categories.map((category) => {
          const categoryItems = checklistItems.filter((item) => item.category === category);
          const categoryCompleted = categoryItems.filter((item) => isItemChecked(item)).length;
          const CategoryIcon = getCategoryIcon(category);

          return (
            <Card key={category}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <CategoryIcon className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-base">{category}</CardTitle>
                      <CardDescription>
                        {categoryCompleted} of {categoryItems.length} complete
                      </CardDescription>
                    </div>
                  </div>
                  {categoryCompleted === categoryItems.length && (
                    <Badge variant="default" className="bg-green-600">
                      <CheckCircle2 className="w-3 h-3 mr-1" />
                      Complete
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <Separator className="mb-4" />
                <div className="space-y-3">
                  {categoryItems.map((item) => {
                    const checked = isItemChecked(item);
                    return (
                      <div
                        key={item.id}
                        className="flex items-start gap-3 p-3 rounded-lg border bg-card hover-elevate"
                      >
                        <Checkbox
                          id={item.id}
                          checked={checked}
                          onCheckedChange={() => toggleItem(item.id)}
                          className="mt-0.5"
                          data-testid={`checkbox-${item.id}`}
                        />
                        <div className="flex-1 min-w-0">
                          <label
                            htmlFor={item.id}
                            className={`font-medium cursor-pointer ${
                              checked ? "line-through text-muted-foreground" : ""
                            }`}
                          >
                            {item.title}
                          </label>
                          <p className="text-sm text-muted-foreground">{item.description}</p>
                        </div>
                        {item.link && (
                          <Link href={item.link}>
                            <Button variant="ghost" size="sm" data-testid={`link-${item.id}`}>
                              <ArrowRight className="w-4 h-4" />
                            </Button>
                          </Link>
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
