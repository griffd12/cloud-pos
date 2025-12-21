import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { DollarSign, Users, Receipt, TrendingUp, Clock, ShoppingCart, CreditCard, Percent } from "lucide-react";
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
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>("all");
  const [selectedRvcId, setSelectedRvcId] = useState<string>("all");
  const [dateRange, setDateRange] = useState<string>("today");

  const { data: properties = [] } = useQuery<Property[]>({
    queryKey: ["/api/properties"],
  });

  const { data: rvcs = [] } = useQuery<Rvc[]>({
    queryKey: ["/api/rvcs"],
  });

  const getDateParams = () => {
    const now = new Date();
    let startDate = new Date(now);
    startDate.setHours(0, 0, 0, 0);
    
    switch (dateRange) {
      case "yesterday":
        startDate.setDate(startDate.getDate() - 1);
        const endYesterday = new Date(startDate);
        endYesterday.setHours(23, 59, 59, 999);
        return { startDate: startDate.toISOString(), endDate: endYesterday.toISOString() };
      case "week":
        startDate.setDate(startDate.getDate() - 7);
        break;
      case "month":
        startDate.setMonth(startDate.getMonth() - 1);
        break;
    }
    return { startDate: startDate.toISOString(), endDate: now.toISOString() };
  };

  const buildQueryParams = () => {
    const params = new URLSearchParams();
    const { startDate, endDate } = getDateParams();
    params.set("startDate", startDate);
    params.set("endDate", endDate);
    if (selectedPropertyId !== "all") params.set("propertyId", selectedPropertyId);
    if (selectedRvcId !== "all") params.set("rvcId", selectedRvcId);
    return params.toString();
  };

  const { data: salesSummary, isLoading: summaryLoading } = useQuery<SalesSummary>({
    queryKey: ["/api/reports/sales-summary", buildQueryParams()],
  });

  const { data: categorySales = [] } = useQuery<CategorySale[]>({
    queryKey: ["/api/reports/sales-by-category", buildQueryParams()],
  });

  const { data: topItems = [] } = useQuery<TopItem[]>({
    queryKey: ["/api/reports/top-items", buildQueryParams()],
  });

  const { data: tenderMix = [] } = useQuery<TenderMix[]>({
    queryKey: ["/api/reports/tender-mix", buildQueryParams()],
  });

  const { data: hourlySales = [] } = useQuery<HourlySale[]>({
    queryKey: ["/api/reports/hourly-sales", `date=${new Date().toISOString().split("T")[0]}&${selectedPropertyId !== "all" ? `propertyId=${selectedPropertyId}` : ""}`],
  });

  const filteredRvcs = selectedPropertyId !== "all" 
    ? rvcs.filter(r => r.propertyId === selectedPropertyId) 
    : rvcs;

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Reports Dashboard</h1>
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
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
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
    </div>
  );
}
