import { useState, useMemo, useEffect, Fragment } from "react";
import { useQuery } from "@tanstack/react-query";
import { useEmcFilter } from "@/lib/emc-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  FileText, DollarSign, Users, Banknote, Clock, Printer, Coins,
  CheckCircle2, AlertTriangle, ShieldCheck, Activity, Info, ChevronRight, ChevronDown
} from "lucide-react";
import type { Property } from "@shared/schema";

const EMC_SESSION_KEY = "emc_session_token";
const DEVICE_TOKEN_KEY = "pos_device_token";

function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  const emcToken = sessionStorage.getItem(EMC_SESSION_KEY);
  if (emcToken) headers["X-EMC-Session"] = emcToken;
  const deviceToken = localStorage.getItem(DEVICE_TOKEN_KEY);
  if (deviceToken) headers["X-Device-Token"] = deviceToken;
  return headers;
}

async function authFetch(url: string): Promise<Response> {
  return fetch(url, { headers: getAuthHeaders() });
}

function formatCurrency(val: number | undefined | null): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(val ?? 0);
}

function formatPercent(val: number | undefined | null): string {
  return `${(val ?? 0).toFixed(1)}%`;
}

function formatLocalDate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function getDatePreset(preset: string, currentBusinessDate?: string): string {
  const base = currentBusinessDate ? new Date(currentBusinessDate + "T12:00:00") : new Date();
  const d = new Date(base);

  switch (preset) {
    case "today":
      return formatLocalDate(d);
    case "yesterday":
      d.setDate(d.getDate() - 1);
      return formatLocalDate(d);
    case "this-week-start": {
      const day = d.getDay();
      d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
      return formatLocalDate(d);
    }
    case "last-week-start": {
      const day = d.getDay();
      d.setDate(d.getDate() - (day === 0 ? 6 : day - 1) - 7);
      return formatLocalDate(d);
    }
    case "this-month-start":
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
    case "last-month-start": {
      d.setMonth(d.getMonth() - 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
    }
    case "this-qtr-start": {
      const qMonth = Math.floor(d.getMonth() / 3) * 3;
      return `${d.getFullYear()}-${String(qMonth + 1).padStart(2, "0")}-01`;
    }
    case "last-qtr-start": {
      let qMonth = Math.floor(d.getMonth() / 3) * 3 - 3;
      let year = d.getFullYear();
      if (qMonth < 0) { qMonth += 12; year--; }
      return `${year}-${String(qMonth + 1).padStart(2, "0")}-01`;
    }
    case "this-year-start":
      return `${d.getFullYear()}-01-01`;
    case "last-year-start":
      return `${d.getFullYear() - 1}-01-01`;
    case "ytd-start":
      return `${d.getFullYear()}-01-01`;
    default:
      return formatLocalDate(d);
  }
}

const DATE_PRESETS = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "this-week-start", label: "This Week" },
  { value: "last-week-start", label: "Last Week" },
  { value: "this-month-start", label: "This Month" },
  { value: "last-month-start", label: "Last Month" },
  { value: "this-qtr-start", label: "This Quarter" },
  { value: "last-qtr-start", label: "Last Quarter" },
  { value: "this-year-start", label: "This Year" },
  { value: "last-year-start", label: "Last Year" },
  { value: "ytd-start", label: "YTD" },
];

function ReportSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{title}</h3>
      <div>{children}</div>
    </div>
  );
}

