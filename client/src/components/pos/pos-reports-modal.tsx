import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  BarChart3,
  DollarSign,
  Users,
  Receipt,
  CreditCard,
  UtensilsCrossed,
  TrendingUp,
  Clock,
  FileText,
} from "lucide-react";

interface Employee {
  id: string;
  firstName: string;
  lastName: string;
}

interface POSReportsModalProps {
  open: boolean;
  onClose: () => void;
  rvcId: string;
  rvcName?: string;
  propertyId?: string;
}

interface SalesSummary {
  grossSales: number;
  netSales: number;
  taxTotal: number;
  totalWithTax: number;
  totalPayments: number;
  totalTips: number;
  discountTotal: number;
  checksStarted: number;
  checksClosed: number;
  checksOutstanding: number;
  avgCheck: number;
}

interface TenderBreakdown {
  name: string;
  count: number;
  amount: number;
}

interface EmployeeBalance {
  employeeId: string;
  employeeName: string;
  checkCount: number;
  itemCount: number;
  subtotal: number;
  tax: number;
  total: number;
  totalCollected: number;
  cashCollected: number;
  creditCollected: number;
  otherCollected: number;
  tipTotal: number;
}

interface OpenCheck {
  id: string;
  checkNumber: number;
  total: string;
  tableNumber: string | null;
  openedAt: string | null;
  employeeName: string;
}

interface ClosedCheck {
  id: string;
  checkNumber: number;
  total: number;
  totalPaid: number;
  closedAt: string | null;
  employeeName: string;
  durationMinutes: number;
}

interface MenuItemSale {
  menuItemId: string;
  menuItemName: string;
  quantity: number;
  grossSales: number;
  netSales: number;
}

