import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import type { Tender, Check } from "@shared/schema";
import { Banknote, CreditCard, Gift, DollarSign, Check as CheckIcon } from "lucide-react";

interface PaymentModalProps {
  open: boolean;
  onClose: () => void;
  onPayment: (tenderId: string, amount: number) => void;
  tenders: Tender[];
  check: Check | null;
  remainingBalance: number;
  isLoading?: boolean;
}

const TENDER_ICONS: Record<string, typeof Banknote> = {
  cash: Banknote,
  credit: CreditCard,
  gift: Gift,
  other: DollarSign,
};

const QUICK_AMOUNTS = [1, 5, 10, 20, 50, 100];

export function PaymentModal({
  open,
  onClose,
  onPayment,
  tenders,
  check,
  remainingBalance,
  isLoading = false,
}: PaymentModalProps) {
  const [selectedTender, setSelectedTender] = useState<Tender | null>(null);
  const [amount, setAmount] = useState("");

  const handleTenderSelect = (tender: Tender) => {
    setSelectedTender(tender);
    setAmount(remainingBalance.toFixed(2));
  };

  const handleQuickAmount = (quickAmount: number) => {
    setAmount(quickAmount.toFixed(2));
  };

  const handleExactAmount = () => {
    setAmount(remainingBalance.toFixed(2));
  };

  const handleSubmit = () => {
    if (selectedTender && parseFloat(amount) > 0) {
      onPayment(selectedTender.id, parseFloat(amount));
    }
  };

  const handleClose = () => {
    setSelectedTender(null);
    setAmount("");
    onClose();
  };

  const numAmount = parseFloat(amount) || 0;
  const change = numAmount - remainingBalance;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between" data-testid="text-payment-title">
            <span>Payment</span>
            {check && (
              <span className="text-muted-foreground text-base font-normal">
                Check #{check.checkNumber}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div className="bg-muted/50 rounded-lg p-4 text-center">
            <p className="text-sm text-muted-foreground mb-1">Amount Due</p>
            <p className="text-4xl font-bold tabular-nums" data-testid="text-amount-due">
              ${remainingBalance.toFixed(2)}
            </p>
          </div>

          {!selectedTender ? (
            <div className="space-y-3">
              <Label>Select Payment Method</Label>
              <div className="grid grid-cols-2 gap-3">
                {tenders.map((tender) => {
                  const Icon = TENDER_ICONS[tender.type] || DollarSign;
                  return (
                    <Button
                      key={tender.id}
                      variant="outline"
                      className="h-16 flex items-center gap-3"
                      onClick={() => handleTenderSelect(tender)}
                      data-testid={`button-tender-${tender.id}`}
                    >
                      <Icon className="w-6 h-6" />
                      <span className="font-medium">{tender.name}</span>
                    </Button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {(() => {
                    const Icon = TENDER_ICONS[selectedTender.type] || DollarSign;
                    return <Icon className="w-5 h-5" />;
                  })()}
                  <span className="font-medium">{selectedTender.name}</span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedTender(null)}
                >
                  Change
                </Button>
              </div>

              <Separator />

              <div className="space-y-2">
                <Label>Amount</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                    $
                  </span>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="pl-7 text-lg h-12 tabular-nums"
                    placeholder="0.00"
                    data-testid="input-payment-amount"
                  />
                </div>
              </div>

              {selectedTender.type === "cash" && (
                <div className="space-y-2">
                  <Label className="text-muted-foreground text-sm">Quick Amounts</Label>
                  <div className="flex flex-wrap gap-2">
                    {QUICK_AMOUNTS.map((quickAmount) => (
                      <Button
                        key={quickAmount}
                        variant="secondary"
                        size="sm"
                        onClick={() => handleQuickAmount(quickAmount)}
                        data-testid={`button-quick-amount-${quickAmount}`}
                      >
                        ${quickAmount}
                      </Button>
                    ))}
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={handleExactAmount}
                      data-testid="button-exact-amount"
                    >
                      Exact
                    </Button>
                  </div>
                </div>
              )}

              {selectedTender.type === "cash" && numAmount >= remainingBalance && (
                <div className="bg-accent/50 rounded-lg p-3 flex items-center justify-between">
                  <span className="text-sm font-medium">Change Due</span>
                  <span className="text-lg font-bold tabular-nums text-green-600 dark:text-green-400">
                    ${change.toFixed(2)}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={handleClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!selectedTender || numAmount <= 0 || isLoading}
            data-testid="button-submit-payment"
          >
            {isLoading ? (
              "Processing..."
            ) : (
              <>
                <CheckIcon className="w-4 h-4 mr-2" />
                Complete Payment
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
