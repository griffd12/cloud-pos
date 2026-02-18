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
  FileText, DollarSign, Users, Banknote, Clock, Printer, Coins
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
                          {selectedProperty?.name} - {zReport.businessDate}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <ReportSection title="Sales Summary">
                        <SummaryRow label="Gross Sales" value={formatCurrency(zReport.grossSales)} />
                        <SummaryRow label="Item Discounts" value={`-${formatCurrency(zReport.itemDiscounts)}`} negative />
                        <SummaryRow label="Check Discounts" value={`-${formatCurrency(zReport.checkDiscounts)}`} negative />
                        <Separator className="my-1" />
                        <SummaryRow label="Net Sales" value={formatCurrency(zReport.netSales)} bold />
                        <SummaryRow label="Service Charges" value={formatCurrency(zReport.serviceCharges)} />
                        <SummaryRow label="Tax" value={formatCurrency(zReport.totalTax)} />
                        <Separator className="my-1" />
                        <SummaryRow label="Total Revenue" value={formatCurrency(zReport.totalRevenue)} bold />
                      </ReportSection>

                      <ReportSection title="Adjustments">
                        <SummaryRow label="Voids" value={`${zReport.voidCount} items (${formatCurrency(zReport.voidAmount)})`} />
                      </ReportSection>

                      <ReportSection title="Check & Payment Summary">
                        <SummaryRow label="Total Checks" value={String(zReport.checkCount)} />
                        <SummaryRow label="Total Collected" value={formatCurrency(zReport.totalCollected)} bold />
                        <SummaryRow label="Card Tips" value={formatCurrency(zReport.cardTips)} />
                        <SummaryRow label="Cash Tips" value={formatCurrency(zReport.cashTips)} />
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
                              <TableHead className="text-right">Amount</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {zReport.tenderBreakdown.map((t: any, i: number) => (
                              <TableRow key={i} data-testid={`row-tender-${i}`}>
                                <TableCell className="font-medium">{t.tenderName}</TableCell>
                                <TableCell className="text-right tabular-nums">{formatCurrency(t.amount)}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </CardContent>
                    </Card>
                  )}

                  {zReport.productMix?.length > 0 && (
                    <Card>
                      <CardHeader className="py-3">
                        <CardTitle className="text-sm">Product Mix</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <ScrollArea className="w-full">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Item</TableHead>
                                <TableHead className="text-right">Qty</TableHead>
                                <TableHead className="text-right">Gross</TableHead>
                                <TableHead className="text-right">Net</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {zReport.productMix.map((p: any, i: number) => (
                                <TableRow key={i} data-testid={`row-pmix-${i}`}>
                                  <TableCell className="font-medium">{p.itemName}</TableCell>
                                  <TableCell className="text-right tabular-nums">{p.quantity}</TableCell>
                                  <TableCell className="text-right tabular-nums">{formatCurrency(p.grossSales)}</TableCell>
                                  <TableCell className="text-right tabular-nums">{formatCurrency(p.netSales)}</TableCell>
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
                          <p className="font-medium" data-testid="text-cash-total-drawers">{cashDrawerReport.summary?.totalDrawers ?? 0}</p>
                        </div>
                        <div className="space-y-0.5">
                          <p className="text-muted-foreground">Open</p>
                          <p className="font-medium">{cashDrawerReport.summary?.openDrawers ?? 0}</p>
                        </div>
                        <div className="space-y-0.5">
                          <p className="text-muted-foreground">Closed</p>
                          <p className="font-medium">{cashDrawerReport.summary?.closedDrawers ?? 0}</p>
                        </div>
                        <div className="space-y-0.5">
                          <p className="text-muted-foreground">Total Variance</p>
                          <p className={`font-medium ${(cashDrawerReport.summary?.totalVariance ?? 0) !== 0 ? "text-destructive" : ""}`}
                             data-testid="text-cash-variance">
                            {formatCurrency(cashDrawerReport.summary?.totalVariance)}
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
              ) : cashierReport && Array.isArray(cashierReport) ? (
                <div className="space-y-4">
                  <Card>
                    <CardHeader className="py-3">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <CardTitle className="text-lg">Cashier Report</CardTitle>
                        <div className="text-sm text-muted-foreground">
                          {selectedProperty?.name} - {businessDate}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <ReportSection title="Summary">
                        <SummaryRow label="Cashiers Active" value={String(cashierReport.length)} />
                        <SummaryRow label="Gross Sales" value={formatCurrency(cashierReport.reduce((s: number, c: any) => s + (c.grossSales || 0), 0))} />
                        <SummaryRow label="Discounts" value={`-${formatCurrency(cashierReport.reduce((s: number, c: any) => s + (c.discounts || 0), 0))}`} negative />
                        <SummaryRow label="Net Sales" value={formatCurrency(cashierReport.reduce((s: number, c: any) => s + (c.netSales || 0), 0))} bold />
                        <SummaryRow label="Total Collected" value={formatCurrency(cashierReport.reduce((s: number, c: any) => s + (c.totalCollected || 0), 0))} bold />
                        <SummaryRow label="Card Tips" value={formatCurrency(cashierReport.reduce((s: number, c: any) => s + (c.cardTips || 0), 0))} />
                      </ReportSection>
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
                                <TableHead className="text-right">Gross</TableHead>
                                <TableHead className="text-right">Disc</TableHead>
                                <TableHead className="text-right">Net</TableHead>
                                <TableHead className="text-right">Voids</TableHead>
                                <TableHead className="text-right">Collected</TableHead>
                                <TableHead className="text-right">Tips</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {cashierReport.map((c: any, i: number) => (
                                <TableRow key={i} data-testid={`row-cashier-${i}`}>
                                  <TableCell className="font-medium">{c.employeeId?.substring(0, 8) || `Cashier ${i + 1}`}</TableCell>
                                  <TableCell className="text-right tabular-nums">{c.checksOpened}</TableCell>
                                  <TableCell className="text-right tabular-nums">{formatCurrency(c.grossSales)}</TableCell>
                                  <TableCell className="text-right tabular-nums text-destructive">{formatCurrency(c.discounts)}</TableCell>
                                  <TableCell className="text-right tabular-nums">{formatCurrency(c.netSales)}</TableCell>
                                  <TableCell className="text-right tabular-nums">{c.voidCount} ({formatCurrency(c.voidAmount)})</TableCell>
                                  <TableCell className="text-right tabular-nums font-medium">{formatCurrency(c.totalCollected)}</TableCell>
                                  <TableCell className="text-right tabular-nums">{formatCurrency(c.cardTips)}</TableCell>
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
                          {selectedProperty?.name} - {dailySales.businessDate}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                        <div className="space-y-0.5">
                          <p className="text-muted-foreground">Total Checks</p>
                          <p className="font-medium text-lg" data-testid="text-sales-checks">{dailySales.checkCount}</p>
                        </div>
                        <div className="space-y-0.5">
                          <p className="text-muted-foreground">Net Sales</p>
                          <p className="font-medium text-lg" data-testid="text-sales-net">{formatCurrency(dailySales.netSales)}</p>
                        </div>
                        <div className="space-y-0.5">
                          <p className="text-muted-foreground">Total Revenue</p>
                          <p className="font-medium text-lg">{formatCurrency(dailySales.totalRevenue)}</p>
                        </div>
                      </div>

                      <Separator />

                      <ReportSection title="Sales Breakdown">
                        <SummaryRow label="Gross Sales" value={formatCurrency(dailySales.grossSales)} />
                        <SummaryRow label="Item Discounts" value={`-${formatCurrency(dailySales.itemDiscounts)}`} negative />
                        <SummaryRow label="Check Discounts" value={`-${formatCurrency(dailySales.checkDiscounts)}`} negative />
                        <SummaryRow label="Net Sales" value={formatCurrency(dailySales.netSales)} bold />
                        <SummaryRow label="Service Charges" value={formatCurrency(dailySales.serviceCharges)} />
                        <SummaryRow label="Tax" value={formatCurrency(dailySales.totalTax)} />
                        <Separator className="my-1" />
                        <SummaryRow label="Total Revenue" value={formatCurrency(dailySales.totalRevenue)} bold />
                      </ReportSection>

                      <ReportSection title="Collections">
                        <SummaryRow label="Total Collected" value={formatCurrency(dailySales.totalCollected)} bold />
                        <SummaryRow label="Card Tips" value={formatCurrency(dailySales.cardTips)} />
                        <SummaryRow label="Cash Tips" value={formatCurrency(dailySales.cashTips)} />
                      </ReportSection>
                    </CardContent>
                  </Card>

                  {dailySales.tenderBreakdown?.length > 0 && (
                    <Card>
                      <CardHeader className="py-3">
                        <CardTitle className="text-sm">Tender Breakdown</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Tender</TableHead>
                              <TableHead className="text-right">Amount</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {dailySales.tenderBreakdown.map((t: any, i: number) => (
                              <TableRow key={i} data-testid={`row-sales-tender-${i}`}>
                                <TableCell className="font-medium">{t.tenderName}</TableCell>
                                <TableCell className="text-right tabular-nums">{formatCurrency(t.amount)}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </CardContent>
                    </Card>
                  )}

                  {dailySales.productMix?.length > 0 && (
                    <Card>
                      <CardHeader className="py-3">
                        <CardTitle className="text-sm">Product Mix</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <ScrollArea className="w-full">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Item</TableHead>
                                <TableHead className="text-right">Qty</TableHead>
                                <TableHead className="text-right">Gross</TableHead>
                                <TableHead className="text-right">Net</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {dailySales.productMix.map((p: any, i: number) => (
                                <TableRow key={i} data-testid={`row-sales-pmix-${i}`}>
                                  <TableCell className="font-medium">{p.itemName}</TableCell>
                                  <TableCell className="text-right tabular-nums">{p.quantity}</TableCell>
                                  <TableCell className="text-right tabular-nums">{formatCurrency(p.grossSales)}</TableCell>
                                  <TableCell className="text-right tabular-nums">{formatCurrency(p.netSales)}</TableCell>
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
                          {selectedProperty?.name} - {laborSummary.businessDate}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                        <div className="space-y-0.5">
                          <p className="text-muted-foreground">Employees</p>
                          <p className="font-medium text-lg" data-testid="text-labor-employees">{laborSummary.employeeCount}</p>
                        </div>
                        <div className="space-y-0.5">
                          <p className="text-muted-foreground">Total Hours</p>
                          <p className="font-medium text-lg">{(laborSummary.totalHours ?? 0).toFixed(1)}</p>
                        </div>
                        <div className="space-y-0.5">
                          <p className="text-muted-foreground">Total Pay</p>
                          <p className="font-medium text-lg" data-testid="text-labor-total-pay">{formatCurrency(laborSummary.totalPay)}</p>
                        </div>
                        <div className="space-y-0.5">
                          <p className="text-muted-foreground">Labor %</p>
                          <p className={`font-medium text-lg ${(laborSummary.laborPercent ?? 0) > 30 ? "text-destructive" : ""}`}
                             data-testid="text-labor-percent">
                            {formatPercent(laborSummary.laborPercent)}
                          </p>
                        </div>
                      </div>

                      <Separator />

                      <ReportSection title="Hours Breakdown">
                        <SummaryRow label="Regular Hours" value={(laborSummary.totalRegularHours ?? 0).toFixed(1)} />
                        <SummaryRow label="Overtime Hours" value={(laborSummary.totalOvertimeHours ?? 0).toFixed(1)} />
                        <SummaryRow label="Double Time Hours" value={(laborSummary.totalDoubleTimeHours ?? 0).toFixed(1)} />
                      </ReportSection>

                      <ReportSection title="Pay Breakdown">
                        <SummaryRow label="Regular Pay" value={formatCurrency(laborSummary.totalRegularPay)} />
                        <SummaryRow label="Overtime Pay" value={formatCurrency(laborSummary.totalOvertimePay)} />
                        <Separator className="my-1" />
                        <SummaryRow label="Total Pay" value={formatCurrency(laborSummary.totalPay)} bold />
                        <SummaryRow label="Net Sales" value={formatCurrency(laborSummary.netSales)} />
                        <SummaryRow label="Sales per Labor Hour" value={formatCurrency(laborSummary.salesPerLaborHour)} />
                        <SummaryRow label="Declared Cash Tips" value={formatCurrency(laborSummary.totalDeclaredCashTips)} />
                      </ReportSection>
                    </CardContent>
                  </Card>

                  {laborSummary.byEmployee?.length > 0 && (
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
                                <TableHead className="text-right">Reg Hrs</TableHead>
                                <TableHead className="text-right">OT Hrs</TableHead>
                                <TableHead className="text-right">Total Hrs</TableHead>
                                <TableHead className="text-right">Reg Pay</TableHead>
                                <TableHead className="text-right">OT Pay</TableHead>
                                <TableHead className="text-right">Total Pay</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {laborSummary.byEmployee.map((e: any, i: number) => (
                                <TableRow key={i} data-testid={`row-labor-emp-${i}`}>
                                  <TableCell className="font-medium">{e.employeeId?.substring(0, 8) || `Emp ${i + 1}`}</TableCell>
                                  <TableCell className="text-right tabular-nums">{(e.regularHours ?? 0).toFixed(1)}</TableCell>
                                  <TableCell className="text-right tabular-nums">{(e.overtimeHours ?? 0) > 0 ? (e.overtimeHours).toFixed(1) : "-"}</TableCell>
                                  <TableCell className="text-right tabular-nums">{(e.totalHours ?? 0).toFixed(1)}</TableCell>
                                  <TableCell className="text-right tabular-nums">{formatCurrency(e.regularPay)}</TableCell>
                                  <TableCell className="text-right tabular-nums">{formatCurrency(e.overtimePay)}</TableCell>
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
                          {selectedProperty?.name} - {tipPoolSummary.businessDate}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                        <div className="space-y-0.5">
                          <p className="text-muted-foreground">Total Poolable Tips</p>
                          <p className="font-medium text-lg" data-testid="text-tip-total">{formatCurrency(tipPoolSummary.totalPoolableTips)}</p>
                        </div>
                        <div className="space-y-0.5">
                          <p className="text-muted-foreground">Participants</p>
                          <p className="font-medium text-lg">{tipPoolSummary.participantCount}</p>
                        </div>
                        <div className="space-y-0.5">
                          <p className="text-muted-foreground">Total Hours</p>
                          <p className="font-medium text-lg">{(tipPoolSummary.totalHoursWorked ?? 0).toFixed(1)}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {tipPoolSummary.participants?.length > 0 && (
                    <Card>
                      <CardHeader className="py-3">
                        <CardTitle className="text-sm">Participant Allocations</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Employee</TableHead>
                              <TableHead className="text-right">Hours</TableHead>
                              <TableHead className="text-right">Share %</TableHead>
                              <TableHead className="text-right">Allocated</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {tipPoolSummary.participants.map((p: any, i: number) => (
                              <TableRow key={i} data-testid={`row-tipalloc-${i}`}>
                                <TableCell className="font-medium">{p.employeeId?.substring(0, 8) || `Emp ${i + 1}`}</TableCell>
                                <TableCell className="text-right tabular-nums">{(p.hoursWorked ?? 0).toFixed(1)}</TableCell>
                                <TableCell className="text-right tabular-nums">{formatPercent(p.sharePercentage)}</TableCell>
                                <TableCell className="text-right tabular-nums font-medium">{formatCurrency(p.allocatedAmount)}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </CardContent>
                    </Card>
                  )}

                  {(!tipPoolSummary.participants || tipPoolSummary.participants.length === 0) && (
                    <Card><CardContent className="py-6 text-center text-muted-foreground text-sm">No tip pool data for this date</CardContent></Card>
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
