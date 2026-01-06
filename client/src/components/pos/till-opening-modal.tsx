import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Loader2, DollarSign, Banknote } from "lucide-react";
import type { RvcCashSettings, TillSession } from "@shared/schema";
import { DEFAULT_DENOMINATIONS } from "@shared/schema";

interface TillOpeningModalProps {
  open: boolean;
  onClose: () => void;
  onComplete: (session: TillSession) => void;
  employeeId: string;
  rvcId: string;
  propertyId: string;
  workstationId: string;
  businessDate: string;
}

interface DenominationCount {
  code: string;
  name: string;
  value: number;
  quantity: number;
}

export function TillOpeningModal({
  open,
  onClose,
  onComplete,
  employeeId,
  rvcId,
  propertyId,
  workstationId,
  businessDate,
}: TillOpeningModalProps) {
  const { toast } = useToast();
  const [step, setStep] = useState<"start" | "count">("start");
  const [startingAmount, setStartingAmount] = useState("150.00");
  const [denominations, setDenominations] = useState<DenominationCount[]>([]);

  const { data: cashSettings, isLoading: settingsLoading } = useQuery<RvcCashSettings>({
    queryKey: ["/api/rvcs", rvcId, "cash-settings"],
    enabled: open && !!rvcId,
  });

  useEffect(() => {
    if (cashSettings) {
      setStartingAmount(cashSettings.defaultStartingBank || "150.00");
    }
    setDenominations(
      DEFAULT_DENOMINATIONS.map((d) => ({
        code: d.code,
        name: d.label,
        value: d.value,
        quantity: 0,
      }))
    );
  }, [cashSettings, open]);

  const countedTotal = denominations.reduce((sum, d) => sum + d.value * d.quantity, 0);

  const updateDenomination = (code: string, quantity: number) => {
    setDenominations((prev) =>
      prev.map((d) => (d.code === code ? { ...d, quantity: Math.max(0, quantity) } : d))
    );
  };

  const createTillMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/till-sessions", {
        propertyId,
        rvcId,
        workstationId,
        employeeId,
        businessDate,
        expectedOpenAmount: startingAmount,
      });
      return res.json();
    },
    onSuccess: (session) => {
      if (cashSettings?.requireOpeningCount) {
        setStep("count");
        recordOpeningCount(session.id);
      } else {
        activateTillDirectly(session.id);
      }
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const recordOpeningCount = async (sessionId: string) => {
    try {
      const res = await apiRequest("POST", `/api/till-sessions/${sessionId}/counts`, {
        countType: "open",
        expectedAmount: startingAmount,
        countedAmount: countedTotal.toFixed(2),
        note: "",
        recordedById: employeeId,
        denominations: denominations.filter((d) => d.quantity > 0),
      });
      const data = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/till-sessions"] });
      toast({ title: "Till Opened", description: "Your till session is now active" });
      onComplete(data.session);
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to record count", variant: "destructive" });
    }
  };

  const activateTillDirectly = async (sessionId: string) => {
    try {
      const res = await apiRequest("POST", `/api/till-sessions/${sessionId}/counts`, {
        countType: "open",
        expectedAmount: startingAmount,
        countedAmount: startingAmount,
        note: "Opening count not required",
        recordedById: employeeId,
        denominations: [],
      });
      const data = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/till-sessions"] });
      toast({ title: "Till Opened", description: "Your till session is now active" });
      onComplete(data.session);
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to open till", variant: "destructive" });
    }
  };

  const handleStart = () => {
    if (cashSettings?.requireOpeningCount) {
      createTillMutation.mutate();
    } else {
      createTillMutation.mutate();
    }
  };

  const handleCountComplete = () => {
    recordOpeningCount(createTillMutation.data?.id);
  };

  const requiresCount = cashSettings?.requireOpeningCount ?? true;
  const allowOverride = cashSettings?.allowStartingBankOverride ?? true;

  if (settingsLoading) {
    return (
      <Dialog open={open} onOpenChange={() => {}}>
        <DialogContent>
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Banknote className="w-5 h-5" />
            Open Till
          </DialogTitle>
          <DialogDescription>
            {step === "start"
              ? "Set up your till before starting transactions"
              : "Count your starting cash by denomination"}
          </DialogDescription>
        </DialogHeader>

        {step === "start" && (
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Starting Bank Amount</Label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  type="number"
                  step="0.01"
                  value={startingAmount}
                  onChange={(e) => setStartingAmount(e.target.value)}
                  disabled={!allowOverride}
                  className="pl-9"
                  data-testid="input-starting-amount"
                />
              </div>
              {!allowOverride && (
                <p className="text-sm text-muted-foreground">
                  Starting bank amount is fixed by management
                </p>
              )}
            </div>

            {requiresCount && (
              <p className="text-sm text-muted-foreground">
                You will need to count your drawer by denomination after this step.
              </p>
            )}
          </div>
        )}

        {step === "count" && (
          <div className="space-y-4 py-2">
            <div className="text-sm text-muted-foreground">
              Expected starting amount: <span className="font-medium">${startingAmount}</span>
            </div>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Denomination Count</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {denominations.map((d) => (
                  <div key={d.code} className="flex items-center justify-between gap-4">
                    <span className="text-sm min-w-[100px]">{d.name}</span>
                    <div className="flex items-center gap-2">
                      <Button
                        size="icon"
                        variant="outline"
                        onClick={() => updateDenomination(d.code, d.quantity - 1)}
                        data-testid={`btn-decrement-${d.code}`}
                      >
                        -
                      </Button>
                      <Input
                        type="number"
                        value={d.quantity}
                        onChange={(e) => updateDenomination(d.code, parseInt(e.target.value) || 0)}
                        className="w-16 text-center"
                        data-testid={`input-qty-${d.code}`}
                      />
                      <Button
                        size="icon"
                        variant="outline"
                        onClick={() => updateDenomination(d.code, d.quantity + 1)}
                        data-testid={`btn-increment-${d.code}`}
                      >
                        +
                      </Button>
                      <span className="text-sm text-muted-foreground min-w-[60px] text-right">
                        ${(d.value * d.quantity).toFixed(2)}
                      </span>
                    </div>
                  </div>
                ))}
                <Separator className="my-2" />
                <div className="flex items-center justify-between font-medium">
                  <span>Total Counted</span>
                  <span className="text-lg">${countedTotal.toFixed(2)}</span>
                </div>
                {Math.abs(countedTotal - parseFloat(startingAmount)) > 0.01 && (
                  <div className="text-sm text-yellow-600 dark:text-yellow-500">
                    Variance: ${(countedTotal - parseFloat(startingAmount)).toFixed(2)}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} data-testid="button-cancel-till">
            Cancel
          </Button>
          {step === "start" && (
            <Button
              onClick={handleStart}
              disabled={createTillMutation.isPending}
              data-testid="button-start-till"
            >
              {createTillMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {requiresCount ? "Next: Count Drawer" : "Open Till"}
            </Button>
          )}
          {step === "count" && (
            <Button onClick={handleCountComplete} data-testid="button-confirm-count">
              Confirm Count & Open Till
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
