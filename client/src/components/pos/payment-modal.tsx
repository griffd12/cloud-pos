import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { Tender, Check } from "@shared/schema";
import { Banknote, CreditCard, Gift, DollarSign, Check as CheckIcon, X, ArrowLeft, Loader2 } from "lucide-react";

interface PaymentModalProps {
  open: boolean;
  onClose: () => void;
  onPayment: (tenderId: string, amount: number, isCashOverTender?: boolean, paymentTransactionId?: string) => void;
  tenders: Tender[];
  check: Check | null;
  remainingBalance: number;
  isLoading?: boolean;
  changeDue?: number | null;
  onReadyForNextOrder?: () => void;
}

const TENDER_ICONS: Record<string, typeof Banknote> = {
  cash: Banknote,
  credit: CreditCard,
  gift: Gift,
  other: DollarSign,
};

const QUICK_CASH_AMOUNTS = [1, 5, 10, 20, 50, 100];

export function PaymentModal({
  open,
  onClose,
  onPayment,
  tenders,
  check,
  remainingBalance,
  isLoading = false,
  changeDue = null,
  onReadyForNextOrder,
}: PaymentModalProps) {
  const { toast } = useToast();
  const [customAmount, setCustomAmount] = useState("");
  const [selectedTender, setSelectedTender] = useState<Tender | null>(null);
  const [tenderAmount, setTenderAmount] = useState("");
  
  // Credit card entry state
  const [showCardEntry, setShowCardEntry] = useState(false);
  const [cardTender, setCardTender] = useState<Tender | null>(null);
  const [cardAmount, setCardAmount] = useState(0);
  const [cardNumber, setCardNumber] = useState("");
  const [cardExpiry, setCardExpiry] = useState("");
  const [cardCvv, setCardCvv] = useState("");
  const [cardName, setCardName] = useState("");
  const [isProcessingCard, setIsProcessingCard] = useState(false);

  const cashTender = tenders.find((t) => t.type === "cash");
  const nonCashTenders = tenders.filter((t) => t.type !== "cash");
  
  const showChangeDueScreen = changeDue !== null && changeDue > 0;

  const resetCardEntry = () => {
    setShowCardEntry(false);
    setCardTender(null);
    setCardAmount(0);
    setCardNumber("");
    setCardExpiry("");
    setCardCvv("");
    setCardName("");
    setIsProcessingCard(false);
  };

  const handleClose = () => {
    setCustomAmount("");
    setSelectedTender(null);
    setTenderAmount("");
    resetCardEntry();
    onClose();
  };

  const handleExactCash = () => {
    if (cashTender) {
      onPayment(cashTender.id, remainingBalance, false);
    }
  };

  const handleQuickCash = (amount: number) => {
    if (cashTender) {
      const isOverTender = amount > remainingBalance;
      onPayment(cashTender.id, amount, isOverTender);
    }
  };

  const handleCustomCashSubmit = () => {
    const amount = parseFloat(customAmount);
    if (cashTender && amount > 0) {
      const isOverTender = amount > remainingBalance;
      onPayment(cashTender.id, amount, isOverTender);
    }
  };
  
  const handleReadyForNextOrder = () => {
    setCustomAmount("");
    setSelectedTender(null);
    setTenderAmount("");
    resetCardEntry();
    if (onReadyForNextOrder) {
      onReadyForNextOrder();
    }
  };

  const handleNonCashExact = (tender: Tender) => {
    // Check if this is a credit/debit tender that needs card entry
    if (tender.type === "credit" || tender.type === "debit") {
      setCardTender(tender);
      setCardAmount(remainingBalance);
      setShowCardEntry(true);
    } else {
      // For gift cards or other non-card tenders, proceed directly
      onPayment(tender.id, remainingBalance);
    }
  };

  const handleNonCashPartial = () => {
    const amount = parseFloat(tenderAmount);
    if (selectedTender && amount > 0) {
      // Check if this is a credit/debit tender that needs card entry
      if (selectedTender.type === "credit" || selectedTender.type === "debit") {
        setCardTender(selectedTender);
        setCardAmount(amount);
        setShowCardEntry(true);
        setSelectedTender(null);
        setTenderAmount("");
      } else {
        onPayment(selectedTender.id, amount);
        setSelectedTender(null);
        setTenderAmount("");
      }
    }
  };

  const formatCardNumber = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 16);
    const groups = digits.match(/.{1,4}/g);
    return groups ? groups.join(" ") : digits;
  };

  const formatExpiry = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 4);
    if (digits.length >= 3) {
      return `${digits.slice(0, 2)}/${digits.slice(2)}`;
    }
    return digits;
  };

  const handleCardNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCardNumber(formatCardNumber(e.target.value));
  };

  const handleExpiryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCardExpiry(formatExpiry(e.target.value));
  };

  const handleCvvChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCardCvv(e.target.value.replace(/\D/g, "").slice(0, 4));
  };

  const processCardPayment = async () => {
    if (!check || !cardTender) return;

    const cleanCardNumber = cardNumber.replace(/\s/g, "");
    
    // Basic validation
    if (cleanCardNumber.length < 15) {
      toast({ title: "Invalid card number", variant: "destructive" });
      return;
    }
    if (cardExpiry.length < 5) {
      toast({ title: "Invalid expiry date", variant: "destructive" });
      return;
    }
    if (cardCvv.length < 3) {
      toast({ title: "Invalid CVV", variant: "destructive" });
      return;
    }

    setIsProcessingCard(true);

    try {
      // Call the unified POS card payment endpoint
      // This routes through the property's configured payment processor
      const response = await apiRequest("POST", "/api/pos/process-card-payment", {
        checkId: check.id,
        tenderId: cardTender.id,
        amount: cardAmount,
        cardData: {
          cardNumber: cleanCardNumber,
          expMonth: parseInt(cardExpiry.slice(0, 2)),
          expYear: parseInt("20" + cardExpiry.slice(3)),
          cvv: cardCvv,
          cardholderName: cardName || undefined,
        },
      });

      const result = await response.json();

      if (result.success) {
        // Payment approved - record it on the check
        onPayment(cardTender.id, cardAmount, false, result.transactionId);
        resetCardEntry();
        
        const modeLabel = result.demoMode ? " (Demo)" : result.testMode ? " (Test)" : "";
        toast({ 
          title: "Card Approved", 
          description: `$${cardAmount.toFixed(2)} charged to ${result.cardBrand || "card"} ending ${result.cardLast4}${modeLabel}` 
        });
      } else {
        // Payment declined
        toast({ 
          title: "Card Declined", 
          description: result.declineReason || result.message || "Please try another card", 
          variant: "destructive" 
        });
      }
    } catch (error: any) {
      console.error("Card payment error:", error);
      toast({ 
        title: "Payment Failed", 
        description: error.message || "Unable to process card payment", 
        variant: "destructive" 
      });
    } finally {
      setIsProcessingCard(false);
    }
  };

  const relevantQuickAmounts = QUICK_CASH_AMOUNTS;
  const customAmountNum = parseFloat(customAmount) || 0;
  const changeFromCustom = customAmountNum - remainingBalance;
  const tenderAmountNum = parseFloat(tenderAmount) || 0;

  // Render card entry screen
  if (showCardEntry && cardTender) {
    return (
      <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
        <DialogContent className="max-w-md p-0 gap-0">
          <DialogHeader className="p-4 pb-0">
            <DialogTitle className="flex items-center gap-2" data-testid="text-card-entry-title">
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={resetCardEntry}
                disabled={isProcessingCard}
                data-testid="button-back-to-payment"
              >
                <ArrowLeft className="w-4 h-4" />
              </Button>
              <CreditCard className="w-5 h-5" />
              <span>{cardTender.name} Payment</span>
            </DialogTitle>
          </DialogHeader>

          <div className="p-4 space-y-4">
            <div className="bg-primary text-primary-foreground rounded-lg p-4 text-center">
              <p className="text-sm opacity-90 mb-1">Charging</p>
              <p className="text-3xl font-bold tabular-nums" data-testid="text-card-charge-amount">
                ${cardAmount.toFixed(2)}
              </p>
            </div>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="cardNumber">Card Number</Label>
                <Input
                  id="cardNumber"
                  type="text"
                  inputMode="numeric"
                  placeholder="4242 4242 4242 4242"
                  value={cardNumber}
                  onChange={handleCardNumberChange}
                  disabled={isProcessingCard}
                  className="text-lg tabular-nums tracking-wider"
                  data-testid="input-card-number"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="cardExpiry">Expiry</Label>
                  <Input
                    id="cardExpiry"
                    type="text"
                    inputMode="numeric"
                    placeholder="MM/YY"
                    value={cardExpiry}
                    onChange={handleExpiryChange}
                    disabled={isProcessingCard}
                    className="tabular-nums"
                    data-testid="input-card-expiry"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cardCvv">CVV</Label>
                  <Input
                    id="cardCvv"
                    type="text"
                    inputMode="numeric"
                    placeholder="123"
                    value={cardCvv}
                    onChange={handleCvvChange}
                    disabled={isProcessingCard}
                    className="tabular-nums"
                    data-testid="input-card-cvv"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="cardName">Name on Card (optional)</Label>
                <Input
                  id="cardName"
                  type="text"
                  placeholder="JOHN DOE"
                  value={cardName}
                  onChange={(e) => setCardName(e.target.value.toUpperCase())}
                  disabled={isProcessingCard}
                  className="uppercase"
                  data-testid="input-card-name"
                />
              </div>
            </div>

            <div className="bg-muted/50 rounded-lg p-3 text-sm text-muted-foreground">
              <p className="font-medium mb-1">Test Cards</p>
              <p>Approve: 4242 4242 4242 4242</p>
              <p>Decline: 4000 0000 0000 0002</p>
              <p className="text-xs mt-2 opacity-75">Uses property's configured processor (or demo mode if none)</p>
            </div>

            <Separator />

            <div className="flex gap-3">
              <Button 
                variant="outline" 
                className="flex-1"
                onClick={resetCardEntry}
                disabled={isProcessingCard}
                data-testid="button-cancel-card"
              >
                <X className="w-4 h-4 mr-2" />
                Cancel
              </Button>
              <Button 
                className="flex-1"
                onClick={processCardPayment}
                disabled={isProcessingCard || cardNumber.replace(/\s/g, "").length < 15}
                data-testid="button-process-card"
              >
                {isProcessingCard ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <CheckIcon className="w-4 h-4 mr-2" />
                    Charge ${cardAmount.toFixed(2)}
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && !showChangeDueScreen && handleClose()}>
      <DialogContent className="max-w-2xl p-0 gap-0">
        <DialogHeader className="p-4 pb-0">
          <DialogTitle className="flex items-center justify-between" data-testid="text-payment-title">
            <span>{showChangeDueScreen ? "Change Due" : "Payment"}</span>
            {check && (
              <span className="text-muted-foreground text-base font-normal">
                Check #{check.checkNumber}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        {showChangeDueScreen ? (
          <div className="p-4">
            <div className="bg-green-600 text-white rounded-lg p-8 text-center mb-6">
              <p className="text-lg opacity-90 mb-2">Change Due</p>
              <p className="text-6xl font-bold tabular-nums" data-testid="text-change-due">
                ${changeDue.toFixed(2)}
              </p>
            </div>
            
            <Button
              variant="default"
              className="w-full h-16 text-xl font-semibold"
              onClick={handleReadyForNextOrder}
              data-testid="button-ready-next-order"
            >
              Ready for Next Order
            </Button>
          </div>
        ) : remainingBalance <= 0 ? (
        <div className="p-4">
          <div className="bg-green-600 text-white rounded-lg p-4 text-center mb-4">
            <p className="text-sm opacity-90 mb-1">Balance</p>
            <p className="text-4xl font-bold tabular-nums" data-testid="text-amount-due">
              $0.00
            </p>
          </div>

          <Button
            variant="default"
            className="w-full h-16 text-xl font-semibold"
            onClick={() => {
              if (cashTender) {
                onPayment(cashTender.id, 0, false);
              }
            }}
            disabled={isLoading || !cashTender}
            data-testid="button-close-check"
          >
            <CheckIcon className="w-6 h-6 mr-2" />
            Close Check
          </Button>
        </div>
        ) : (
        <div className="p-4">
          <div className="bg-primary text-primary-foreground rounded-lg p-4 text-center mb-4">
            <p className="text-sm opacity-90 mb-1">Amount Due</p>
            <p className="text-4xl font-bold tabular-nums" data-testid="text-amount-due">
              ${remainingBalance.toFixed(2)}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-3">
              <p className="text-sm font-medium text-muted-foreground">Cash</p>
              
              {cashTender && (
                <Button
                  variant="default"
                  className="w-full h-14 text-lg font-semibold"
                  onClick={handleExactCash}
                  disabled={isLoading}
                  data-testid="button-exact-cash"
                >
                  <Banknote className="w-5 h-5 mr-2" />
                  Exact ${remainingBalance.toFixed(2)}
                </Button>
              )}

              {cashTender && (
                <div className="grid grid-cols-3 gap-2">
                  {relevantQuickAmounts.map((amount) => (
                    <Button
                      key={amount}
                      variant="secondary"
                      className="h-11"
                      onClick={() => handleQuickCash(amount)}
                      disabled={isLoading}
                      data-testid={`button-quick-cash-${amount}`}
                    >
                      ${amount}
                    </Button>
                  ))}
                </div>
              )}

              {cashTender && (
                <div className="pt-1">
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                        $
                      </span>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={customAmount}
                        onChange={(e) => setCustomAmount(e.target.value)}
                        className="pl-7 h-10 tabular-nums"
                        placeholder="Custom"
                        data-testid="input-custom-cash-amount"
                      />
                    </div>
                    <Button
                      variant="outline"
                      onClick={handleCustomCashSubmit}
                      disabled={isLoading || customAmountNum <= 0}
                      data-testid="button-custom-cash-submit"
                    >
                      <CheckIcon className="w-4 h-4" />
                    </Button>
                  </div>
                  {customAmountNum >= remainingBalance && (
                    <p className="text-sm text-green-600 dark:text-green-400 mt-1 tabular-nums">
                      Change: ${changeFromCustom.toFixed(2)}
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="space-y-3">
              <p className="text-sm font-medium text-muted-foreground">Card / Other</p>
              
              {nonCashTenders.map((tender) => {
                const Icon = TENDER_ICONS[tender.type] || DollarSign;
                const isSelected = selectedTender?.id === tender.id;
                const isCardTender = tender.type === "credit" || tender.type === "debit";
                
                return (
                  <div key={tender.id} className="space-y-2">
                    <div className="flex gap-2">
                      <Button
                        variant={isSelected ? "secondary" : "outline"}
                        className="flex-1 h-12 justify-start gap-3"
                        onClick={() => handleNonCashExact(tender)}
                        disabled={isLoading}
                        data-testid={`button-tender-exact-${tender.id}`}
                      >
                        <Icon className="w-5 h-5" />
                        <span className="font-medium">{tender.name}</span>
                        <span className="ml-auto text-muted-foreground tabular-nums text-sm">
                          ${remainingBalance.toFixed(2)}
                        </span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setSelectedTender(isSelected ? null : tender)}
                        disabled={isLoading}
                        data-testid={`button-tender-split-${tender.id}`}
                        title="Split payment"
                      >
                        <DollarSign className="w-4 h-4" />
                      </Button>
                    </div>
                    
                    {isSelected && (
                      <div className="flex gap-2 pl-2">
                        <div className="relative flex-1">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                            $
                          </span>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            max={remainingBalance}
                            value={tenderAmount}
                            onChange={(e) => setTenderAmount(e.target.value)}
                            className="pl-7 h-9 tabular-nums text-sm"
                            placeholder="Partial amount"
                            autoFocus
                            data-testid={`input-tender-amount-${tender.id}`}
                          />
                        </div>
                        <Button
                          size="sm"
                          onClick={handleNonCashPartial}
                          disabled={isLoading || tenderAmountNum <= 0 || tenderAmountNum > remainingBalance}
                          data-testid={`button-tender-submit-${tender.id}`}
                        >
                          {isCardTender ? "Enter Card" : "Apply"}
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <Separator className="my-4" />

          <div className="flex justify-end">
            <Button variant="ghost" onClick={handleClose} disabled={isLoading} data-testid="button-cancel-payment">
              <X className="w-4 h-4 mr-2" />
              Cancel
            </Button>
          </div>
        </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
