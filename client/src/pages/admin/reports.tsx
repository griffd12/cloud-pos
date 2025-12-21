import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { DollarSign, Users, Receipt, TrendingUp, Clock, ShoppingCart, CreditCard, Percent, AlertTriangle, XCircle } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { type Property, type Rvc } from "@shared/schema";

interface SalesSummary {
  grossSales: number;
  discountTotal: number;
  netSales: number;
  taxTotal: number;
  totalWithTax: number;
  checkCount: number;
  guestCount: number;
  avgCheck: number;
  avgPerGuest: number;
  openCheckCount: number;
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
  const [location, setLocation] = useLocation();
  
  const getActiveTab = () => {
    if (location.includes("/reports/sales")) return "sales";
    if (location.includes("/reports/operations")) return "operations";
    return "dashboard";
  };
  const activeTab = getActiveTab();
  
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>("all");
  const [selectedRvcId, setSelectedRvcId] = useState<string>("all");
  const [dateRange, setDateRange] = useState<string>("today");

  const handleTabChange = (tab: string) => {
    if (tab === "dashboard") {
      setLocation("/admin/reports");
    } else {
      setLocation(`/admin/reports/${tab}`);
    }
  };

  const { data: properties = [] } = useQuery<Property[]>({
    queryKey: ["/api/properties"],
  });

