import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest, getAuthHeaders } from "@/lib/queryClient";
import { Loader2, DollarSign, AlertTriangle, CheckCircle, TrendingUp, TrendingDown } from "lucide-react";
import type { TillSession, RvcCashSettings } from "@shared/schema";

const DEFAULT_DENOMINATIONS = [
  { name: "$100", value: 100, type: "bill" as const },
  { name: "$50", value: 50, type: "bill" as const },
  { name: "$20", value: 20, type: "bill" as const },
  { name: "$10", value: 10, type: "bill" as const },
  { name: "$5", value: 5, type: "bill" as const },
  { name: "$1", value: 1, type: "bill" as const },
  { name: "Quarters", value: 0.25, type: "coin" as const },
  { name: "Dimes", value: 0.10, type: "coin" as const },
  { name: "Nickels", value: 0.05, type: "coin" as const },
  { name: "Pennies", value: 0.01, type: "coin" as const },
];

interface TillClosingModalProps {
  open: boolean;
  onClose: () => void;
  onComplete: () => void;
  tillSession: TillSession;
  rvcId: string;
}

export function TillClosingModal({ open, onClose, onComplete, tillSession, rvcId }: TillClosingModalProps) {
  const { toast } = useToast();
  const [step, setStep] = useState<"summary" | "count">("summary");
  const [denominations, setDenominations] = useState<Record<string, number>>({});
  const [closingNotes, setClosingNotes] = useState("");
  
  const { data: cashSettings, isLoading: settingsLoading } = useQuery<RvcCashSettings>({
    queryKey: ["/api/rvc-cash-settings", rvcId],
    queryFn: async () => {
      const res = await fetch(`/api/rvc-cash-settings/${rvcId}`, {
        credentials: "include",
        headers: getAuthHeaders(),
      });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: open && !!rvcId,
  });

  const { data: shiftSummary, isLoading: summaryLoading } = useQuery<{
    startingBank: string;
    cashSales: string;
    cardSales: string;
    otherSales: string;
    totalSales: string;
    paidIn: string;
    paidOut: string;
    cashDrops: string;
    tips: string;
    expectedCash: string;
    transactionCount: number;
  }>({
    queryKey: ["/api/till-sessions", tillSession.id, "summary"],
    queryFn: async () => {
      const res = await fetch(`/api/till-sessions/${tillSession.id}/summary`, {
        credentials: "include",
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error("Failed to load shift summary");
      return res.json();
    },
    enabled: open && !!tillSession.id,
  });

  const closeMutation = useMutation({
    mutationFn: async (data: { 
      closingAmount: string; 
      closingNotes?: string;
      denominations?: Array<{ denomination: string; quantity: number; subtotal: string }>;
    }) => {
      return apiRequest("POST", `/api/till-sessions/${tillSession.id}/close`, data);
    },
    onSuccess: () => {
      toast({
        title: "Till Closed",
        description: "Your shift has been closed successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/till-sessions"] });
      onComplete();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to close till",
        variant: "destructive",
      });
    },
  });

  const requireClosingCount = cashSettings?.requireClosingCount ?? true;

  const calculateTotal = () => {
    return Object.entries(denominations).reduce((sum, [denom, qty]) => {
      const denomination = DEFAULT_DENOMINATIONS.find(d => d.name === denom);
      return sum + (denomination?.value || 0) * qty;
    }, 0);
  };

  const closingTotal = calculateTotal();
  const expectedCash = shiftSummary ? parseFloat(shiftSummary.expectedCash) : 0;
  const overShort = closingTotal - expectedCash;

  const handleClose = () => {
    if (requireClosingCount && step === "summary") {
      setStep("count");
      return;
    }

    const denominationData = Object.entries(denominations)
      .filter(([_, qty]) => qty > 0)
      .map(([denom, qty]) => {
        const denomination = DEFAULT_DENOMINATIONS.find(d => d.name === denom);
        return {
          denomination: denom,
          quantity: qty,
          subtotal: ((denomination?.value || 0) * qty).toFixed(2),
        };
      });

    closeMutation.mutate({
      closingAmount: closingTotal.toFixed(2),
      closingNotes: closingNotes || undefined,
      denominations: denominationData.length > 0 ? denominationData : undefined,
    });
  };

  const handleQuickClose = () => {
    closeMutation.mutate({
      closingAmount: expectedCash.toFixed(2),
      closingNotes: "Quick close - no count performed",
    });
  };

  const isLoading = settingsLoading || summaryLoading;

  if (isLoading) {
    return (
      <Dialog open={open} onOpenChange={() => onClose()}>
        <DialogContent className="sm:max-w-lg">
          <div className="flex items-center justify-center p-12">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={() => onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DollarSign className="w-5 h-5" />
            {step === "summary" ? "Close Till - Shift Summary" : "Close Till - Count Drawer"}
          </DialogTitle>
          <DialogDescription>
            {step === "summary" 
              ? "Review your shift summary before closing"
              : "Count your cash drawer by entering quantities for each denomination"
            }
          </DialogDescription>
        </DialogHeader>

        {step === "summary" && shiftSummary && (
          <div className="space-y-4 py-4">
            <Card>
              <CardContent className="p-4 space-y-3">
                <div className="flex justify-between items-center pb-2 border-b">
                  <span className="font-medium">Shift Summary</span>
                  <Badge variant="outline">{shiftSummary.transactionCount} transactions</Badge>
                </div>
                
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Starting Bank:</span>
                    <span className="font-medium">${parseFloat(shiftSummary.startingBank).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Cash Sales:</span>
                    <span className="font-medium text-green-600">+${parseFloat(shiftSummary.cashSales).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Card Sales:</span>
                    <span className="font-medium">${parseFloat(shiftSummary.cardSales).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Other Sales:</span>
                    <span className="font-medium">${parseFloat(shiftSummary.otherSales).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Paid In:</span>
                    <span className="font-medium text-green-600">+${parseFloat(shiftSummary.paidIn).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Paid Out:</span>
                    <span className="font-medium text-red-600">-${parseFloat(shiftSummary.paidOut).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Cash Drops:</span>
                    <span className="font-medium text-amber-600">-${parseFloat(shiftSummary.cashDrops).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Tips:</span>
                    <span className="font-medium">${parseFloat(shiftSummary.tips).toFixed(2)}</span>
                  </div>
                </div>

                <div className="flex justify-between items-center pt-3 border-t">
                  <span className="font-semibold">Expected Cash in Drawer:</span>
                  <span className="text-xl font-bold">${parseFloat(shiftSummary.expectedCash).toFixed(2)}</span>
                </div>
              </CardContent>
            </Card>

            <div className="space-y-2">
              <Label htmlFor="closing-notes">Closing Notes (Optional)</Label>
              <Input
                id="closing-notes"
                placeholder="Any notes about this shift..."
                value={closingNotes}
                onChange={(e) => setClosingNotes(e.target.value)}
                data-testid="input-closing-notes"
              />
            </div>
          </div>
        )}

        {step === "count" && (
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <h4 className="text-sm font-medium mb-2">Bills</h4>
                <div className="space-y-2">
                  {DEFAULT_DENOMINATIONS.filter(d => d.type === "bill").map((denom) => (
                    <div key={denom.name} className="flex items-center gap-2">
                      <Label className="w-16 text-sm">{denom.name}</Label>
                      <Input
                        type="number"
                        min="0"
                        className="w-20"
                        value={denominations[denom.name] || ""}
                        onChange={(e) => setDenominations(prev => ({
                          ...prev,
                          [denom.name]: parseInt(e.target.value) || 0
                        }))}
                        placeholder="0"
                        data-testid={`input-denom-${denom.name.replace(/\$/g, "").toLowerCase()}`}
                      />
                      <span className="text-sm text-muted-foreground">
                        = ${((denominations[denom.name] || 0) * denom.value).toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h4 className="text-sm font-medium mb-2">Coins</h4>
                <div className="space-y-2">
                  {DEFAULT_DENOMINATIONS.filter(d => d.type === "coin").map((denom) => (
                    <div key={denom.name} className="flex items-center gap-2">
                      <Label className="w-16 text-sm">{denom.name}</Label>
                      <Input
                        type="number"
                        min="0"
                        className="w-20"
                        value={denominations[denom.name] || ""}
                        onChange={(e) => setDenominations(prev => ({
                          ...prev,
                          [denom.name]: parseInt(e.target.value) || 0
                        }))}
                        placeholder="0"
                        data-testid={`input-denom-${denom.name.toLowerCase()}`}
                      />
                      <span className="text-sm text-muted-foreground">
                        = ${((denominations[denom.name] || 0) * denom.value).toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <Card className={overShort === 0 ? "border-green-500" : overShort > 0 ? "border-blue-500" : "border-red-500"}>
              <CardContent className="p-4">
                <div className="flex justify-between items-center mb-2">
                  <span>Expected Cash:</span>
                  <span className="font-medium">${expectedCash.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center mb-2">
                  <span>Actual Count:</span>
                  <span className="font-bold text-lg">${closingTotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center pt-2 border-t">
                  <span className="font-medium">Over/Short:</span>
                  <div className="flex items-center gap-2">
                    {overShort === 0 ? (
                      <CheckCircle className="w-4 h-4 text-green-600" />
                    ) : overShort > 0 ? (
                      <TrendingUp className="w-4 h-4 text-blue-600" />
                    ) : (
                      <TrendingDown className="w-4 h-4 text-red-600" />
                    )}
                    <span className={`font-bold ${
                      overShort === 0 ? "text-green-600" : overShort > 0 ? "text-blue-600" : "text-red-600"
                    }`}>
                      {overShort >= 0 ? "+" : ""}{overShort.toFixed(2)}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {Math.abs(overShort) > 10 && (
              <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-950/30 rounded-md">
                <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium text-amber-800 dark:text-amber-400">
                    Significant variance detected
                  </p>
                  <p className="text-amber-700 dark:text-amber-500">
                    The drawer is ${Math.abs(overShort).toFixed(2)} {overShort > 0 ? "over" : "short"}. 
                    Please recount if this seems incorrect.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="flex gap-2">
          {step === "count" && (
            <Button
              variant="outline"
              onClick={() => setStep("summary")}
              disabled={closeMutation.isPending}
              data-testid="button-back-to-summary"
            >
              Back
            </Button>
          )}
          <Button
            variant="outline"
            onClick={onClose}
            disabled={closeMutation.isPending}
            data-testid="button-cancel-close"
          >
            Cancel
          </Button>
          {step === "summary" && !requireClosingCount && (
            <Button
              variant="secondary"
              onClick={handleQuickClose}
              disabled={closeMutation.isPending}
              data-testid="button-quick-close"
            >
              Quick Close
            </Button>
          )}
          <Button
            onClick={handleClose}
            disabled={closeMutation.isPending || (step === "count" && closingTotal === 0)}
            data-testid="button-close-till"
          >
            {closeMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Closing...
              </>
            ) : step === "summary" && requireClosingCount ? (
              "Count Drawer"
            ) : (
              "Close Till"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
