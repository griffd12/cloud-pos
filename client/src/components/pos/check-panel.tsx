import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { Check, CheckItem, OrderType } from "@shared/schema";
import { Trash2, Send, CreditCard, Check as CheckIcon, Clock, DollarSign } from "lucide-react";

interface CheckPanelProps {
  check: Check | null;
  items: CheckItem[];
  orderType?: OrderType;
  onSend: () => void;
  onVoidItem: (item: CheckItem) => void;
  onEditModifiers?: (item: CheckItem) => void;
  onSelectItem?: (item: CheckItem | null) => void;
  selectedItemId?: string | null;
  onPay: () => void;
  onNewCheck: () => void;
  onChangeOrderType: () => void;
  onPriceOverride?: (item: CheckItem) => void;
  canSend: boolean;
  canVoid: boolean;
  canPriceOverride?: boolean;
  isSending?: boolean;
  subtotal?: number;
  tax?: number;
  total?: number;
  paidAmount?: number;
  paymentsReady?: boolean;
}

const ORDER_TYPE_LABELS: Record<string, string> = {
  dine_in: "Dine In",
  take_out: "Take Out",
  delivery: "Delivery",
  pickup: "Pickup",
};

interface SwipeableItemProps {
  item: CheckItem;
  isSelected: boolean;
  itemTotal: number;
  canVoid: boolean;
  canPriceOverride?: boolean;
  onSelect: () => void;
  onVoid: () => void;
  onPriceOverride?: () => void;
  onEditModifiers?: () => void;
  formatPrice: (price: string | number | null) => string;
}

