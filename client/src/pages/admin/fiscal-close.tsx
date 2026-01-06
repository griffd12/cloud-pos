import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { usePosWebSocket } from "@/hooks/use-pos-websocket";
import { format } from "date-fns";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Loader2, Calendar, Lock, Unlock, DollarSign, AlertTriangle, CheckCircle2 } from "lucide-react";
import type { Property, FiscalPeriod } from "@shared/schema";

export default function FiscalClosePage() {
  const { toast } = useToast();
  usePosWebSocket();
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>("");
  const [showCloseDialog, setShowCloseDialog] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState<FiscalPeriod | null>(null);
  const [pin, setPin] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [cashVariance, setCashVariance] = useState("");
  const [notes, setNotes] = useState("");

  const { data: properties = [], isLoading: propertiesLoading } = useQuery<Property[]>({
    queryKey: ["/api/properties"],
  });

  const { data: currentPeriod, isLoading: currentLoading } = useQuery<FiscalPeriod>({
    queryKey: ["/api/fiscal-periods/current", selectedPropertyId],
    queryFn: async () => {
      const res = await fetch(`/api/fiscal-periods/current/${selectedPropertyId}`);
      if (!res.ok) throw new Error("Failed to fetch current period");
      return res.json();
    },
    enabled: !!selectedPropertyId,
  });

  const { data: fiscalPeriods = [], isLoading: periodsLoading } = useQuery<FiscalPeriod[]>({
    queryKey: ["/api/fiscal-periods", selectedPropertyId],
    queryFn: async () => {
      const res = await fetch(`/api/fiscal-periods?propertyId=${selectedPropertyId}`);
      if (!res.ok) throw new Error("Failed to fetch fiscal periods");
      return res.json();
    },
    enabled: !!selectedPropertyId,
  });

  const closePeriodMutation = useMutation({
    mutationFn: async (data: { periodId: string; pin: string; cashVariance?: string; notes?: string }) => {
      const res = await apiRequest("POST", `/api/fiscal-periods/${data.periodId}/close`, {
        pin: data.pin,
        cashVariance: data.cashVariance,
        notes: data.notes,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/fiscal-periods"] });
      queryClient.invalidateQueries({ queryKey: ["/api/fiscal-periods/current"] });
      setShowCloseDialog(false);
      resetDialog();
      toast({ title: "Day Closed", description: "Fiscal period has been closed successfully." });
    },
    onError: (error: Error) => {
      toast({ title: "Close Failed", description: error.message, variant: "destructive" });
    },
  });

  const resetDialog = () => {
    setPin("");
    setAcknowledged(false);
    setCashVariance("");
    setNotes("");
    setSelectedPeriod(null);
  };

  const handleCloseDay = () => {
    if (!selectedPeriod || !pin || !acknowledged) return;
    closePeriodMutation.mutate({
      periodId: selectedPeriod.id,
      pin,
      cashVariance: cashVariance || undefined,
      notes: notes || undefined,
    });
  };

  const openCloseDialog = (period: FiscalPeriod) => {
    setSelectedPeriod(period);
    setShowCloseDialog(true);
  };

  const selectedProperty = properties.find(p => p.id === selectedPropertyId);

  const formatCurrency = (value: string | null | undefined) => {
    if (!value) return "$0.00";
    return `$${parseFloat(value).toFixed(2)}`;
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Fiscal Close / End of Day</h1>
          <p className="text-muted-foreground">Manage business dates and close fiscal periods</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Select Property</CardTitle>
        </CardHeader>
        <CardContent>
          <Select value={selectedPropertyId} onValueChange={setSelectedPropertyId}>
            <SelectTrigger className="w-64" data-testid="select-property">
              <SelectValue placeholder="Select a property..." />
            </SelectTrigger>
            <SelectContent>
              {properties.map(prop => (
                <SelectItem key={prop.id} value={prop.id}>{prop.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {selectedPropertyId && (
        <Tabs defaultValue="current" className="space-y-4">
          <TabsList>
            <TabsTrigger value="current" data-testid="tab-current">Current Period</TabsTrigger>
            <TabsTrigger value="history" data-testid="tab-history">History</TabsTrigger>
          </TabsList>

          <TabsContent value="current" className="space-y-4">
            {currentLoading ? (
              <Card><CardContent className="p-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin" /></CardContent></Card>
            ) : currentPeriod ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Calendar className="w-5 h-5" />
                      Business Date: {currentPeriod.businessDate}
                    </CardTitle>
                    <CardDescription>
                      Status: <Badge variant={currentPeriod.status === "open" ? "default" : "secondary"}>{currentPeriod.status}</Badge>
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-muted-foreground">Gross Sales</p>
                        <p className="text-xl font-semibold" data-testid="text-gross-sales">{formatCurrency(currentPeriod.grossSales)}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Net Sales</p>
                        <p className="text-xl font-semibold" data-testid="text-net-sales">{formatCurrency(currentPeriod.netSales)}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Total Tax</p>
                        <p className="text-xl font-semibold">{formatCurrency(currentPeriod.taxCollected)}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Total Tips</p>
                        <p className="text-xl font-semibold">{formatCurrency(currentPeriod.tipsTotal)}</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-4 pt-4 border-t">
                      <div>
                        <p className="text-sm text-muted-foreground">Checks</p>
                        <p className="text-lg font-medium">{currentPeriod.checkCount || 0}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Guests</p>
                        <p className="text-lg font-medium">{currentPeriod.guestCount || 0}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Discounts</p>
                        <p className="text-lg font-medium">{formatCurrency(currentPeriod.discountsTotal)}</p>
                      </div>
                    </div>

                    {currentPeriod.status === "open" && (
                      <Button 
                        className="w-full mt-4" 
                        onClick={() => openCloseDialog(currentPeriod)}
                        data-testid="button-close-day"
                      >
                        <Lock className="w-4 h-4 mr-2" />
                        Close Business Day
                      </Button>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Cash Reconciliation</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-muted-foreground">Expected Cash</p>
                        <p className="text-lg font-medium">{formatCurrency(currentPeriod.cashExpected)}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Actual Cash</p>
                        <p className="text-lg font-medium">{formatCurrency(currentPeriod.cashActual)}</p>
                      </div>
                    </div>
                    {currentPeriod.cashVariance && parseFloat(currentPeriod.cashVariance) !== 0 && (
                      <div className={`flex items-center gap-2 p-3 rounded-md ${parseFloat(currentPeriod.cashVariance) > 0 ? "bg-green-100 dark:bg-green-900/20" : "bg-red-100 dark:bg-red-900/20"}`}>
                        {parseFloat(currentPeriod.cashVariance) > 0 ? (
                          <CheckCircle2 className="w-4 h-4 text-green-600" />
                        ) : (
                          <AlertTriangle className="w-4 h-4 text-red-600" />
                        )}
                        <span className="text-sm">Variance: {formatCurrency(currentPeriod.cashVariance)}</span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            ) : (
              <Card>
                <CardContent className="p-8 text-center text-muted-foreground">
                  No current fiscal period found. A new period will be created automatically.
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="history">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Fiscal Period History</CardTitle>
              </CardHeader>
              <CardContent>
                {periodsLoading ? (
                  <div className="flex justify-center p-8"><Loader2 className="w-6 h-6 animate-spin" /></div>
                ) : fiscalPeriods.length === 0 ? (
                  <p className="text-center text-muted-foreground p-4">No fiscal periods found.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Business Date</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Gross Sales</TableHead>
                        <TableHead className="text-right">Net Sales</TableHead>
                        <TableHead className="text-right">Cash Variance</TableHead>
                        <TableHead>Closed At</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {fiscalPeriods.map(period => (
                        <TableRow key={period.id} data-testid={`row-period-${period.id}`}>
                          <TableCell className="font-medium">{period.businessDate}</TableCell>
                          <TableCell>
                            <Badge variant={period.status === "open" ? "default" : period.status === "closed" ? "secondary" : "outline"}>
                              {period.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">{formatCurrency(period.grossSales)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(period.netSales)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(period.cashVariance)}</TableCell>
                          <TableCell>{period.closedAt ? format(new Date(period.closedAt), "MMM d, h:mm a") : "-"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}

      <Dialog open={showCloseDialog} onOpenChange={(open) => { if (!open) resetDialog(); setShowCloseDialog(open); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Close Business Day</DialogTitle>
            <DialogDescription>
              Close fiscal period for {selectedProperty?.name} - {selectedPeriod?.businessDate}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Cash Variance (optional)</Label>
              <Input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={cashVariance}
                onChange={(e) => setCashVariance(e.target.value)}
                data-testid="input-cash-variance"
              />
            </div>
            <div className="space-y-2">
              <Label>Notes (optional)</Label>
              <Input
                placeholder="Any notes for this close..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                data-testid="input-notes"
              />
            </div>
            <div className="space-y-2">
              <Label>Manager PIN</Label>
              <Input
                type="password"
                placeholder="Enter PIN"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                data-testid="input-pin"
              />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="acknowledge"
                checked={acknowledged}
                onCheckedChange={(c) => setAcknowledged(c === true)}
                data-testid="checkbox-acknowledge"
              />
              <label htmlFor="acknowledge" className="text-sm">
                I confirm all transactions have been reviewed and the day is ready to close.
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCloseDialog(false)}>Cancel</Button>
            <Button
              onClick={handleCloseDay}
              disabled={!pin || !acknowledged || closePeriodMutation.isPending}
              data-testid="button-confirm-close"
            >
              {closePeriodMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Close Day
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
