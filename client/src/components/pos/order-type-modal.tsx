import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ORDER_TYPES, type OrderType } from "@shared/schema";
import { UtensilsCrossed, ShoppingBag, Truck, Clock } from "lucide-react";

interface OrderTypeModalProps {
  open: boolean;
  onClose: () => void;
  onSelect: (orderType: OrderType) => void;
  currentOrderType?: OrderType;
}

const ORDER_TYPE_CONFIG: Record<OrderType, { label: string; icon: typeof UtensilsCrossed; description: string }> = {
  dine_in: {
    label: "Dine In",
    icon: UtensilsCrossed,
    description: "Customer eating in restaurant",
  },
  take_out: {
    label: "Take Out",
    icon: ShoppingBag,
    description: "Customer picking up order",
  },
  delivery: {
    label: "Delivery",
    icon: Truck,
    description: "Order to be delivered",
  },
  pickup: {
    label: "Pickup",
    icon: Clock,
    description: "Scheduled pickup order",
  },
};

export function OrderTypeModal({
  open,
  onClose,
  onSelect,
  currentOrderType,
}: OrderTypeModalProps) {
  const handleSelect = (type: OrderType) => {
    onSelect(type);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle data-testid="text-order-type-title">Select Order Type</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3 py-4">
          {ORDER_TYPES.map((type) => {
            const config = ORDER_TYPE_CONFIG[type];
            const Icon = config.icon;
            const isSelected = currentOrderType === type;

            return (
              <Button
                key={type}
                variant={isSelected ? "default" : "outline"}
                className="h-auto flex-col items-start p-4 gap-2"
                onClick={() => handleSelect(type)}
                data-testid={`button-order-type-${type}`}
              >
                <div className="flex items-center gap-2">
                  <Icon className="w-5 h-5" />
                  <span className="font-semibold">{config.label}</span>
                </div>
                <span className="text-xs text-muted-foreground text-left">
                  {config.description}
                </span>
              </Button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
