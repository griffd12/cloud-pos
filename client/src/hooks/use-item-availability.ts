import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { usePosContext } from "@/lib/pos-context";
import type { ItemAvailability } from "@shared/schema";

export function useItemAvailability() {
  const { currentRvc } = usePosContext();
  const propertyId = currentRvc?.propertyId;

  const { data: availabilityData = [], isLoading } = useQuery<ItemAvailability[]>({
    queryKey: ["/api/item-availability", propertyId],
    queryFn: async () => {
      if (!propertyId) return [];
      const res = await fetch(`/api/item-availability?propertyId=${propertyId}`, {
        credentials: "include",
      });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!propertyId,
    staleTime: 10000,
  });

  const availabilityMap = new Map<string, ItemAvailability>();
  for (const item of availabilityData) {
    availabilityMap.set(item.menuItemId, item);
  }

  const getAvailability = (menuItemId: string): ItemAvailability | undefined => {
    return availabilityMap.get(menuItemId);
  };

  const isItemAvailable = (menuItemId: string): boolean => {
    const availability = availabilityMap.get(menuItemId);
    if (!availability) return true;
    if (availability.is86ed) return false;
    if (availability.currentQuantity !== null && availability.currentQuantity <= 0) return false;
    return availability.isAvailable !== false;
  };

  const getQuantityRemaining = (menuItemId: string): number | null => {
    const availability = availabilityMap.get(menuItemId);
    if (!availability) return null;
    return availability.currentQuantity;
  };

  const setAvailabilityMutation = useMutation({
    mutationFn: async (data: {
      menuItemId: string;
      quantity: number | null;
      is86ed?: boolean;
    }) => {
      const existing = availabilityMap.get(data.menuItemId);
      
      if (existing) {
        const response = await apiRequest("PUT", `/api/item-availability/${existing.id}`, {
          currentQuantity: data.quantity,
          initialQuantity: data.quantity,
          is86ed: data.is86ed ?? (data.quantity === 0),
          isAvailable: data.quantity === null || data.quantity > 0,
        });
        return response.json();
      } else {
        const response = await apiRequest("POST", "/api/item-availability", {
          menuItemId: data.menuItemId,
          propertyId,
          businessDate: new Date().toISOString().split("T")[0],
          initialQuantity: data.quantity,
          currentQuantity: data.quantity,
          is86ed: data.is86ed ?? (data.quantity === 0),
          isAvailable: data.quantity === null || data.quantity > 0,
        });
        return response.json();
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/item-availability", propertyId] });
    },
  });

  const decrementQuantityMutation = useMutation({
    mutationFn: async (menuItemId: string) => {
      const existing = availabilityMap.get(menuItemId);
      if (!existing || existing.currentQuantity === null) return null;
      
      const newQty = Math.max(0, existing.currentQuantity - 1);
      const response = await apiRequest("PUT", `/api/item-availability/${existing.id}`, {
        currentQuantity: newQty,
        soldQuantity: (existing.soldQuantity || 0) + 1,
        is86ed: newQty === 0,
        isAvailable: newQty > 0,
        eightySixedAt: newQty === 0 ? new Date().toISOString() : null,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/item-availability", propertyId] });
    },
  });

  return {
    availabilityData,
    isLoading,
    getAvailability,
    isItemAvailable,
    getQuantityRemaining,
    setAvailability: setAvailabilityMutation.mutate,
    decrementQuantity: decrementQuantityMutation.mutate,
    isUpdating: setAvailabilityMutation.isPending || decrementQuantityMutation.isPending,
  };
}
