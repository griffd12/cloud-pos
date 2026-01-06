import { useState, useEffect } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Loader2, Plus, DollarSign, ArrowDownToLine, ArrowUpFromLine, Wallet, Banknote, Lock, Settings, Save } from "lucide-react";
import type { Property, CashDrawer, DrawerAssignment, CashTransaction, SafeCount, Rvc, RvcCashSettings } from "@shared/schema";

export default function CashManagementPage() {
  const { toast } = useToast();
  usePosWebSocket();
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>("");
  const [showDrawerDialog, setShowDrawerDialog] = useState(false);
  const [showTransactionDialog, setShowTransactionDialog] = useState(false);
  const [showSafeCountDialog, setShowSafeCountDialog] = useState(false);
  const [editingDrawer, setEditingDrawer] = useState<CashDrawer | null>(null);
  const [transactionType, setTransactionType] = useState<string>("paid_in");
  const [transactionAmount, setTransactionAmount] = useState("");
  const [transactionReason, setTransactionReason] = useState("");
  const [selectedDrawerId, setSelectedDrawerId] = useState<string>("");

  const [drawerName, setDrawerName] = useState("");
  const [drawerStartingBalance, setDrawerStartingBalance] = useState("");
  
  const [safeAmount, setSafeAmount] = useState("");
  const [safeNotes, setSafeNotes] = useState("");

  const { data: properties = [] } = useQuery<Property[]>({
    queryKey: ["/api/properties"],
  });

  const { data: cashDrawers = [], isLoading: drawersLoading } = useQuery<CashDrawer[]>({
    queryKey: ["/api/cash-drawers", selectedPropertyId],
    enabled: !!selectedPropertyId,
  });

  const { data: drawerAssignments = [] } = useQuery<DrawerAssignment[]>({
    queryKey: ["/api/drawer-assignments", selectedPropertyId],
    enabled: !!selectedPropertyId,
  });

  const { data: cashTransactions = [] } = useQuery<CashTransaction[]>({
    queryKey: ["/api/cash-transactions", selectedPropertyId],
    enabled: !!selectedPropertyId,
  });

  const { data: safeCounts = [] } = useQuery<SafeCount[]>({
    queryKey: ["/api/safe-counts", selectedPropertyId],
    enabled: !!selectedPropertyId,
  });

  const { data: rvcs = [] } = useQuery<Rvc[]>({
    queryKey: ["/api/rvcs"],
  });

  const propertyRvcs = rvcs.filter(r => r.propertyId === selectedPropertyId);
  const [selectedRvcId, setSelectedRvcId] = useState<string>("");

  const { data: rvcCashSettings, isLoading: settingsLoading } = useQuery<RvcCashSettings>({
    queryKey: ["/api/rvcs", selectedRvcId, "cash-settings"],
    enabled: !!selectedRvcId,
  });

  const [settingsForm, setSettingsForm] = useState({
    defaultStartingBank: "150.00",
    requireOpeningCount: true,
    requireClosingCount: true,
    allowStartingBankOverride: true,
    dropReminderThreshold: "500.00",
  });

  useEffect(() => {
    if (rvcCashSettings) {
      setSettingsForm({
        defaultStartingBank: rvcCashSettings.defaultStartingBank || "150.00",
        requireOpeningCount: rvcCashSettings.requireOpeningCount ?? true,
        requireClosingCount: rvcCashSettings.requireClosingCount ?? true,
        allowStartingBankOverride: rvcCashSettings.allowStartingBankOverride ?? true,
        dropReminderThreshold: rvcCashSettings.dropReminderThreshold || "500.00",
      });
    } else if (selectedRvcId) {
      setSettingsForm({
        defaultStartingBank: "150.00",
        requireOpeningCount: true,
        requireClosingCount: true,
        allowStartingBankOverride: true,
        dropReminderThreshold: "500.00",
      });
    }
  }, [rvcCashSettings, selectedRvcId]);

  const createDrawerMutation = useMutation({
    mutationFn: async (data: { name: string; propertyId: string }) => {
      const res = await apiRequest("POST", "/api/cash-drawers", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cash-drawers"] });
      resetDrawerDialog();
      toast({ title: "Drawer Created", description: "Cash drawer has been created." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const createTransactionMutation = useMutation({
    mutationFn: async (data: { drawerId: string; transactionType: string; amount: string; reason: string; propertyId: string }) => {
      const res = await apiRequest("POST", "/api/cash-transactions", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cash-transactions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cash-drawers"] });
      resetTransactionDialog();
      toast({ title: "Transaction Recorded", description: "Cash transaction has been recorded." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const createSafeCountMutation = useMutation({
    mutationFn: async (data: { propertyId: string; actualAmount: string; businessDate: string; countType: string; employeeId?: string; notes?: string }) => {
      const res = await apiRequest("POST", "/api/safe-counts", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/safe-counts"] });
      resetSafeCountDialog();
      toast({ title: "Safe Count Recorded", description: "Safe count has been recorded." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const saveRvcSettingsMutation = useMutation({
    mutationFn: async (data: typeof settingsForm) => {
      const res = await apiRequest("PUT", `/api/rvcs/${selectedRvcId}/cash-settings`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rvcs", selectedRvcId, "cash-settings"] });
      toast({ title: "Settings Saved", description: "Till settings have been updated." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const resetDrawerDialog = () => {
    setDrawerName("");
    setDrawerStartingBalance("");
    setEditingDrawer(null);
    setShowDrawerDialog(false);
  };

  const resetTransactionDialog = () => {
    setTransactionType("paid_in");
    setTransactionAmount("");
    setTransactionReason("");
    setSelectedDrawerId("");
    setShowTransactionDialog(false);
  };

  const resetSafeCountDialog = () => {
    setSafeAmount("");
    setSafeNotes("");
    setShowSafeCountDialog(false);
  };

  const handleCreateDrawer = () => {
    if (!drawerName || !selectedPropertyId) return;
    createDrawerMutation.mutate({
      name: drawerName,
      propertyId: selectedPropertyId,
    });
  };

  const handleCreateTransaction = () => {
    if (!selectedDrawerId || !transactionAmount || !transactionReason) return;
    createTransactionMutation.mutate({
      drawerId: selectedDrawerId,
      transactionType,
      amount: transactionAmount,
      reason: transactionReason,
      propertyId: selectedPropertyId,
    });
  };

  const handleCreateSafeCount = () => {
    if (!safeAmount || !selectedPropertyId) return;
    createSafeCountMutation.mutate({
      propertyId: selectedPropertyId,
      actualAmount: safeAmount,
      businessDate: format(new Date(), "yyyy-MM-dd"),
      countType: "daily",
      notes: safeNotes || undefined,
    });
  };

  const formatCurrency = (value: string | null | undefined) => {
    if (!value) return "$0.00";
    return `$${parseFloat(value).toFixed(2)}`;
  };

  const transactionTypes = [
    { value: "paid_in", label: "Paid In", icon: ArrowDownToLine },
    { value: "paid_out", label: "Paid Out", icon: ArrowUpFromLine },
    { value: "drop", label: "Drop", icon: Lock },
    { value: "pickup", label: "Pickup", icon: Banknote },
  ];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Cash Management</h1>
          <p className="text-muted-foreground">Manage cash drawers, transactions, and safe counts</p>
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
        <Tabs defaultValue="drawers" className="space-y-4">
          <TabsList>
            <TabsTrigger value="drawers" data-testid="tab-drawers">Cash Drawers</TabsTrigger>
            <TabsTrigger value="transactions" data-testid="tab-transactions">Transactions</TabsTrigger>
            <TabsTrigger value="safe" data-testid="tab-safe">Safe Counts</TabsTrigger>
            <TabsTrigger value="till-settings" data-testid="tab-till-settings">Till Settings</TabsTrigger>
          </TabsList>

          <TabsContent value="drawers" className="space-y-4">
            <div className="flex justify-end">
              <Button onClick={() => setShowDrawerDialog(true)} data-testid="button-add-drawer">
                <Plus className="w-4 h-4 mr-2" />
                Add Drawer
              </Button>
            </div>

            {drawersLoading ? (
              <Card><CardContent className="p-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin" /></CardContent></Card>
            ) : cashDrawers.length === 0 ? (
              <Card><CardContent className="p-8 text-center text-muted-foreground">No cash drawers configured.</CardContent></Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {cashDrawers.map(drawer => (
                  <Card key={drawer.id} data-testid={`card-drawer-${drawer.id}`}>
                    <CardHeader className="pb-2">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Wallet className="w-4 h-4" />
                        {drawer.name}
                      </CardTitle>
                      <CardDescription>
                        <Badge variant={drawer.active ? "default" : "secondary"}>{drawer.active ? "Active" : "Inactive"}</Badge>
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        <div className="flex justify-between">
                          <span className="text-sm text-muted-foreground">Workstation</span>
                          <span className="font-medium">{drawer.workstationId || "Unassigned"}</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="transactions" className="space-y-4">
            <div className="flex justify-end">
              <Button onClick={() => setShowTransactionDialog(true)} data-testid="button-add-transaction">
                <Plus className="w-4 h-4 mr-2" />
                Record Transaction
              </Button>
            </div>

            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date/Time</TableHead>
                      <TableHead>Drawer</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Reason</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {cashTransactions.length === 0 ? (
                      <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No transactions recorded.</TableCell></TableRow>
                    ) : (
                      cashTransactions.map(tx => (
                        <TableRow key={tx.id} data-testid={`row-tx-${tx.id}`}>
                          <TableCell>{tx.createdAt ? format(new Date(tx.createdAt), "MMM d, h:mm a") : "-"}</TableCell>
                          <TableCell>{cashDrawers.find(d => d.id === tx.drawerId)?.name || "-"}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{tx.transactionType?.replace("_", " ")}</Badge>
                          </TableCell>
                          <TableCell className="text-right font-medium">{formatCurrency(tx.amount)}</TableCell>
                          <TableCell className="max-w-[200px] truncate">{tx.reason}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="safe" className="space-y-4">
            <div className="flex justify-end">
              <Button onClick={() => setShowSafeCountDialog(true)} data-testid="button-add-safe-count">
                <Plus className="w-4 h-4 mr-2" />
                Record Safe Count
              </Button>
            </div>

            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date/Time</TableHead>
                      <TableHead className="text-right">Counted Amount</TableHead>
                      <TableHead>Notes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {safeCounts.length === 0 ? (
                      <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">No safe counts recorded.</TableCell></TableRow>
                    ) : (
                      safeCounts.map(count => (
                        <TableRow key={count.id} data-testid={`row-safe-${count.id}`}>
                          <TableCell>{count.createdAt ? format(new Date(count.createdAt), "MMM d, h:mm a") : "-"}</TableCell>
                          <TableCell className="text-right font-medium">{formatCurrency(count.actualAmount)}</TableCell>
                          <TableCell className="max-w-[300px] truncate">{count.notes || "-"}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="till-settings" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Settings className="w-4 h-4" />
                  Till Settings by Revenue Center
                </CardTitle>
                <CardDescription>Configure opening/closing count requirements and default amounts per RVC</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label>Select Revenue Center</Label>
                  <Select value={selectedRvcId} onValueChange={setSelectedRvcId}>
                    <SelectTrigger className="w-64" data-testid="select-rvc-settings">
                      <SelectValue placeholder="Select RVC..." />
                    </SelectTrigger>
                    <SelectContent>
                      {propertyRvcs.map(rvc => (
                        <SelectItem key={rvc.id} value={rvc.id}>{rvc.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {selectedRvcId && (
                  <>
                    {settingsLoading ? (
                      <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin" /></div>
                    ) : (
                      <div className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div className="space-y-2">
                            <Label>Default Starting Bank</Label>
                            <div className="relative">
                              <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                              <Input
                                type="number"
                                step="0.01"
                                value={settingsForm.defaultStartingBank}
                                onChange={(e) => setSettingsForm(s => ({ ...s, defaultStartingBank: e.target.value }))}
                                className="pl-9"
                                data-testid="input-starting-bank"
                              />
                            </div>
                            <p className="text-sm text-muted-foreground">Default amount when opening a till</p>
                          </div>

                          <div className="space-y-2">
                            <Label>Drop Reminder Threshold</Label>
                            <div className="relative">
                              <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                              <Input
                                type="number"
                                step="0.01"
                                value={settingsForm.dropReminderThreshold}
                                onChange={(e) => setSettingsForm(s => ({ ...s, dropReminderThreshold: e.target.value }))}
                                className="pl-9"
                                data-testid="input-drop-threshold"
                              />
                            </div>
                            <p className="text-sm text-muted-foreground">Remind employee to drop cash when till exceeds this amount</p>
                          </div>
                        </div>

                        <div className="space-y-4">
                          <div className="flex items-center justify-between">
                            <div>
                              <Label>Require Opening Count</Label>
                              <p className="text-sm text-muted-foreground">Employees must count denomination before starting</p>
                            </div>
                            <Switch
                              checked={settingsForm.requireOpeningCount}
                              onCheckedChange={(checked) => setSettingsForm(s => ({ ...s, requireOpeningCount: checked }))}
                              data-testid="switch-require-open-count"
                            />
                          </div>

                          <div className="flex items-center justify-between">
                            <div>
                              <Label>Require Closing Count</Label>
                              <p className="text-sm text-muted-foreground">Employees must count denomination when closing</p>
                            </div>
                            <Switch
                              checked={settingsForm.requireClosingCount}
                              onCheckedChange={(checked) => setSettingsForm(s => ({ ...s, requireClosingCount: checked }))}
                              data-testid="switch-require-close-count"
                            />
                          </div>

                          <div className="flex items-center justify-between">
                            <div>
                              <Label>Allow Starting Bank Override</Label>
                              <p className="text-sm text-muted-foreground">Allow employees to change the default starting amount</p>
                            </div>
                            <Switch
                              checked={settingsForm.allowStartingBankOverride}
                              onCheckedChange={(checked) => setSettingsForm(s => ({ ...s, allowStartingBankOverride: checked }))}
                              data-testid="switch-allow-override"
                            />
                          </div>
                        </div>

                        <div className="flex justify-end">
                          <Button
                            onClick={() => saveRvcSettingsMutation.mutate(settingsForm)}
                            disabled={saveRvcSettingsMutation.isPending}
                            data-testid="button-save-till-settings"
                          >
                            {saveRvcSettingsMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                            Save Settings
                          </Button>
                        </div>
                      </div>
                    )}
                  </>
                )}

                {!selectedRvcId && propertyRvcs.length === 0 && (
                  <p className="text-muted-foreground text-center py-4">No revenue centers configured for this property.</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}

      <Dialog open={showDrawerDialog} onOpenChange={(open) => { if (!open) resetDrawerDialog(); setShowDrawerDialog(open); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Cash Drawer</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Drawer Name</Label>
              <Input value={drawerName} onChange={(e) => setDrawerName(e.target.value)} placeholder="e.g., Register 1" data-testid="input-drawer-name" />
            </div>
            <div className="space-y-2">
              <Label>Starting Balance</Label>
              <Input type="number" step="0.01" value={drawerStartingBalance} onChange={(e) => setDrawerStartingBalance(e.target.value)} placeholder="0.00" data-testid="input-starting-balance" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={resetDrawerDialog}>Cancel</Button>
            <Button onClick={handleCreateDrawer} disabled={!drawerName || createDrawerMutation.isPending} data-testid="button-save-drawer">
              {createDrawerMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Create Drawer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showTransactionDialog} onOpenChange={(open) => { if (!open) resetTransactionDialog(); setShowTransactionDialog(open); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record Cash Transaction</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Drawer</Label>
              <Select value={selectedDrawerId} onValueChange={setSelectedDrawerId}>
                <SelectTrigger data-testid="select-drawer">
                  <SelectValue placeholder="Select drawer..." />
                </SelectTrigger>
                <SelectContent>
                  {cashDrawers.map(d => (
                    <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Transaction Type</Label>
              <Select value={transactionType} onValueChange={setTransactionType}>
                <SelectTrigger data-testid="select-tx-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {transactionTypes.map(t => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Amount</Label>
              <Input type="number" step="0.01" value={transactionAmount} onChange={(e) => setTransactionAmount(e.target.value)} placeholder="0.00" data-testid="input-tx-amount" />
            </div>
            <div className="space-y-2">
              <Label>Reason</Label>
              <Textarea value={transactionReason} onChange={(e) => setTransactionReason(e.target.value)} placeholder="Reason for transaction..." data-testid="input-tx-reason" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={resetTransactionDialog}>Cancel</Button>
            <Button onClick={handleCreateTransaction} disabled={!selectedDrawerId || !transactionAmount || !transactionReason || createTransactionMutation.isPending} data-testid="button-save-tx">
              {createTransactionMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Record Transaction
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showSafeCountDialog} onOpenChange={(open) => { if (!open) resetSafeCountDialog(); setShowSafeCountDialog(open); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record Safe Count</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Counted Amount</Label>
              <Input type="number" step="0.01" value={safeAmount} onChange={(e) => setSafeAmount(e.target.value)} placeholder="0.00" data-testid="input-safe-amount" />
            </div>
            <div className="space-y-2">
              <Label>Notes (optional)</Label>
              <Textarea value={safeNotes} onChange={(e) => setSafeNotes(e.target.value)} placeholder="Any notes..." data-testid="input-safe-notes" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={resetSafeCountDialog}>Cancel</Button>
            <Button onClick={handleCreateSafeCount} disabled={!safeAmount || createSafeCountMutation.isPending} data-testid="button-save-safe-count">
              {createSafeCountMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Record Count
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
