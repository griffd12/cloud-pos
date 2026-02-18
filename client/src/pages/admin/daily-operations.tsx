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
  FileText, DollarSign, Users, Banknote, Clock, Printer, Coins,
  CheckCircle2, AlertTriangle, ShieldCheck
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
    <div className="space-y-1">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{title}</h3>
      <div>{children}</div>
    </div>
  );
}

function SummaryRow({ label, value, bold, negative, highlight, indent }: {
  label: string; value: string; bold?: boolean; negative?: boolean; highlight?: boolean; indent?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between gap-2 py-0.5 ${bold ? "font-semibold" : ""} ${highlight ? "bg-muted/50 -mx-2 px-2 rounded" : ""}`}>
      <span className={`text-sm ${indent ? "pl-4" : ""}`}>{label}</span>
      <span className={`text-sm tabular-nums ${negative ? "text-destructive" : ""}`}>{value}</span>
    </div>
  );
}

function ReconciliationStatus({ customerTotal, totalPayments }: { customerTotal: number; totalPayments: number }) {
  const delta = Math.round((totalPayments - customerTotal) * 100) / 100;
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
      <SummaryRow label="Total Payments" value={formatCurrency(totalPayments)} bold />
      <Separator className="my-1" />
      <SummaryRow label="Difference" value={formatCurrency(delta)} bold negative={!balanced} />
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

  const zCustomerTotal = zReport
    ? Math.round(((zReport.netSales || 0) + (zReport.totalTax || 0) + (zReport.serviceCharges || 0) + (zReport.cardTips || 0) + (zReport.cashTips || 0)) * 100) / 100
    : 0;

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-daily-ops-title">Daily Operations Reports</h1>
          <p className="text-muted-foreground text-sm">Oracle Simphony-style FOH/BOH reports with enterprise reconciliation</p>
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
            <TabsTrigger value="validation" data-testid="tab-validation">
              <ShieldCheck className="h-4 w-4 mr-2" />
              Validation
            </TabsTrigger>
          </TabsList>

          {/* ========== Z REPORT ========== */}
          <TabsContent value="z-report">
            {zLoading ? (
              <Card><CardContent className="py-8 text-center text-muted-foreground">Loading Z Report...</CardContent></Card>
            ) : zReport ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="py-3">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <CardTitle className="text-lg">Z Report - Daily Close</CardTitle>
                      <div className="text-sm text-muted-foreground">
                        {selectedProperty?.name} - {zReport.businessDate}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <ReportSection title="Sales">
                      <SummaryRow label="Gross Sales" value={formatCurrency(zReport.grossSales)} />
                      <SummaryRow label="Item Discounts" value={`(${formatCurrency(zReport.itemDiscounts)})`} negative indent />
                      <SummaryRow label="Check Discounts" value={`(${formatCurrency(zReport.checkDiscounts)})`} negative indent />
                      <SummaryRow label="Total Discounts" value={`(${formatCurrency(zReport.totalDiscounts)})`} negative />
                      <Separator className="my-1" />
                      <SummaryRow label="Net Sales" value={formatCurrency(zReport.netSales)} bold highlight />
                    </ReportSection>

                    <ReportSection title="Additions">
                      <SummaryRow label="Tax (Item)" value={formatCurrency(zReport.itemTax)} indent />
                      <SummaryRow label="Tax (Service Charge)" value={formatCurrency(zReport.serviceChargeTax)} indent />
                      <SummaryRow label="Total Tax" value={formatCurrency(zReport.totalTax)} />
                      <SummaryRow label="Service Charges" value={formatCurrency(zReport.serviceCharges)} />
                      <Separator className="my-1" />
                      <SummaryRow label="Total Revenue" value={formatCurrency(zReport.totalRevenue)} bold />
                    </ReportSection>

                    <ReportSection title="Tips">
                      <SummaryRow label="Card Tips" value={formatCurrency(zReport.cardTips)} indent />
                      <SummaryRow label="Cash Tips" value={formatCurrency(zReport.cashTips)} indent />
                      <Separator className="my-1" />
                      <SummaryRow label="Total Tips" value={formatCurrency((zReport.cardTips || 0) + (zReport.cashTips || 0))} />
                    </ReportSection>

                    <Separator />
                    <SummaryRow label="Customer Total" value={formatCurrency(zCustomerTotal)} bold highlight />
                    <p className="text-xs text-muted-foreground">Net Sales + Tax + Service Charges + Tips</p>
                  </CardContent>
                </Card>

                <div className="space-y-4">
                  <Card>
                    <CardHeader className="py-3">
                      <CardTitle className="text-sm">Payments</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {zReport.tenderBreakdown?.map((t: any, i: number) => (
                        <SummaryRow key={i} label={t.tenderName} value={formatCurrency(t.amount)} />
                      ))}
                      <Separator className="my-1" />
                      <SummaryRow label="Total Payments" value={formatCurrency(zReport.totalCollected)} bold highlight />
                    </CardContent>
                  </Card>

                  <ReconciliationStatus
                    customerTotal={zCustomerTotal}
                    totalPayments={zReport.totalCollected || 0}
                  />

                  <Card>
                    <CardHeader className="py-3">
                      <CardTitle className="text-sm">Operational Metrics</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-1">
                      <SummaryRow label="Total Checks" value={String(zReport.checkCount || 0)} />
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
              <Card><CardContent className="py-8 text-center text-muted-foreground">Select a property and date to generate Z Report</CardContent></Card>
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
                        {selectedProperty?.name} - {businessDate}
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
                        <SummaryRow label="Card Tips" value={formatCurrency(dailySales.cardTips)} indent />
                        <SummaryRow label="Cash Tips" value={formatCurrency(dailySales.cashTips)} indent />
                      </ReportSection>

                      <Separator />
                      {(() => {
                        const custTotal = Math.round(((dailySales.netSales || 0) + (dailySales.totalTax || 0) + (dailySales.serviceCharges || 0) + (dailySales.cardTips || 0) + (dailySales.cashTips || 0)) * 100) / 100;
                        return (
                          <>
                            <SummaryRow label="Customer Total" value={formatCurrency(custTotal)} bold highlight />
                            <ReconciliationStatus customerTotal={custTotal} totalPayments={dailySales.totalCollected || 0} />
                          </>
                        );
                      })()}
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
                      <CardContent className="space-y-1">
                        <SummaryRow label="Total Checks" value={String(dailySales.checkCount || 0)} />
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
                              <TableCell className="font-medium">{d.name}</TableCell>
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
                              <TableCell className="font-medium">{sc.name}</TableCell>
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
                        {selectedProperty?.name} - {businessDate}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                      <div className="space-y-0.5">
                        <p className="text-muted-foreground">Employees</p>
                        <p className="font-medium text-lg" data-testid="text-labor-emp-count">{laborSummary.employeeCount}</p>
                      </div>
                      <div className="space-y-0.5">
                        <p className="text-muted-foreground">Total Hours</p>
                        <p className="font-medium text-lg" data-testid="text-labor-hours">{(laborSummary.totalHours || 0).toFixed(1)}</p>
                      </div>
                      <div className="space-y-0.5">
                        <p className="text-muted-foreground">Total Pay</p>
                        <p className="font-medium text-lg" data-testid="text-labor-pay">{formatCurrency(laborSummary.totalPay)}</p>
                      </div>
                      <div className="space-y-0.5">
                        <p className="text-muted-foreground">Labor %</p>
                        <p className="font-medium text-lg" data-testid="text-labor-pct">{formatPercent(laborSummary.laborPercent)}</p>
                      </div>
                    </div>

                    <Separator />

                    <ReportSection title="Hours Breakdown">
                      <SummaryRow label="Regular Hours" value={(laborSummary.totalRegularHours || 0).toFixed(1)} />
                      <SummaryRow label="Overtime Hours" value={(laborSummary.totalOvertimeHours || 0).toFixed(1)} />
                      <SummaryRow label="Double-Time Hours" value={(laborSummary.totalDoubleTimeHours || 0).toFixed(1)} />
                      <Separator className="my-1" />
                      <SummaryRow label="Total Hours" value={(laborSummary.totalHours || 0).toFixed(1)} bold />
                    </ReportSection>

                    <ReportSection title="Pay Breakdown">
                      <SummaryRow label="Regular Pay" value={formatCurrency(laborSummary.totalRegularPay)} />
                      <SummaryRow label="Overtime Pay" value={formatCurrency(laborSummary.totalOvertimePay)} />
                      <Separator className="my-1" />
                      <SummaryRow label="Total Pay" value={formatCurrency(laborSummary.totalPay)} bold />
                    </ReportSection>

                    <ReportSection title="Efficiency">
                      <SummaryRow label="Net Sales" value={formatCurrency(laborSummary.netSales)} />
                      <SummaryRow label="Sales per Labor Hour" value={formatCurrency(laborSummary.salesPerLaborHour)} />
                      <SummaryRow label="Labor Cost %" value={formatPercent(laborSummary.laborPercent)} />
                      <SummaryRow label="Declared Cash Tips" value={formatCurrency(laborSummary.totalDeclaredCashTips)} />
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
                              <TableHead className="text-right">Reg Pay</TableHead>
                              <TableHead className="text-right">OT Pay</TableHead>
                              <TableHead className="text-right">Total Pay</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {laborSummary.byEmployee.map((e: any, i: number) => (
                              <TableRow key={i} data-testid={`row-labor-${i}`}>
                                <TableCell className="font-medium">{e.employeeId?.substring(0, 8)}</TableCell>
                                <TableCell className="text-right tabular-nums">{(e.regularHours || 0).toFixed(1)}</TableCell>
                                <TableCell className="text-right tabular-nums">{(e.overtimeHours || 0).toFixed(1)}</TableCell>
                                <TableCell className="text-right tabular-nums">{(e.totalHours || 0).toFixed(1)}</TableCell>
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
          </TabsContent>

          {/* ========== TIP POOL ========== */}
          <TabsContent value="tip-pool">
            {tipLoading ? (
              <Card><CardContent className="py-8 text-center text-muted-foreground">Loading Tip Pool Summary...</CardContent></Card>
            ) : tipPoolSummary ? (
              <div className="space-y-4">
                <Card>
                  <CardHeader className="py-3">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <CardTitle className="text-lg">Tip Pool Summary</CardTitle>
                      <div className="text-sm text-muted-foreground">
                        {selectedProperty?.name} - {businessDate}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-3 gap-3 text-sm">
                      <div className="space-y-0.5">
                        <p className="text-muted-foreground">Total Poolable Tips</p>
                        <p className="font-medium text-lg" data-testid="text-tip-pool-total">{formatCurrency(tipPoolSummary.totalPoolableTips)}</p>
                      </div>
                      <div className="space-y-0.5">
                        <p className="text-muted-foreground">Participants</p>
                        <p className="font-medium text-lg" data-testid="text-tip-pool-participants">{tipPoolSummary.participantCount}</p>
                      </div>
                      <div className="space-y-0.5">
                        <p className="text-muted-foreground">Total Hours</p>
                        <p className="font-medium text-lg">{(tipPoolSummary.totalHoursWorked || 0).toFixed(1)}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {tipPoolSummary.participants?.length > 0 && (
                  <Card>
                    <CardHeader className="py-3">
                      <CardTitle className="text-sm">Tip Allocation</CardTitle>
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
                            <TableRow key={i} data-testid={`row-tip-${i}`}>
                              <TableCell className="font-medium">{p.employeeId?.substring(0, 8)}</TableCell>
                              <TableCell className="text-right tabular-nums">{(p.hoursWorked || 0).toFixed(1)}</TableCell>
                              <TableCell className="text-right tabular-nums">{formatPercent(p.sharePercentage)}</TableCell>
                              <TableCell className="text-right tabular-nums font-medium">{formatCurrency(p.allocatedAmount)}</TableCell>
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

          {/* ========== VALIDATION ========== */}
          <TabsContent value="validation">
            {validLoading ? (
              <Card><CardContent className="py-8 text-center text-muted-foreground">Running validation checks...</CardContent></Card>
            ) : validation ? (
              <div className="space-y-4">
                <Card>
                  <CardHeader className="py-3">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <CardTitle className="text-lg">Data Validation</CardTitle>
                      <Badge variant={validation.overall === "PASS" ? "default" : "destructive"} data-testid="badge-validation-overall">
                        {validation.overall === "PASS" ? (
                          <><CheckCircle2 className="h-3.5 w-3.5 mr-1" />ALL PASS</>
                        ) : (
                          <><AlertTriangle className="h-3.5 w-3.5 mr-1" />FAILURES DETECTED</>
                        )}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {validation.checks && Object.entries(validation.checks).map(([key, check]: [string, any]) => (
                      <div key={key} className={`border rounded-md p-3 ${check.status === "PASS" ? "border-green-500/20" : "border-destructive/30 bg-destructive/5"}`}>
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-2">
                            {check.status === "PASS" ? (
                              <CheckCircle2 className="h-4 w-4 text-green-600" />
                            ) : (
                              <AlertTriangle className="h-4 w-4 text-destructive" />
                            )}
                            <span className="text-sm font-medium">
                              {key === "serviceChargeReconciliation" && "Service Charge Reconciliation"}
                              {key === "tipDoubleCountCheck" && "Tip Double-Count Check"}
                              {key === "cashDrawerLinkage" && "Cash Drawer Linkage"}
                              {key === "salesRebuild" && "Sales Rebuild Verification"}
                              {key === "paymentReconciliation" && "Payment Reconciliation"}
                            </span>
                          </div>
                          <Badge variant={check.status === "PASS" ? "secondary" : "destructive"}>
                            {check.status}
                          </Badge>
                        </div>
                        {check.message && (
                          <p className="text-xs text-muted-foreground mt-1">{check.message}</p>
                        )}
                        {key === "paymentReconciliation" && check.breakdown && (
                          <div className="mt-2 space-y-0.5 text-xs">
                            <SummaryRow label="Net Sales" value={formatCurrency(check.breakdown.netSales)} />
                            <SummaryRow label="Tax" value={formatCurrency(check.breakdown.tax)} />
                            <SummaryRow label="Service Charges" value={formatCurrency(check.breakdown.serviceCharges)} />
                            <SummaryRow label="Card Tips" value={formatCurrency(check.breakdown.cardTips)} />
                            <SummaryRow label="Cash Tips" value={formatCurrency(check.breakdown.cashTips)} />
                            <Separator className="my-1" />
                            <SummaryRow label="Customer Total" value={formatCurrency(check.breakdown.customerTotal)} bold />
                            <SummaryRow label="Total Payments" value={formatCurrency(check.breakdown.totalPayments)} bold />
                            <SummaryRow label="Delta" value={formatCurrency(check.breakdown.delta)} bold negative={check.status !== "PASS"} />
                          </div>
                        )}
                        {check.details?.length > 0 && (
                          <div className="mt-2 text-xs text-destructive">
                            {check.details.length} issue(s) found
                          </div>
                        )}
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>
            ) : (
              <Card><CardContent className="py-8 text-center text-muted-foreground">Select a property and date to run validation</CardContent></Card>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