export function POSReportsModal({
  open,
  onClose,
  rvcId,
  rvcName,
  propertyId,
}: POSReportsModalProps) {
  const today = new Date().toISOString().split("T")[0];
  const [businessDate, setBusinessDate] = useState(today);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>("all");
  const [activeTab, setActiveTab] = useState("rvc-balance");

  const { data: employees = [] } = useQuery<Employee[]>({
    queryKey: ["/api/employees", rvcId],
    enabled: open,
  });

  const { data: salesSummary } = useQuery<SalesSummary>({
    queryKey: ["/api/reports/sales-summary", { rvcId, businessDate }],
    enabled: open && !!rvcId,
  });

  const { data: tenderBreakdown } = useQuery<{ tenders: TenderBreakdown[] }>({
    queryKey: ["/api/reports/tender-breakdown", { rvcId, businessDate }],
    enabled: open && !!rvcId && activeTab === "tender",
  });

  const { data: employeeBalances } = useQuery<{ employees: EmployeeBalance[] }>({
    queryKey: ["/api/reports/employee-balance", { rvcId, businessDate }],
    enabled: open && !!rvcId && (activeTab === "employee-balance" || activeTab === "system-balance"),
  });

  const { data: openChecksData } = useQuery<{ checks: OpenCheck[] }>({
    queryKey: ["/api/reports/open-checks", { rvcId }],
    enabled: open && !!rvcId && activeTab === "open-checks",
  });

  const { data: closedChecksData } = useQuery<{ checks: ClosedCheck[] }>({
    queryKey: ["/api/reports/closed-checks", { rvcId, businessDate }],
    enabled: open && !!rvcId && activeTab === "closed-checks",
  });

  const { data: menuItemSales } = useQuery<{ items: MenuItemSale[] }>({
    queryKey: ["/api/reports/menu-item-sales", { rvcId, businessDate }],
    enabled: open && !!rvcId && activeTab === "menu-items",
  });

  const formatPrice = (price: number) => `$${price.toFixed(2)}`;

  const formatTime = (dateStr: string | null) => {
    if (!dateStr) return "-";
    const date = new Date(dateStr);
    return date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  };

  const filteredEmployeeBalances = useMemo(() => {
    if (!employeeBalances?.employees) return [];
    if (selectedEmployeeId === "all") return employeeBalances.employees;
    return employeeBalances.employees.filter((e) => e.employeeId === selectedEmployeeId);
  }, [employeeBalances, selectedEmployeeId]);

  const systemTotals = useMemo(() => {
    if (!employeeBalances?.employees) return null;
    return employeeBalances.employees.reduce(
      (acc, emp) => ({
        checkCount: acc.checkCount + emp.checkCount,
        itemCount: acc.itemCount + emp.itemCount,
        subtotal: acc.subtotal + emp.subtotal,
        tax: acc.tax + emp.tax,
        total: acc.total + emp.total,
        totalCollected: acc.totalCollected + emp.totalCollected,
        cashCollected: acc.cashCollected + emp.cashCollected,
        creditCollected: acc.creditCollected + emp.creditCollected,
        otherCollected: acc.otherCollected + emp.otherCollected,
        tipTotal: acc.tipTotal + emp.tipTotal,
      }),
      {
        checkCount: 0,
        itemCount: 0,
        subtotal: 0,
        tax: 0,
        total: 0,
        totalCollected: 0,
        cashCollected: 0,
        creditCollected: 0,
        otherCollected: 0,
        tipTotal: 0,
      }
    );
  }, [employeeBalances]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5" />
            Reports - {rvcName || "RVC"}
          </DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-4 pb-4 border-b">
          <div className="flex items-center gap-2">
            <Label htmlFor="business-date">Date:</Label>
            <Input
              id="business-date"
              type="date"
              value={businessDate}
              onChange={(e) => setBusinessDate(e.target.value)}
              className="w-40"
              data-testid="input-report-date"
            />
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1">
          <TabsList className="grid w-full grid-cols-7 h-auto">
            <TabsTrigger value="rvc-balance" className="text-xs py-2">
              <DollarSign className="w-3 h-3 mr-1" />
              RVC Balance
            </TabsTrigger>
            <TabsTrigger value="system-balance" className="text-xs py-2">
              <TrendingUp className="w-3 h-3 mr-1" />
              System
            </TabsTrigger>
            <TabsTrigger value="employee-balance" className="text-xs py-2">
              <Users className="w-3 h-3 mr-1" />
              Employee
            </TabsTrigger>
            <TabsTrigger value="open-checks" className="text-xs py-2">
              <Clock className="w-3 h-3 mr-1" />
              Open Checks
            </TabsTrigger>
            <TabsTrigger value="closed-checks" className="text-xs py-2">
              <FileText className="w-3 h-3 mr-1" />
              Closed Checks
            </TabsTrigger>
            <TabsTrigger value="menu-items" className="text-xs py-2">
              <UtensilsCrossed className="w-3 h-3 mr-1" />
              Menu Items
            </TabsTrigger>
            <TabsTrigger value="tender" className="text-xs py-2">
              <CreditCard className="w-3 h-3 mr-1" />
              Tender
            </TabsTrigger>
          </TabsList>

          <ScrollArea className="h-[400px] mt-4">
            <TabsContent value="rvc-balance" className="mt-0">
              {salesSummary ? (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm text-muted-foreground">Gross Sales</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{formatPrice(salesSummary.grossSales)}</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm text-muted-foreground">Net Sales</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{formatPrice(salesSummary.netSales)}</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm text-muted-foreground">Tax Collected</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{formatPrice(salesSummary.taxTotal)}</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm text-muted-foreground">Total Payments</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-green-600">{formatPrice(salesSummary.totalPayments)}</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm text-muted-foreground">Checks Started</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{salesSummary.checksStarted}</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm text-muted-foreground">Checks Closed</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{salesSummary.checksClosed}</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm text-muted-foreground">Outstanding</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-amber-600">{salesSummary.checksOutstanding}</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm text-muted-foreground">Avg Check</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{formatPrice(salesSummary.avgCheck)}</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm text-muted-foreground">Tips</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{formatPrice(salesSummary.totalTips)}</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm text-muted-foreground">Discounts</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-red-600">{formatPrice(salesSummary.discountTotal)}</div>
                    </CardContent>
                  </Card>
                </div>
              ) : (
                <div className="text-center text-muted-foreground py-8">Loading...</div>
              )}
            </TabsContent>

            <TabsContent value="system-balance" className="mt-0">
              {systemTotals ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm text-muted-foreground">Total Checks</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">{systemTotals.checkCount}</div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm text-muted-foreground">Total Items</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">{systemTotals.itemCount}</div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm text-muted-foreground">Sales Total</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold">{formatPrice(systemTotals.total)}</div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm text-muted-foreground">Collected</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold text-green-600">{formatPrice(systemTotals.totalCollected)}</div>
                      </CardContent>
                    </Card>
                  </div>
                  <Separator />
                  <div className="grid grid-cols-3 gap-4">
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm text-muted-foreground">Cash</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-xl font-bold">{formatPrice(systemTotals.cashCollected)}</div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm text-muted-foreground">Credit</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-xl font-bold">{formatPrice(systemTotals.creditCollected)}</div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm text-muted-foreground">Tips</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-xl font-bold">{formatPrice(systemTotals.tipTotal)}</div>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              ) : (
                <div className="text-center text-muted-foreground py-8">Loading...</div>
              )}
            </TabsContent>

            <TabsContent value="employee-balance" className="mt-0">
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Label>Employee:</Label>
                  <Select value={selectedEmployeeId} onValueChange={setSelectedEmployeeId}>
                    <SelectTrigger className="w-48" data-testid="select-employee-filter">
                      <SelectValue placeholder="All Employees" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Employees</SelectItem>
                      {employees.map((emp) => (
                        <SelectItem key={emp.id} value={emp.id}>
                          {emp.firstName} {emp.lastName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-3">
                  {filteredEmployeeBalances.map((emp) => (
                    <Card key={emp.employeeId}>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base flex items-center justify-between">
                          <span>{emp.employeeName}</span>
                          <Badge variant="secondary">{emp.checkCount} checks</Badge>
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-4 gap-4 text-sm">
                          <div>
                            <div className="text-muted-foreground">Sales</div>
                            <div className="font-semibold">{formatPrice(emp.total)}</div>
                          </div>
                          <div>
                            <div className="text-muted-foreground">Collected</div>
                            <div className="font-semibold text-green-600">{formatPrice(emp.totalCollected)}</div>
                          </div>
                          <div>
                            <div className="text-muted-foreground">Cash</div>
                            <div className="font-semibold">{formatPrice(emp.cashCollected)}</div>
                          </div>
                          <div>
                            <div className="text-muted-foreground">Tips</div>
                            <div className="font-semibold">{formatPrice(emp.tipTotal)}</div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="open-checks" className="mt-0">
              <div className="space-y-2">
                {openChecksData?.checks && openChecksData.checks.length > 0 ? (
                  openChecksData.checks.map((check) => (
                    <Card key={check.id}>
                      <CardContent className="py-3 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                            <span className="font-bold text-amber-700 dark:text-amber-300">#{check.checkNumber}</span>
                          </div>
                          <div>
                            <div className="font-medium">
                              Check #{check.checkNumber}
                              {check.tableNumber && (
                                <span className="text-muted-foreground ml-2">Table {check.tableNumber}</span>
                              )}
                            </div>
                            <div className="text-sm text-muted-foreground">
                              {check.employeeName} • Opened {formatTime(check.openedAt)}
                            </div>
                          </div>
                        </div>
                        <div className="text-lg font-bold">{formatPrice(parseFloat(check.total))}</div>
                      </CardContent>
                    </Card>
                  ))
                ) : (
                  <div className="text-center text-muted-foreground py-8">No open checks</div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="closed-checks" className="mt-0">
              <div className="space-y-2">
                {closedChecksData?.checks && closedChecksData.checks.length > 0 ? (
                  closedChecksData.checks.map((check) => (
                    <Card key={check.id}>
                      <CardContent className="py-3 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                            <span className="font-bold text-green-700 dark:text-green-300">#{check.checkNumber}</span>
                          </div>
                          <div>
                            <div className="font-medium">Check #{check.checkNumber}</div>
                            <div className="text-sm text-muted-foreground">
                              {check.employeeName} • Closed {formatTime(check.closedAt)} • {check.durationMinutes}min
                            </div>
                          </div>
                        </div>
                        <div className="text-lg font-bold text-green-600">{formatPrice(check.totalPaid)}</div>
                      </CardContent>
                    </Card>
                  ))
                ) : (
                  <div className="text-center text-muted-foreground py-8">No closed checks for this date</div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="menu-items" className="mt-0">
              <div className="space-y-2">
                {menuItemSales?.items && menuItemSales.items.length > 0 ? (
                  menuItemSales.items.map((item, idx) => (
                    <Card key={item.menuItemId || idx}>
                      <CardContent className="py-3 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Badge variant="secondary" className="w-10 h-10 flex items-center justify-center rounded-full">
                            {item.quantity}
                          </Badge>
                          <div>
                            <div className="font-medium">{item.menuItemName}</div>
                            <div className="text-sm text-muted-foreground">
                              {item.quantity} sold
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-bold">{formatPrice(item.netSales)}</div>
                          <div className="text-sm text-muted-foreground">gross: {formatPrice(item.grossSales)}</div>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                ) : (
                  <div className="text-center text-muted-foreground py-8">No menu item sales for this date</div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="tender" className="mt-0">
              <div className="space-y-4">
                {tenderBreakdown?.tenders && tenderBreakdown.tenders.length > 0 ? (
                  tenderBreakdown.tenders.map((tender) => (
                    <Card key={tender.name}>
                      <CardContent className="py-4 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <CreditCard className="w-6 h-6 text-muted-foreground" />
                          <div>
                            <div className="font-medium">{tender.name}</div>
                            <div className="text-sm text-muted-foreground">{tender.count} transactions</div>
                          </div>
                        </div>
                        <div className="text-xl font-bold text-green-600">{formatPrice(tender.amount)}</div>
                      </CardContent>
                    </Card>
                  ))
                ) : (
                  <div className="text-center text-muted-foreground py-8">No tender data for this date</div>
                )}
              </div>
            </TabsContent>
          </ScrollArea>
        </Tabs>

        <div className="flex justify-end pt-4 border-t">
          <Button variant="secondary" onClick={onClose} data-testid="button-close-reports">
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
