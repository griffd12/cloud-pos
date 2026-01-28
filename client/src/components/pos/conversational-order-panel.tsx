import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { getAuthHeaders } from "@/lib/queryClient";
import type { MenuItem, MenuItemRecipeIngredient, IngredientPrefix, Modifier } from "@shared/schema";
import { Check, X, Plus, Minus } from "lucide-react";

interface ActiveItemState {
  menuItem: MenuItem;
  ingredients: Array<{
    id: string;
    modifierId: string | null;
    ingredientName: string;
    prefixId: string | null;
    quantity: number;
    isIncluded: boolean;
  }>;
}

interface ConversationalOrderPanelProps {
  enterpriseId: string;
  activeMenuItem: MenuItem | null;
  onConfirmItem: (menuItemId: string, modifications: Array<{ingredientName: string; prefixName: string | null; quantity: number}>) => void;
  onCancelItem: () => void;
}

export function ConversationalOrderPanel({
  enterpriseId,
  activeMenuItem,
  onConfirmItem,
  onCancelItem,
}: ConversationalOrderPanelProps) {
  const [activeItemState, setActiveItemState] = useState<ActiveItemState | null>(null);

  const { data: ingredientPrefixes = [] } = useQuery<IngredientPrefix[]>({
    queryKey: ["/api/ingredient-prefixes", { enterpriseId }],
    queryFn: async () => {
      const res = await fetch(`/api/ingredient-prefixes?enterpriseId=${enterpriseId}`, { headers: getAuthHeaders() });
      return res.json();
    },
    enabled: !!enterpriseId,
  });

  const { data: recipeIngredients = [] } = useQuery<MenuItemRecipeIngredient[]>({
    queryKey: ["/api/menu-items", activeMenuItem?.id, "recipe-ingredients"],
    queryFn: async () => {
      if (!activeMenuItem) return [];
      const res = await fetch(`/api/menu-items/${activeMenuItem.id}/recipe-ingredients`, { headers: getAuthHeaders() });
      return res.json();
    },
    enabled: !!activeMenuItem?.menuBuildEnabled,
  });

  const { data: modifiers = [] } = useQuery<Modifier[]>({
    queryKey: ["/api/modifiers", { enterpriseId }],
    queryFn: async () => {
      const res = await fetch(`/api/modifiers?enterpriseId=${enterpriseId}`, { headers: getAuthHeaders() });
      return res.json();
    },
    enabled: !!enterpriseId,
  });

  useEffect(() => {
    if (activeMenuItem && recipeIngredients.length > 0) {
      setActiveItemState({
        menuItem: activeMenuItem,
        ingredients: recipeIngredients.map(r => ({
          id: r.id,
          modifierId: r.modifierId,
          ingredientName: r.modifierId 
            ? (modifiers.find(m => m.id === r.modifierId)?.name || r.ingredientName)
            : r.ingredientName,
          prefixId: r.defaultPrefixId,
          quantity: r.defaultQuantity ?? 1,
          isIncluded: r.isDefault ?? true,
        })),
      });
    } else if (activeMenuItem && !activeMenuItem.menuBuildEnabled) {
      setActiveItemState({
        menuItem: activeMenuItem,
        ingredients: [],
      });
    } else {
      setActiveItemState(null);
    }
  }, [activeMenuItem, recipeIngredients, modifiers]);

  const applyPrefix = (ingredientId: string, prefixId: string | null) => {
    if (!activeItemState) return;
    
    const prefix = ingredientPrefixes.find(p => p.id === prefixId);
    
    setActiveItemState(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        ingredients: prev.ingredients.map(ing => {
          if (ing.id === ingredientId) {
            if (prefix?.name === "No" || prefix?.name === "NO") {
              return { ...ing, prefixId, isIncluded: false, quantity: 0 };
            } else if (prefix?.name === "Extra" || prefix?.name === "EXTRA") {
              return { ...ing, prefixId, isIncluded: true, quantity: 2 };
            } else {
              return { ...ing, prefixId, isIncluded: true };
            }
          }
          return ing;
        }),
      };
    });
  };

  const toggleIngredient = (ingredientId: string) => {
    if (!activeItemState) return;
    
    setActiveItemState(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        ingredients: prev.ingredients.map(ing => {
          if (ing.id === ingredientId) {
            return { 
              ...ing, 
              isIncluded: !ing.isIncluded,
              quantity: ing.isIncluded ? 0 : 1,
              prefixId: ing.isIncluded ? null : ing.prefixId,
            };
          }
          return ing;
        }),
      };
    });
  };

  const handleConfirm = () => {
    if (!activeItemState) return;
    
    const modifications = activeItemState.ingredients
      .filter(ing => ing.prefixId || !ing.isIncluded || ing.quantity !== 1)
      .map(ing => ({
        ingredientName: ing.ingredientName,
        prefixName: ing.prefixId ? ingredientPrefixes.find(p => p.id === ing.prefixId)?.name || null : null,
        quantity: ing.quantity,
      }));
    
    onConfirmItem(activeItemState.menuItem.id, modifications);
    setActiveItemState(null);
  };

  if (!activeMenuItem) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground p-4">
        <p className="text-center text-sm">
          Select a menu item to begin building your order
        </p>
      </div>
    );
  }

  if (!activeMenuItem.menuBuildEnabled) {
    return (
      <div className="h-full flex flex-col p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-lg">{activeMenuItem.name}</h3>
          <Button size="icon" variant="ghost" onClick={onCancelItem} data-testid="button-cancel-item">
            <X className="w-4 h-4" />
          </Button>
        </div>
        <p className="text-muted-foreground text-sm mb-4">
          This item has no configurable ingredients.
        </p>
        <div className="flex gap-2 mt-auto">
          <Button variant="outline" className="flex-1" onClick={onCancelItem} data-testid="button-cancel">
            Cancel
          </Button>
          <Button className="flex-1" onClick={handleConfirm} data-testid="button-confirm-item">
            Add to Order
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-lg">{activeMenuItem.name}</h3>
        <Button size="icon" variant="ghost" onClick={onCancelItem} data-testid="button-cancel-item">
          <X className="w-4 h-4" />
        </Button>
      </div>
      
      <div className="flex flex-wrap gap-2 mb-4">
        {ingredientPrefixes.map(prefix => (
          <Badge 
            key={prefix.id} 
            variant="outline" 
            className="cursor-pointer text-xs"
            data-testid={`badge-prefix-${prefix.id}`}
          >
            {prefix.name}
          </Badge>
        ))}
      </div>
      
      <Separator className="mb-4" />
      
      <ScrollArea className="flex-1">
        <div className="space-y-2">
          {activeItemState?.ingredients.map((ingredient, idx) => (
            <div
              key={ingredient.id}
              className={`flex items-center gap-2 p-3 rounded-md border ${
                ingredient.isIncluded ? "bg-background" : "bg-muted/50 opacity-60"
              }`}
              data-testid={`ingredient-row-${idx}`}
            >
              <Button
                size="icon"
                variant={ingredient.isIncluded ? "default" : "outline"}
                className="w-8 h-8 flex-shrink-0"
                onClick={() => toggleIngredient(ingredient.id)}
                data-testid={`button-toggle-ingredient-${idx}`}
              >
                {ingredient.isIncluded ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
              </Button>
              
              <span className="flex-1 text-sm">
                {ingredient.prefixId && (
                  <span className="text-primary font-medium mr-1">
                    {ingredientPrefixes.find(p => p.id === ingredient.prefixId)?.name}
                  </span>
                )}
                {ingredient.ingredientName}
              </span>
              
              {ingredient.quantity > 1 && (
                <Badge variant="secondary" className="text-xs">
                  {ingredient.quantity}x
                </Badge>
              )}
              
              <div className="flex gap-1">
                {ingredientPrefixes.slice(0, 4).map(prefix => (
                  <Button
                    key={prefix.id}
                    size="sm"
                    variant={ingredient.prefixId === prefix.id ? "default" : "outline"}
                    className="px-2 py-1 h-7 text-xs"
                    onClick={() => applyPrefix(ingredient.id, prefix.id === ingredient.prefixId ? null : prefix.id)}
                    data-testid={`button-prefix-${prefix.name}-${idx}`}
                  >
                    {prefix.code || prefix.name.substring(0, 2)}
                  </Button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
      
      <div className="flex gap-2 mt-4 pt-4 border-t">
        <Button variant="outline" className="flex-1" onClick={onCancelItem} data-testid="button-cancel">
          Cancel
        </Button>
        <Button className="flex-1" onClick={handleConfirm} data-testid="button-confirm-item">
          Add to Order
        </Button>
      </div>
    </div>
  );
}
