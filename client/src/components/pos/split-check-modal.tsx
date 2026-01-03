import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Split, Loader2 } from "lucide-react";
import type { CheckItem } from "@shared/schema";

interface SplitCheckModalProps {
  open: boolean;
  onClose: () => void;
  checkNumber: number;
  items: CheckItem[];
  onSplit: (itemIds: string[]) => void;
  isSplitting?: boolean;
}

export function SplitCheckModal({
  open,
  onClose,
  checkNumber,
  items,
  onSplit,
  isSplitting,
}: SplitCheckModalProps) {
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());

  const activeItems = items.filter((item) => !item.voided);

  const toggleItem = (itemId: string) => {
    const newSelected = new Set(selectedItems);
    if (newSelected.has(itemId)) {
      newSelected.delete(itemId);
    } else {
      newSelected.add(itemId);
    }
    setSelectedItems(newSelected);
  };

  const handleSplit = () => {
    if (selectedItems.size > 0) {
      onSplit(Array.from(selectedItems));
    }
  };

  const formatPrice = (price: string | number | null) => {
    const numPrice = typeof price === "string" ? parseFloat(price) : (price || 0);
    return `$${numPrice.toFixed(2)}`;
  };

  const getModifierTotal = (item: CheckItem) => {
    if (!item.modifiers || !Array.isArray(item.modifiers)) return 0;
    return item.modifiers.reduce((sum, mod) => sum + parseFloat(mod.priceDelta || "0"), 0);
  };

  const selectedTotal = activeItems
    .filter((item) => selectedItems.has(item.id))
    .reduce((sum, item) => {
      const unitPrice = parseFloat(item.unitPrice || "0");
      const modPrice = getModifierTotal(item);
      return sum + (unitPrice + modPrice) * (item.quantity || 1);
    }, 0);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Split className="w-5 h-5" />
            Split Check #{checkNumber}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Select items to move to a new check:
          </p>

          {activeItems.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              No items to split
            </p>
          ) : (
            <ScrollArea className="h-64">
              <div className="space-y-2">
                {activeItems.map((item) => (
                  <div
                    key={item.id}
                    className={`flex items-center gap-3 p-3 rounded-md border cursor-pointer transition-colors ${
                      selectedItems.has(item.id)
                        ? "bg-primary/10 border-primary"
                        : "hover:bg-muted/50"
                    }`}
                    onClick={() => toggleItem(item.id)}
                    data-testid={`checkbox-split-item-${item.id}`}
                  >
                    <Checkbox
                      checked={selectedItems.has(item.id)}
                      onCheckedChange={() => toggleItem(item.id)}
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{item.menuItemName}</span>
                        {item.sent && (
                          <Badge variant="outline" className="text-xs">Sent</Badge>
                        )}
                      </div>
                      {(item.quantity || 1) > 1 && (
                        <span className="text-sm text-muted-foreground">
                          Qty: {item.quantity}
                        </span>
                      )}
                    </div>
                    <span className="font-semibold tabular-nums">
                      {formatPrice(
                        (parseFloat(item.unitPrice || "0") + getModifierTotal(item)) *
                          (item.quantity || 1)
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}

          {selectedItems.size > 0 && (
            <div className="flex items-center justify-between p-3 bg-muted/50 rounded-md">
              <span className="text-sm text-muted-foreground">
                {selectedItems.size} item(s) selected
              </span>
              <span className="font-semibold">{formatPrice(selectedTotal)}</span>
            </div>
          )}
        </div>

        <div className="flex gap-2 justify-end pt-4 border-t">
          <Button variant="secondary" onClick={onClose} data-testid="button-cancel-split">
            Cancel
          </Button>
          <Button
            onClick={handleSplit}
            disabled={selectedItems.size === 0 || isSplitting}
            data-testid="button-confirm-split"
          >
            {isSplitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Splitting...
              </>
            ) : (
              <>
                <Split className="w-4 h-4 mr-2" />
                Split to New Check
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
