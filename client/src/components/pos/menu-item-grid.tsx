import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ItemOptionsPopup } from "./item-options-popup";
import { SetAvailabilityDialog } from "./set-availability-dialog";
import { SoldOutConfirmDialog } from "./sold-out-confirm-dialog";
import { useItemAvailability } from "@/hooks/use-item-availability";
import type { MenuItem } from "@shared/schema";
import { AlertCircle, X } from "lucide-react";

interface MenuItemWithModifiers extends MenuItem {
  hasRequiredModifiers?: boolean;
}

interface MenuItemGridProps {
  items: MenuItemWithModifiers[];
  onSelectItem: (item: MenuItem, skipAvailabilityCheck?: boolean) => void;
  isLoading?: boolean;
}

const LONG_PRESS_DURATION = 500;

export function MenuItemGrid({ items, onSelectItem, isLoading }: MenuItemGridProps) {
  const { getQuantityRemaining, isItemAvailable, setAvailability, isUpdating } = useItemAvailability();
  
  const [longPressItem, setLongPressItem] = useState<MenuItem | null>(null);
  const [showOptionsPopup, setShowOptionsPopup] = useState(false);
  const [showAvailabilityDialog, setShowAvailabilityDialog] = useState(false);
  const [soldOutItem, setSoldOutItem] = useState<MenuItem | null>(null);
  
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isLongPressRef = useRef(false);

  const handlePointerDown = useCallback((item: MenuItem) => {
    isLongPressRef.current = false;
    longPressTimerRef.current = setTimeout(() => {
      isLongPressRef.current = true;
      setLongPressItem(item);
      setShowOptionsPopup(true);
    }, LONG_PRESS_DURATION);
  }, []);

  const handlePointerUp = useCallback((item: MenuItem) => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    if (!isLongPressRef.current) {
      if (!isItemAvailable(item.id)) {
        setSoldOutItem(item);
      } else {
        onSelectItem(item);
      }
    }
  }, [isItemAvailable, onSelectItem]);

  const handlePointerLeave = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const handlePointerCancel = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const handleSetAvailability = useCallback(() => {
    setShowAvailabilityDialog(true);
  }, []);

  const handleQuick86 = useCallback(() => {
    if (!longPressItem) return;
    const currentQty = getQuantityRemaining(longPressItem.id);
    const is86ed = !isItemAvailable(longPressItem.id);
    
    if (is86ed) {
      setAvailability({ menuItemId: longPressItem.id, quantity: null, is86ed: false });
    } else {
      setAvailability({ menuItemId: longPressItem.id, quantity: 0, is86ed: true });
    }
  }, [longPressItem, getQuantityRemaining, isItemAvailable, setAvailability]);

  const handleSaveAvailability = useCallback((quantity: number | null) => {
    if (!longPressItem) return;
    setAvailability({ menuItemId: longPressItem.id, quantity });
  }, [longPressItem, setAvailability]);

  const handleConfirmSoldOut = useCallback(() => {
    if (soldOutItem) {
      onSelectItem(soldOutItem, true);
      setSoldOutItem(null);
    }
  }, [soldOutItem, onSelectItem]);

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 p-4">
        {Array.from({ length: 10 }).map((_, i) => (
          <div
            key={i}
            className="h-24 bg-muted animate-pulse rounded-md"
          />
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
        <span className="text-base">Select a category to view items</span>
      </div>
    );
  }

  const formatPrice = (price: string | null) => {
    const numPrice = parseFloat(price || "0");
    return `$${numPrice.toFixed(2)}`;
  };

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 p-4">
        {items.map((item) => {
          const quantity = getQuantityRemaining(item.id);
          const available = isItemAvailable(item.id);
          const showQuantityBadge = quantity !== null && quantity > 0;
          const is86ed = !available;

          return (
            <div key={item.id} className="h-24 relative">
              <Button
                variant="secondary"
                className={`w-full h-full flex flex-col items-center justify-center relative overflow-visible gap-1 ${is86ed ? "opacity-60" : ""}`}
                onPointerDown={() => handlePointerDown(item)}
                onPointerUp={() => handlePointerUp(item)}
                onPointerLeave={handlePointerLeave}
                onPointerCancel={handlePointerCancel}
                onContextMenu={(e) => e.preventDefault()}
                data-testid={`button-menu-item-${item.id}`}
              >
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-semibold text-center line-clamp-2">
                    {item.shortName || item.name}
                  </span>
                  {item.hasRequiredModifiers && (
                    <AlertCircle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                  )}
                </div>
                <span className="text-base font-bold tabular-nums">
                  {formatPrice(item.price)}
                </span>
                
                {is86ed && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <X className="w-16 h-16 text-destructive opacity-50" strokeWidth={3} />
                  </div>
                )}
              </Button>
              
              {showQuantityBadge && (
                <span
                  className="absolute top-1 right-1 min-w-6 h-6 px-1.5 rounded-full bg-red-500 text-white text-sm font-bold flex items-center justify-center shadow-sm"
                  data-testid={`badge-quantity-${item.id}`}
                >
                  {quantity}
                </span>
              )}
            </div>
          );
        })}
      </div>

      <ItemOptionsPopup
        open={showOptionsPopup}
        onOpenChange={setShowOptionsPopup}
        item={longPressItem}
        onSetAvailability={handleSetAvailability}
        onQuick86={handleQuick86}
        is86ed={longPressItem ? !isItemAvailable(longPressItem.id) : false}
      />

      <SetAvailabilityDialog
        open={showAvailabilityDialog}
        onOpenChange={setShowAvailabilityDialog}
        item={longPressItem}
        currentQuantity={longPressItem ? getQuantityRemaining(longPressItem.id) : null}
        onSave={handleSaveAvailability}
        isSaving={isUpdating}
      />

      <SoldOutConfirmDialog
        open={!!soldOutItem}
        onOpenChange={(open) => !open && setSoldOutItem(null)}
        item={soldOutItem}
        onConfirm={handleConfirmSoldOut}
      />
    </>
  );
}
