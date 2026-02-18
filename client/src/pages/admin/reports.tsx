import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearch } from "wouter";
import { usePosWebSocket } from "@/hooks/use-pos-websocket";
import { useEmcFilter } from "@/lib/emc-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const EMC_SESSION_KEY = "emc_session_token";
const DEVICE_TOKEN_KEY = "pos_device_token";

function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  const emcToken = sessionStorage.getItem(EMC_SESSION_KEY);
  if (emcToken) {
    headers["X-EMC-Session"] = emcToken;
  }
  const deviceToken = localStorage.getItem(DEVICE_TOKEN_KEY);
  if (deviceToken) {
    headers["X-Device-Token"] = deviceToken;
  }
  return headers;
}

async function authFetch(url: string): Promise<Response> {
  return fetch(url, { headers: getAuthHeaders() });
}
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { 
  DollarSign, Receipt, TrendingUp, Clock, Package, BarChart3,
  Timer, GitCompare, ShoppingCart
} from "lucide-react";
import { Area, AreaChart } from "recharts";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";
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
  avgCheck: number;
  checksOutstanding: number;
  baseItemSales: number;
  modifierTotal: number;
  totalPayments: number;
  totalTips: number;
  paymentCount: number;
  checksStarted: number;
  checksClosed: number;
  checksCarriedOver: number;
  carriedOverTotal: number;
  startedTotal: number;
  outstandingTotal: number;
  closedSubtotal: number;
  closedTax: number;
  closedTotal: number;
  openSubtotal: number;
  openTax: number;
  openTotal: number;
  todaysOpenCount: number;
  voidCount: number;
  voidAmount: number;
  totalRefunds: number;
  refundCount: number;
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

