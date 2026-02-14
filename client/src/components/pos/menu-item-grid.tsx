import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ItemOptionsPopup } from "./item-options-popup";
import { SetAvailabilityDialog } from "./set-availability-dialog";
import { SoldOutConfirmDialog } from "./sold-out-confirm-dialog";
import { useItemAvailability } from "@/hooks/use-item-availability";
import type { MenuItem } from "@shared/schema";
import { AlertCircle, X, ChevronUp, ChevronDown } from "lucide-react";

interface MenuItemWithModifiers extends MenuItem {
  hasRequiredModifiers?: boolean;
}

interface MenuItemGridProps {
  items: MenuItemWithModifiers[];
  onSelectItem: (item: MenuItem, skipAvailabilityCheck?: boolean) => void;
  isLoading?: boolean;
}

const LONG_PRESS_DURATION = 500;
const PAGE_NAV_HEIGHT = 44;
const GRID_PADDING = 16;
const GAP = 12;

function getItemHeight(): number {
  const rootFontSize = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  return Math.round(5 * rootFontSize);
}

function getColumns(width: number): number {
  if (width >= 1280) return 5;
  if (width >= 1024) return 4;
  if (width >= 640) return 3;
  return 2;
}

export function MenuItemGrid({ items, onSelectItem, isLoading }: MenuItemGridProps) {
  const { getQuantityRemaining, isItemAvailable, setAvailability, isUpdating } = useItemAvailability();
  
  const [longPressItem, setLongPressItem] = useState<MenuItem | null>(null);
  const [showOptionsPopup, setShowOptionsPopup] = useState(false);
  const [showAvailabilityDialog, setShowAvailabilityDialog] = useState(false);
  const [soldOutItem, setSoldOutItem] = useState<MenuItem | null>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ width: 800, height: 600 });
  
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isLongPressRef = useRef(false);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerSize({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setCurrentPage(0);
  }, [items]);

  const itemHeight = getItemHeight();
  const columns = getColumns(containerSize.width);

  const { totalPages, pageItems } = useMemo(() => {
    if (containerSize.height <= 0 || items.length === 0) {
      return { totalPages: 1, pageItems: items };
    }

    const usableHeight = containerSize.height - (GRID_PADDING * 2);
    const rowHeight = itemHeight + GAP;
    let maxRows = Math.max(1, Math.floor((usableHeight + GAP) / rowHeight));
    const perPage = maxRows * columns;

    if (items.length <= perPage) {
      return { totalPages: 1, pageItems: items };
    }

    const usableWithNav = usableHeight - PAGE_NAV_HEIGHT;
    const adjustedRows = Math.max(1, Math.floor((usableWithNav + GAP) / rowHeight));
    const adjustedPerPage = adjustedRows * columns;
    const adjustedTotal = Math.ceil(items.length / adjustedPerPage);
    const safeCurrentPage = Math.min(currentPage, adjustedTotal - 1);
    const start = safeCurrentPage * adjustedPerPage;
    const end = Math.min(start + adjustedPerPage, items.length);

    return {
      totalPages: adjustedTotal,
      pageItems: items.slice(start, end),
    };
  }, [items, containerSize.height, containerSize.width, columns, currentPage, itemHeight]);

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
    const is86ed = !isItemAvailable(longPressItem.id);
    
    if (is86ed) {
      setAvailability({ menuItemId: longPressItem.id, quantity: null, is86ed: false });
    } else {
      setAvailability({ menuItemId: longPressItem.id, quantity: 0, is86ed: true });
    }
  }, [longPressItem, isItemAvailable, setAvailability]);

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
      <div ref={containerRef} className="flex-1 overflow-hidden">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 p-4">
          {Array.from({ length: 10 }).map((_, i) => (
            <div
              key={i}
              style={{ height: `${itemHeight}px` }}
              className="bg-muted animate-pulse rounded-md"
            />
          ))}
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div ref={containerRef} className="flex-1 flex flex-col items-center justify-center text-muted-foreground overflow-hidden">
        <span className="text-lg">Select a category to view items</span>
      </div>
    );
  }

  const formatPrice = (price: string | null) => {
    const numPrice = parseFloat(price || "0");
    return `$${numPrice.toFixed(2)}`;
  };

  return (
    <>
      <div ref={containerRef} className="flex-1 flex flex-col overflow-hidden">
        <div
          className="flex-1 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 p-4 overflow-hidden"
          style={{ alignContent: "start" }}
        >
          {pageItems.map((item) => {
            const quantity = getQuantityRemaining(item.id);
            const available = isItemAvailable(item.id);
            const showQuantityBadge = quantity !== null && quantity > 0;
            const is86ed = !available;

            return (
              <div key={item.id} className="relative" style={{ height: `${itemHeight}px` }}>
                <Button
                  variant="secondary"
                  className={`w-full h-full flex flex-col items-center justify-center relative overflow-hidden gap-0.5 ${is86ed ? "opacity-60" : ""}`}
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
                      <X className="w-12 h-12 text-destructive opacity-50" strokeWidth={3} />
                    </div>
                  )}
                </Button>
                
                {showQuantityBadge && (
                  <span
                    className="absolute top-1 right-1 min-w-5 h-5 px-1 rounded-full bg-red-500 text-white text-xs font-bold flex items-center justify-center shadow-sm"
                    data-testid={`badge-quantity-${item.id}`}
                  >
                    {quantity}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {totalPages > 1 && (
          <div className="flex-shrink-0 flex items-center justify-center gap-3 px-4 py-1.5 border-t bg-card" style={{ height: `${PAGE_NAV_HEIGHT}px` }}>
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-4 font-semibold"
              disabled={currentPage === 0}
              onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
              data-testid="button-page-up"
            >
              <ChevronUp className="w-4 h-4 mr-1" />
              Page Up
            </Button>
            <span className="text-sm font-medium text-muted-foreground tabular-nums" data-testid="text-page-indicator">
              Page {currentPage + 1} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-4 font-semibold"
              disabled={currentPage >= totalPages - 1}
              onClick={() => setCurrentPage(p => Math.min(totalPages - 1, p + 1))}
              data-testid="button-page-down"
            >
              <ChevronDown className="w-4 h-4 mr-1" />
              Page Down
            </Button>
          </div>
        )}
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
