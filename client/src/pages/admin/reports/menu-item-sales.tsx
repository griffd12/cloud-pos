import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearch, Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, ShoppingCart, DollarSign, Package, TrendingUp } from "lucide-react";
import { type Property, type Rvc } from "@shared/schema";

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

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

export default function MenuItemSalesReport() {
  const searchString = useSearch();
  const params = new URLSearchParams(searchString);
  
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>(params.get("propertyId") || "all");
  const [selectedRvcId, setSelectedRvcId] = useState<string>(params.get("rvcId") || "all");
  const [dateRange, setDateRange] = useState<string>(params.get("dateRange") || "today");

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
        start.setDate(start.getDate() - 30);
        return { startDate: start.toISOString(), endDate: todayEnd.toISOString() };
      }
      default:
        return { startDate: todayStart.toISOString(), endDate: todayEnd.toISOString() };
    }
  }, [dateRange]);

  const queryParams = useMemo(() => {
    const p = new URLSearchParams();
    p.append("startDate", dateParams.startDate);
    p.append("endDate", dateParams.endDate);
    if (selectedPropertyId !== "all") p.append("propertyId", selectedPropertyId);
    if (selectedRvcId !== "all") p.append("rvcId", selectedRvcId);
    return p.toString();
  }, [dateParams, selectedPropertyId, selectedRvcId]);

  const { data: salesData, isLoading } = useQuery<MenuItemSalesData>({
    queryKey: ["/api/reports/menu-item-sales", queryParams],
    queryFn: async () => {
      const res = await fetch(`/api/reports/menu-item-sales?${queryParams}`);
      if (!res.ok) throw new Error("Failed to fetch menu item sales");
      return res.json();
    },
  });

  const avgItemPrice = salesData && salesData.totalQuantity > 0 
    ? salesData.totalSales / salesData.totalQuantity 
    : 0;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/admin/reports">
          <Button variant="ghost" size="icon" data-testid="button-back-reports">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-semibold">Menu Item Sales Report</h1>
          <p className="text-sm text-muted-foreground">Item-level sales breakdown</p>
        </div>
      </div>

      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1.5">
              <Label>Date Range</Label>
              <Select value={dateRange} onValueChange={setDateRange}>
                <SelectTrigger className="w-[140px]" data-testid="select-date-range">
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

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Sales</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-sales">
              {formatCurrency(salesData?.totalSales || 0)}
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
              {salesData?.totalQuantity || 0}
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
              {salesData?.itemCount || 0}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Item Price</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-avg-price">
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
          {isLoading ? (
            <div className="text-muted-foreground text-sm">Loading...</div>
          ) : (
            <div className="max-h-[500px] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item Name</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Qty Sold</TableHead>
                    <TableHead className="text-right">Avg Price</TableHead>
                    <TableHead className="text-right">Total Sales</TableHead>
                    <TableHead className="text-right">% of Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {salesData?.items?.map((item, index) => {
                    const pctOfTotal = salesData.totalSales > 0 
                      ? (item.netSales / salesData.totalSales * 100) 
                      : 0;
                    return (
                      <TableRow key={item.id} data-testid={`row-item-${item.id}`}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {index < 3 && (
                              <Badge variant="secondary" className="text-xs">#{index + 1}</Badge>
                            )}
                            <span className="font-medium">{item.name}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{item.category}</Badge>
                        </TableCell>
                        <TableCell className="text-right">{item.quantity}</TableCell>
                        <TableCell className="text-right">{formatCurrency(item.avgPrice)}</TableCell>
                        <TableCell className="text-right font-medium">{formatCurrency(item.netSales)}</TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {pctOfTotal.toFixed(1)}%
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {(!salesData?.items || salesData.items.length === 0) && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground">
                        No items sold in this period
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