  const { data: rvcs = [] } = useQuery<Rvc[]>({
    queryKey: ["/api/rvcs"],
  });

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
      default:
        return { startDate: todayStart.toISOString(), endDate: todayEnd.toISOString() };
    }
  }, [dateRange]);

  const filterParams = useMemo(() => ({
    startDate: dateParams.startDate,
    endDate: dateParams.endDate,
    propertyId: selectedPropertyId,
    rvcId: selectedRvcId,
  }), [dateParams, selectedPropertyId, selectedRvcId]);
  
  const buildUrl = (endpoint: string) => {
    const params = new URLSearchParams();
    params.set("startDate", dateParams.startDate);
    params.set("endDate", dateParams.endDate);
    if (selectedPropertyId !== "all") params.set("propertyId", selectedPropertyId);
    if (selectedRvcId !== "all") params.set("rvcId", selectedRvcId);
    return `${endpoint}?${params.toString()}`;
  };
  
  const { data: salesSummary, isLoading: summaryLoading } = useQuery<SalesSummary>({
    queryKey: ["/api/reports/sales-summary", filterParams],
    queryFn: async () => {
      const res = await fetch(buildUrl("/api/reports/sales-summary"), { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch sales summary");
      return res.json();
    },
    staleTime: 0,
  });

  const { data: categorySales = [] } = useQuery<CategorySale[]>({
    queryKey: ["/api/reports/sales-by-category", filterParams],
    queryFn: async () => {
      const res = await fetch(buildUrl("/api/reports/sales-by-category"), { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch category sales");
      return res.json();
    },
    staleTime: 0,
  });

  const { data: topItems = [] } = useQuery<TopItem[]>({
    queryKey: ["/api/reports/top-items", filterParams],
    queryFn: async () => {
      const res = await fetch(buildUrl("/api/reports/top-items"), { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch top items");
      return res.json();
    },
    staleTime: 0,
  });

  const { data: tenderMix = [] } = useQuery<TenderMix[]>({
    queryKey: ["/api/reports/tender-mix", filterParams],
    queryFn: async () => {
      const res = await fetch(buildUrl("/api/reports/tender-mix"), { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch tender mix");
      return res.json();
    },
    staleTime: 0,
  });

  const todayDate = new Date().toISOString().split("T")[0];
  const hourlyFilterParams = { date: todayDate, propertyId: selectedPropertyId };
  
  const { data: hourlySales = [] } = useQuery<HourlySale[]>({
    queryKey: ["/api/reports/hourly-sales", hourlyFilterParams],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("date", todayDate);
      if (selectedPropertyId !== "all") params.set("propertyId", selectedPropertyId);
      const res = await fetch(`/api/reports/hourly-sales?${params.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch hourly sales");
      return res.json();
    },
    staleTime: 0,
  });

  const filteredRvcs = selectedPropertyId !== "all" 
    ? rvcs.filter(r => r.propertyId === selectedPropertyId) 
    : rvcs;

  const getPageTitle = () => {
    switch (activeTab) {
      case "sales": return "Sales Reports";
      case "operations": return "Operations Reports";
      default: return "Reports Dashboard";
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">{getPageTitle()}</h1>
          <p className="text-muted-foreground">Real-time sales and operations analytics</p>
        </div>
        
        <div className="flex gap-3 flex-wrap">
          <div className="space-y-1">
            <Label className="text-xs">Date Range</Label>
            <Select value={dateRange} onValueChange={setDateRange}>
              <SelectTrigger className="w-32" data-testid="select-date-range">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="yesterday">Yesterday</SelectItem>
                <SelectItem value="week">Last 7 Days</SelectItem>
                <SelectItem value="month">Last 30 Days</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div className="space-y-1">
            <Label className="text-xs">Property</Label>
            <Select value={selectedPropertyId} onValueChange={(v) => { setSelectedPropertyId(v); setSelectedRvcId("all"); }}>
              <SelectTrigger className="w-40" data-testid="select-property">
                <SelectValue placeholder="All Properties" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Properties</SelectItem>
                {properties.map(p => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div className="space-y-1">
            <Label className="text-xs">Revenue Center</Label>
            <Select value={selectedRvcId} onValueChange={setSelectedRvcId}>
              <SelectTrigger className="w-40" data-testid="select-rvc">
                <SelectValue placeholder="All RVCs" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All RVCs</SelectItem>
                {filteredRvcs.map(r => (
                  <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList>
          <TabsTrigger value="dashboard" data-testid="tab-dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="sales" data-testid="tab-sales">Sales Reports</TabsTrigger>
          <TabsTrigger value="operations" data-testid="tab-operations">Operations</TabsTrigger>
        </TabsList>
        
        <TabsContent value="dashboard" className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 py-3">
            <CardTitle className="text-sm font-medium">Net Sales</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-net-sales">
              {summaryLoading ? "..." : formatCurrency(salesSummary?.netSales || 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              Gross: {formatCurrency(salesSummary?.grossSales || 0)}
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 py-3">
            <CardTitle className="text-sm font-medium">Checks</CardTitle>
            <Receipt className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-check-count">
              {summaryLoading ? "..." : salesSummary?.checkCount || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              {salesSummary?.openCheckCount || 0} open
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 py-3">
            <CardTitle className="text-sm font-medium">Avg Check</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-avg-check">
              {summaryLoading ? "..." : formatCurrency(salesSummary?.avgCheck || 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              Per guest: {formatCurrency(salesSummary?.avgPerGuest || 0)}
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 py-3">
            <CardTitle className="text-sm font-medium">Guests</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-guest-count">
              {summaryLoading ? "..." : salesSummary?.guestCount || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              Discounts: {formatCurrency(salesSummary?.discountTotal || 0)}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm">Hourly Sales</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={hourlySales.filter(h => h.sales > 0 || h.checkCount > 0)}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis 
                    dataKey="hour" 
                    tickFormatter={formatHour}
                    className="text-xs"
                  />
                  <YAxis 
                    tickFormatter={(v) => `$${v}`}
                    className="text-xs"
                  />
                  <Tooltip 
                    formatter={(value: number) => formatCurrency(value)}
                    labelFormatter={(hour) => formatHour(hour as number)}
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

        <TabsContent value="sales" className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 py-3">
                <CardTitle className="text-sm font-medium">Gross Sales</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCurrency(salesSummary?.grossSales || 0)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 py-3">
                <CardTitle className="text-sm font-medium">Discounts</CardTitle>
                <Percent className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCurrency(salesSummary?.discountTotal || 0)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 py-3">
                <CardTitle className="text-sm font-medium">Net Sales</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCurrency(salesSummary?.netSales || 0)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 py-3">
                <CardTitle className="text-sm font-medium">Tax Collected</CardTitle>
                <Receipt className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCurrency(salesSummary?.taxTotal || 0)}</div>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-sm">Sales by Category</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {categorySales.length > 0 ? (
                    categorySales.map((cat, index) => (
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
                <CardTitle className="text-sm">Tender Mix Detail</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {tenderMix.length > 0 ? (
                    tenderMix.map((tender) => (
                      <div key={tender.id} className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <CreditCard className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <p className="font-medium text-sm">{tender.name}</p>
                            <p className="text-xs text-muted-foreground">{tender.count} transactions</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="font-medium">{formatCurrency(tender.amount)}</span>
                          <p className="text-xs text-muted-foreground">{tender.percentage.toFixed(1)}%</p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-muted-foreground text-center py-4">No tender data</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="operations" className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 py-3">
                <CardTitle className="text-sm font-medium">Total Checks</CardTitle>
                <Receipt className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{salesSummary?.checkCount || 0}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 py-3">
                <CardTitle className="text-sm font-medium">Open Checks</CardTitle>
                <Clock className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{salesSummary?.openCheckCount || 0}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 py-3">
                <CardTitle className="text-sm font-medium">Total Guests</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{salesSummary?.guestCount || 0}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 py-3">
                <CardTitle className="text-sm font-medium">Avg Per Guest</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCurrency(salesSummary?.avgPerGuest || 0)}</div>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-sm">Top Selling Items</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {topItems.length > 0 ? (
                    topItems.map((item, index) => (
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

            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-sm">Hourly Activity</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={hourlySales.filter(h => h.sales > 0 || h.checkCount > 0)}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="hour" tickFormatter={formatHour} className="text-xs" />
                      <YAxis className="text-xs" />
                      <Tooltip labelFormatter={(hour) => formatHour(hour as number)} />
                      <Bar dataKey="checkCount" fill="#10B981" radius={[4, 4, 0, 0]} name="Checks" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
