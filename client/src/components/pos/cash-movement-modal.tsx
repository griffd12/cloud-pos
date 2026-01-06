import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Loader2, ArrowDownToLine, ArrowUpFromLine, Banknote } from "lucide-react";
import type { TillSession } from "@shared/schema";

interface CashMovementModalProps {
  open: boolean;
  onClose: () => void;
  tillSession: TillSession;
  employeeId: string;
}

export function CashMovementModal({ open, onClose, tillSession, employeeId }: CashMovementModalProps) {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<"paid_in" | "paid_out" | "drop">("paid_in");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");

  const movementMutation = useMutation({
    mutationFn: async (data: { movementType: string; amount: string; reason: string; employeeId: string }) => {
      return apiRequest("POST", `/api/till-sessions/${tillSession.id}/movements`, data);
    },
    onSuccess: () => {
      const typeLabels: Record<string, string> = {
        paid_in: "Paid In",
        paid_out: "Paid Out",
        drop: "Cash Drop",
      };
      toast({
        title: `${typeLabels[activeTab]} Recorded`,
        description: `$${parseFloat(amount).toFixed(2)} has been recorded`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/till-sessions"] });
      setAmount("");
      setReason("");
      onClose();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to record transaction",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = () => {
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      toast({
        title: "Invalid Amount",
        description: "Please enter a valid positive amount",
        variant: "destructive",
      });
      return;
    }

    if (!reason.trim()) {
      toast({
        title: "Reason Required",
        description: "Please provide a reason for this transaction",
        variant: "destructive",
      });
      return;
    }

    movementMutation.mutate({
      movementType: activeTab,
      amount: amountNum.toFixed(2),
      reason: reason.trim(),
      employeeId,
    });
  };

  const getQuickAmounts = () => {
    if (activeTab === "drop") {
      return [50, 100, 200, 500];
    }
    return [5, 10, 20, 50];
  };

  return (
    <Dialog open={open} onOpenChange={() => onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Banknote className="w-5 h-5" />
            Cash Operations
          </DialogTitle>
          <DialogDescription>
            Record paid in/out transactions or cash drops
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="mt-4">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="paid_in" className="flex items-center gap-1" data-testid="tab-paid-in">
              <ArrowDownToLine className="w-3 h-3" />
              Paid In
            </TabsTrigger>
            <TabsTrigger value="paid_out" className="flex items-center gap-1" data-testid="tab-paid-out">
              <ArrowUpFromLine className="w-3 h-3" />
              Paid Out
            </TabsTrigger>
            <TabsTrigger value="drop" className="flex items-center gap-1" data-testid="tab-cash-drop">
              <Banknote className="w-3 h-3" />
              Drop
            </TabsTrigger>
          </TabsList>

          <TabsContent value="paid_in" className="mt-4 space-y-4">
            <p className="text-sm text-muted-foreground">
              Use Paid In when adding cash to the drawer (e.g., starting change, returned advances).
            </p>
          </TabsContent>

          <TabsContent value="paid_out" className="mt-4 space-y-4">
            <p className="text-sm text-muted-foreground">
              Use Paid Out when removing cash from the drawer (e.g., vendor payments, employee advances).
            </p>
          </TabsContent>

          <TabsContent value="drop" className="mt-4 space-y-4">
            <p className="text-sm text-muted-foreground">
              Use Cash Drop to move excess cash from drawer to safe during shift.
            </p>
          </TabsContent>
        </Tabs>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="amount">Amount</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
              <Input
                id="amount"
                type="number"
                step="0.01"
                min="0.01"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="pl-7"
                data-testid="input-movement-amount"
              />
            </div>
            <div className="flex flex-wrap gap-2 mt-2">
              {getQuickAmounts().map((quickAmount) => (
                <Button
                  key={quickAmount}
                  variant="outline"
                  size="sm"
                  onClick={() => setAmount(quickAmount.toString())}
                  data-testid={`button-quick-${quickAmount}`}
                >
                  ${quickAmount}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="reason">Reason</Label>
            <Textarea
              id="reason"
              placeholder={
                activeTab === "paid_in"
                  ? "e.g., Change replenishment, Returned advance"
                  : activeTab === "paid_out"
                  ? "e.g., Vendor COD payment, Employee meal"
                  : "e.g., Regular drop, End of rush drop"
              }
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="min-h-[80px]"
              data-testid="input-movement-reason"
            />
          </div>
        </div>

        <DialogFooter className="flex gap-2">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={movementMutation.isPending}
            data-testid="button-cancel-movement"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={movementMutation.isPending || !amount || !reason.trim()}
            className={
              activeTab === "paid_in"
                ? "bg-green-600 hover:bg-green-700"
                : activeTab === "paid_out"
                ? "bg-amber-600 hover:bg-amber-700"
                : "bg-blue-600 hover:bg-blue-700"
            }
            data-testid="button-submit-movement"
          >
            {movementMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Recording...
              </>
            ) : (
              <>
                {activeTab === "paid_in" && "Record Paid In"}
                {activeTab === "paid_out" && "Record Paid Out"}
                {activeTab === "drop" && "Record Drop"}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
