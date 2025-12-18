import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import type { Check, CheckItem, OrderType } from "@shared/schema";
import { Trash2, Send, CreditCard, Star, Plus, Minus } from "lucide-react";

interface CheckPanelProps {
  check: Check | null;
  items: CheckItem[];
  orderType?: OrderType;
  onSend: () => void;
  onVoidItem: (item: CheckItem) => void;
  onPay: () => void;
  onNewCheck: () => void;
  onChangeOrderType: () => void;
  canSend: boolean;
  canVoid: boolean;
  isSending?: boolean;
  subtotal?: number;
  tax?: number;
  total?: number;
}

const ORDER_TYPE_LABELS: Record<string, string> = {
  dine_in: "Dine In",
  take_out: "Take Out",
  delivery: "Delivery",
  pickup: "Pickup",
};

export function CheckPanel({
  check,
  items,
  orderType,
  onSend,
  onVoidItem,
  onPay,
  onNewCheck,
  onChangeOrderType,
  canSend,
  canVoid,
  isSending,
  subtotal: propSubtotal,
  tax: propTax,
  total: propTotal,
}: CheckPanelProps) {
  const formatPrice = (price: string | number | null) => {
    const numPrice = typeof price === "string" ? parseFloat(price) : (price || 0);
    return `$${numPrice.toFixed(2)}`;
  };

  const activeItems = items.filter(item => !item.voided);
  const unsentItems = activeItems.filter(item => !item.sent);
  
  // Use provided values or fall back to local calculation
  const subtotal = propSubtotal ?? 0;
  const tax = propTax ?? 0;
  const total = propTotal ?? (subtotal + tax);

  if (!check) {
    return (
      <Card className="h-full flex flex-col">
        <CardHeader className="flex-shrink-0 pb-4">
          <div className="flex items-center justify-between gap-2">
            <span className="text-lg font-semibold">No Active Check</span>
          </div>
        </CardHeader>
        <CardContent className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-4">
            <p className="text-muted-foreground text-sm">
              Start a new check or select an item to begin
            </p>
            <Button onClick={onNewCheck} data-testid="button-new-check">
              <Plus className="w-4 h-4 mr-2" />
              New Check
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="flex-shrink-0 pb-2 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-lg font-semibold" data-testid="text-check-number">
            Check #{check.checkNumber}
          </span>
          <Badge
            variant="outline"
            className="cursor-pointer"
            onClick={onChangeOrderType}
            data-testid="badge-order-type"
          >
            {ORDER_TYPE_LABELS[check.orderType] || check.orderType}
          </Badge>
        </div>
        {check.tableNumber && (
          <span className="text-sm text-muted-foreground">
            Table: {check.tableNumber}
          </span>
        )}
      </CardHeader>
      
      <Separator />
      
      <ScrollArea className="flex-1">
        <CardContent className="pt-4 space-y-2">
          {activeItems.length === 0 ? (
            <p className="text-center text-muted-foreground text-sm py-8">
              No items on this check
            </p>
          ) : (
            activeItems.map((item) => (
              <div
                key={item.id}
                className="flex items-start gap-2 p-2 rounded-md hover-elevate group"
                data-testid={`check-item-${item.id}`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    {item.sent && (
                      <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500 flex-shrink-0" />
                    )}
                    <span className="font-medium text-sm truncate">
                      {item.quantity && item.quantity > 1 ? `${item.quantity}x ` : ""}
                      {item.menuItemName}
                    </span>
                  </div>
                  {item.modifiers && item.modifiers.length > 0 && (
                    <div className="ml-5 mt-0.5 space-y-0.5">
                      {item.modifiers.map((mod, idx) => (
                        <span
                          key={idx}
                          className="block text-xs text-muted-foreground"
                        >
                          + {mod.name}
                          {parseFloat(mod.priceDelta) > 0 && (
                            <span className="ml-1">
                              (+{formatPrice(mod.priceDelta)})
                            </span>
                          )}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium tabular-nums">
                    {formatPrice(
                      (parseFloat(item.unitPrice || "0") +
                        (item.modifiers || []).reduce(
                          (sum, m) => sum + parseFloat(m.priceDelta || "0"),
                          0
                        )) *
                        (item.quantity || 1)
                    )}
                  </span>
                  {canVoid && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => onVoidItem(item)}
                      data-testid={`button-void-item-${item.id}`}
                    >
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  )}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </ScrollArea>

      <Separator />

      <CardFooter className="flex-shrink-0 flex-col gap-4 pt-4">
        <div className="w-full space-y-1">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Subtotal</span>
            <span className="tabular-nums">{formatPrice(subtotal)}</span>
          </div>
          {tax > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Tax</span>
              <span className="tabular-nums">{formatPrice(tax)}</span>
            </div>
          )}
          <div className="flex justify-between text-lg font-semibold pt-1">
            <span>Total</span>
            <span className="tabular-nums" data-testid="text-check-total">
              {formatPrice(total)}
            </span>
          </div>
        </div>

        <div className="w-full grid grid-cols-2 gap-2">
          <Button
            variant="secondary"
            className="h-12"
            onClick={onSend}
            disabled={unsentItems.length === 0 || !canSend || isSending}
            data-testid="button-send"
          >
            <Send className="w-4 h-4 mr-2" />
            {isSending ? "Sending..." : `Send (${unsentItems.length})`}
          </Button>
          <Button
            className="h-12"
            onClick={onPay}
            disabled={activeItems.length === 0}
            data-testid="button-pay"
          >
            <CreditCard className="w-4 h-4 mr-2" />
            Pay
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}