export default function ReportsPage() {
  usePosWebSocket();
  const { filterParam, filterKeys, selectedPropertyId: contextPropertyId, selectedRvcId: contextRvcId } = useEmcFilter();
  
  const searchParams = useSearch();
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>(contextPropertyId || "all");
  const [selectedRvcId, setSelectedRvcId] = useState<string>(contextRvcId || "all");

  useEffect(() => {
    if (contextPropertyId) {
      setSelectedPropertyId(contextPropertyId);
    }
  }, [contextPropertyId]);

  useEffect(() => {
    if (contextRvcId) {
      setSelectedRvcId(contextRvcId);
    } else {
      setSelectedRvcId("all");
    }
  }, [contextRvcId]);
  const [dateRange, setDateRange] = useState<string>("today");
  const [activeTab, setActiveTab] = useState<string>("dashboard");
  const [customStartDate, setCustomStartDate] = useState<string>("");
  const [customEndDate, setCustomEndDate] = useState<string>("");

  useEffect(() => {
    const params = new URLSearchParams(searchParams);
    const tab = params.get("tab");
    if (tab) {
      setActiveTab(tab);
    }
  }, [searchParams]);

  const { data: properties = [] } = useQuery<Property[]>({
    queryKey: ["/api/properties", filterKeys],
    queryFn: async () => {
      const res = await authFetch(`/api/properties${filterParam}`);
      if (!res.ok) throw new Error("Failed to fetch properties");
      return res.json();
    },
  });

  const { data: rvcs = [] } = useQuery<Rvc[]>({
    queryKey: ["/api/rvcs", filterKeys],
    queryFn: async () => {
      const res = await authFetch(`/api/rvcs${filterParam}`);
      if (!res.ok) throw new Error("Failed to fetch rvcs");
      return res.json();
    },
  });

  const businessDatePropertyId = useMemo(() => {
    if (selectedPropertyId !== "all") return selectedPropertyId;
    return properties[0]?.id || null;
  }, [selectedPropertyId, properties]);

  const { data: businessDateInfo } = useQuery<{ currentBusinessDate: string; nextBusinessDate: string }>({
    queryKey: ["/api/properties", businessDatePropertyId, "business-date"],
    queryFn: async () => {
      if (!businessDatePropertyId) return { currentBusinessDate: new Date().toISOString().split('T')[0], nextBusinessDate: "" };
      const res = await authFetch(`/api/properties/${businessDatePropertyId}/business-date`);
      if (!res.ok) throw new Error("Failed to fetch business date");
      return res.json();
    },
    enabled: !!businessDatePropertyId,
  });

  const filteredRvcs = useMemo(() => {
    if (selectedPropertyId === "all") return rvcs;
    return rvcs.filter((r) => r.propertyId === selectedPropertyId);
  }, [rvcs, selectedPropertyId]);

  const dateParams = useMemo(() => {
    const formatDateLocal = (d: Date) => {
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    };
    
    const currentBusinessDate = businessDateInfo?.currentBusinessDate || formatDateLocal(new Date());
    const [y, m, d] = currentBusinessDate.split('-').map(Number);
    const todayStart = new Date(y, m - 1, d, 0, 0, 0, 0);
    const todayEnd = new Date(y, m - 1, d, 23, 59, 59, 999);
    
    switch (dateRange) {
      case "yesterday": {
        const bizDate = new Date(currentBusinessDate + "T00:00:00");
        bizDate.setDate(bizDate.getDate() - 1);
        bizDate.setHours(0, 0, 0, 0);
        const end = new Date(bizDate);
        end.setHours(23, 59, 59, 999);
        return { startDate: bizDate.toISOString(), endDate: end.toISOString(), businessDate: formatDateLocal(bizDate) };
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
        const start = new Date(todayStart.getFullYear(), 0, 1);
        start.setHours(0, 0, 0, 0);
        return { startDate: start.toISOString(), endDate: todayEnd.toISOString() };
      }
      case "last_quarter": {
        const currentMonth = todayStart.getMonth();
        const currentQuarter = Math.floor(currentMonth / 3);
        const lastQuarterStart = currentQuarter === 0 ? 9 : (currentQuarter - 1) * 3;
        const lastQuarterYear = currentQuarter === 0 ? todayStart.getFullYear() - 1 : todayStart.getFullYear();
        const start = new Date(lastQuarterYear, lastQuarterStart, 1);
        start.setHours(0, 0, 0, 0);
        const end = new Date(lastQuarterYear, lastQuarterStart + 3, 0);
        end.setHours(23, 59, 59, 999);
        return { startDate: start.toISOString(), endDate: end.toISOString() };
      }
      case "this_month": {
        const start = new Date(todayStart.getFullYear(), todayStart.getMonth(), 1);
        start.setHours(0, 0, 0, 0);
        return { startDate: start.toISOString(), endDate: todayEnd.toISOString() };
      }
      case "custom": {
        if (customStartDate && customEndDate) {
          const start = new Date(customStartDate);
          start.setHours(0, 0, 0, 0);
          const end = new Date(customEndDate);
          end.setHours(23, 59, 59, 999);
          if (customStartDate === customEndDate) {
            return { startDate: start.toISOString(), endDate: end.toISOString(), businessDate: formatDateLocal(start) };
          }
          return { startDate: start.toISOString(), endDate: end.toISOString() };
        }
        const bizDate = new Date(currentBusinessDate + "T00:00:00");
        bizDate.setHours(0, 0, 0, 0);
        const bizDateEnd = new Date(bizDate);
        bizDateEnd.setHours(23, 59, 59, 999);
        return { startDate: bizDate.toISOString(), endDate: bizDateEnd.toISOString(), businessDate: currentBusinessDate };
      }
      default: {
        const bizDate = new Date(currentBusinessDate + "T00:00:00");
        bizDate.setHours(0, 0, 0, 0);
        const bizDateEnd = new Date(bizDate);
        bizDateEnd.setHours(23, 59, 59, 999);
        return { startDate: bizDate.toISOString(), endDate: bizDateEnd.toISOString(), businessDate: currentBusinessDate };
      }
    }
  }, [dateRange, customStartDate, customEndDate, businessDateInfo]);
  
  const dateRangeDisplay = useMemo(() => {
    const formatDate = (dateStr: string) => {
      const date = new Date(dateStr);
      return date.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    };
    
    const startDate = new Date(dateParams.startDate);
    const endDate = new Date(dateParams.endDate);
    const startFormatted = formatDate(dateParams.startDate);
    const endFormatted = formatDate(dateParams.endDate);
    
    const isSameDay = startDate.toDateString() === endDate.toDateString();
    
    if (isSameDay) {
      return startFormatted;
    }
    return `${startFormatted} - ${endFormatted}`;
  }, [dateParams]);

  const buildUrl = (endpoint: string) => {
    const params = new URLSearchParams();
    params.set("startDate", dateParams.startDate);
    params.set("endDate", dateParams.endDate);
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
      const res = await authFetch(buildUrl("/api/reports/sales-summary"));
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const { data: categorySales = [] } = useQuery<CategorySale[]>({
    queryKey: ["/api/reports/sales-by-category", dateParams, selectedPropertyId, selectedRvcId],
    queryFn: async () => {
      const res = await authFetch(buildUrl("/api/reports/sales-by-category"));
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const { data: topItems = [] } = useQuery<TopItem[]>({
    queryKey: ["/api/reports/top-items", dateParams, selectedPropertyId, selectedRvcId],
    queryFn: async () => {
      const res = await authFetch(buildUrl("/api/reports/top-items"));
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const { data: tenderMix = [] } = useQuery<TenderMix[]>({
    queryKey: ["/api/reports/tender-mix", dateParams, selectedPropertyId, selectedRvcId],
    queryFn: async () => {
      const res = await authFetch(buildUrl("/api/reports/tender-mix"));
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const { data: hourlySales = [] } = useQuery<HourlySale[]>({
    queryKey: ["/api/reports/hourly-sales", dateParams, selectedPropertyId, selectedRvcId],
    queryFn: async () => {
      const res = await authFetch(buildUrl("/api/reports/hourly-sales"));
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const { data: kdsKpiData, isLoading: kdsKpiLoading } = useQuery<KdsKpiData>({
    queryKey: ["/api/reports/kds-kpi", dateParams, selectedPropertyId, selectedRvcId],
    queryFn: async () => {
      const res = await authFetch(buildUrl("/api/reports/kds-kpi"));
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
      const res = await authFetch(`/api/reports/sales-comparison?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

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

            <div className="flex items-center gap-2 ml-auto">
              <Badge variant="outline" className="text-sm px-3 py-1" data-testid="badge-date-range">
                <Clock className="h-3.5 w-3.5 mr-2" />
                {dateRangeDisplay}
              </Badge>
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
          <TabsTrigger value="kds-kpi" data-testid="tab-kds-kpi">
            <Timer className="h-4 w-4 mr-2" />
            KDS KPIs
          </TabsTrigger>
          <TabsTrigger value="comparison" data-testid="tab-comparison">
            <GitCompare className="h-4 w-4 mr-2" />
            Compare
          </TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="space-y-6">
          {summaryLoading ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {[1,2,3,4].map(i => (
                <Card key={i}>
                  <CardContent className="pt-6 pb-4">
                    <div className="h-20 flex items-center justify-center text-muted-foreground">Loading...</div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Net Sales</CardTitle>
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold" data-testid="text-hero-net-sales">
                    {formatCurrency(salesSummary?.netSales ?? 0)}
                  </div>
                  <div className="flex items-center gap-1 mt-1">
                    <p className="text-xs text-muted-foreground">
                      Gross {formatCurrency(salesSummary?.grossSales ?? 0)}
                    </p>
                    {(salesSummary?.discountTotal || 0) > 0 && (
                      <span className="text-xs text-destructive ml-1">(-{formatCurrency(salesSummary?.discountTotal || 0)} disc.)</span>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Checks</CardTitle>
                  <Receipt className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold" data-testid="text-hero-check-count">
                    {salesSummary?.checkCount || 0}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {salesSummary?.checksClosed || 0} closed / {salesSummary?.checksOutstanding || 0} open
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Avg Check</CardTitle>
                  <ShoppingCart className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold" data-testid="text-hero-avg-check">
                    {formatCurrency(salesSummary?.avgCheck ?? 0)}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Total w/ tax {formatCurrency(salesSummary?.totalWithTax ?? 0)}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Payments</CardTitle>
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold" data-testid="text-hero-payments">
                    {formatCurrency(salesSummary?.totalPayments ?? 0)}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {salesSummary?.paymentCount || 0} payments / {formatCurrency(salesSummary?.totalTips || 0)} tips
                  </p>
                </CardContent>
              </Card>
            </div>
          )}

          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm">Hourly Sales</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={hourlySales.filter(h => h.sales > 0 || h.checkCount > 0).length > 0 ? hourlySales : []}>
                    <defs>
                      <linearGradient id="salesGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="hour" tickFormatter={formatHour} fontSize={12} />
                    <YAxis tickFormatter={(v) => `$${v}`} fontSize={12} />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload;
                          return (
                            <div className="bg-popover p-3 rounded-md border text-sm">
                              <p className="font-medium">{formatHour(data.hour)}</p>
                              <p className="text-muted-foreground">Sales: {formatCurrency(data.sales)}</p>
                              <p className="text-muted-foreground">Checks: {data.checkCount}</p>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Area type="monotone" dataKey="sales" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#salesGradient)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-sm">Tender Mix</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64 flex items-center">
                  {tenderMix.length > 0 ? (
                    <div className="flex w-full gap-4">
                      <div className="w-1/2">
                        <ResponsiveContainer width="100%" height={220}>
                          <PieChart margin={{ top: 10, right: 10, bottom: 10, left: 10 }}>
                            <Pie
                              data={tenderMix}
                              dataKey="amount"
                              nameKey="name"
                              cx="50%"
                              cy="50%"
                              innerRadius={45}
                              outerRadius={80}
                              paddingAngle={2}
                              label={({ percentage }) => `${percentage.toFixed(0)}%`}
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
                      <div className="w-1/2 flex flex-col justify-center space-y-2">
                        {tenderMix.map((tender, index) => (
                          <div key={tender.id} className="flex items-center justify-between text-sm">
                            <div className="flex items-center gap-2">
                              <div
                                className="w-3 h-3 rounded-sm"
                                style={{ backgroundColor: COLORS[index % COLORS.length] }}
                              />
                              <span>{tender.name}</span>
                            </div>
                            <div className="text-right">
                              <span className="font-medium">{formatCurrency(tender.amount)}</span>
                              <span className="text-xs text-muted-foreground ml-1">({tender.percentage.toFixed(0)}%)</span>
                            </div>
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

            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-sm">Sales by Category</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  {categorySales.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={categorySales.slice(0, 8)} layout="vertical" margin={{ left: 0, right: 10 }}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" horizontal={false} />
                        <XAxis type="number" tickFormatter={(v) => `$${v >= 1000 ? `${(v/1000).toFixed(0)}k` : v}`} fontSize={11} />
                        <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 11 }} />
                        <Tooltip
                          content={({ active, payload }) => {
                            if (active && payload && payload.length) {
                              const data = payload[0].payload;
                              return (
                                <div className="bg-popover p-3 rounded-md border text-sm">
                                  <p className="font-medium">{data.name}</p>
                                  <p className="text-muted-foreground">Sales: {formatCurrency(data.sales)}</p>
                                  <p className="text-muted-foreground">Qty: {data.quantity}</p>
                                </div>
                              );
                            }
                            return null;
                          }}
                        />
                        <Bar dataKey="sales" radius={[0, 4, 4, 0]}>
                          {categorySales.slice(0, 8).map((_, index) => (
                            <Cell key={index} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex items-center justify-center">
                      <p className="text-muted-foreground">No category data</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm">Top Selling Items</CardTitle>
            </CardHeader>
            <CardContent>
              {topItems.length > 0 ? (
                <div className="grid gap-3 md:grid-cols-2">
                  {topItems.slice(0, 10).map((item, index) => {
                    const maxSales = topItems[0]?.sales || 1;
                    const pct = (item.sales / maxSales) * 100;
                    return (
                      <div key={item.id} className="flex items-center gap-3" data-testid={`row-top-item-${item.id}`}>
                        <Badge variant="secondary" className="w-6 h-6 flex items-center justify-center p-0 shrink-0">
                          {index + 1}
                        </Badge>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <p className="font-medium text-sm truncate">{item.name}</p>
                            <span className="font-medium text-sm shrink-0">{formatCurrency(item.sales)}</span>
                          </div>
                          <div className="mt-1 h-1.5 rounded-sm bg-muted overflow-hidden">
                            <div
                              className="h-full rounded-sm bg-primary/60"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">{item.quantity} sold</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-muted-foreground text-center py-4">No item data</p>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-sm">Check Movement</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="space-y-1">
                    <p className="text-muted-foreground">Carried Over</p>
                    <p className="font-medium text-lg" data-testid="text-checks-carried">
                      {salesSummary?.checksCarriedOver || 0}
                    </p>
                    <p className="text-xs text-muted-foreground" data-testid="text-carried-total">
                      {formatCurrency(salesSummary?.carriedOverTotal || 0)}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-muted-foreground">Started</p>
                    <p className="font-medium text-lg" data-testid="text-checks-started">
                      {salesSummary?.checksStarted || 0}
                    </p>
                    <p className="text-xs text-muted-foreground" data-testid="text-started-total">
                      {formatCurrency(salesSummary?.startedTotal || 0)}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-muted-foreground">Closed</p>
                    <p className="font-medium text-lg" data-testid="text-checks-closed">
                      {salesSummary?.checksClosed || 0}
                    </p>
                    <p className="text-xs text-muted-foreground" data-testid="text-closed-total">
                      {formatCurrency(salesSummary?.closedTotal || 0)}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-muted-foreground">Outstanding</p>
                    <p className="font-medium text-lg" data-testid="text-checks-outstanding">
                      {salesSummary?.checksOutstanding || 0}
                    </p>
                    <p className="text-xs text-muted-foreground" data-testid="text-outstanding-total">
                      {formatCurrency(salesSummary?.outstandingTotal || 0)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-sm">Adjustments</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div className="space-y-1">
                    <p className="text-muted-foreground">Voids</p>
                    <p className="font-medium text-lg" data-testid="text-void-count">
                      {salesSummary?.voidCount || 0}
                    </p>
                    <p className="text-xs text-destructive" data-testid="text-void-amount">
                      {formatCurrency(salesSummary?.voidAmount || 0)}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-muted-foreground">Refunds</p>
                    <p className="font-medium text-lg" data-testid="text-refund-count">
                      {salesSummary?.refundCount || 0}
                    </p>
                    <p className="text-xs text-destructive" data-testid="text-refund-amount">
                      {formatCurrency(salesSummary?.totalRefunds || 0)}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-muted-foreground">Tips</p>
                    <p className="font-medium text-lg" data-testid="text-total-tips">
                      {formatCurrency(salesSummary?.totalTips || 0)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Svc Chg: {formatCurrency(salesSummary?.serviceChargeTotal || 0)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm">Reconciliation</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-6 text-sm">
                <div className="space-y-3">
                  <p className="font-medium text-muted-foreground">Closed Checks</p>
                  <div className="space-y-1">
                    <div className="flex justify-between gap-2">
                      <span className="text-muted-foreground">Subtotal</span>
                      <span data-testid="text-closed-subtotal">{formatCurrency(salesSummary?.closedSubtotal || 0)}</span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-muted-foreground">Tax</span>
                      <span data-testid="text-closed-tax">{formatCurrency(salesSummary?.closedTax || 0)}</span>
                    </div>
                    <Separator />
                    <div className="flex justify-between gap-2 font-medium">
                      <span>Total</span>
                      <span data-testid="text-closed-total-recon">{formatCurrency(salesSummary?.closedTotal || 0)}</span>
                    </div>
                  </div>
                </div>
                {(salesSummary?.totalRefunds || 0) > 0 && (
                  <div className="space-y-3">
                    <p className="font-medium text-destructive">Refunds</p>
                    <div className="space-y-1">
                      <div className="flex justify-between gap-2">
                        <span className="text-muted-foreground">Count</span>
                        <span data-testid="text-refund-count-recon">{salesSummary?.refundCount || 0}</span>
                      </div>
                      <div className="flex justify-between gap-2">
                        <span className="text-muted-foreground">Amount</span>
                        <span className="text-destructive" data-testid="text-refund-amount-recon">-{formatCurrency(salesSummary?.totalRefunds || 0)}</span>
                      </div>
                      <Separator />
                      <div className="flex justify-between gap-2 font-medium">
                        <span>Net Expected</span>
                        <span data-testid="text-net-expected">{formatCurrency((salesSummary?.closedTotal || 0) - (salesSummary?.totalRefunds || 0))}</span>
                      </div>
                    </div>
                  </div>
                )}
                <div className="space-y-3">
                  <p className="font-medium text-muted-foreground">Open Checks</p>
                  <div className="space-y-1">
                    <div className="flex justify-between gap-2">
                      <span className="text-muted-foreground">Subtotal</span>
                      <span data-testid="text-open-subtotal">{formatCurrency(salesSummary?.openSubtotal || 0)}</span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-muted-foreground">Tax</span>
                      <span data-testid="text-open-tax">{formatCurrency(salesSummary?.openTax || 0)}</span>
                    </div>
                    <Separator />
                    <div className="flex justify-between gap-2 font-medium">
                      <span>Total</span>
                      <span data-testid="text-open-total-recon">{formatCurrency(salesSummary?.openTotal || 0)}</span>
                    </div>
                  </div>
                </div>
                <div className="space-y-3">
                  <p className="font-medium text-muted-foreground">Payments Received</p>
                  <div className="space-y-1">
                    <div className="flex justify-between gap-2">
                      <span className="text-muted-foreground">Count</span>
                      <span data-testid="text-payment-count-recon">{salesSummary?.paymentCount || 0}</span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-muted-foreground">Tips</span>
                      <span data-testid="text-tips-recon">{formatCurrency(salesSummary?.totalTips || 0)}</span>
                    </div>
                    <Separator />
                    <div className="flex justify-between gap-2 font-medium">
                      <span>Total</span>
                      <span data-testid="text-payments-total-recon">{formatCurrency(salesSummary?.totalPayments || 0)}</span>
                    </div>
                  </div>
                </div>
                <div className="space-y-3">
                  <p className="font-medium text-muted-foreground">Variance</p>
                  <div className="space-y-1">
                    <div className="flex justify-between gap-2">
                      <span className="text-muted-foreground">Expected</span>
                      <span data-testid="text-expected-payments">{formatCurrency((salesSummary?.closedTotal || 0) - (salesSummary?.totalRefunds || 0))}</span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-muted-foreground">Received</span>
                      <span data-testid="text-received-payments">{formatCurrency(salesSummary?.totalPayments || 0)}</span>
                    </div>
                    <Separator />
                    <div className="flex justify-between gap-2 font-medium">
                      <span>Difference</span>
                      <span
                        className={((salesSummary?.closedTotal || 0) - (salesSummary?.totalRefunds || 0) - (salesSummary?.totalPayments || 0)) !== 0 ? "text-destructive" : ""}
                        data-testid="text-variance"
                      >
                        {formatCurrency((salesSummary?.closedTotal || 0) - (salesSummary?.totalRefunds || 0) - (salesSummary?.totalPayments || 0))}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
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
    </div>
  );
}
