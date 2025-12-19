import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Check, AlertCircle } from "lucide-react";
import type { MenuItem, ModifierGroup, Modifier } from "@shared/schema";

interface SelectedModifier {
  id: string;
  name: string;
  priceDelta: string;
}

interface ModifierWithMeta extends Modifier {
  isDefault?: boolean;
  displayOrder?: number;
}

interface ModifierModalProps {
  open: boolean;
  onClose: () => void;
  menuItem: MenuItem | null;
  modifierGroups: (ModifierGroup & { modifiers: ModifierWithMeta[] })[];
  onConfirm: (modifiers: SelectedModifier[]) => void;
  initialModifiers?: SelectedModifier[];
}

export function ModifierModal({
  open,
  onClose,
  menuItem,
  modifierGroups,
  onConfirm,
  initialModifiers,
}: ModifierModalProps) {
  const [selectedModifiers, setSelectedModifiers] = useState<Map<string, SelectedModifier[]>>(
    new Map()
  );

  useEffect(() => {
    if (open && modifierGroups.length > 0) {
      const newSelection = new Map<string, SelectedModifier[]>();
      
      if (initialModifiers && initialModifiers.length > 0) {
        modifierGroups.forEach((group) => {
          const groupModIds = new Set(group.modifiers.map((m) => m.id));
          const matchingMods = initialModifiers.filter((m) => groupModIds.has(m.id));
          if (matchingMods.length > 0) {
            newSelection.set(group.id, matchingMods);
          }
        });
      } else {
        modifierGroups.forEach((group) => {
          const defaultMods = group.modifiers
            .filter((m) => m.isDefault)
            .map((m) => ({
              id: m.id,
              name: m.name,
              priceDelta: m.priceDelta || "0",
            }));
          if (defaultMods.length > 0) {
            newSelection.set(group.id, defaultMods);
          }
        });
      }
      setSelectedModifiers(newSelection);
    } else {
      setSelectedModifiers(new Map());
    }
  }, [open, modifierGroups, initialModifiers]);

  const toggleModifier = (group: ModifierGroup & { modifiers: ModifierWithMeta[] }, modifier: ModifierWithMeta) => {
    setSelectedModifiers((prev) => {
      const updated = new Map(prev);
      const groupMods = updated.get(group.id) || [];
      const isSelected = groupMods.some((m) => m.id === modifier.id);

      if (isSelected) {
        updated.set(
          group.id,
          groupMods.filter((m) => m.id !== modifier.id)
        );
      } else {
        const maxSelect = group.maxSelect || 99;
        if (groupMods.length < maxSelect) {
          updated.set(group.id, [
            ...groupMods,
            {
              id: modifier.id,
              name: modifier.name,
              priceDelta: modifier.priceDelta || "0",
            },
          ]);
        } else if (maxSelect === 1) {
          updated.set(group.id, [
            {
              id: modifier.id,
              name: modifier.name,
              priceDelta: modifier.priceDelta || "0",
            },
          ]);
        }
      }

      return updated;
    });
  };

  const isValid = () => {
    return modifierGroups.every((group) => {
      const selected = selectedModifiers.get(group.id) || [];
      const minSelect = group.minSelect || 0;
      return selected.length >= minSelect;
    });
  };

  const handleConfirm = () => {
    const allModifiers: SelectedModifier[] = [];
    selectedModifiers.forEach((mods) => {
      allModifiers.push(...mods);
    });
    onConfirm(allModifiers);
    onClose();
  };

  const formatPrice = (price: string | null) => {
    const numPrice = parseFloat(price || "0");
    if (numPrice === 0) return "";
    return numPrice > 0 ? `+$${numPrice.toFixed(2)}` : `-$${Math.abs(numPrice).toFixed(2)}`;
  };

  if (!menuItem) return null;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-xl" data-testid="text-modifier-modal-title">
            {menuItem.name}
          </DialogTitle>
          <p className="text-muted-foreground text-sm">
            Select your options
          </p>
        </DialogHeader>

        <ScrollArea className="flex-1 -mx-6 px-6">
          <div className="space-y-6 py-4">
            {modifierGroups.map((group) => {
              const groupSelected = selectedModifiers.get(group.id) || [];
              const minSelect = group.minSelect || 0;
              const maxSelect = group.maxSelect || 99;
              const isRequired = group.required || minSelect > 0;
              const isSatisfied = groupSelected.length >= minSelect;

              return (
                <div key={group.id} className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{group.name}</span>
                      {isRequired && !isSatisfied && (
                        <AlertCircle className="w-4 h-4 text-amber-500" />
                      )}
                    </div>
                    <Badge variant="outline" className="text-xs">
                      {groupSelected.length}/{maxSelect === 99 ? "any" : maxSelect}
                      {minSelect > 0 && ` (min ${minSelect})`}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    {group.modifiers.map((modifier) => {
                      const isSelected = groupSelected.some((m) => m.id === modifier.id);
                      const priceStr = formatPrice(modifier.priceDelta);

                      return (
                        <Button
                          key={modifier.id}
                          variant={isSelected ? "default" : "outline"}
                          className="h-auto py-3 justify-between"
                          onClick={() => toggleModifier(group, modifier)}
                          data-testid={`button-modifier-${modifier.id}`}
                        >
                          <div className="flex items-center gap-2">
                            {isSelected && <Check className="w-4 h-4" />}
                            <span>{modifier.name}</span>
                          </div>
                          {priceStr && (
                            <span className="text-xs opacity-70">{priceStr}</span>
                          )}
                        </Button>
                      );
                    })}
                  </div>

                  <Separator />
                </div>
              );
            })}
          </div>
        </ScrollArea>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onClose} data-testid="button-modifier-cancel">
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!isValid()}
            data-testid="button-modifier-confirm"
          >
            Add to Check
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
