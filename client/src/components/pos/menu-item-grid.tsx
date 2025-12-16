import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 p-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="h-20 bg-muted animate-pulse rounded-md"
          />
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
        <span className="text-sm">Select a category to view items</span>
      </div>
    );
  }

  const formatPrice = (price: string | null) => {
    const numPrice = parseFloat(price || "0");
    return `$${numPrice.toFixed(2)}`;
  };

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 p-2">
      {items.map((item) => (
        <Button
          key={item.id}
          variant="outline"
          className="h-20 flex flex-col items-start justify-between p-3 relative overflow-visible"
          onClick={() => onSelectItem(item)}
          data-testid={`button-menu-item-${item.id}`}
        >
          <div className="flex items-start justify-between w-full gap-1">
            <span className="text-sm font-medium text-left truncate flex-1">
              {item.shortName || item.name}
            </span>
            {item.hasRequiredModifiers && (
              <AlertCircle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
            )}
          </div>
          <Badge variant="secondary" className="text-xs">
            {formatPrice(item.price)}
          </Badge>
        </Button>
      ))}
    </div>
  );
}
