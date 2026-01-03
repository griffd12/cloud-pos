import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DollarSign, Loader2, ShieldCheck } from "lucide-react";
import type { CheckItem } from "@shared/schema";

interface PriceOverrideModalProps {
  open: boolean;
  onClose: () => void;
  item: CheckItem | null;
  onOverride: (itemId: string, newPrice: number, reason: string, managerPin?: string) => void;
  isOverriding?: boolean;
  requireManagerApproval?: boolean;
}

export function PriceOverrideModal({
  open,
  onClose,
  item,
  onOverride,
  isOverriding,
  requireManagerApproval = true,
}: PriceOverrideModalProps) {
  const [newPrice, setNewPrice] = useState("");
  const [reason, setReason] = useState("");
  const [managerPin, setManagerPin] = useState("");

  const currentPrice = item ? parseFloat(item.unitPrice || "0") : 0;

  const handleOverride = () => {
    if (item && newPrice && reason) {
      onOverride(item.id, parseFloat(newPrice), reason, requireManagerApproval ? managerPin : undefined);
    }
  };

  const handlePriceChange = (value: string) => {
    const cleaned = value.replace(/[^0-9.]/g, "");
    const parts = cleaned.split(".");
    if (parts.length > 2) return;
    if (parts[1]?.length > 2) return;
    setNewPrice(cleaned);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DollarSign className="w-5 h-5" />
            Price Override
          </DialogTitle>
        </DialogHeader>

        {item && (
          <div className="space-y-4">
            <div className="p-3 bg-muted/50 rounded-md">
              <div className="font-medium">{item.menuItemName}</div>
              <div className="text-sm text-muted-foreground">
                Current price: ${currentPrice.toFixed(2)}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="newPrice">New Price</Label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="newPrice"
                  type="text"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={newPrice}
                  onChange={(e) => handlePriceChange(e.target.value)}
                  className="pl-9"
                  data-testid="input-new-price"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="reason">Reason (required)</Label>
              <Textarea
                id="reason"
                placeholder="Enter reason for price change..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                data-testid="input-override-reason"
              />
            </div>

            {requireManagerApproval && (
              <div className="space-y-2">
                <Label htmlFor="managerPin" className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4" />
                  Manager PIN (required)
                </Label>
                <Input
                  id="managerPin"
                  type="password"
                  inputMode="numeric"
                  placeholder="Enter manager PIN"
                  value={managerPin}
                  onChange={(e) => setManagerPin(e.target.value)}
                  data-testid="input-manager-pin"
                />
              </div>
            )}
          </div>
        )}

        <div className="flex gap-2 justify-end pt-4 border-t">
          <Button variant="secondary" onClick={onClose} data-testid="button-cancel-override">
            Cancel
          </Button>
          <Button
            onClick={handleOverride}
            disabled={!newPrice || !reason || (requireManagerApproval && !managerPin) || isOverriding}
            data-testid="button-confirm-override"
          >
            {isOverriding ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Applying...
              </>
            ) : (
              <>
                <DollarSign className="w-4 h-4 mr-2" />
                Apply Override
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
