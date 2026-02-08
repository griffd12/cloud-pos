import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { getAuthHeaders, fetchWithTimeout } from "@/lib/queryClient";
import type { MenuItem, MenuItemRecipeIngredient, IngredientPrefix, Modifier, CheckItem } from "@shared/schema";
import { X } from "lucide-react";

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

interface HorizontalCOMPanelProps {
  enterpriseId: string;
  activeMenuItem: MenuItem | null;
  editingCheckItem?: CheckItem | null;
  onConfirmItem: (menuItemId: string, modifications: Array<{ingredientName: string; prefixName: string | null; quantity: number}>) => void;
  onCancelItem: () => void;
}

export function HorizontalCOMPanel({
  enterpriseId,
  activeMenuItem,
  editingCheckItem,
  onConfirmItem,
  onCancelItem,
}: HorizontalCOMPanelProps) {
  const [activeItemState, setActiveItemState] = useState<ActiveItemState | null>(null);

  const { data: ingredientPrefixes = [] } = useQuery<IngredientPrefix[]>({
    queryKey: ["/api/ingredient-prefixes", { enterpriseId }],
    queryFn: async () => {
      const res = await fetchWithTimeout(`/api/ingredient-prefixes?enterpriseId=${enterpriseId}`, { headers: getAuthHeaders() });
      return res.json();
    },
    enabled: !!enterpriseId,
  });

  const { data: recipeIngredients = [] } = useQuery<MenuItemRecipeIngredient[]>({
    queryKey: ["/api/menu-items", activeMenuItem?.id, "recipe-ingredients"],
    queryFn: async () => {
      if (!activeMenuItem) return [];
      const res = await fetchWithTimeout(`/api/menu-items/${activeMenuItem.id}/recipe-ingredients`, { headers: getAuthHeaders() });
      return res.json();
    },
    enabled: !!activeMenuItem?.menuBuildEnabled,
  });

  const { data: modifiers = [] } = useQuery<Modifier[]>({
    queryKey: ["/api/modifiers", { enterpriseId }],
    queryFn: async () => {
      const res = await fetchWithTimeout(`/api/modifiers?enterpriseId=${enterpriseId}`, { headers: getAuthHeaders() });
      return res.json();
    },
    enabled: !!enterpriseId,
  });

  useEffect(() => {
    if (activeMenuItem && recipeIngredients.length > 0) {
      // Build the base ingredients from recipe
      const baseIngredients = recipeIngredients.map(r => {
        const ingredientName = r.modifierId 
          ? (modifiers.find(m => m.id === r.modifierId)?.name || r.ingredientName)
          : r.ingredientName;
        
        // If editing, find existing modifier for this ingredient
        let prefixId = r.defaultPrefixId;
        let quantity = r.defaultQuantity ?? 1;
        let isIncluded = r.isDefault ?? true;
        
        if (editingCheckItem?.modifiers) {
          // Look for a modifier that matches this ingredient
          const existingMod = editingCheckItem.modifiers.find(m => {
            const modName = m.name?.toLowerCase() || '';
            const ingName = ingredientName.toLowerCase();
            return modName.includes(ingName) || ingName.includes(modName.split(' ').pop() || '');
          });
          
          if (existingMod) {
            // Parse the prefix from the existing modifier
            const prefix = existingMod.prefix || (existingMod.name?.split(' ')[0] || '');
            const matchingPrefix = ingredientPrefixes.find(p => 
              p.name?.toLowerCase() === prefix.toLowerCase() || 
              p.code?.toLowerCase() === prefix.toLowerCase()
            );
            if (matchingPrefix) {
              prefixId = matchingPrefix.id;
              const prefixName = matchingPrefix.name?.toLowerCase() || '';
              if (prefixName === 'no') {
                isIncluded = false;
                quantity = 0;
              } else if (prefixName === 'extra' || prefixName === 'xtr') {
                quantity = 2;
              }
            }
          }
        }
        
        return {
          id: r.id,
          modifierId: r.modifierId,
          ingredientName,
          prefixId,
          quantity,
          isIncluded,
        };
      });
      
      setActiveItemState({
        menuItem: activeMenuItem,
        ingredients: baseIngredients,
      });
    } else if (activeMenuItem && !activeMenuItem.menuBuildEnabled) {
      setActiveItemState({
        menuItem: activeMenuItem,
        ingredients: [],
      });
    } else {
      setActiveItemState(null);
    }
  }, [activeMenuItem, recipeIngredients, modifiers, editingCheckItem, ingredientPrefixes]);

  const applyPrefix = (ingredientId: string, prefixId: string | null) => {
    if (!activeItemState) return;
    
    const prefix = ingredientPrefixes.find(p => p.id === prefixId);
    const prefixName = prefix?.name?.toLowerCase() || '';
    
    setActiveItemState(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        ingredients: prev.ingredients.map(ing => {
          if (ing.id === ingredientId) {
            if (prefixName === 'no') {
              return { ...ing, prefixId, isIncluded: false, quantity: 0 };
            } else if (prefixName === 'extra' || prefixName === 'xtr') {
              return { ...ing, prefixId, isIncluded: true, quantity: 2 };
            } else if (prefixName === 'lt' || prefixName === 'light') {
              return { ...ing, prefixId, isIncluded: true, quantity: 1 };
            } else if (prefixName === 'sub') {
              return { ...ing, prefixId, isIncluded: true, quantity: 1 };
            } else {
              return { ...ing, prefixId, isIncluded: true };
            }
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
    return null;
  }

  if (!activeMenuItem.menuBuildEnabled) {
    return (
      <div className="flex-shrink-0 border-b bg-muted/50 px-3 py-2">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="font-semibold">{activeMenuItem.name}</span>
            <span className="text-xs text-muted-foreground">No configurable ingredients</span>
          </div>
          <div className="flex-1" />
          <Button variant="outline" size="sm" onClick={onCancelItem} data-testid="button-cancel-com">
            Cancel
          </Button>
          <Button size="sm" onClick={handleConfirm} data-testid="button-confirm-com">
            Add to Order
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-shrink-0 border-t bg-muted/30">
      <div className="flex items-center gap-3 px-3 py-2 border-b bg-card">
        <span className="font-semibold text-lg">{activeMenuItem.name}</span>
        <Button size="icon" variant="ghost" onClick={onCancelItem} data-testid="button-close-com">
          <X className="w-4 h-4" />
        </Button>
        <div className="flex-1" />
        <Button variant="outline" size="sm" onClick={onCancelItem} data-testid="button-cancel-com">
          Cancel
        </Button>
        <Button size="sm" onClick={handleConfirm} data-testid="button-add-to-order-com">
          {editingCheckItem ? "Update" : "Add to Order"}
        </Button>
      </div>
      
      <ScrollArea className="w-full">
        <div className="flex gap-2 p-3">
          {activeItemState?.ingredients.map((ingredient, idx) => (
            <div
              key={ingredient.id}
              className={`flex flex-col gap-1 p-2 rounded-md border min-w-fit ${
                ingredient.isIncluded ? "bg-background" : "bg-muted/50 opacity-60"
              }`}
              data-testid={`com-ingredient-${idx}`}
            >
              <div className="flex items-center gap-1.5">
                {ingredient.prefixId && (
                  <span className="text-primary font-medium text-xs">
                    {ingredientPrefixes.find(p => p.id === ingredient.prefixId)?.code || 
                     ingredientPrefixes.find(p => p.id === ingredient.prefixId)?.name}
                  </span>
                )}
                <span className="text-sm font-medium whitespace-nowrap">
                  {ingredient.ingredientName}
                </span>
              </div>
              
              <div className="flex gap-1">
                {ingredientPrefixes.map(prefix => (
                  <Button
                    key={prefix.id}
                    size="sm"
                    variant={ingredient.prefixId === prefix.id ? "default" : "outline"}
                    onClick={() => applyPrefix(ingredient.id, prefix.id === ingredient.prefixId ? null : prefix.id)}
                    data-testid={`button-com-prefix-${prefix.name}-${idx}`}
                  >
                    {prefix.code || prefix.name.substring(0, 2).toUpperCase()}
                  </Button>
                ))}
              </div>
            </div>
          ))}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </div>
  );
}
