import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { MenuItem } from "@shared/schema";

interface SetAvailabilityDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: MenuItem | null;
  currentQuantity: number | null;
  onSave: (quantity: number | null) => void;
  isSaving?: boolean;
}

export function SetAvailabilityDialog({
  open,
  onOpenChange,
  item,
  currentQuantity,
  onSave,
  isSaving,
}: SetAvailabilityDialogProps) {
  const [quantity, setQuantity] = useState<string>("");

  useEffect(() => {
    if (open) {
      setQuantity(currentQuantity !== null ? String(currentQuantity) : "");
    }
  }, [open, currentQuantity]);

  if (!item) return null;

  const handleSave = () => {
    const qty = quantity.trim() === "" ? null : parseInt(quantity, 10);
    if (qty !== null && isNaN(qty)) return;
    onSave(qty);
    onOpenChange(false);
  };

  const handleClear = () => {
    onSave(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Set Availability</DialogTitle>
        </DialogHeader>
        <div className="py-4 space-y-4">
          <div className="text-center">
            <span className="font-semibold text-lg">{item.shortName || item.name}</span>
          </div>
          <div className="space-y-2">
            <Label htmlFor="quantity">Available Quantity</Label>
            <Input
              id="quantity"
              type="number"
              min="0"
              placeholder="Leave empty for unlimited"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="text-center text-xl h-14"
              autoFocus
              data-testid="input-availability-quantity"
            />
            <p className="text-xs text-muted-foreground text-center">
              Leave empty to remove quantity tracking
            </p>
          </div>
        </div>
        <DialogFooter className="flex gap-2">
          <Button
            variant="outline"
            onClick={handleClear}
            disabled={isSaving}
            data-testid="button-clear-availability"
          >
            Clear
          </Button>
          <Button
            onClick={handleSave}
            disabled={isSaving}
            data-testid="button-save-availability"
          >
            {isSaving ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
