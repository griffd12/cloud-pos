import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { 
  DollarSign, Users, Receipt, TrendingUp, Clock, ShoppingCart, CreditCard, 
  Banknote, Smartphone, Package, Layers, ChevronDown, ChevronRight, BarChart3
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { type Property, type Rvc } from "@shared/schema";

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
  guestCount: number;
  avgCheck: number;
  avgPerGuest: number;
  openCheckCount: number;
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

export default function ReportsPage() {
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>("all");
  const [selectedRvcId, setSelectedRvcId] = useState<string>("all");
  const [dateRange, setDateRange] = useState<string>("today");
  const [activeTab, setActiveTab] = useState<string>("dashboard");
  const [customStartDate, setCustomStartDate] = useState<string>("");
  const [customEndDate, setCustomEndDate] = useState<string>("");

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
    
    switch (dateRange) {
      case "yesterday": {
        const start = new Date(todayStart);
        start.setDate(start.getDate() - 1);
        const end = new Date(start);
        end.setHours(23, 59, 59, 999);
        return { startDate: start.toISOString(), endDate: end.toISOString() };
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
          return { startDate: start.toISOString(), endDate: end.toISOString() };
        }
        return { startDate: todayStart.toISOString(), endDate: todayEnd.toISOString() };
      }
      default:
        return { startDate: todayStart.toISOString(), endDate: todayEnd.toISOString() };
    }
  }, [dateRange, customStartDate, customEndDate]);
  
  const buildUrl = (endpoint: string) => {
    const params = new URLSearchParams();
    params.set("startDate", dateParams.startDate);
    params.set("endDate", dateParams.endDate);
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

  const avgItemPrice = menuItemData && menuItemData.totalQuantity > 0 
    ? menuItemData.totalSales / menuItemData.totalQuantity 
    : 0;

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
        <TabsList data-testid="tabs-reports">
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
                <CardTitle className="text-sm font-medium">Guests</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold tabular-nums" data-testid="text-guest-count">
                  {summaryLoading ? "..." : salesSummary?.guestCount || 0}
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
                  <p className="text-muted-foreground">Checks Started</p>
                  <p className="font-medium text-lg" data-testid="text-checks-started">
                    {salesSummary?.checksStarted || 0}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-muted-foreground">Checks Closed</p>
                  <p className="font-medium text-lg" data-testid="text-checks-closed">
                    {salesSummary?.checksClosed || 0}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-muted-foreground">Carried Over</p>
                  <p className="font-medium text-lg" data-testid="text-checks-carried">
                    {salesSummary?.checksCarriedOver || 0}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-muted-foreground">Currently Open</p>
                  <p className="font-medium text-lg" data-testid="text-checks-open">
                    {salesSummary?.openCheckCount || 0}
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
              <div className="grid grid-cols-2 md:grid-cols-7 gap-4 text-sm">
                <div className="space-y-1">
                  <p className="text-muted-foreground">Base Item Sales</p>
                  <p className="font-medium text-lg" data-testid="text-base-item-sales">
                    {formatCurrency(salesSummary?.baseItemSales || 0)}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-muted-foreground">Modifiers</p>
                  <p className="font-medium text-lg" data-testid="text-modifier-sales">
                    {formatCurrency(salesSummary?.modifierTotal || 0)}
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
      </Tabs>
    </div>
  );
}
