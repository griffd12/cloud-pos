import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearch } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { 
  DollarSign, Users, Receipt, TrendingUp, Clock, ShoppingCart, CreditCard, 
  Banknote, Smartphone, Package, Layers, ChevronDown, ChevronRight, BarChart3,
  FileText, UserCheck, Timer, GitCompare, X
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";
import { type Property, type Rvc, type CheckItem } from "@shared/schema";

interface SalesSummary {
  grossSales: number;
  itemSales: number;
  serviceChargeTotal: number;
  otherCharges: number;
  discountTotal: number;
  netSales: number;
  taxTotal: number;
  totalWithTax: number;
  checkCount: number;
  avgCheck: number;
  checksOutstanding: number;
  // Detailed breakdowns
  baseItemSales: number;
  modifierTotal: number;
  // New fields for proper accounting
  totalPayments: number;
  totalTips: number;
  paymentCount: number;
  checksStarted: number;
  checksClosed: number;
  checksCarriedOver: number;
  // Check movement totals
  carriedOverTotal: number;
  startedTotal: number;
  closedTotal: number;
  outstandingTotal: number;
}

interface CategorySale {
  id: string;
  name: string;
  quantity: number;
  sales: number;
}

interface TopItem {
  id: string;
  name: string;
  quantity: number;
  sales: number;
}

interface TenderMix {
  id: string;
  name: string;
  count: number;
  amount: number;
  percentage: number;
}

interface HourlySale {
  hour: number;
  sales: number;
  checkCount: number;
}

interface TenderTransaction {
  id: string;
  checkNumber: number;
  tenderName: string;
  tenderType: string;
  amount: number;
  tipAmount: number;
  employeeName: string;
  rvcName: string;
  paidAt: string | null;
}

interface TenderSummary {
  name: string;
  count: number;
  amount: number;
  tips: number;
}

interface TenderDetailData {
  transactions: TenderTransaction[];
  summary: TenderSummary[];
  totalAmount: number;
  totalTips: number;
  transactionCount: number;
}

interface MenuItemSale {
  id: string;
  name: string;
  category: string;
  quantity: number;
  grossSales: number;
  netSales: number;
  avgPrice: number;
}

interface MenuItemSalesData {
  items: MenuItemSale[];
  totalQuantity: number;
  totalSales: number;
  itemCount: number;
}

interface CategoryItem {
  id: string;
  name: string;
  quantity: number;
  sales: number;
}

interface CategorySaleDetail {
  id: string;
  name: string;
  totalQuantity: number;
  totalSales: number;
  items: CategoryItem[];
}

interface CategorySalesData {
  categories: CategorySaleDetail[];
  totalSales: number;
  totalQuantity: number;
}

interface OpenCheck {
  id: string;
  checkNumber: number;
  employeeName: string;
  rvcName: string;
  tableNumber: number | null;
  guestCount: number;
  subtotal: number;
  total: number;
  itemCount: number;
  durationMinutes: number;
  openedAt: string | null;
  businessDate: string | null;
}

interface OpenChecksData {
  checks: OpenCheck[];
  summary: {
    count: number;
    totalValue: number;
    avgDuration: number;
  };
}

interface ClosedCheck {
  id: string;
  checkNumber: number;
  employeeName: string;
  rvcName: string;
  tableNumber: number | null;
  guestCount: number;
  subtotal: number;
  tax: number;
  total: number;
  totalPaid: number;
  durationMinutes: number;
  openedAt: string | null;
  closedAt: string | null;
  businessDate: string | null;
}

interface ClosedChecksData {
  checks: ClosedCheck[];
  summary: {
    count: number;
    totalSales: number;
    avgCheck: number;
    avgDuration: number;
  };
}

interface EmployeeBalanceItem {
  employeeId: string;
  employeeName: string;
  checkCount: number;
  itemCount: number;
  grossSales: number;
  discounts: number;
  netSales: number;
  tax: number;
  total: number;
  cashCollected: number;
  creditCollected: number;
  otherCollected: number;
  totalCollected: number;
  tips: number;
}

interface EmployeeBalanceData {
  employees: EmployeeBalanceItem[];
  summary: {
    employeeCount: number;
    totalChecks: number;
    totalSales: number;
    totalTips: number;
    totalCollected: number;
  };
}

interface KdsKpiData {
  summary: {
    totalTickets: number;
    completedTickets: number;
    totalItems: number;
    readyItems: number;
    avgTicketTimeSeconds: number;
    minTicketTimeSeconds: number;
    maxTicketTimeSeconds: number;
  };
  statusCounts: {
    pending: number;
    inProgress: number;
    completed: number;
    recalled: number;
  };
  hourlyThroughput: Array<{
    hour: number;
    tickets: number;
    avgTime: number;
  }>;
}

interface SalesPeriod {
  checkCount: number;
  grossSales: number;
  discounts: number;
  netSales: number;
  tax: number;
  total: number;
  avgCheck: number;
}

interface SalesComparisonData {
  currentPeriod: { label: string; data: SalesPeriod };
  previousPeriod: { label: string; data: SalesPeriod };
  changes: {
    checkCount: { value: number; percentage: number };
    grossSales: { value: number; percentage: number };
    netSales: { value: number; percentage: number };
    total: { value: number; percentage: number };
    avgCheck: { value: number; percentage: number };
  };
}

const COLORS = ["#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#EC4899", "#06B6D4", "#84CC16"];

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

function formatHour(hour: number): string {
  const ampm = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;
  return `${displayHour}${ampm}`;
}

function formatDateTime(dateStr: string | null): string {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function getTenderIcon(type: string) {
  switch (type) {
    case "cash":
      return <Banknote className="h-4 w-4" />;
    case "credit":
      return <CreditCard className="h-4 w-4" />;
    case "mobile":
      return <Smartphone className="h-4 w-4" />;
    default:
      return <DollarSign className="h-4 w-4" />;
  }
}

function CategoryRows({ category, totalSales }: { category: CategorySaleDetail; totalSales: number }) {
  const [isOpen, setIsOpen] = useState(false);
  const pctOfTotal = totalSales > 0 ? (category.totalSales / totalSales * 100) : 0;

  return (
    <>
      <TableRow 
        className="cursor-pointer hover-elevate" 
        data-testid={`row-category-${category.id}`}
        onClick={() => setIsOpen(!isOpen)}
      >
        <TableCell>
          <div className="flex items-center gap-2">
            {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            <span className="font-medium">{category.name}</span>
            <Badge variant="secondary" className="text-xs">{category.items.length} items</Badge>
          </div>
        </TableCell>
        <TableCell className="text-right">{category.totalQuantity}</TableCell>
        <TableCell className="text-right font-medium">{formatCurrency(category.totalSales)}</TableCell>
        <TableCell className="text-right text-muted-foreground">{pctOfTotal.toFixed(1)}%</TableCell>
      </TableRow>
      {isOpen && category.items.map((item) => {
        const itemPct = category.totalSales > 0 ? (item.sales / category.totalSales * 100) : 0;
        return (
          <TableRow key={item.id} className="bg-muted/30" data-testid={`row-item-${item.id}`}>
            <TableCell className="pl-10">{item.name}</TableCell>
            <TableCell className="text-right text-muted-foreground">{item.quantity}</TableCell>
            <TableCell className="text-right text-muted-foreground">{formatCurrency(item.sales)}</TableCell>
            <TableCell className="text-right text-muted-foreground text-xs">{itemPct.toFixed(1)}%</TableCell>
          </TableRow>
        );
      })}
    </>
  );
}

interface CheckDetailData {
  check: {
    id: string;
    checkNumber: number;
    employeeId: string;
    rvcId: string;
    status: string;
    tableNumber?: string | null;
    orderType?: string;
    subtotal?: string;
    taxTotal?: string;
    discountTotal?: string;
    total?: string;
    openedAt?: string | null;
    closedAt?: string | null;
    paidAmount?: number;
  };
  items: CheckItem[];
}

export default function ReportsPage() {
  const searchParams = useSearch();
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>("all");
  const [selectedRvcId, setSelectedRvcId] = useState<string>("all");
  const [dateRange, setDateRange] = useState<string>("today");
  const [activeTab, setActiveTab] = useState<string>("dashboard");
  const [customStartDate, setCustomStartDate] = useState<string>("");
  const [customEndDate, setCustomEndDate] = useState<string>("");
  const [selectedCheckId, setSelectedCheckId] = useState<string | null>(null);
  const [checkModalOpen, setCheckModalOpen] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(searchParams);
    const tab = params.get("tab");
    if (tab) {
      setActiveTab(tab);
    }
  }, [searchParams]);

  const { data: properties = [] } = useQuery<Property[]>({
    queryKey: ["/api/properties"],
  });

  const { data: rvcs = [] } = useQuery<Rvc[]>({
    queryKey: ["/api/rvcs"],
  });

  const filteredRvcs = useMemo(() => {
    if (selectedPropertyId === "all") return rvcs;
    return rvcs.filter((r) => r.propertyId === selectedPropertyId);
  }, [rvcs, selectedPropertyId]);

  const dateParams = useMemo(() => {
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);
    
    // Helper to format date as YYYY-MM-DD for businessDate
    const formatBusinessDate = (d: Date) => d.toISOString().split('T')[0];
    
    switch (dateRange) {
      case "yesterday": {
        const start = new Date(todayStart);
        start.setDate(start.getDate() - 1);
        const end = new Date(start);
        end.setHours(23, 59, 59, 999);
        return { startDate: start.toISOString(), endDate: end.toISOString(), businessDate: formatBusinessDate(start) };
      }
      case "week": {
        const start = new Date(todayStart);
        start.setDate(start.getDate() - 7);
        return { startDate: start.toISOString(), endDate: todayEnd.toISOString() };
      }
      case "month": {
        const start = new Date(todayStart);
        start.setMonth(start.getMonth() - 1);
        return { startDate: start.toISOString(), endDate: todayEnd.toISOString() };
      }
      case "ytd": {
        const start = new Date(now.getFullYear(), 0, 1);
        start.setHours(0, 0, 0, 0);
        return { startDate: start.toISOString(), endDate: todayEnd.toISOString() };
      }
      case "last_quarter": {
        const currentMonth = now.getMonth();
        const currentQuarter = Math.floor(currentMonth / 3);
        const lastQuarterStart = currentQuarter === 0 ? 9 : (currentQuarter - 1) * 3;
        const lastQuarterYear = currentQuarter === 0 ? now.getFullYear() - 1 : now.getFullYear();
        const start = new Date(lastQuarterYear, lastQuarterStart, 1);
        start.setHours(0, 0, 0, 0);
        const end = new Date(lastQuarterYear, lastQuarterStart + 3, 0);
        end.setHours(23, 59, 59, 999);
        return { startDate: start.toISOString(), endDate: end.toISOString() };
      }
      case "this_month": {
        const start = new Date(now.getFullYear(), now.getMonth(), 1);
        start.setHours(0, 0, 0, 0);
        return { startDate: start.toISOString(), endDate: todayEnd.toISOString() };
      }
      case "custom": {
        if (customStartDate && customEndDate) {
          const start = new Date(customStartDate);
          start.setHours(0, 0, 0, 0);
          const end = new Date(customEndDate);
          end.setHours(23, 59, 59, 999);
          // If same day, include businessDate
          if (customStartDate === customEndDate) {
            return { startDate: start.toISOString(), endDate: end.toISOString(), businessDate: formatBusinessDate(start) };
          }
          return { startDate: start.toISOString(), endDate: end.toISOString() };
        }
        return { startDate: todayStart.toISOString(), endDate: todayEnd.toISOString(), businessDate: formatBusinessDate(todayStart) };
      }
      default:
        // Today - include businessDate for precise filtering
        return { startDate: todayStart.toISOString(), endDate: todayEnd.toISOString(), businessDate: formatBusinessDate(todayStart) };
    }
  }, [dateRange, customStartDate, customEndDate]);
  
  const buildUrl = (endpoint: string) => {
    const params = new URLSearchParams();
    params.set("startDate", dateParams.startDate);
    params.set("endDate", dateParams.endDate);
    // Include businessDate for precise single-day filtering when available
    if ('businessDate' in dateParams && dateParams.businessDate) {
      params.set("businessDate", dateParams.businessDate);
    }
    if (selectedPropertyId !== "all") params.set("propertyId", selectedPropertyId);
    if (selectedRvcId !== "all") params.set("rvcId", selectedRvcId);
    return `${endpoint}?${params.toString()}`;
  };
  
  const { data: salesSummary, isLoading: summaryLoading } = useQuery<SalesSummary>({
    queryKey: ["/api/reports/sales-summary", dateParams, selectedPropertyId, selectedRvcId],
    queryFn: async () => {
      const res = await fetch(buildUrl("/api/reports/sales-summary"));
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const { data: categorySales = [] } = useQuery<CategorySale[]>({
    queryKey: ["/api/reports/sales-by-category", dateParams, selectedPropertyId, selectedRvcId],
    queryFn: async () => {
      const res = await fetch(buildUrl("/api/reports/sales-by-category"));
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const { data: topItems = [] } = useQuery<TopItem[]>({
    queryKey: ["/api/reports/top-items", dateParams, selectedPropertyId, selectedRvcId],
    queryFn: async () => {
      const res = await fetch(buildUrl("/api/reports/top-items"));
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const { data: tenderMix = [] } = useQuery<TenderMix[]>({
    queryKey: ["/api/reports/tender-mix", dateParams, selectedPropertyId, selectedRvcId],
    queryFn: async () => {
      const res = await fetch(buildUrl("/api/reports/tender-mix"));
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const { data: hourlySales = [] } = useQuery<HourlySale[]>({
    queryKey: ["/api/reports/hourly-sales", dateParams, selectedPropertyId, selectedRvcId],
    queryFn: async () => {
      const res = await fetch(buildUrl("/api/reports/hourly-sales"));
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const { data: tenderData } = useQuery<TenderDetailData>({
    queryKey: ["/api/reports/tender-detail", dateParams, selectedPropertyId, selectedRvcId],
    queryFn: async () => {
      const res = await fetch(buildUrl("/api/reports/tender-detail"));
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const { data: menuItemData } = useQuery<MenuItemSalesData>({
    queryKey: ["/api/reports/menu-item-sales", dateParams, selectedPropertyId, selectedRvcId],
    queryFn: async () => {
      const res = await fetch(buildUrl("/api/reports/menu-item-sales"));
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const { data: categoryData } = useQuery<CategorySalesData>({
    queryKey: ["/api/reports/category-sales", dateParams, selectedPropertyId, selectedRvcId],
    queryFn: async () => {
      const res = await fetch(buildUrl("/api/reports/category-sales"));
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const { data: openChecksData, isLoading: openChecksLoading } = useQuery<OpenChecksData>({
    queryKey: ["/api/reports/open-checks", dateParams, selectedPropertyId, selectedRvcId],
    queryFn: async () => {
      const res = await fetch(buildUrl("/api/reports/open-checks"));
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const { data: closedChecksData, isLoading: closedChecksLoading } = useQuery<ClosedChecksData>({
    queryKey: ["/api/reports/closed-checks", dateParams, selectedPropertyId, selectedRvcId],
    queryFn: async () => {
      const res = await fetch(buildUrl("/api/reports/closed-checks"));
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const { data: employeeBalanceData, isLoading: employeeBalanceLoading } = useQuery<EmployeeBalanceData>({
    queryKey: ["/api/reports/employee-balance", dateParams, selectedPropertyId, selectedRvcId],
    queryFn: async () => {
      const res = await fetch(buildUrl("/api/reports/employee-balance"));
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const { data: kdsKpiData, isLoading: kdsKpiLoading } = useQuery<KdsKpiData>({
    queryKey: ["/api/reports/kds-kpi", dateParams, selectedPropertyId, selectedRvcId],
    queryFn: async () => {
      const res = await fetch(buildUrl("/api/reports/kds-kpi"));
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const [comparisonType, setComparisonType] = useState<string>("today_vs_last_week");

  const { data: comparisonData, isLoading: comparisonLoading } = useQuery<SalesComparisonData>({
    queryKey: ["/api/reports/sales-comparison", comparisonType, selectedPropertyId, selectedRvcId],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("comparisonType", comparisonType);
      if (selectedPropertyId !== "all") params.set("propertyId", selectedPropertyId);
      if (selectedRvcId !== "all") params.set("rvcId", selectedRvcId);
      const res = await fetch(`/api/reports/sales-comparison?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const { data: checkDetailData, isLoading: checkDetailLoading } = useQuery<CheckDetailData>({
    queryKey: ["/api/checks", selectedCheckId],
    queryFn: async () => {
      if (!selectedCheckId) throw new Error("No check selected");
      const res = await fetch(`/api/checks/${selectedCheckId}`);
      if (!res.ok) throw new Error("Failed to fetch check details");
      return res.json();
    },
    enabled: !!selectedCheckId && checkModalOpen,
  });

  const handleViewCheck = (checkId: string) => {
    setSelectedCheckId(checkId);
    setCheckModalOpen(true);
  };

  const comparisonChartData = useMemo(() => {
    if (!comparisonData) return [];
    return [
      { 
        name: "Checks", 
        current: comparisonData.currentPeriod.data.checkCount, 
        previous: comparisonData.previousPeriod.data.checkCount 
      },
      { 
        name: "Gross Sales", 
        current: comparisonData.currentPeriod.data.grossSales, 
        previous: comparisonData.previousPeriod.data.grossSales 
      },
      { 
        name: "Net Sales", 
        current: comparisonData.currentPeriod.data.netSales, 
        previous: comparisonData.previousPeriod.data.netSales 
      },
      { 
        name: "Avg Check", 
        current: comparisonData.currentPeriod.data.avgCheck, 
        previous: comparisonData.previousPeriod.data.avgCheck 
      },
    ];
  }, [comparisonData]);

  const avgItemPrice = menuItemData && menuItemData.totalQuantity > 0 
    ? menuItemData.totalSales / menuItemData.totalQuantity 
    : 0;

  const formatSeconds = (seconds: number): string => {
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold" data-testid="text-reports-title">Reports & Analytics</h1>
        <p className="text-sm text-muted-foreground">Sales performance and insights</p>
      </div>

      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1.5">
              <Label>Date Range</Label>
              <Select value={dateRange} onValueChange={setDateRange}>
                <SelectTrigger className="w-[160px]" data-testid="select-date-range">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="today">Today</SelectItem>
                  <SelectItem value="yesterday">Yesterday</SelectItem>
                  <SelectItem value="week">Last 7 Days</SelectItem>
                  <SelectItem value="month">Last 30 Days</SelectItem>
                  <SelectItem value="this_month">This Month</SelectItem>
                  <SelectItem value="ytd">Year to Date</SelectItem>
                  <SelectItem value="last_quarter">Last Quarter</SelectItem>
                  <SelectItem value="custom">Custom Range</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {dateRange === "custom" && (
              <>
                <div className="space-y-1.5">
                  <Label>From Date</Label>
                  <Input
                    type="date"
                    value={customStartDate}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCustomStartDate(e.target.value)}
                    className="w-[160px]"
                    data-testid="input-custom-start-date"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>To Date</Label>
                  <Input
                    type="date"
                    value={customEndDate}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCustomEndDate(e.target.value)}
                    className="w-[160px]"
                    data-testid="input-custom-end-date"
                  />
                </div>
              </>
            )}

            <div className="space-y-1.5">
              <Label>Property</Label>
              <Select value={selectedPropertyId} onValueChange={(v) => { setSelectedPropertyId(v); setSelectedRvcId("all"); }}>
                <SelectTrigger className="w-[180px]" data-testid="select-property">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Properties</SelectItem>
                  {properties.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Revenue Center</Label>
              <Select value={selectedRvcId} onValueChange={setSelectedRvcId}>
                <SelectTrigger className="w-[180px]" data-testid="select-rvc">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All RVCs</SelectItem>
                  {filteredRvcs.map((r) => (
                    <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList data-testid="tabs-reports" className="flex-wrap h-auto gap-1">
          <TabsTrigger value="dashboard" data-testid="tab-dashboard">
            <BarChart3 className="h-4 w-4 mr-2" />
            Dashboard
          </TabsTrigger>
          <TabsTrigger value="tenders" data-testid="tab-tenders">
            <CreditCard className="h-4 w-4 mr-2" />
            Tenders
          </TabsTrigger>
          <TabsTrigger value="items" data-testid="tab-items">
            <ShoppingCart className="h-4 w-4 mr-2" />
            Menu Items
          </TabsTrigger>
          <TabsTrigger value="categories" data-testid="tab-categories">
            <Layers className="h-4 w-4 mr-2" />
            Categories
          </TabsTrigger>
          <TabsTrigger value="open-checks" data-testid="tab-open-checks">
            <FileText className="h-4 w-4 mr-2" />
            Open Checks
          </TabsTrigger>
          <TabsTrigger value="closed-checks" data-testid="tab-closed-checks">
            <Receipt className="h-4 w-4 mr-2" />
            Closed Checks
          </TabsTrigger>
          <TabsTrigger value="employee-balance" data-testid="tab-employee-balance">
            <UserCheck className="h-4 w-4 mr-2" />
            Employee Balance
          </TabsTrigger>
          <TabsTrigger value="kds-kpi" data-testid="tab-kds-kpi">
            <Timer className="h-4 w-4 mr-2" />
            KDS KPIs
          </TabsTrigger>
          <TabsTrigger value="comparison" data-testid="tab-comparison">
            <GitCompare className="h-4 w-4 mr-2" />
            Compare
          </TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Net Sales</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold tabular-nums" data-testid="text-net-sales">
                  {summaryLoading ? "..." : formatCurrency(salesSummary?.netSales || 0)}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Payments</CardTitle>
                <CreditCard className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold tabular-nums" data-testid="text-total-payments">
                  {summaryLoading ? "..." : formatCurrency(salesSummary?.totalPayments || 0)}
                </div>
                <p className="text-xs text-muted-foreground">
                  {summaryLoading ? "" : `${salesSummary?.paymentCount || 0} transactions`}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Avg Check</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold tabular-nums" data-testid="text-avg-check">
                  {summaryLoading ? "..." : formatCurrency(salesSummary?.avgCheck || 0)}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Checks</CardTitle>
                <Receipt className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold tabular-nums" data-testid="text-check-count">
                  {summaryLoading ? "..." : salesSummary?.checkCount || 0}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm">Check Movement</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div className="space-y-1">
                  <p className="text-muted-foreground">Carried Over</p>
                  <p className="font-medium text-lg" data-testid="text-checks-carried">
                    {salesSummary?.checksCarriedOver || 0} checks
                  </p>
                  <p className="text-sm text-muted-foreground" data-testid="text-carried-total">
                    {formatCurrency(salesSummary?.carriedOverTotal || 0)}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-muted-foreground">Started</p>
                  <p className="font-medium text-lg" data-testid="text-checks-started">
                    {salesSummary?.checksStarted || 0} checks
                  </p>
                  <p className="text-sm text-muted-foreground" data-testid="text-started-total">
                    {formatCurrency(salesSummary?.startedTotal || 0)}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-muted-foreground">Closed</p>
                  <p className="font-medium text-lg" data-testid="text-checks-closed">
                    {salesSummary?.checksClosed || 0} checks
                  </p>
                  <p className="text-sm text-muted-foreground" data-testid="text-closed-total">
                    {formatCurrency(salesSummary?.closedTotal || 0)}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-muted-foreground">Outstanding</p>
                  <p className="font-medium text-lg" data-testid="text-checks-outstanding">
                    {salesSummary?.checksOutstanding || 0} checks
                  </p>
                  <p className="text-sm text-muted-foreground" data-testid="text-outstanding-total">
                    {formatCurrency(salesSummary?.outstandingTotal || 0)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm">Sales Breakdown (by item ring-in date)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-6 gap-4 text-sm">
                <div className="space-y-1">
                  <p className="text-muted-foreground">Item Sales</p>
                  <p className="font-medium text-lg" data-testid="text-item-sales">
                    {formatCurrency(salesSummary?.itemSales || 0)}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-muted-foreground">Service Charges</p>
                  <p className="font-medium text-lg" data-testid="text-service-charges">
                    {formatCurrency(salesSummary?.serviceChargeTotal || 0)}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-muted-foreground">Other</p>
                  <p className="font-medium text-lg" data-testid="text-other-charges">
                    {formatCurrency(salesSummary?.otherCharges || 0)}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-muted-foreground">Net Sales</p>
                  <p className="font-medium text-lg" data-testid="text-breakdown-net-sales">
                    {formatCurrency(salesSummary?.netSales || 0)}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-muted-foreground">Tax</p>
                  <p className="font-medium text-lg" data-testid="text-tax-total">
                    {formatCurrency(salesSummary?.taxTotal || 0)}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-muted-foreground">Total Collected</p>
                  <p className="font-semibold text-lg" data-testid="text-total-with-tax">
                    {formatCurrency(salesSummary?.totalWithTax || 0)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-sm">Hourly Sales</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={hourlySales.filter(h => h.sales > 0 || h.checkCount > 0).length > 0 ? hourlySales : []}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="hour" tickFormatter={formatHour} fontSize={12} />
                      <YAxis tickFormatter={(v) => `$${v}`} fontSize={12} />
                      <Tooltip 
                        formatter={(value: number) => formatCurrency(value)}
                        labelFormatter={(label) => formatHour(label as number)}
                      />
                      <Bar dataKey="sales" fill="#3B82F6" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-sm">Tender Mix</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64 flex items-center">
                  {tenderMix.length > 0 ? (
                    <div className="flex w-full gap-4">
                      <div className="w-1/2">
                        <ResponsiveContainer width="100%" height={200}>
                          <PieChart>
                            <Pie
                              data={tenderMix}
                              dataKey="amount"
                              nameKey="name"
                              cx="50%"
                              cy="50%"
                              outerRadius={80}
                              label={({ name, percentage }) => `${name} ${percentage.toFixed(0)}%`}
                              labelLine={false}
                            >
                              {tenderMix.map((entry, index) => (
                                <Cell key={entry.id} fill={COLORS[index % COLORS.length]} />
                              ))}
                            </Pie>
                            <Tooltip formatter={(value: number) => formatCurrency(value)} />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="w-1/2 space-y-2">
                        {tenderMix.map((tender, index) => (
                          <div key={tender.id} className="flex items-center justify-between text-sm">
                            <div className="flex items-center gap-2">
                              <div 
                                className="w-3 h-3 rounded-sm" 
                                style={{ backgroundColor: COLORS[index % COLORS.length] }}
                              />
                              <span>{tender.name}</span>
                            </div>
                            <span className="font-medium">{formatCurrency(tender.amount)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p className="text-muted-foreground text-center w-full">No payment data</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-sm">Sales by Category</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {categorySales.length > 0 ? (
                    categorySales.slice(0, 8).map((cat, index) => (
                      <div key={cat.id} className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div 
                            className="w-2 h-8 rounded-sm" 
                            style={{ backgroundColor: COLORS[index % COLORS.length] }}
                          />
                          <div>
                            <p className="font-medium text-sm">{cat.name}</p>
                            <p className="text-xs text-muted-foreground">{cat.quantity} items sold</p>
                          </div>
                        </div>
                        <span className="font-medium">{formatCurrency(cat.sales)}</span>
                      </div>
                    ))
                  ) : (
                    <p className="text-muted-foreground text-center py-4">No category data</p>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-sm">Top Selling Items</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {topItems.length > 0 ? (
                    topItems.slice(0, 8).map((item, index) => (
                      <div key={item.id} className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Badge variant="secondary" className="w-6 h-6 flex items-center justify-center p-0">
                            {index + 1}
                          </Badge>
                          <div>
                            <p className="font-medium text-sm">{item.name}</p>
                            <p className="text-xs text-muted-foreground">{item.quantity} sold</p>
                          </div>
                        </div>
                        <span className="font-medium">{formatCurrency(item.sales)}</span>
                      </div>
                    ))
                  ) : (
                    <p className="text-muted-foreground text-center py-4">No item data</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="tenders" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Collected</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-total-collected">
                  {formatCurrency(tenderData?.totalAmount || 0)}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Tips</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-total-tips">
                  {formatCurrency(tenderData?.totalTips || 0)}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Transactions</CardTitle>
                <Receipt className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-transaction-count">
                  {tenderData?.transactionCount || 0}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Avg Transaction</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-avg-transaction">
                  {formatCurrency(tenderData && tenderData.transactionCount > 0 
                    ? tenderData.totalAmount / tenderData.transactionCount 
                    : 0)}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Summary by Tender Type</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tender</TableHead>
                      <TableHead className="text-right">Count</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="text-right">Tips</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(tenderData?.summary || []).map((t) => (
                      <TableRow key={t.name} data-testid={`row-tender-${t.name}`}>
                        <TableCell className="font-medium">{t.name}</TableCell>
                        <TableCell className="text-right">{t.count}</TableCell>
                        <TableCell className="text-right">{formatCurrency(t.amount)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(t.tips)}</TableCell>
                      </TableRow>
                    ))}
                    {(!tenderData?.summary || tenderData.summary.length === 0) && (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-muted-foreground">
                          No tender data
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Recent Transactions</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Check</TableHead>
                      <TableHead>Tender</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Time</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(tenderData?.transactions || []).slice(0, 10).map((t) => (
                      <TableRow key={t.id} data-testid={`row-transaction-${t.id}`}>
                        <TableCell>#{t.checkNumber}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {getTenderIcon(t.tenderType)}
                            <span>{t.tenderName}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-medium">{formatCurrency(t.amount)}</TableCell>
                        <TableCell className="text-muted-foreground text-sm">{formatDateTime(t.paidAt)}</TableCell>
                      </TableRow>
                    ))}
                    {(!tenderData?.transactions || tenderData.transactions.length === 0) && (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-muted-foreground">
                          No transactions
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="items" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Sales</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-total-item-sales">
                  {formatCurrency(menuItemData?.totalSales || 0)}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Items Sold</CardTitle>
                <ShoppingCart className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-items-sold">
                  {menuItemData?.totalQuantity || 0}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Unique Items</CardTitle>
                <Package className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-unique-items">
                  {menuItemData?.itemCount || 0}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Avg Item Price</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-avg-item-price">
                  {formatCurrency(avgItemPrice)}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Item Sales Detail</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Avg Price</TableHead>
                    <TableHead className="text-right">Net Sales</TableHead>
                    <TableHead className="text-right">% of Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(menuItemData?.items || []).map((item) => {
                    const pct = menuItemData && menuItemData.totalSales > 0 
                      ? (item.netSales / menuItemData.totalSales * 100) 
                      : 0;
                    return (
                      <TableRow key={item.id} data-testid={`row-item-${item.id}`}>
                        <TableCell className="font-medium">{item.name}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">{item.category}</Badge>
                        </TableCell>
                        <TableCell className="text-right">{item.quantity}</TableCell>
                        <TableCell className="text-right">{formatCurrency(item.avgPrice)}</TableCell>
                        <TableCell className="text-right font-medium">{formatCurrency(item.netSales)}</TableCell>
                        <TableCell className="text-right text-muted-foreground">{pct.toFixed(1)}%</TableCell>
                      </TableRow>
                    );
                  })}
                  {(!menuItemData?.items || menuItemData.items.length === 0) && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground">
                        No item sales data
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="categories" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Sales</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-category-total-sales">
                  {formatCurrency(categoryData?.totalSales || 0)}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Items Sold</CardTitle>
                <ShoppingCart className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-category-items-sold">
                  {categoryData?.totalQuantity || 0}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Categories</CardTitle>
                <Layers className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-category-count">
                  {categoryData?.categories?.length || 0}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Category Breakdown</CardTitle>
              <p className="text-sm text-muted-foreground">Click a category to see item details</p>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Qty Sold</TableHead>
                    <TableHead className="text-right">Total Sales</TableHead>
                    <TableHead className="text-right">% of Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(categoryData?.categories || []).map((category) => (
                    <CategoryRows 
                      key={category.id} 
                      category={category} 
                      totalSales={categoryData?.totalSales || 0} 
                    />
                  ))}
                  {(!categoryData?.categories || categoryData.categories.length === 0) && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground">
                        No category data
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="open-checks" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Open Checks</CardTitle>
                <FileText className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-open-check-count">
                  {openChecksLoading ? "..." : openChecksData?.summary.count || 0}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Value</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-open-check-value">
                  {openChecksLoading ? "..." : formatCurrency(openChecksData?.summary.totalValue || 0)}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Avg Duration</CardTitle>
                <Clock className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-open-check-duration">
                  {openChecksLoading ? "..." : `${Math.round(openChecksData?.summary.avgDuration || 0)} min`}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Open Checks</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Check #</TableHead>
                    <TableHead>Employee</TableHead>
                    <TableHead>RVC</TableHead>
                    <TableHead>Table</TableHead>
                    <TableHead className="text-right">Items</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Duration</TableHead>
                    <TableHead>Opened</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(openChecksData?.checks || []).map((check) => (
                    <TableRow 
                      key={check.id} 
                      data-testid={`row-open-check-${check.id}`}
                      className="cursor-pointer hover-elevate"
                      onClick={() => handleViewCheck(check.id)}
                    >
                      <TableCell className="font-medium">{check.checkNumber}</TableCell>
                      <TableCell>{check.employeeName}</TableCell>
                      <TableCell>{check.rvcName}</TableCell>
                      <TableCell>{check.tableNumber || "-"}</TableCell>
                      <TableCell className="text-right">{check.itemCount}</TableCell>
                      <TableCell className="text-right font-medium">{formatCurrency(check.total)}</TableCell>
                      <TableCell className="text-right">{check.durationMinutes} min</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{formatDateTime(check.openedAt)}</TableCell>
                    </TableRow>
                  ))}
                  {(!openChecksData?.checks || openChecksData.checks.length === 0) && (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-muted-foreground">
                        No open checks
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
              <p className="text-xs text-muted-foreground mt-2">Click on a check to view details</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="closed-checks" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Closed Checks</CardTitle>
                <Receipt className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-closed-check-count">
                  {closedChecksLoading ? "..." : closedChecksData?.summary.count || 0}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Sales</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-closed-check-sales">
                  {closedChecksLoading ? "..." : formatCurrency(closedChecksData?.summary.totalSales || 0)}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Avg Check</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-closed-avg-check">
                  {closedChecksLoading ? "..." : formatCurrency(closedChecksData?.summary.avgCheck || 0)}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Avg Duration</CardTitle>
                <Clock className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-closed-avg-duration">
                  {closedChecksLoading ? "..." : `${Math.round(closedChecksData?.summary.avgDuration || 0)} min`}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Closed Checks</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Check #</TableHead>
                    <TableHead>Employee</TableHead>
                    <TableHead>RVC</TableHead>
                    <TableHead className="text-right">Tax</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Paid</TableHead>
                    <TableHead className="text-right">Duration</TableHead>
                    <TableHead>Closed</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(closedChecksData?.checks || []).map((check) => (
                    <TableRow 
                      key={check.id} 
                      data-testid={`row-closed-check-${check.id}`}
                      className="cursor-pointer hover-elevate"
                      onClick={() => handleViewCheck(check.id)}
                    >
                      <TableCell className="font-medium">{check.checkNumber}</TableCell>
                      <TableCell>{check.employeeName}</TableCell>
                      <TableCell>{check.rvcName}</TableCell>
                      <TableCell className="text-right">{formatCurrency(check.tax)}</TableCell>
                      <TableCell className="text-right font-medium">{formatCurrency(check.total)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(check.totalPaid)}</TableCell>
                      <TableCell className="text-right">{check.durationMinutes} min</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{formatDateTime(check.closedAt)}</TableCell>
                    </TableRow>
                  ))}
                  {(!closedChecksData?.checks || closedChecksData.checks.length === 0) && (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-muted-foreground">
                        No closed checks in selected period
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
              <p className="text-xs text-muted-foreground mt-2">Click on a check to view details</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="employee-balance" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Employees</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-employee-count">
                  {employeeBalanceLoading ? "..." : employeeBalanceData?.summary.employeeCount || 0}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Checks</CardTitle>
                <Receipt className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-employee-total-checks">
                  {employeeBalanceLoading ? "..." : employeeBalanceData?.summary.totalChecks || 0}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Sales</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-employee-total-sales">
                  {employeeBalanceLoading ? "..." : formatCurrency(employeeBalanceData?.summary.totalSales || 0)}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Collected</CardTitle>
                <CreditCard className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-employee-total-collected">
                  {employeeBalanceLoading ? "..." : formatCurrency(employeeBalanceData?.summary.totalCollected || 0)}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Employee Balance</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead className="text-right">Checks</TableHead>
                    <TableHead className="text-right">Gross Sales</TableHead>
                    <TableHead className="text-right">Discounts</TableHead>
                    <TableHead className="text-right">Net Sales</TableHead>
                    <TableHead className="text-right">Cash</TableHead>
                    <TableHead className="text-right">Credit</TableHead>
                    <TableHead className="text-right">Total Collected</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(employeeBalanceData?.employees || []).map((emp) => (
                    <TableRow key={emp.employeeId} data-testid={`row-employee-${emp.employeeId}`}>
                      <TableCell className="font-medium">{emp.employeeName}</TableCell>
                      <TableCell className="text-right">{emp.checkCount}</TableCell>
                      <TableCell className="text-right">{formatCurrency(emp.grossSales)}</TableCell>
                      <TableCell className="text-right text-destructive">{formatCurrency(emp.discounts)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(emp.netSales)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(emp.cashCollected)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(emp.creditCollected)}</TableCell>
                      <TableCell className="text-right font-medium">{formatCurrency(emp.totalCollected)}</TableCell>
                    </TableRow>
                  ))}
                  {(!employeeBalanceData?.employees || employeeBalanceData.employees.length === 0) && (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-muted-foreground">
                        No employee data
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="kds-kpi" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Tickets</CardTitle>
                <Receipt className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-kds-total-tickets">
                  {kdsKpiLoading ? "..." : kdsKpiData?.summary.totalTickets || 0}
                </div>
                <p className="text-xs text-muted-foreground">
                  {kdsKpiData?.summary.completedTickets || 0} completed
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Avg Ticket Time</CardTitle>
                <Timer className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-kds-avg-time">
                  {kdsKpiLoading ? "..." : formatSeconds(kdsKpiData?.summary.avgTicketTimeSeconds || 0)}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Min / Max Time</CardTitle>
                <Clock className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-kds-min-max-time">
                  {kdsKpiLoading ? "..." : `${formatSeconds(kdsKpiData?.summary.minTicketTimeSeconds || 0)} / ${formatSeconds(kdsKpiData?.summary.maxTicketTimeSeconds || 0)}`}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Items</CardTitle>
                <Package className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-kds-total-items">
                  {kdsKpiLoading ? "..." : kdsKpiData?.summary.totalItems || 0}
                </div>
                <p className="text-xs text-muted-foreground">
                  {kdsKpiData?.summary.readyItems || 0} ready
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Ticket Status</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Pending</p>
                    <p className="text-xl font-medium" data-testid="text-kds-pending">{kdsKpiData?.statusCounts.pending || 0}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">In Progress</p>
                    <p className="text-xl font-medium" data-testid="text-kds-in-progress">{kdsKpiData?.statusCounts.inProgress || 0}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Completed</p>
                    <p className="text-xl font-medium" data-testid="text-kds-completed">{kdsKpiData?.statusCounts.completed || 0}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Recalled</p>
                    <p className="text-xl font-medium" data-testid="text-kds-recalled">{kdsKpiData?.statusCounts.recalled || 0}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Hourly Throughput</CardTitle>
              </CardHeader>
              <CardContent className="h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={kdsKpiData?.hourlyThroughput || []}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="hour" tickFormatter={formatHour} tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload;
                          return (
                            <div className="bg-popover p-2 rounded border text-sm">
                              <p className="font-medium">{formatHour(data.hour)}</p>
                              <p>Tickets: {data.tickets}</p>
                              <p>Avg Time: {formatSeconds(Math.round(data.avgTime))}</p>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Bar dataKey="tickets" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="comparison" className="space-y-4">
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-4">
                <Label>Comparison Type</Label>
                <Select value={comparisonType} onValueChange={setComparisonType}>
                  <SelectTrigger className="w-[220px]" data-testid="select-comparison-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="today_vs_last_week">Today vs Same Day Last Week</SelectItem>
                    <SelectItem value="this_week_vs_last_week">This Week vs Last Week</SelectItem>
                    <SelectItem value="this_month_vs_last_month">This Month vs Last Month</SelectItem>
                    <SelectItem value="this_year_vs_last_year">This Year vs Last Year</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {comparisonLoading ? (
            <Card>
              <CardContent className="py-10 text-center text-muted-foreground">
                Loading comparison data...
              </CardContent>
            </Card>
          ) : comparisonData ? (
            <>
              <div className="grid gap-4 md:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">{comparisonData.currentPeriod.label}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-muted-foreground">Checks</p>
                        <p className="text-lg font-medium">{comparisonData.currentPeriod.data.checkCount}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Gross Sales</p>
                        <p className="text-lg font-medium">{formatCurrency(comparisonData.currentPeriod.data.grossSales)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Net Sales</p>
                        <p className="text-lg font-medium">{formatCurrency(comparisonData.currentPeriod.data.netSales)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Avg Check</p>
                        <p className="text-lg font-medium">{formatCurrency(comparisonData.currentPeriod.data.avgCheck)}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">{comparisonData.previousPeriod.label}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-muted-foreground">Checks</p>
                        <p className="text-lg font-medium">{comparisonData.previousPeriod.data.checkCount}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Gross Sales</p>
                        <p className="text-lg font-medium">{formatCurrency(comparisonData.previousPeriod.data.grossSales)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Net Sales</p>
                        <p className="text-lg font-medium">{formatCurrency(comparisonData.previousPeriod.data.netSales)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Avg Check</p>
                        <p className="text-lg font-medium">{formatCurrency(comparisonData.previousPeriod.data.avgCheck)}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Changes</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                    {Object.entries(comparisonData.changes).map(([key, change]) => {
                      const label = key === "checkCount" ? "Checks" : 
                                   key === "grossSales" ? "Gross Sales" :
                                   key === "netSales" ? "Net Sales" :
                                   key === "total" ? "Total" : "Avg Check";
                      const isPositive = change.percentage >= 0;
                      const isMoney = key !== "checkCount";
                      return (
                        <div key={key} className="space-y-1">
                          <p className="text-sm text-muted-foreground">{label}</p>
                          <p className={`text-lg font-medium ${isPositive ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`} data-testid={`text-change-${key}`}>
                            {isPositive ? "+" : ""}{change.percentage.toFixed(1)}%
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {isPositive ? "+" : ""}{isMoney ? formatCurrency(change.value) : change.value}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Sales Comparison Chart</CardTitle>
                </CardHeader>
                <CardContent className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={comparisonChartData} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis type="number" tickFormatter={(value) => value >= 1000 ? `$${(value / 1000).toFixed(0)}k` : value.toString()} />
                      <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 12 }} />
                      <Tooltip 
                        content={({ active, payload, label }) => {
                          if (active && payload && payload.length) {
                            return (
                              <div className="bg-popover p-3 rounded border text-sm">
                                <p className="font-medium mb-2">{label}</p>
                                {payload.map((entry, index) => (
                                  <p key={index} style={{ color: entry.color }}>
                                    {entry.name}: {label === "Checks" ? entry.value : formatCurrency(entry.value as number)}
                                  </p>
                                ))}
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      <Legend />
                      <Bar 
                        dataKey="current" 
                        name={comparisonData.currentPeriod.label} 
                        fill="hsl(var(--primary))" 
                        radius={[0, 4, 4, 0]} 
                      />
                      <Bar 
                        dataKey="previous" 
                        name={comparisonData.previousPeriod.label} 
                        fill="hsl(var(--muted-foreground))" 
                        radius={[0, 4, 4, 0]} 
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </>
          ) : (
            <Card>
              <CardContent className="py-10 text-center text-muted-foreground">
                No comparison data available
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={checkModalOpen} onOpenChange={setCheckModalOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5" />
              Check #{checkDetailData?.check.checkNumber || "..."}
              <Badge variant={checkDetailData?.check.status === "open" ? "default" : "secondary"}>
                {checkDetailData?.check.status || "..."}
              </Badge>
            </DialogTitle>
          </DialogHeader>
          
          {checkDetailLoading ? (
            <div className="py-8 text-center text-muted-foreground">Loading check details...</div>
          ) : checkDetailData ? (
            <ScrollArea className="max-h-[60vh]">
              <div className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Order Type</p>
                    <p className="font-medium">{checkDetailData.check.orderType || "Dine In"}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Table</p>
                    <p className="font-medium">{checkDetailData.check.tableNumber || "-"}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Opened</p>
                    <p className="font-medium">{formatDateTime(checkDetailData.check.openedAt || null)}</p>
                  </div>
                  {checkDetailData.check.closedAt && (
                    <div>
                      <p className="text-muted-foreground">Closed</p>
                      <p className="font-medium">{formatDateTime(checkDetailData.check.closedAt)}</p>
                    </div>
                  )}
                </div>

                <Separator />

                <div>
                  <h4 className="font-medium mb-2">Items ({checkDetailData.items.filter(i => !i.voided).length})</h4>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Item</TableHead>
                        <TableHead className="text-right">Qty</TableHead>
                        <TableHead className="text-right">Price</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {checkDetailData.items.filter(i => !i.voided).map((item) => {
                        const unitPrice = parseFloat(item.unitPrice || "0");
                        const qty = item.quantity || 1;
                        const modifierTotal = item.modifiers?.reduce((sum, m) => sum + parseFloat(m.priceDelta || "0"), 0) || 0;
                        const extendedPrice = (unitPrice + modifierTotal) * qty;
                        return (
                          <TableRow key={item.id} data-testid={`row-check-item-${item.id}`}>
                            <TableCell>
                              <div>
                                <span className="font-medium">{item.menuItemName}</span>
                                {item.modifiers && item.modifiers.length > 0 && (
                                  <div className="text-xs text-muted-foreground mt-0.5">
                                    {item.modifiers.map(m => m.name).join(", ")}
                                  </div>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-right">{qty}</TableCell>
                            <TableCell className="text-right">{formatCurrency(unitPrice)}</TableCell>
                            <TableCell className="text-right font-medium">{formatCurrency(extendedPrice)}</TableCell>
                          </TableRow>
                        );
                      })}
                      {checkDetailData.items.filter(i => !i.voided).length === 0 && (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center text-muted-foreground">No items</TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>

                <Separator />

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Subtotal</span>
                      <span>{formatCurrency(parseFloat(checkDetailData.check.subtotal || "0"))}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Discounts</span>
                      <span className="text-destructive">-{formatCurrency(parseFloat(checkDetailData.check.discountTotal || "0"))}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Tax</span>
                      <span>{formatCurrency(parseFloat(checkDetailData.check.taxTotal || "0"))}</span>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between text-lg font-bold">
                      <span>Total</span>
                      <span>{formatCurrency(parseFloat(checkDetailData.check.total || "0"))}</span>
                    </div>
                    {checkDetailData.check.paidAmount !== undefined && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Paid</span>
                        <span className="text-green-600 dark:text-green-400">{formatCurrency(checkDetailData.check.paidAmount)}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </ScrollArea>
          ) : (
            <div className="py-8 text-center text-muted-foreground">Failed to load check details</div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
