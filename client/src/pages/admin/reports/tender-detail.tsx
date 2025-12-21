import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useSearch, Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, CreditCard, DollarSign, Receipt, Banknote, Smartphone } from "lucide-react";
import { type Property, type Rvc } from "@shared/schema";

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

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
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
    case "credit_card":
      return <CreditCard className="h-4 w-4" />;
    case "mobile":
      return <Smartphone className="h-4 w-4" />;
    default:
      return <DollarSign className="h-4 w-4" />;
  }
}

export default function TenderDetailReport() {
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

  const { data: tenderData, isLoading } = useQuery<TenderDetailData>({
    queryKey: ["/api/reports/tender-detail", queryParams],
    queryFn: async () => {
      const res = await fetch(`/api/reports/tender-detail?${queryParams}`);
      if (!res.ok) throw new Error("Failed to fetch tender detail");
      return res.json();
    },
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/admin/reports">
          <Button variant="ghost" size="icon" data-testid="button-back-reports">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-semibold">Tender Detail Report</h1>
          <p className="text-sm text-muted-foreground">Payment transactions breakdown</p>
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
            <CardTitle className="text-sm font-medium">Tender Types</CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-tender-types">
              {tenderData?.summary?.length || 0}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-base">Summary by Tender</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-muted-foreground text-sm">Loading...</div>
            ) : (
              <div className="space-y-3">
                {tenderData?.summary?.map((s) => (
                  <div key={s.name} className="flex items-center justify-between p-2 rounded-md bg-muted/50">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{s.count}</Badge>
                      <span className="font-medium">{s.name}</span>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold">{formatCurrency(s.amount)}</div>
                      {s.tips > 0 && (
                        <div className="text-xs text-muted-foreground">+{formatCurrency(s.tips)} tips</div>
                      )}
                    </div>
                  </div>
                ))}
                {(!tenderData?.summary || tenderData.summary.length === 0) && (
                  <div className="text-muted-foreground text-sm">No data available</div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Transaction Details</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-muted-foreground text-sm">Loading...</div>
            ) : (
              <div className="max-h-[400px] overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Check #</TableHead>
                      <TableHead>Tender</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="text-right">Tip</TableHead>
                      <TableHead>Employee</TableHead>
                      <TableHead>Time</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tenderData?.transactions?.map((t) => (
                      <TableRow key={t.id} data-testid={`row-transaction-${t.id}`}>
                        <TableCell className="font-medium">{t.checkNumber}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {getTenderIcon(t.tenderType)}
                            {t.tenderName}
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-medium">{formatCurrency(t.amount)}</TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {t.tipAmount > 0 ? formatCurrency(t.tipAmount) : "-"}
                        </TableCell>
                        <TableCell>{t.employeeName}</TableCell>
                        <TableCell className="text-muted-foreground">{formatDateTime(t.paidAt)}</TableCell>
                      </TableRow>
                    ))}
                    {(!tenderData?.transactions || tenderData.transactions.length === 0) && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground">
                          No transactions found
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
    </div>
  );
}