function SwipeableItem({
  item,
  isSelected,
  itemTotal,
  canVoid,
  canPriceOverride,
  onSelect,
  onVoid,
  onPriceOverride,
  onEditModifiers,
  formatPrice,
}: SwipeableItemProps) {
  const [isRevealed, setIsRevealed] = useState(false);
  const startX = useRef<number | null>(null);
  const startY = useRef<number | null>(null);
  const isDragging = useRef(false);

  // Touch handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
    isDragging.current = false;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (startX.current === null || startY.current === null) return;
    
    const endX = e.changedTouches[0].clientX;
    const endY = e.changedTouches[0].clientY;
    const deltaX = startX.current - endX;
    const deltaY = Math.abs(startY.current - endY);
    
    if (Math.abs(deltaX) > 50 && Math.abs(deltaX) > deltaY) {
      isDragging.current = true;
      setIsRevealed(deltaX > 0);
    }
    
    startX.current = null;
    startY.current = null;
  };

  // Mouse handlers for desktop
  const handleMouseDown = (e: React.MouseEvent) => {
    startX.current = e.clientX;
    startY.current = e.clientY;
    isDragging.current = false;
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (startX.current === null || startY.current === null) return;
    
    const deltaX = startX.current - e.clientX;
    const deltaY = Math.abs(startY.current - e.clientY);
    
    if (Math.abs(deltaX) > 50 && Math.abs(deltaX) > deltaY) {
      isDragging.current = true;
      setIsRevealed(deltaX > 0);
    }
    
    startX.current = null;
    startY.current = null;
  };

  const handleClick = (e: React.MouseEvent) => {
    // If we just finished dragging, don't trigger click
    if (isDragging.current) {
      isDragging.current = false;
      return;
    }
    
    if (isRevealed) {
      setIsRevealed(false);
    } else {
      // For unsent items, clicking opens modifier modal if available
      if (!item.sent && onEditModifiers) {
        onEditModifiers();
      } else {
        onSelect();
      }
    }
  };

  return (
    <div
      className={`rounded-md transition-colors overflow-hidden ${
        isSelected 
          ? "bg-accent ring-1 ring-primary/20" 
          : item.sent 
            ? "bg-green-500/5 dark:bg-green-500/10" 
            : "bg-muted/50"
      }`}
      data-testid={`check-item-${item.id}`}
    >
      <div className="relative flex">
        {/* Main item content */}
        <div
          className={`flex-1 flex items-start gap-2 p-2.5 cursor-pointer hover-elevate active-elevate-2 transition-transform duration-200 ${
            isRevealed ? "-translate-x-24" : "translate-x-0"
          }`}
          onClick={handleClick}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
          data-testid={`button-select-item-${item.id}`}
        >
          <div className="flex-shrink-0 w-5 h-5 flex items-center justify-center">
            {item.sent ? (
              <CheckIcon className="w-4 h-4 text-green-500" />
            ) : (
              <div className="w-2 h-2 rounded-full bg-amber-500" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-1">
              {item.quantity && item.quantity > 1 && (
                <span className="text-xs font-semibold text-primary">{item.quantity}x</span>
              )}
              <span className="font-medium text-sm truncate">
                {item.menuItemName}
              </span>
            </div>
            {item.modifiers && item.modifiers.length > 0 && (
              <div className="mt-1 space-y-0.5">
                {item.modifiers.map((mod, idx) => (
                  <button
                    key={idx}
                    type="button"
                    className={`block text-left text-xs rounded ${
                      !item.sent 
                        ? "cursor-pointer text-muted-foreground hover:text-foreground" 
                        : "text-muted-foreground/70 cursor-default"
                    }`}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!item.sent && onEditModifiers) {
                        onEditModifiers();
                      }
                    }}
                    disabled={!!item.sent}
                    data-testid={`button-modifier-${item.id}-${idx}`}
                  >
                    + {mod.name}
                    {parseFloat(mod.priceDelta) > 0 && (
                      <span className="ml-1 text-muted-foreground">
                        (+{formatPrice(mod.priceDelta)})
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
          <span className="text-sm font-semibold tabular-nums flex-shrink-0">
            {formatPrice(itemTotal)}
          </span>
        </div>
        
        {/* Swipe actions panel */}
        <div 
          className={`absolute right-0 top-0 bottom-0 flex items-stretch transition-opacity duration-200 ${
            isRevealed ? "opacity-100" : "opacity-0 pointer-events-none"
          }`}
        >
          {canPriceOverride && onPriceOverride && (
            <button
              className="w-12 bg-blue-500 hover:bg-blue-600 text-white flex items-center justify-center"
              onClick={(e) => {
                e.stopPropagation();
                setIsRevealed(false);
                onPriceOverride();
              }}
              data-testid={`button-price-override-swipe-${item.id}`}
            >
              <DollarSign className="w-5 h-5" />
            </button>
          )}
          {canVoid && (
            <button
              className="w-12 bg-destructive hover:bg-destructive/90 text-destructive-foreground flex items-center justify-center"
              onClick={(e) => {
                e.stopPropagation();
                setIsRevealed(false);
                onVoid();
              }}
              data-testid={`button-void-swipe-${item.id}`}
            >
              <Trash2 className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function CheckPanel({
  check,
  items,
  orderType,
  onSend,
  onVoidItem,
  onEditModifiers,
  onSelectItem,
  selectedItemId,
  onPay,
  onNewCheck,
  onChangeOrderType,
  onPriceOverride,
  canSend,
  canVoid,
  canPriceOverride = false,
  isSending,
  subtotal: propSubtotal,
  tax: propTax,
  total: propTotal,
  paidAmount = 0,
  paymentsReady = true,
}: CheckPanelProps) {
  const formatPrice = (price: string | number | null) => {
    const numPrice = typeof price === "string" ? parseFloat(price) : (price || 0);
    return `$${numPrice.toFixed(2)}`;
  };

  const activeItems = items.filter(item => !item.voided);
  const unsentItems = activeItems.filter(item => !item.sent);
  const sentItems = activeItems.filter(item => item.sent);
  
  const subtotal = propSubtotal ?? 0;
  const tax = propTax ?? 0;
  const total = propTotal ?? (subtotal + tax);
  const balanceDue = Math.max(0, total - paidAmount);

  if (!check) {
    return (
      <div className="h-full flex flex-col bg-card">
        <div className="flex-shrink-0 px-4 py-3 border-b bg-muted/30">
          <span className="text-base font-semibold text-muted-foreground">No Active Check</span>
        </div>
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="text-center space-y-3">
            <Clock className="w-12 h-12 mx-auto text-muted-foreground/50" />
            <p className="text-muted-foreground text-sm">
              Select an item to start a new check,<br />
              or use the function bar below
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-card">
      <div className="flex-shrink-0 px-4 py-3 border-b flex items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <span className="text-lg font-bold tabular-nums" data-testid="text-check-number">
            #{check.checkNumber}
          </span>
          <Badge
            variant="secondary"
            className="cursor-pointer font-medium"
            onClick={onChangeOrderType}
            data-testid="badge-order-type"
          >
            {ORDER_TYPE_LABELS[check.orderType] || check.orderType}
          </Badge>
        </div>
        {check.tableNumber && (
          <span className="text-sm text-muted-foreground">
            Tbl {check.tableNumber}
          </span>
        )}
      </div>
      
      <ScrollArea className="flex-1">
        <div className="p-3 space-y-1">
          {activeItems.length === 0 ? (
            <p className="text-center text-muted-foreground text-sm py-12">
              No items on this check
            </p>
          ) : (
            activeItems.map((item) => {
              const isSelected = selectedItemId === item.id;
              const itemTotal = (parseFloat(item.unitPrice || "0") +
                (item.modifiers || []).reduce(
                  (sum, m) => sum + parseFloat(m.priceDelta || "0"),
                  0
                )) * (item.quantity || 1);
              
              return (
                <SwipeableItem
                  key={item.id}
                  item={item}
                  isSelected={isSelected}
                  itemTotal={itemTotal}
                  canVoid={canVoid}
                  canPriceOverride={canPriceOverride}
                  onSelect={() => onSelectItem?.(isSelected ? null : item)}
                  onVoid={() => onVoidItem(item)}
                  onPriceOverride={onPriceOverride ? () => onPriceOverride(item) : undefined}
                  onEditModifiers={onEditModifiers ? () => onEditModifiers(item) : undefined}
                  formatPrice={formatPrice}
                />
              );
            })
          )}
        </div>
      </ScrollArea>

      <div className="flex-shrink-0 border-t bg-muted/30">
        <div className="px-4 py-3 space-y-1">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Subtotal</span>
            <span className="tabular-nums font-medium">{formatPrice(subtotal)}</span>
          </div>
          {tax > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Tax</span>
              <span className="tabular-nums">{formatPrice(tax)}</span>
            </div>
          )}
          {paidAmount > 0 && (
            <div className="flex justify-between text-sm text-green-600 dark:text-green-400">
              <span>Paid</span>
              <span className="tabular-nums">-{formatPrice(paidAmount)}</span>
            </div>
          )}
        </div>
        <div className="px-4 py-3 border-t bg-card flex justify-between items-center">
          <span className="font-semibold">{paidAmount > 0 ? "Balance" : "Total"}</span>
          <span className="text-2xl font-bold tabular-nums" data-testid="text-check-total">
            {formatPrice(paidAmount > 0 ? balanceDue : total)}
          </span>
        </div>
      </div>

      <div className="flex-shrink-0 p-3 border-t bg-muted/30 space-y-2">
        <Button
          variant={unsentItems.length > 0 ? "default" : "secondary"}
          size="lg"
          className="w-full"
          onClick={onSend}
          disabled={isSending}
          data-testid="button-send-order"
        >
          <Send className="w-4 h-4 mr-2" />
          {unsentItems.length > 0 ? `Send (${unsentItems.length})` : "Exit"}
        </Button>
        <Button
          size="lg"
          className="w-full bg-green-600 hover:bg-green-700 text-white"
          onClick={onPay}
          disabled={!paymentsReady}
          data-testid="button-pay"
        >
          <CreditCard className="w-4 h-4 mr-2" />
          {paidAmount > 0 ? `Pay Balance ${formatPrice(balanceDue)}` : `Pay ${formatPrice(total)}`}
        </Button>
      </div>
    </div>
  );
}
