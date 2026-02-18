import { useState, useMemo } from "react";
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
  FileText, DollarSign, Users, Receipt, Banknote, Clock, Printer,
  TrendingUp, AlertTriangle, Coins
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

function formatCurrency(val: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(val);
}

function formatPercent(val: number): string {
  return `${val.toFixed(1)}%`;
}

function formatLocalDate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function ReportSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{title}</h3>
      <div>{children}</div>
    </div>
  );
}

function SummaryRow({ label, value, bold, negative }: { label: string; value: string; bold?: boolean; negative?: boolean }) {
  return (
    <div className={`flex items-center justify-between py-1 ${bold ? "font-semibold" : ""}`}>
      <span className="text-sm">{label}</span>
      <span className={`text-sm tabular-nums ${negative ? "text-destructive" : ""}`}>{value}</span>
    </div>
  );
}

function PrintableReport({ children }: { children: React.ReactNode }) {
  return (
    <div className="print:p-4">
      {children}
    </div>
  );
}

export default function DailyOperationsPage() {
  const emcFilter = useEmcFilter();
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>("");
  const [businessDate, setBusinessDate] = useState<string>(formatLocalDate(new Date()));
  const [activeTab, setActiveTab] = useState("z-report");

  const { data: properties } = useQuery<Property[]>({
    queryKey: ["/api/properties"],
  });

  const effectivePropertyId = selectedPropertyId || emcFilter?.selectedPropertyId || (properties?.[0]?.id ?? "");

  const selectedProperty = useMemo(() => {
    return properties?.find(p => p.id === effectivePropertyId);
  }, [properties, effectivePropertyId]);

  const queryParams = `propertyId=${effectivePropertyId}&businessDate=${businessDate}`;

  const { data: zReport, isLoading: zLoading } = useQuery({
    queryKey: ["/api/reports/z-report", effectivePropertyId, businessDate],
    queryFn: () => authFetch(`/api/reports/z-report?${queryParams}`).then(r => r.json()),
    enabled: !!effectivePropertyId && activeTab === "z-report",
  });

  const { data: cashDrawerReport, isLoading: cashLoading } = useQuery({
    queryKey: ["/api/reports/cash-drawer-report", effectivePropertyId, businessDate],
    queryFn: () => authFetch(`/api/reports/cash-drawer-report?${queryParams}`).then(r => r.json()),
    enabled: !!effectivePropertyId && activeTab === "cash-drawer",
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

  const handlePrint = () => {
    window.print();
  };

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
          <p className="text-muted-foreground text-sm">Oracle Simphony-style FOH/BOH reports</p>
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
            <TabsTrigger value="z-report" data-testid="tab-z-report">
              <FileText className="h-4 w-4 mr-2" />
              Z Report
            </TabsTrigger>
            <TabsTrigger value="cash-drawer" data-testid="tab-cash-drawer">
              <Banknote className="h-4 w-4 mr-2" />
              Cash Drawer
            </TabsTrigger>
            <TabsTrigger value="cashier" data-testid="tab-cashier">
              <Users className="h-4 w-4 mr-2" />
              Cashier
            </TabsTrigger>
            <TabsTrigger value="daily-sales" data-testid="tab-daily-sales">
              <DollarSign className="h-4 w-4 mr-2" />
              Daily Sales
            </TabsTrigger>
            <TabsTrigger value="labor" data-testid="tab-labor">
              <Clock className="h-4 w-4 mr-2" />
              Labor Summary
            </TabsTrigger>
            <TabsTrigger value="tip-pool" data-testid="tab-tip-pool">
              <Coins className="h-4 w-4 mr-2" />
              Tip Pool
            </TabsTrigger>
          </TabsList>

          <TabsContent value="z-report">
            <PrintableReport>
              {zLoading ? (
                <Card><CardContent className="py-8 text-center text-muted-foreground">Loading Z Report...</CardContent></Card>
              ) : zReport ? (
                <div className="space-y-4">
                  <Card>
                    <CardHeader className="py-3">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <CardTitle className="text-lg">Z Report</CardTitle>
                        <div className="text-sm text-muted-foreground">
                          {zReport.propertyName} - {zReport.businessDate}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <ReportSection title="Sales Summary">
                        <SummaryRow label="Gross Sales" value={formatCurrency(zReport.summary.grossSales)} />
                        <SummaryRow label="Discounts" value={`-${formatCurrency(zReport.summary.discounts)}`} negative />
                        <Separator className="my-1" />
                        <SummaryRow label="Net Sales" value={formatCurrency(zReport.summary.netSales)} bold />
                        <SummaryRow label="Service Charges" value={formatCurrency(zReport.summary.serviceCharges)} />
                        <SummaryRow label="Tax" value={formatCurrency(zReport.summary.tax)} />
                        <Separator className="my-1" />
                        <SummaryRow label="Total" value={formatCurrency(zReport.summary.total)} bold />
                      </ReportSection>

                      <ReportSection title="Adjustments">
                        <SummaryRow label="Voids" value={`${zReport.summary.voidCount} items (${formatCurrency(zReport.summary.voidAmount)})`} />
                        <SummaryRow label="Refunds" value={`${zReport.summary.refundCount} (${formatCurrency(zReport.summary.refunds)})`} negative />
                      </ReportSection>

                      <ReportSection title="Check Movement">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                          <div className="space-y-0.5">
                            <p className="text-muted-foreground">Started</p>
                            <p className="font-medium" data-testid="text-z-checks-started">{zReport.checkMovement.checksStarted}</p>
                          </div>
                          <div className="space-y-0.5">
                            <p className="text-muted-foreground">Closed</p>
                            <p className="font-medium" data-testid="text-z-checks-closed">{zReport.checkMovement.checksClosed}</p>
                          </div>
                          <div className="space-y-0.5">
                            <p className="text-muted-foreground">Open</p>
                            <p className="font-medium" data-testid="text-z-checks-open">{zReport.checkMovement.checksOpen}</p>
                          </div>
                          <div className="space-y-0.5">
                            <p className="text-muted-foreground">Avg Check</p>
                            <p className="font-medium" data-testid="text-z-avg-check">{formatCurrency(zReport.checkMovement.avgCheckAmount)}</p>
                          </div>
                        </div>
                      </ReportSection>

                      <ReportSection title="Tips & Payments">
                        <SummaryRow label="Total Payments" value={formatCurrency(zReport.summary.totalPayments)} />
                        <SummaryRow label="Total Tips" value={formatCurrency(zReport.summary.tips)} />
                      </ReportSection>
                    </CardContent>
                  </Card>

                  {zReport.tenderBreakdown?.length > 0 && (
                    <Card>
                      <CardHeader className="py-3">
                        <CardTitle className="text-sm">Tender Breakdown</CardTitle>
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
                            {zReport.tenderBreakdown.map((t: any, i: number) => (
                              <TableRow key={i} data-testid={`row-tender-${i}`}>
                                <TableCell className="font-medium">{t.tenderName}</TableCell>
                                <TableCell className="text-right tabular-nums">{t.count}</TableCell>
                                <TableCell className="text-right tabular-nums">{formatCurrency(t.amount)}</TableCell>
                                <TableCell className="text-right tabular-nums">{formatCurrency(t.tips)}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </CardContent>
                    </Card>
                  )}

                  {zReport.rvcBreakdown?.length > 0 && (
                    <Card>
                      <CardHeader className="py-3">
                        <CardTitle className="text-sm">Revenue Center Breakdown</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Revenue Center</TableHead>
                              <TableHead className="text-right">Checks</TableHead>
                              <TableHead className="text-right">Net Sales</TableHead>
                              <TableHead className="text-right">Tax</TableHead>
                              <TableHead className="text-right">Total</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {zReport.rvcBreakdown.map((r: any, i: number) => (
                              <TableRow key={i} data-testid={`row-rvc-${i}`}>
                                <TableCell className="font-medium">{r.rvcName}</TableCell>
                                <TableCell className="text-right tabular-nums">{r.checkCount}</TableCell>
                                <TableCell className="text-right tabular-nums">{formatCurrency(r.netSales)}</TableCell>
                                <TableCell className="text-right tabular-nums">{formatCurrency(r.tax)}</TableCell>
                                <TableCell className="text-right tabular-nums">{formatCurrency(r.total)}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </CardContent>
                    </Card>
                  )}
                </div>
              ) : (
                <Card><CardContent className="py-8 text-center text-muted-foreground">Select a property and date to generate Z Report</CardContent></Card>
              )}
            </PrintableReport>
          </TabsContent>

          <TabsContent value="cash-drawer">
            <PrintableReport>
              {cashLoading ? (
                <Card><CardContent className="py-8 text-center text-muted-foreground">Loading Cash Drawer Report...</CardContent></Card>
              ) : cashDrawerReport ? (
                <div className="space-y-4">
                  <Card>
                    <CardHeader className="py-3">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <CardTitle className="text-lg">Cash Drawer Report</CardTitle>
                        <div className="text-sm text-muted-foreground">
                          {cashDrawerReport.propertyName} - {cashDrawerReport.businessDate}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                        <div className="space-y-0.5">
                          <p className="text-muted-foreground">Total Drawers</p>
                          <p className="font-medium" data-testid="text-cash-total-drawers">{cashDrawerReport.summary.totalDrawers}</p>
                        </div>
                        <div className="space-y-0.5">
                          <p className="text-muted-foreground">Open</p>
                          <p className="font-medium">{cashDrawerReport.summary.openDrawers}</p>
                        </div>
                        <div className="space-y-0.5">
                          <p className="text-muted-foreground">Closed</p>
                          <p className="font-medium">{cashDrawerReport.summary.closedDrawers}</p>
                        </div>
                        <div className="space-y-0.5">
                          <p className="text-muted-foreground">Total Variance</p>
                          <p className={`font-medium ${cashDrawerReport.summary.totalVariance !== 0 ? "text-destructive" : ""}`}
                             data-testid="text-cash-variance">
                            {formatCurrency(cashDrawerReport.summary.totalVariance)}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {cashDrawerReport.drawers?.length > 0 ? (
                    <Card>
                      <CardHeader className="py-3">
                        <CardTitle className="text-sm">Drawer Details</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-4">
                          {cashDrawerReport.drawers.map((d: any, i: number) => (
                            <div key={i} className="border rounded-md p-3 space-y-2" data-testid={`card-drawer-${i}`}>
                              <div className="flex items-center justify-between flex-wrap gap-1">
                                <div className="font-medium text-sm">{d.drawerName}</div>
                                <Badge variant={d.status === "assigned" ? "default" : "secondary"}>
                                  {d.status === "assigned" ? "Open" : "Closed"}
                                </Badge>
                              </div>
                              <p className="text-xs text-muted-foreground">Assigned to: {d.employeeName}</p>
                              <Separator />
                              <div className="text-sm space-y-0.5">
                                <SummaryRow label="Opening Amount" value={formatCurrency(d.openingAmount)} />
                                <SummaryRow label="Cash Sales" value={formatCurrency(d.cashSales)} />
                                <SummaryRow label="Cash Refunds" value={`-${formatCurrency(d.cashRefunds)}`} negative />
                                <SummaryRow label="Paid In" value={formatCurrency(d.paidIn)} />
                                <SummaryRow label="Paid Out" value={`-${formatCurrency(d.paidOut)}`} negative />
                                <SummaryRow label="Drops" value={`-${formatCurrency(d.drops)}`} negative />
                                <SummaryRow label="Pickups" value={formatCurrency(d.pickups)} />
                                <Separator className="my-1" />
                                <SummaryRow label="Expected" value={formatCurrency(d.expectedAmount)} bold />
                                {d.actualAmount !== null && (
                                  <>
                                    <SummaryRow label="Actual" value={formatCurrency(d.actualAmount)} />
                                    <SummaryRow
                                      label="Variance"
                                      value={formatCurrency(d.variance)}
                                      bold
                                      negative={d.variance !== 0}
                                    />
                                  </>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  ) : (
                    <Card><CardContent className="py-6 text-center text-muted-foreground text-sm">No cash drawer assignments for this date</CardContent></Card>
                  )}
                </div>
              ) : (
                <Card><CardContent className="py-8 text-center text-muted-foreground">Select a property and date</CardContent></Card>
              )}
            </PrintableReport>
          </TabsContent>

          <TabsContent value="cashier">
            <PrintableReport>
              {cashierLoading ? (
                <Card><CardContent className="py-8 text-center text-muted-foreground">Loading Cashier Report...</CardContent></Card>
              ) : cashierReport ? (
                <div className="space-y-4">
                  <Card>
                    <CardHeader className="py-3">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <CardTitle className="text-lg">Cashier Report</CardTitle>
                        <div className="text-sm text-muted-foreground">
                          {cashierReport.propertyName} - {cashierReport.businessDate}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <ReportSection title="Totals">
                        <SummaryRow label="Cashiers Active" value={String(cashierReport.cashierCount)} />
                        <SummaryRow label="Gross Sales" value={formatCurrency(cashierReport.totals.grossSales)} />
                        <SummaryRow label="Discounts" value={`-${formatCurrency(cashierReport.totals.discounts)}`} negative />
                        <SummaryRow label="Net Sales" value={formatCurrency(cashierReport.totals.netSales)} bold />
                        <SummaryRow label="Tax" value={formatCurrency(cashierReport.totals.tax)} />
                        <SummaryRow label="Total" value={formatCurrency(cashierReport.totals.total)} bold />
                        <SummaryRow label="Tips" value={formatCurrency(cashierReport.totals.tips)} />
                        <SummaryRow label="Refunds" value={formatCurrency(cashierReport.totals.refunds)} negative />
                      </ReportSection>
                    </CardContent>
                  </Card>

                  {cashierReport.cashiers?.length > 0 && (
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
                                <TableHead className="text-right">Gross</TableHead>
                                <TableHead className="text-right">Disc</TableHead>
                                <TableHead className="text-right">Net</TableHead>
                                <TableHead className="text-right">Tax</TableHead>
                                <TableHead className="text-right">Total</TableHead>
                                <TableHead className="text-right">Tips</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {cashierReport.cashiers.map((c: any, i: number) => (
                                <TableRow key={i} data-testid={`row-cashier-${i}`}>
                                  <TableCell className="font-medium">{c.employeeName}</TableCell>
                                  <TableCell className="text-right tabular-nums">{c.checksOpened}</TableCell>
                                  <TableCell className="text-right tabular-nums">{formatCurrency(c.grossSales)}</TableCell>
                                  <TableCell className="text-right tabular-nums text-destructive">{formatCurrency(c.discounts)}</TableCell>
                                  <TableCell className="text-right tabular-nums">{formatCurrency(c.netSales)}</TableCell>
                                  <TableCell className="text-right tabular-nums">{formatCurrency(c.tax)}</TableCell>
                                  <TableCell className="text-right tabular-nums font-medium">{formatCurrency(c.total)}</TableCell>
                                  <TableCell className="text-right tabular-nums">{formatCurrency(c.tips)}</TableCell>
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
            </PrintableReport>
          </TabsContent>

          <TabsContent value="daily-sales">
            <PrintableReport>
              {salesLoading ? (
                <Card><CardContent className="py-8 text-center text-muted-foreground">Loading Daily Sales Summary...</CardContent></Card>
              ) : dailySales ? (
                <div className="space-y-4">
                  <Card>
                    <CardHeader className="py-3">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <CardTitle className="text-lg">Daily Sales Summary</CardTitle>
                        <div className="text-sm text-muted-foreground">
                          {dailySales.propertyName} - {dailySales.businessDate}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                        <div className="space-y-0.5">
                          <p className="text-muted-foreground">Total Checks</p>
                          <p className="font-medium text-lg" data-testid="text-sales-checks">{dailySales.summary.totalChecks}</p>
                        </div>
                        <div className="space-y-0.5">
                          <p className="text-muted-foreground">Total Guests</p>
                          <p className="font-medium text-lg">{dailySales.summary.totalGuests}</p>
                        </div>
                        <div className="space-y-0.5">
                          <p className="text-muted-foreground">Avg Check</p>
                          <p className="font-medium text-lg" data-testid="text-sales-avg">{formatCurrency(dailySales.summary.avgCheckAmount)}</p>
                        </div>
                        <div className="space-y-0.5">
                          <p className="text-muted-foreground">Per Guest</p>
                          <p className="font-medium text-lg">{formatCurrency(dailySales.summary.avgPerGuest)}</p>
                        </div>
                      </div>

                      <Separator />

                      <ReportSection title="Sales Breakdown">
                        <SummaryRow label="Gross Sales" value={formatCurrency(dailySales.summary.grossSales)} />
                        <SummaryRow label="Discounts" value={`-${formatCurrency(dailySales.summary.discounts)}`} negative />
                        <SummaryRow label="Net Sales" value={formatCurrency(dailySales.summary.netSales)} bold />
                        <SummaryRow label="Service Charges" value={formatCurrency(dailySales.summary.serviceCharges)} />
                        <SummaryRow label="Tax" value={formatCurrency(dailySales.summary.tax)} />
                        <Separator className="my-1" />
                        <SummaryRow label="Total" value={formatCurrency(dailySales.summary.total)} bold />
                      </ReportSection>
                    </CardContent>
                  </Card>

                  {dailySales.categorySales?.length > 0 && (
                    <Card>
                      <CardHeader className="py-3">
                        <CardTitle className="text-sm">Sales by Category</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Category</TableHead>
                              <TableHead className="text-right">Qty</TableHead>
                              <TableHead className="text-right">Sales</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {dailySales.categorySales.map((c: any, i: number) => (
                              <TableRow key={i} data-testid={`row-category-${i}`}>
                                <TableCell className="font-medium">{c.name}</TableCell>
                                <TableCell className="text-right tabular-nums">{c.quantity}</TableCell>
                                <TableCell className="text-right tabular-nums">{formatCurrency(c.sales)}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </CardContent>
                    </Card>
                  )}

                  {dailySales.hourlySales?.length > 0 && (
                    <Card>
                      <CardHeader className="py-3">
                        <CardTitle className="text-sm">Hourly Sales</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Hour</TableHead>
                              <TableHead className="text-right">Checks</TableHead>
                              <TableHead className="text-right">Sales</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {dailySales.hourlySales.map((h: any, i: number) => (
                              <TableRow key={i}>
                                <TableCell className="font-medium">{h.label}</TableCell>
                                <TableCell className="text-right tabular-nums">{h.checkCount}</TableCell>
                                <TableCell className="text-right tabular-nums">{formatCurrency(h.sales)}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </CardContent>
                    </Card>
                  )}

                  {dailySales.rvcBreakdown?.length > 0 && (
                    <Card>
                      <CardHeader className="py-3">
                        <CardTitle className="text-sm">By Revenue Center</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Revenue Center</TableHead>
                              <TableHead className="text-right">Checks</TableHead>
                              <TableHead className="text-right">Total</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {dailySales.rvcBreakdown.map((r: any, i: number) => (
                              <TableRow key={i}>
                                <TableCell className="font-medium">{r.rvcName}</TableCell>
                                <TableCell className="text-right tabular-nums">{r.checkCount}</TableCell>
                                <TableCell className="text-right tabular-nums">{formatCurrency(r.total)}</TableCell>
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
            </PrintableReport>
          </TabsContent>

          <TabsContent value="labor">
            <PrintableReport>
              {laborLoading ? (
                <Card><CardContent className="py-8 text-center text-muted-foreground">Loading Labor Summary...</CardContent></Card>
              ) : laborSummary ? (
                <div className="space-y-4">
                  <Card>
                    <CardHeader className="py-3">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <CardTitle className="text-lg">Labor Summary</CardTitle>
                        <div className="text-sm text-muted-foreground">
                          {laborSummary.propertyName} - {laborSummary.businessDate}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                        <div className="space-y-0.5">
                          <p className="text-muted-foreground">Employees</p>
                          <p className="font-medium text-lg" data-testid="text-labor-employees">{laborSummary.summary.totalEmployees}</p>
                        </div>
                        <div className="space-y-0.5">
                          <p className="text-muted-foreground">Total Hours</p>
                          <p className="font-medium text-lg">{laborSummary.summary.totalHours.toFixed(1)}</p>
                        </div>
                        <div className="space-y-0.5">
                          <p className="text-muted-foreground">Total Pay</p>
                          <p className="font-medium text-lg" data-testid="text-labor-total-pay">{formatCurrency(laborSummary.summary.totalPay)}</p>
                        </div>
                        <div className="space-y-0.5">
                          <p className="text-muted-foreground">Labor %</p>
                          <p className={`font-medium text-lg ${laborSummary.summary.laborCostPercent > 30 ? "text-destructive" : ""}`}
                             data-testid="text-labor-percent">
                            {formatPercent(laborSummary.summary.laborCostPercent)}
                          </p>
                        </div>
                      </div>

                      <Separator />

                      <ReportSection title="Hours Breakdown">
                        <SummaryRow label="Regular Hours" value={laborSummary.summary.totalRegularHours.toFixed(1)} />
                        <SummaryRow label="Overtime Hours" value={laborSummary.summary.totalOvertimeHours.toFixed(1)} />
                        <SummaryRow label="Double Time Hours" value={laborSummary.summary.totalDoubleTimeHours.toFixed(1)} />
                        <SummaryRow label="Break Minutes" value={String(laborSummary.summary.totalBreakMinutes)} />
                      </ReportSection>

                      <ReportSection title="Pay Breakdown">
                        <SummaryRow label="Regular Pay" value={formatCurrency(laborSummary.summary.regularPay)} />
                        <SummaryRow label="Overtime Pay" value={formatCurrency(laborSummary.summary.overtimePay)} />
                        <Separator className="my-1" />
                        <SummaryRow label="Total Pay" value={formatCurrency(laborSummary.summary.totalPay)} bold />
                        <SummaryRow label="Total Sales" value={formatCurrency(laborSummary.summary.totalSales)} />
                      </ReportSection>
                    </CardContent>
                  </Card>

                  {laborSummary.jobCodeBreakdown?.length > 0 && (
                    <Card>
                      <CardHeader className="py-3">
                        <CardTitle className="text-sm">By Job Code</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Job Code</TableHead>
                              <TableHead className="text-right">Staff</TableHead>
                              <TableHead className="text-right">Hours</TableHead>
                              <TableHead className="text-right">Pay</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {laborSummary.jobCodeBreakdown.map((j: any, i: number) => (
                              <TableRow key={i} data-testid={`row-jobcode-${i}`}>
                                <TableCell className="font-medium">{j.name}</TableCell>
                                <TableCell className="text-right tabular-nums">{j.headcount}</TableCell>
                                <TableCell className="text-right tabular-nums">{j.totalHours.toFixed(1)}</TableCell>
                                <TableCell className="text-right tabular-nums">{formatCurrency(j.totalPay)}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </CardContent>
                    </Card>
                  )}

                  {laborSummary.employees?.length > 0 && (
                    <Card>
                      <CardHeader className="py-3">
                        <CardTitle className="text-sm">Employee Detail</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <ScrollArea className="w-full">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Employee</TableHead>
                                <TableHead>Job</TableHead>
                                <TableHead className="text-right">Reg Hrs</TableHead>
                                <TableHead className="text-right">OT Hrs</TableHead>
                                <TableHead className="text-right">Total</TableHead>
                                <TableHead className="text-right">Rate</TableHead>
                                <TableHead className="text-right">Pay</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {laborSummary.employees.map((e: any, i: number) => (
                                <TableRow key={i} data-testid={`row-labor-emp-${i}`}>
                                  <TableCell className="font-medium">{e.employeeName}</TableCell>
                                  <TableCell className="text-muted-foreground">{e.jobCode}</TableCell>
                                  <TableCell className="text-right tabular-nums">{e.regularHours.toFixed(1)}</TableCell>
                                  <TableCell className="text-right tabular-nums">{e.overtimeHours > 0 ? e.overtimeHours.toFixed(1) : "-"}</TableCell>
                                  <TableCell className="text-right tabular-nums">{e.totalHours.toFixed(1)}</TableCell>
                                  <TableCell className="text-right tabular-nums">{formatCurrency(e.payRate)}</TableCell>
                                  <TableCell className="text-right tabular-nums font-medium">{formatCurrency(e.totalPay)}</TableCell>
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
            </PrintableReport>
          </TabsContent>

          <TabsContent value="tip-pool">
            <PrintableReport>
              {tipLoading ? (
                <Card><CardContent className="py-8 text-center text-muted-foreground">Loading Tip Pool Summary...</CardContent></Card>
              ) : tipPoolSummary ? (
                <div className="space-y-4">
                  <Card>
                    <CardHeader className="py-3">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <CardTitle className="text-lg">Tip Pool Summary</CardTitle>
                        <div className="text-sm text-muted-foreground">
                          {tipPoolSummary.propertyName} - {tipPoolSummary.businessDate}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                        <div className="space-y-0.5">
                          <p className="text-muted-foreground">Pools Run</p>
                          <p className="font-medium text-lg" data-testid="text-tip-pools">{tipPoolSummary.summary.totalPools}</p>
                        </div>
                        <div className="space-y-0.5">
                          <p className="text-muted-foreground">Total Tips</p>
                          <p className="font-medium text-lg" data-testid="text-tip-total">{formatCurrency(tipPoolSummary.summary.totalTips)}</p>
                        </div>
                        <div className="space-y-0.5">
                          <p className="text-muted-foreground">Participants</p>
                          <p className="font-medium text-lg">{tipPoolSummary.summary.totalParticipants}</p>
                        </div>
                        <div className="space-y-0.5">
                          <p className="text-muted-foreground">Avg Per Person</p>
                          <p className="font-medium text-lg">{formatCurrency(tipPoolSummary.summary.avgTipPerParticipant)}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {tipPoolSummary.pools?.length > 0 && tipPoolSummary.pools.map((pool: any, pi: number) => (
                    <Card key={pi}>
                      <CardHeader className="py-3">
                        <div className="flex items-center justify-between flex-wrap gap-1">
                          <CardTitle className="text-sm">{pool.policyName}</CardTitle>
                          <Badge variant={pool.status === "settled" ? "default" : "secondary"}>
                            {pool.status}
                          </Badge>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {pool.distributionMethod} - {formatCurrency(pool.totalTips)} total - Run by {pool.runBy}
                        </div>
                      </CardHeader>
                      <CardContent>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Employee</TableHead>
                              <TableHead className="text-right">Hours</TableHead>
                              <TableHead className="text-right">Share %</TableHead>
                              <TableHead className="text-right">Direct</TableHead>
                              <TableHead className="text-right">Pooled</TableHead>
                              <TableHead className="text-right">Total</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {pool.allocations.map((a: any, ai: number) => (
                              <TableRow key={ai} data-testid={`row-tipalloc-${pi}-${ai}`}>
                                <TableCell className="font-medium">{a.employeeName}</TableCell>
                                <TableCell className="text-right tabular-nums">{a.hoursWorked.toFixed(1)}</TableCell>
                                <TableCell className="text-right tabular-nums">{formatPercent(a.sharePercentage)}</TableCell>
                                <TableCell className="text-right tabular-nums">{formatCurrency(a.directTips)}</TableCell>
                                <TableCell className="text-right tabular-nums">{formatCurrency(a.pooledTips)}</TableCell>
                                <TableCell className="text-right tabular-nums font-medium">{formatCurrency(a.totalTips)}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </CardContent>
                    </Card>
                  ))}

                  {tipPoolSummary.employeeTotals?.length > 0 && (
                    <Card>
                      <CardHeader className="py-3">
                        <CardTitle className="text-sm">Employee Tip Totals (All Pools)</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Employee</TableHead>
                              <TableHead className="text-right">Direct Tips</TableHead>
                              <TableHead className="text-right">Pooled Tips</TableHead>
                              <TableHead className="text-right">Total Tips</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {tipPoolSummary.employeeTotals.map((e: any, i: number) => (
                              <TableRow key={i} data-testid={`row-tiptotal-${i}`}>
                                <TableCell className="font-medium">{e.name}</TableCell>
                                <TableCell className="text-right tabular-nums">{formatCurrency(e.directTips)}</TableCell>
                                <TableCell className="text-right tabular-nums">{formatCurrency(e.pooledTips)}</TableCell>
                                <TableCell className="text-right tabular-nums font-medium">{formatCurrency(e.totalTips)}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </CardContent>
                    </Card>
                  )}

                  {tipPoolSummary.pools?.length === 0 && (
                    <Card><CardContent className="py-6 text-center text-muted-foreground text-sm">No tip pool runs for this date</CardContent></Card>
                  )}
                </div>
              ) : (
                <Card><CardContent className="py-8 text-center text-muted-foreground">Select a property and date</CardContent></Card>
              )}
            </PrintableReport>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