function SummaryRow({ label, value, bold, negative, highlight, indent, muted }: {
  label: string; value: string; bold?: boolean; negative?: boolean; highlight?: boolean; indent?: boolean; muted?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between gap-2 py-0.5 ${bold ? "font-semibold" : ""} ${highlight ? "bg-muted/50 -mx-2 px-2 rounded" : ""}`}>
      <span className={`text-sm ${indent ? "pl-4" : ""} ${muted ? "text-muted-foreground italic" : ""}`}>{label}</span>
      <span className={`text-sm tabular-nums ${negative ? "text-destructive" : ""} ${muted ? "text-muted-foreground italic" : ""}`}>{value}</span>
    </div>
  );
}

function ReconciliationStatus({ customerTotal, totalPayments, delta: propDelta, changeDue, netCollected }: { customerTotal: number; totalPayments: number; delta?: number; changeDue?: number; netCollected?: number }) {
  const effectiveNet = netCollected !== undefined ? netCollected : totalPayments;
  const delta = propDelta !== undefined ? propDelta : Math.round((effectiveNet - customerTotal) * 100) / 100;
  const balanced = Math.abs(delta) <= 0.02;
  return (
    <div className={`border rounded-md p-3 ${balanced ? "border-green-500/30 bg-green-500/5" : "border-destructive/30 bg-destructive/5"}`}>
      <div className="flex items-center gap-2 mb-2">
        {balanced ? (
          <CheckCircle2 className="h-4 w-4 text-green-600" />
        ) : (
          <AlertTriangle className="h-4 w-4 text-destructive" />
        )}
        <span className={`text-sm font-semibold ${balanced ? "text-green-600" : "text-destructive"}`}>
          {balanced ? "BALANCED" : "OUT OF BALANCE"}
        </span>
      </div>
      <SummaryRow label="Customer Total" value={formatCurrency(customerTotal)} bold />
      <SummaryRow label="Total Payments (Tendered)" value={formatCurrency(totalPayments)} bold />
      {(changeDue !== undefined && changeDue > 0) && (
        <SummaryRow label="Less: Change Due" value={formatCurrency(-changeDue)} muted />
      )}
      {netCollected !== undefined && (changeDue !== undefined && changeDue > 0) && (
        <SummaryRow label="Net Collected" value={formatCurrency(netCollected)} bold highlight />
      )}
      <Separator className="my-1" />
      <SummaryRow label="Difference" value={formatCurrency(delta)} bold negative={!balanced} />
    </div>
  );
}

interface ProductMixItem {
  itemName: string;
  majorGroup: string;
  quantity: number;
  grossSales: number;
  netSales: number;
}

function ProductMixByCategory({ items }: { items: ProductMixItem[] }) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const grouped = useMemo(() => {
    const map = new Map<string, { items: ProductMixItem[]; totalQty: number; totalGross: number; totalNet: number }>();
    for (const item of items) {
      const group = item.majorGroup || "Uncategorized";
      const existing = map.get(group);
      if (existing) {
        existing.items.push(item);
        existing.totalQty += item.quantity;
        existing.totalGross += item.grossSales;
        existing.totalNet += item.netSales;
      } else {
        map.set(group, {
          items: [item],
          totalQty: item.quantity,
          totalGross: item.grossSales,
          totalNet: item.netSales,
        });
      }
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [items]);

  const toggleGroup = (group: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(group)) {
        next.delete(group);
      } else {
        next.add(group);
      }
      return next;
    });
  };

  return (
    <Card>
      <CardHeader className="py-3">
        <CardTitle className="text-sm">Product Mix</CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="w-full">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Category / Item</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Gross</TableHead>
                <TableHead className="text-right">Net</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {grouped.map(([groupName, group]) => {
                const isExpanded = expandedGroups.has(groupName);
                return (
                  <Fragment key={groupName}>
                    <TableRow
                      className="cursor-pointer hover-elevate"
                      onClick={() => toggleGroup(groupName)}
                      data-testid={`row-pmix-group-${groupName}`}
                    >
                      <TableCell className="font-semibold">
                        <span className="flex items-center gap-1">
                          {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          {groupName}
                        </span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-semibold">{group.totalQty}</TableCell>
                      <TableCell className="text-right tabular-nums font-semibold">{formatCurrency(group.totalGross)}</TableCell>
                      <TableCell className="text-right tabular-nums font-semibold">{formatCurrency(group.totalNet)}</TableCell>
                    </TableRow>
                    {isExpanded && group.items.map((p, i) => (
                      <TableRow key={`${groupName}-${i}`} data-testid={`row-pmix-${groupName}-${i}`}>
                        <TableCell className="pl-10 text-muted-foreground">{p.itemName}</TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">{p.quantity}</TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">{formatCurrency(p.grossSales)}</TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">{formatCurrency(p.netSales)}</TableCell>
                      </TableRow>
                    ))}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

export default function DailyOperationsPage() {
  const emcFilter = useEmcFilter();
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>("");
  const [businessDate, setBusinessDate] = useState<string>(formatLocalDate(new Date()));
  const [activeTab, setActiveTab] = useState("daily-sales");

  const { data: allProperties } = useQuery<Property[]>({
    queryKey: ["/api/properties"],
  });

  const properties = useMemo(() => {
    if (!allProperties) return [];
    if (emcFilter?.selectedEnterpriseId) {
      return allProperties.filter(p => p.enterpriseId === emcFilter.selectedEnterpriseId);
    }
    return allProperties;
  }, [allProperties, emcFilter?.selectedEnterpriseId]);

  const effectivePropertyId = useMemo(() => {
    const candidate = selectedPropertyId || emcFilter?.selectedPropertyId || "";
    if (candidate && properties.some(p => p.id === candidate)) {
      return candidate;
    }
    return properties[0]?.id ?? "";
  }, [selectedPropertyId, emcFilter?.selectedPropertyId, properties]);

  const selectedProperty = useMemo(() => {
    return properties?.find(p => p.id === effectivePropertyId);
  }, [properties, effectivePropertyId]);

  useEffect(() => {
    if (selectedProperty?.currentBusinessDate) {
      setBusinessDate(selectedProperty.currentBusinessDate);
    }
  }, [selectedProperty?.id, selectedProperty?.currentBusinessDate]);

  const queryParams = `propertyId=${effectivePropertyId}&businessDate=${businessDate}`;

  const { data: zReport, isLoading: zLoading } = useQuery({
    queryKey: ["/api/reports/z-report", effectivePropertyId, businessDate],
    queryFn: () => authFetch(`/api/reports/z-report?${queryParams}`).then(r => r.json()),
    enabled: !!effectivePropertyId && activeTab === "financial-close",
  });

  const { data: activityReport, isLoading: activityLoading } = useQuery({
    queryKey: ["/api/reports/business-day-activity", effectivePropertyId, businessDate],
    queryFn: () => authFetch(`/api/reports/business-day-activity?${queryParams}`).then(r => r.json()),
    enabled: !!effectivePropertyId && activeTab === "activity",
  });

  const { data: cashierReport, isLoading: cashierLoading } = useQuery({
    queryKey: ["/api/reports/cashier-report", effectivePropertyId, businessDate],
    queryFn: () => authFetch(`/api/reports/cashier-report?${queryParams}`).then(r => r.json()),
    enabled: !!effectivePropertyId && activeTab === "cashier",
  });

  const { data: dailySales, isLoading: salesLoading } = useQuery({
    queryKey: ["/api/reports/daily-sales-summary", effectivePropertyId, businessDate],
    queryFn: () => authFetch(`/api/reports/daily-sales-summary?${queryParams}`).then(r => r.json()),
    enabled: !!effectivePropertyId && activeTab === "daily-sales",
  });

  const { data: laborSummary, isLoading: laborLoading } = useQuery({
    queryKey: ["/api/reports/labor-summary", effectivePropertyId, businessDate],
    queryFn: () => authFetch(`/api/reports/labor-summary?${queryParams}`).then(r => r.json()),
    enabled: !!effectivePropertyId && activeTab === "labor",
  });

  const { data: tipPoolSummary, isLoading: tipLoading } = useQuery({
    queryKey: ["/api/reports/tip-pool-summary", effectivePropertyId, businessDate],
    queryFn: () => authFetch(`/api/reports/tip-pool-summary?${queryParams}`).then(r => r.json()),
    enabled: !!effectivePropertyId && activeTab === "tip-pool",
  });

  const { data: validation, isLoading: validLoading } = useQuery({
    queryKey: ["/api/reports/validate", effectivePropertyId, businessDate],
    queryFn: () => authFetch(`/api/reports/validate?${queryParams}`).then(r => r.json()),
    enabled: !!effectivePropertyId && activeTab === "validation",
  });

  const handlePrint = () => window.print();

  if (!properties?.length) {
    return (
      <div className="p-6">
        <div className="py-8 text-center text-muted-foreground">No properties configured. Set up a property first.</div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-daily-ops-title">Daily Operations Reports</h1>
          <p className="text-muted-foreground text-sm">Oracle Simphony-compliant FOH/BOH reports with enterprise reconciliation</p>
        </div>
        <Button variant="outline" onClick={handlePrint} data-testid="button-print-report">
          <Printer className="h-4 w-4 mr-2" />
          Print Report
        </Button>
      </div>

      <Card>
        <CardContent className="pt-4 pb-3">
          <div className="flex items-end gap-4 flex-wrap">
            <div className="space-y-1.5">
              <Label>Property</Label>
              <Select value={effectivePropertyId} onValueChange={setSelectedPropertyId}>
                <SelectTrigger className="w-[220px]" data-testid="select-ops-property">
                  <SelectValue placeholder="Select property" />
                </SelectTrigger>
                <SelectContent>
                  {properties.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Quick Select</Label>
              <Select
                value=""
                onValueChange={(preset) => {
                  const date = getDatePreset(preset, selectedProperty?.currentBusinessDate || undefined);
                  setBusinessDate(date);
                }}
              >
                <SelectTrigger className="w-[160px]" data-testid="select-date-preset">
                  <SelectValue placeholder="Choose period" />
                </SelectTrigger>
                <SelectContent>
                  {DATE_PRESETS.map((p) => (
                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Business Date</Label>
              <Input
                type="date"
                value={businessDate}
                onChange={(e) => setBusinessDate(e.target.value)}
                className="w-[180px]"
                data-testid="input-ops-date"
              />
            </div>

            <Badge variant="outline" className="text-sm px-3 py-1.5 ml-auto">
              <Clock className="h-3.5 w-3.5 mr-2" />
              {selectedProperty?.name || "Property"} - {businessDate}
            </Badge>
          </div>
        </CardContent>
      </Card>

      <div className="print:hidden">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="flex-wrap h-auto gap-1" data-testid="tabs-daily-ops">
            <TabsTrigger value="daily-sales" data-testid="tab-daily-sales">
              <DollarSign className="h-4 w-4 mr-2" />
              Daily Sales
            </TabsTrigger>
            <TabsTrigger value="cashier" data-testid="tab-cashier">
              <Users className="h-4 w-4 mr-2" />
              Cashier
            </TabsTrigger>
            <TabsTrigger value="activity" data-testid="tab-activity">
              <Activity className="h-4 w-4 mr-2" />
              Activity
            </TabsTrigger>
            <TabsTrigger value="labor" data-testid="tab-labor">
              <Clock className="h-4 w-4 mr-2" />
              Labor Summary
            </TabsTrigger>
            <TabsTrigger value="tip-pool" data-testid="tab-tip-pool">
              <Coins className="h-4 w-4 mr-2" />
              Tip Pool
            </TabsTrigger>
            <TabsTrigger value="financial-close" data-testid="tab-financial-close">
              <FileText className="h-4 w-4 mr-2" />
              Financial Close
            </TabsTrigger>
            <TabsTrigger value="validation" data-testid="tab-validation">
              <ShieldCheck className="h-4 w-4 mr-2" />
              Validation
            </TabsTrigger>
          </TabsList>

          {/* ========== FINANCIAL CLOSE (Report 1) ========== */}
          <TabsContent value="financial-close">
            {zLoading ? (
              <Card><CardContent className="py-8 text-center text-muted-foreground">Loading Financial Close...</CardContent></Card>
            ) : zReport ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="py-3">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <CardTitle className="text-lg">Daily Financial Close</CardTitle>
                      <div className="text-sm text-muted-foreground">
                        {selectedProperty?.name} - {zReport.businessDate}
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">Closed checks only (status = closed)</p>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <ReportSection title="Section A - Sales">
                      <SummaryRow label="Gross Sales" value={formatCurrency(zReport.grossSales)} />
                      <SummaryRow label="Item Discounts" value={`(${formatCurrency(zReport.itemDiscounts)})`} negative indent />
                      <SummaryRow label="Check Discounts" value={`(${formatCurrency(zReport.checkDiscounts)})`} negative indent />
                      <SummaryRow label="Total Discounts" value={`(${formatCurrency(zReport.totalDiscounts)})`} negative />
                      <Separator className="my-1" />
                      <SummaryRow label="Net Sales" value={formatCurrency(zReport.netSales)} bold highlight />
                    </ReportSection>

                    <ReportSection title="Section B - Additions">
                      <SummaryRow label="Tax (Item)" value={formatCurrency(zReport.itemTax)} indent />
                      <SummaryRow label="Tax (Service Charge)" value={formatCurrency(zReport.serviceChargeTax)} indent />
                      <SummaryRow label="Total Tax" value={formatCurrency(zReport.totalTax)} />
                      <SummaryRow label="Service Charges" value={formatCurrency(zReport.serviceCharges)} />
                      <Separator className="my-1" />
                      <SummaryRow label="Total Revenue" value={formatCurrency(zReport.totalRevenue)} bold />
                      <p className="text-xs text-muted-foreground">Net Sales + Tax + Service Charges (tips NOT included)</p>
                    </ReportSection>

                    <ReportSection title="Section C - Tips (Liability)">
                      <SummaryRow label="Card Tips" value={formatCurrency(zReport.cardTips)} />
                    </ReportSection>

                    <Separator />
                    <SummaryRow label="Customer Total" value={formatCurrency(zReport.customerTotal)} bold highlight />
                    <p className="text-xs text-muted-foreground">Net Sales + Tax + Service Charges + Card Tips</p>
                  </CardContent>
                </Card>

                <div className="space-y-4">
                  <Card>
                    <CardHeader className="py-3">
                      <CardTitle className="text-sm">Section D - Payments</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {zReport.tenderBreakdown?.map((t: any, i: number) => (
                        <SummaryRow key={i} label={t.tenderName} value={formatCurrency(t.amount)} />
                      ))}
                      <Separator className="my-1" />
                      <SummaryRow label="Total Tendered" value={formatCurrency(zReport.totalCollected)} bold />
                      {(zReport.changeDue > 0) && (
                        <>
                          <SummaryRow label="Less: Change Due" value={formatCurrency(-zReport.changeDue)} muted />
                          <SummaryRow label="Net Collected" value={formatCurrency(zReport.netCollected)} bold highlight />
                        </>
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="py-3">
                      <CardTitle className="text-sm">Section E - Reconciliation</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ReconciliationStatus
                        customerTotal={zReport.customerTotal || 0}
                        totalPayments={zReport.totalCollected || 0}
                        changeDue={zReport.changeDue || 0}
                        netCollected={zReport.netCollected}
                        delta={zReport.reconciliationDelta}
                      />
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="py-3">
                      <CardTitle className="text-sm">Operational Metrics</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-1">
                      <SummaryRow label="Closed Checks" value={String(zReport.checkCount || 0)} />
                      <SummaryRow label="Voids" value={`${zReport.voidCount || 0} items`} />
                      <SummaryRow label="Void Amount" value={formatCurrency(zReport.voidAmount)} negative={!!zReport.voidAmount} />
                      {(zReport.checkCount || 0) > 0 && (
                        <SummaryRow
                          label="Avg Check"
                          value={formatCurrency((zReport.netSales || 0) / (zReport.checkCount || 1))}
                        />
                      )}
                    </CardContent>
                  </Card>
                </div>
              </div>
            ) : (
              <Card><CardContent className="py-8 text-center text-muted-foreground">Select a property and date to generate Financial Close</CardContent></Card>
            )}
          </TabsContent>

          {/* ========== BUSINESS DAY ACTIVITY (Report 2) ========== */}
          <TabsContent value="activity">
            {activityLoading ? (
              <Card><CardContent className="py-8 text-center text-muted-foreground">Loading Activity Report...</CardContent></Card>
            ) : activityReport ? (
              <div className="space-y-4">
                <Card>
                  <CardHeader className="py-3">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <CardTitle className="text-lg">Business Day Activity</CardTitle>
                      <div className="text-sm text-muted-foreground">
                        {selectedProperty?.name} - {activityReport.businessDate}
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">All check statuses - operational flow (does not need to balance)</p>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="border rounded-md p-3 space-y-1">
                        <p className="text-xs text-muted-foreground uppercase">Carried In</p>
                        <p className="text-2xl font-bold tabular-nums" data-testid="text-activity-carried-in">{activityReport.carriedIn?.count || 0}</p>
                        <p className="text-sm text-muted-foreground">{formatCurrency(activityReport.carriedIn?.amount)}</p>
                      </div>
                      <div className="border rounded-md p-3 space-y-1">
                        <p className="text-xs text-muted-foreground uppercase">Started</p>
                        <p className="text-2xl font-bold tabular-nums" data-testid="text-activity-started">{activityReport.checksStarted?.count || 0}</p>
                        <p className="text-sm text-muted-foreground">{formatCurrency(activityReport.checksStarted?.amount)}</p>
                      </div>
                      <div className="border rounded-md p-3 space-y-1 border-green-500/30">
                        <p className="text-xs text-muted-foreground uppercase">Closed</p>
                        <p className="text-2xl font-bold tabular-nums text-green-600" data-testid="text-activity-closed">{activityReport.checksClosed?.count || 0}</p>
                        <p className="text-sm text-muted-foreground">{formatCurrency(activityReport.checksClosed?.amount)}</p>
                      </div>
                      <div className={`border rounded-md p-3 space-y-1 ${(activityReport.checksOutstanding?.count || 0) > 0 ? "border-amber-500/30" : ""}`}>
                        <p className="text-xs text-muted-foreground uppercase">Outstanding</p>
                        <p className={`text-2xl font-bold tabular-nums ${(activityReport.checksOutstanding?.count || 0) > 0 ? "text-amber-600" : ""}`} data-testid="text-activity-outstanding">{activityReport.checksOutstanding?.count || 0}</p>
                        <p className="text-sm text-muted-foreground">{formatCurrency(activityReport.checksOutstanding?.amount)}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {(activityReport.checksOutstanding?.checks?.length || 0) > 0 && (
                  <Card>
                    <CardHeader className="py-3">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-amber-600" />
                        <CardTitle className="text-sm">Outstanding Checks</CardTitle>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Check #</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Amount</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {activityReport.checksOutstanding.checks.map((c: any, i: number) => (
                            <TableRow key={i} data-testid={`row-outstanding-${i}`}>
                              <TableCell className="font-medium">#{c.checkNumber}</TableCell>
                              <TableCell>
                                <Badge variant="outline">{c.status}</Badge>
                              </TableCell>
                              <TableCell className="text-right tabular-nums">{formatCurrency(c.amount)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                )}

                {(activityReport.carriedIn?.checks?.length || 0) > 0 && (
                  <Card>
                    <CardHeader className="py-3">
                      <div className="flex items-center gap-2">
                        <Info className="h-4 w-4 text-muted-foreground" />
                        <CardTitle className="text-sm">Carried-In Checks (from prior business dates)</CardTitle>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Check #</TableHead>
                            <TableHead>Original Date</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Amount</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {activityReport.carriedIn.checks.map((c: any, i: number) => (
                            <TableRow key={i} data-testid={`row-carried-in-${i}`}>
                              <TableCell className="font-medium">#{c.checkNumber}</TableCell>
                              <TableCell>{c.businessDate}</TableCell>
                              <TableCell>
                                <Badge variant="outline">{c.status}</Badge>
                              </TableCell>
                              <TableCell className="text-right tabular-nums">{formatCurrency(c.amount)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                )}
              </div>
            ) : (
              <Card><CardContent className="py-8 text-center text-muted-foreground">Select a property and date</CardContent></Card>
            )}
          </TabsContent>

          {/* ========== CASHIER REPORT ========== */}
          <TabsContent value="cashier">
            {cashierLoading ? (
              <Card><CardContent className="py-8 text-center text-muted-foreground">Loading Cashier Report...</CardContent></Card>
            ) : cashierReport && Array.isArray(cashierReport) ? (
              <div className="space-y-4">
                <Card>
                  <CardHeader className="py-3">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <CardTitle className="text-lg">Cashier Report</CardTitle>
                      <div className="text-sm text-muted-foreground">
                        {selectedProperty?.name} - {businessDate} (closed checks)
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div className="space-y-0.5 text-sm">
                        <p className="text-muted-foreground">Cashiers</p>
                        <p className="font-medium text-lg" data-testid="text-cashier-count">{cashierReport.length}</p>
                      </div>
                      <div className="space-y-0.5 text-sm">
                        <p className="text-muted-foreground">Net Sales</p>
                        <p className="font-medium text-lg" data-testid="text-cashier-net">
                          {formatCurrency(cashierReport.reduce((s: number, c: any) => s + (c.netSales || 0), 0))}
                        </p>
                      </div>
                      <div className="space-y-0.5 text-sm">
                        <p className="text-muted-foreground">Total Collected</p>
                        <p className="font-medium text-lg" data-testid="text-cashier-collected">
                          {formatCurrency(cashierReport.reduce((s: number, c: any) => s + (c.totalCollected || 0), 0))}
                        </p>
                      </div>
                      <div className="space-y-0.5 text-sm">
                        <p className="text-muted-foreground">Card Tips</p>
                        <p className="font-medium text-lg">
                          {formatCurrency(cashierReport.reduce((s: number, c: any) => s + (c.cardTips || 0), 0))}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {cashierReport.length > 0 && (
                  <Card>
                    <CardHeader className="py-3">
                      <CardTitle className="text-sm">By Cashier</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ScrollArea className="w-full">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Cashier</TableHead>
                              <TableHead className="text-right">Checks</TableHead>
                              <TableHead className="text-right">Net</TableHead>
                              <TableHead className="text-right">Tax</TableHead>
                              <TableHead className="text-right">Svc Chg</TableHead>
                              <TableHead className="text-right">Card Tips</TableHead>
                              <TableHead className="text-right">Cust Total</TableHead>
                              <TableHead className="text-right">Collected</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {cashierReport.map((c: any, i: number) => {
                              const delta = Math.abs((c.customerTotal || 0) - (c.totalCollected || 0));
                              return (
                                <TableRow key={i} data-testid={`row-cashier-${i}`}>
                                  <TableCell className="font-medium">{c.employeeId?.substring(0, 8) || `Cashier ${i + 1}`}</TableCell>
                                  <TableCell className="text-right tabular-nums">{c.checksOpened}</TableCell>
                                  <TableCell className="text-right tabular-nums">{formatCurrency(c.netSales)}</TableCell>
                                  <TableCell className="text-right tabular-nums">{formatCurrency(c.tax)}</TableCell>
                                  <TableCell className="text-right tabular-nums">{formatCurrency(c.serviceCharges)}</TableCell>
                                  <TableCell className="text-right tabular-nums">{formatCurrency(c.cardTips)}</TableCell>
                                  <TableCell className="text-right tabular-nums font-medium">{formatCurrency(c.customerTotal)}</TableCell>
                                  <TableCell className={`text-right tabular-nums font-medium ${delta > 0.02 ? "text-destructive" : ""}`}>{formatCurrency(c.totalCollected)}</TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </ScrollArea>
                    </CardContent>
                  </Card>
                )}
              </div>
            ) : (
              <Card><CardContent className="py-8 text-center text-muted-foreground">Select a property and date</CardContent></Card>
            )}
          </TabsContent>

          {/* ========== DAILY SALES SUMMARY ========== */}
          <TabsContent value="daily-sales">
            {salesLoading ? (
              <Card><CardContent className="py-8 text-center text-muted-foreground">Loading Daily Sales Summary...</CardContent></Card>
            ) : dailySales ? (
              <div className="space-y-4">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <Card>
                    <CardHeader className="py-3">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <CardTitle className="text-lg">Daily Sales Summary</CardTitle>
                        <div className="text-sm text-muted-foreground">
                          {selectedProperty?.name} - {dailySales.businessDate}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <ReportSection title="Sales">
                        <SummaryRow label="Gross Sales" value={formatCurrency(dailySales.grossSales)} />
                        <SummaryRow label="Item Discounts" value={`(${formatCurrency(dailySales.itemDiscounts)})`} negative indent />
                        <SummaryRow label="Check Discounts" value={`(${formatCurrency(dailySales.checkDiscounts)})`} negative indent />
                        <SummaryRow label="Total Discounts" value={`(${formatCurrency(dailySales.totalDiscounts)})`} negative />
                        <Separator className="my-1" />
                        <SummaryRow label="Net Sales" value={formatCurrency(dailySales.netSales)} bold highlight />
                      </ReportSection>

                      <ReportSection title="Additions">
                        <SummaryRow label="Total Tax" value={formatCurrency(dailySales.totalTax)} />
                        <SummaryRow label="Service Charges" value={formatCurrency(dailySales.serviceCharges)} />
                        <Separator className="my-1" />
                        <SummaryRow label="Total Revenue" value={formatCurrency(dailySales.totalRevenue)} bold />
                      </ReportSection>

                      <ReportSection title="Tips">
                        <SummaryRow label="Card Tips" value={formatCurrency(dailySales.cardTips)} />
                      </ReportSection>

                      <Separator />
                      <SummaryRow label="Customer Total" value={formatCurrency(dailySales.customerTotal)} bold highlight />
                      <p className="text-xs text-muted-foreground">Net Sales + Tax + Service Charges + Card Tips</p>
                      <ReconciliationStatus
                        customerTotal={dailySales.customerTotal || 0}
                        totalPayments={dailySales.totalCollected || 0}
                        changeDue={dailySales.changeDue || 0}
                        netCollected={dailySales.netCollected}
                        delta={dailySales.reconciliationDelta}
                      />
                    </CardContent>
                  </Card>

                  <div className="space-y-4">
                    <Card>
                      <CardHeader className="py-3">
                        <CardTitle className="text-sm">Payments</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        {dailySales.tenderBreakdown?.map((t: any, i: number) => (
                          <SummaryRow key={i} label={t.tenderName} value={formatCurrency(t.amount)} />
                        ))}
                        <Separator className="my-1" />
                        <SummaryRow label="Total Payments" value={formatCurrency(dailySales.totalCollected)} bold />
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="py-3">
                        <CardTitle className="text-sm">Operational Metrics</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        <div className="space-y-1">
                          <SummaryRow
                            label="Checks Carried Over"
                            value={`${dailySales.operationalMetrics?.carriedOver?.qty || 0} (${formatCurrency(dailySales.operationalMetrics?.carriedOver?.amt || 0)})`}
                          />
                          <SummaryRow
                            label="Checks Begun"
                            value={`${dailySales.operationalMetrics?.begun?.qty || 0} (${formatCurrency(dailySales.operationalMetrics?.begun?.amt || 0)})`}
                          />
                          <SummaryRow
                            label="Checks Paid"
                            value={`${dailySales.operationalMetrics?.checksPaid?.qty || 0} (${formatCurrency(dailySales.operationalMetrics?.checksPaid?.amt || 0)})`}
                            bold
                          />
                          <SummaryRow
                            label="Checks O/S"
                            value={`${dailySales.operationalMetrics?.outstanding?.qty || 0} (${formatCurrency(dailySales.operationalMetrics?.outstanding?.amt || 0)})`}
                            highlight={(dailySales.operationalMetrics?.outstanding?.qty || 0) > 0}
                          />
                        </div>
                        <Separator className="my-1" />
                        <SummaryRow label="Total Checks (Sales)" value={String(dailySales.checkCount || 0)} />
                        <SummaryRow label="Voids" value={`${dailySales.voidCount || 0} items (${formatCurrency(dailySales.voidAmount)})`} />
                        {(dailySales.checkCount || 0) > 0 && (
                          <SummaryRow
                            label="Avg Check"
                            value={formatCurrency((dailySales.netSales || 0) / (dailySales.checkCount || 1))}
                          />
                        )}
                      </CardContent>
                    </Card>
                  </div>
                </div>

                {dailySales.productMix?.length > 0 && (
                  <ProductMixByCategory items={dailySales.productMix} />
                )}

                {dailySales.discountDetail?.length > 0 && (
                  <Card>
                    <CardHeader className="py-3">
                      <CardTitle className="text-sm">Discount Detail</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Discount</TableHead>
                            <TableHead className="text-right">Count</TableHead>
                            <TableHead className="text-right">Amount</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {dailySales.discountDetail.map((d: any, i: number) => (
                            <TableRow key={i}>
                              <TableCell>{d.name}</TableCell>
                              <TableCell className="text-right tabular-nums">{d.count}</TableCell>
                              <TableCell className="text-right tabular-nums">{formatCurrency(d.amount)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                )}

                {dailySales.serviceChargeDetail?.length > 0 && (
                  <Card>
                    <CardHeader className="py-3">
                      <CardTitle className="text-sm">Service Charge Detail</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Service Charge</TableHead>
                            <TableHead className="text-right">Count</TableHead>
                            <TableHead className="text-right">Amount</TableHead>
                            <TableHead className="text-right">Tax</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {dailySales.serviceChargeDetail.map((sc: any, i: number) => (
                            <TableRow key={i}>
                              <TableCell>{sc.name}</TableCell>
                              <TableCell className="text-right tabular-nums">{sc.count}</TableCell>
                              <TableCell className="text-right tabular-nums">{formatCurrency(sc.amount)}</TableCell>
                              <TableCell className="text-right tabular-nums">{formatCurrency(sc.taxAmount)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                )}
              </div>
            ) : (
              <Card><CardContent className="py-8 text-center text-muted-foreground">Select a property and date</CardContent></Card>
            )}
          </TabsContent>

          {/* ========== LABOR SUMMARY ========== */}
          <TabsContent value="labor">
            {laborLoading ? (
              <Card><CardContent className="py-8 text-center text-muted-foreground">Loading Labor Summary...</CardContent></Card>
            ) : laborSummary ? (
              <div className="space-y-4">
                <Card>
                  <CardHeader className="py-3">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <CardTitle className="text-lg">Labor Summary</CardTitle>
                      <div className="text-sm text-muted-foreground">
                        {selectedProperty?.name} - {laborSummary.businessDate}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div className="space-y-0.5 text-sm">
                        <p className="text-muted-foreground">Employees</p>
                        <p className="font-medium text-lg">{laborSummary.employeeCount || 0}</p>
                      </div>
                      <div className="space-y-0.5 text-sm">
                        <p className="text-muted-foreground">Total Hours</p>
                        <p className="font-medium text-lg">{laborSummary.totalHours || 0}</p>
                      </div>
                      <div className="space-y-0.5 text-sm">
                        <p className="text-muted-foreground">Total Wages</p>
                        <p className="font-medium text-lg">{formatCurrency(laborSummary.totalPay)}</p>
                      </div>
                      <div className="space-y-0.5 text-sm">
                        <p className="text-muted-foreground">Labor %</p>
                        <p className="font-medium text-lg">{formatPercent(laborSummary.laborPercent)}</p>
                      </div>
                    </div>

                    <Separator />

                    <ReportSection title="Summary">
                      <SummaryRow label="Regular Hours" value={String(laborSummary.totalRegularHours || 0)} />
                      <SummaryRow label="Overtime Hours" value={String(laborSummary.totalOvertimeHours || 0)} />
                      <SummaryRow label="Total Hours" value={String(laborSummary.totalHours || 0)} bold />
                      <Separator className="my-1" />
                      <SummaryRow label="Regular Pay" value={formatCurrency(laborSummary.totalRegularPay)} />
                      <SummaryRow label="Overtime Pay" value={formatCurrency(laborSummary.totalOvertimePay)} />
                      <SummaryRow label="Total Wages" value={formatCurrency(laborSummary.totalPay)} bold />
                      <Separator className="my-1" />
                      <SummaryRow label="Declared Cash Tips" value={formatCurrency(laborSummary.totalDeclaredCashTips)} />
                      <SummaryRow label="Net Sales (closed)" value={formatCurrency(laborSummary.netSales)} />
                      <SummaryRow label="Labor %" value={formatPercent(laborSummary.laborPercent)} bold highlight />
                      <SummaryRow label="Sales Per Labor Hour" value={formatCurrency(laborSummary.salesPerLaborHour)} />
                    </ReportSection>
                  </CardContent>
                </Card>

                {laborSummary.byEmployee?.length > 0 && (
                  <Card>
                    <CardHeader className="py-3">
                      <CardTitle className="text-sm">By Employee</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ScrollArea className="w-full">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Employee</TableHead>
                              <TableHead className="text-right">Reg Hrs</TableHead>
                              <TableHead className="text-right">OT Hrs</TableHead>
                              <TableHead className="text-right">Total Hrs</TableHead>
                              <TableHead className="text-right">Pay</TableHead>
                              <TableHead className="text-right">Cash Tips</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {laborSummary.byEmployee.map((e: any, i: number) => (
                              <TableRow key={i} data-testid={`row-labor-${i}`}>
                                <TableCell className="font-medium">{e.employeeId?.substring(0, 8)}</TableCell>
                                <TableCell className="text-right tabular-nums">{e.regularHours}</TableCell>
                                <TableCell className="text-right tabular-nums">{e.overtimeHours}</TableCell>
                                <TableCell className="text-right tabular-nums">{e.totalHours}</TableCell>
                                <TableCell className="text-right tabular-nums">{formatCurrency(e.totalPay)}</TableCell>
                                <TableCell className="text-right tabular-nums">{formatCurrency(e.declaredCashTips)}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </ScrollArea>
                    </CardContent>
                  </Card>
                )}
              </div>
            ) : (
              <Card><CardContent className="py-8 text-center text-muted-foreground">Select a property and date</CardContent></Card>
            )}
          </TabsContent>

          {/* ========== TIP POOL SUMMARY ========== */}
          <TabsContent value="tip-pool">
            {tipLoading ? (
              <Card><CardContent className="py-8 text-center text-muted-foreground">Loading Tip Pool Summary...</CardContent></Card>
            ) : tipPoolSummary ? (
              <div className="space-y-4">
                <Card>
                  <CardHeader className="py-3">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <CardTitle className="text-lg">Tip Pool Summary (CC Only)</CardTitle>
                      <div className="text-sm text-muted-foreground">
                        {selectedProperty?.name} - {tipPoolSummary.businessDate}
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">Closed checks only - card tips pooled by hours worked</p>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-3 gap-3">
                      <div className="space-y-0.5 text-sm">
                        <p className="text-muted-foreground">Poolable Tips</p>
                        <p className="font-medium text-lg">{formatCurrency(tipPoolSummary.totalPoolableTips)}</p>
                      </div>
                      <div className="space-y-0.5 text-sm">
                        <p className="text-muted-foreground">Participants</p>
                        <p className="font-medium text-lg">{tipPoolSummary.participantCount || 0}</p>
                      </div>
                      <div className="space-y-0.5 text-sm">
                        <p className="text-muted-foreground">Total Hours</p>
                        <p className="font-medium text-lg">{tipPoolSummary.totalHoursWorked || 0}</p>
                      </div>
                    </div>

                    {tipPoolSummary.participants?.length > 0 && (
                      <>
                        <Separator />
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Employee</TableHead>
                              <TableHead className="text-right">Hours</TableHead>
                              <TableHead className="text-right">Share %</TableHead>
                              <TableHead className="text-right">Allocation</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {tipPoolSummary.participants.map((p: any, i: number) => (
                              <TableRow key={i} data-testid={`row-tippool-${i}`}>
                                <TableCell className="font-medium">{p.employeeId?.substring(0, 8)}</TableCell>
                                <TableCell className="text-right tabular-nums">{p.hoursWorked}</TableCell>
                                <TableCell className="text-right tabular-nums">{formatPercent(p.sharePercentage)}</TableCell>
                                <TableCell className="text-right tabular-nums font-medium">{formatCurrency(p.allocatedAmount)}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </>
                    )}
                  </CardContent>
                </Card>
              </div>
            ) : (
              <Card><CardContent className="py-8 text-center text-muted-foreground">Select a property and date</CardContent></Card>
            )}
          </TabsContent>

          {/* ========== VALIDATION ========== */}
          <TabsContent value="validation">
            {validLoading ? (
              <Card><CardContent className="py-8 text-center text-muted-foreground">Loading Validation...</CardContent></Card>
            ) : validation ? (
              <div className="space-y-4">
                <Card>
                  <CardHeader className="py-3">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <CardTitle className="text-lg">Validation Checks</CardTitle>
                      <Badge
                        variant={validation.overall === "PASS" ? "default" : validation.overall === "WARN" ? "secondary" : "destructive"}
                        data-testid="badge-validation-overall"
                      >
                        {validation.overall}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {validation.checks && Object.entries(validation.checks).map(([key, check]: [string, any]) => (
                      <div key={key} className={`border rounded-md p-3 ${
                        check.status === "PASS" ? "border-green-500/30 bg-green-500/5" :
                        check.status === "WARN" ? "border-amber-500/30 bg-amber-500/5" :
                        "border-destructive/30 bg-destructive/5"
                      }`}>
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-2">
                            {check.status === "PASS" ? (
                              <CheckCircle2 className="h-4 w-4 text-green-600" />
                            ) : check.status === "WARN" ? (
                              <AlertTriangle className="h-4 w-4 text-amber-600" />
                            ) : (
                              <AlertTriangle className="h-4 w-4 text-destructive" />
                            )}
                            <span className="text-sm font-medium">
                              {key === "serviceChargeReconciliation" && "Service Charge Reconciliation"}
                              {key === "tipDoubleCountCheck" && "Model A Tip Verification"}
                              {key === "cashDrawerLinkage" && "Cash Drawer Linkage"}
                              {key === "salesRebuild" && "Sales Rebuild"}
                              {key === "paymentReconciliation" && "Payment Reconciliation"}
                              {key === "overpaymentCheck" && "Overpayment Check"}
                              {key === "openCheckWarning" && "Open Checks Warning"}
                            </span>
                          </div>
                          <Badge
                            variant={check.status === "PASS" ? "default" : check.status === "WARN" ? "secondary" : "destructive"}
                          >
                            {check.status}
                          </Badge>
                        </div>
                        {check.message && (
                          <p className="text-xs text-muted-foreground mt-1">{check.message}</p>
                        )}
                        {check.breakdown && (
                          <div className="mt-2 text-xs space-y-0.5">
                            <div className="flex justify-between gap-2"><span>Net Sales</span><span className="tabular-nums">{formatCurrency(check.breakdown.netSales)}</span></div>
                            <div className="flex justify-between gap-2"><span>Tax</span><span className="tabular-nums">{formatCurrency(check.breakdown.tax)}</span></div>
                            <div className="flex justify-between gap-2"><span>Service Charges</span><span className="tabular-nums">{formatCurrency(check.breakdown.serviceCharges)}</span></div>
                            <div className="flex justify-between gap-2"><span>Card Tips</span><span className="tabular-nums">{formatCurrency(check.breakdown.cardTips)}</span></div>
                            <Separator className="my-1" />
                            <div className="flex justify-between gap-2 font-medium"><span>Customer Total</span><span className="tabular-nums">{formatCurrency(check.breakdown.customerTotal)}</span></div>
                            <div className="flex justify-between gap-2 font-medium"><span>Total Payments</span><span className="tabular-nums">{formatCurrency(check.breakdown.totalPayments)}</span></div>
                            <div className="flex justify-between gap-2 font-medium"><span>Delta</span><span className={`tabular-nums ${Math.abs(check.breakdown.delta) > 0.02 ? "text-destructive" : "text-green-600"}`}>{formatCurrency(check.breakdown.delta)}</span></div>
                          </div>
                        )}
                        {check.details && check.details.length > 0 && (
                          <div className="mt-2">
                            <p className="text-xs font-medium mb-1">{check.details.length} issue(s):</p>
                            <div className="max-h-32 overflow-y-auto text-xs space-y-0.5">
                              {check.details.slice(0, 10).map((d: any, i: number) => (
                                <div key={i} className="flex gap-2 text-muted-foreground">
                                  <span>#{d.checkNumber || d.paymentId?.substring(0, 8) || i}</span>
                                  {d.overpayment !== undefined && <span>Overpaid: {formatCurrency(d.overpayment)}</span>}
                                  {d.difference !== undefined && <span>Diff: {formatCurrency(d.difference)}</span>}
                                  {d.amount !== undefined && d.status !== undefined && <span>{d.status}: {formatCurrency(d.amount)}</span>}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>
            ) : (
              <Card><CardContent className="py-8 text-center text-muted-foreground">Select a property and date</CardContent></Card>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
