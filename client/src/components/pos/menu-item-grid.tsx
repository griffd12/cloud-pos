import { Button } from "@/components/ui/button";
import type { MenuItem } from "@shared/schema";
import { AlertCircle } from "lucide-react";

interface MenuItemWithModifiers extends MenuItem {
  hasRequiredModifiers?: boolean;
}

interface MenuItemGridProps {
  items: MenuItemWithModifiers[];
  onSelectItem: (item: MenuItem) => void;
  isLoading?: boolean;
}

export function MenuItemGrid({ items, onSelectItem, isLoading }: MenuItemGridProps) {
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
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 p-4">
      {items.map((item) => (
        <Button
          key={item.id}
          variant="secondary"
          className="h-24 flex flex-col items-center justify-center p-3 relative overflow-visible gap-1"
          onClick={() => onSelectItem(item)}
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
        </Button>
      ))}
    </div>
  );
}
