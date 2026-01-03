import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { SluGrid } from "@/components/pos/slu-grid";
import { MenuItemGrid } from "@/components/pos/menu-item-grid";
import { CheckPanel } from "@/components/pos/check-panel";
import { ModifierModal } from "@/components/pos/modifier-modal";
import { ManagerApprovalModal } from "@/components/pos/manager-approval-modal";
import { OrderTypeModal } from "@/components/pos/order-type-modal";
import { PaymentModal } from "@/components/pos/payment-modal";
import { OpenChecksModal } from "@/components/pos/open-checks-modal";
import { TransactionLookupModal } from "@/components/pos/transaction-lookup-modal";
import { RefundModal } from "@/components/pos/refund-modal";
import { ThemeToggle } from "@/components/theme-toggle";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { usePosContext } from "@/lib/pos-context";
import type { Slu, MenuItem, Check, CheckItem, ModifierGroup, Modifier, Tender, OrderType, TaxGroup, PosLayout, PosLayoutCell } from "@shared/schema";
import { LogOut, User, Receipt, Clock, Settings, Search, Square, UtensilsCrossed, Plus, RotateCcw, List } from "lucide-react";
import { Link, Redirect } from "wouter";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface MenuItemWithModifiers extends MenuItem {
  hasRequiredModifiers?: boolean;
  modifierGroups?: (ModifierGroup & { modifiers: Modifier[] })[];
}

interface SelectedModifier {
  id: string;
  name: string;
  priceDelta: string;
}

export default function PosPage() {
  const { toast } = useToast();
  const {
    currentEmployee,
    currentRvc,
    currentCheck,
    checkItems,
    selectedSlu,
    pendingItem,
    privileges,
    setCurrentCheck,
    setCheckItems,
    setSelectedSlu,
    setPendingItem,
    hasPrivilege,
    logout,
  } = usePosContext();

  const [showModifierModal, setShowModifierModal] = useState(false);
  const [showManagerApproval, setShowManagerApproval] = useState(false);
  const [showOrderTypeModal, setShowOrderTypeModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showOpenChecksModal, setShowOpenChecksModal] = useState(false);
  const [showTransactionLookup, setShowTransactionLookup] = useState(false);
  const [showRefundModal, setShowRefundModal] = useState(false);
  const [selectedRefundCheck, setSelectedRefundCheck] = useState<Check | null>(null);
  const [refundManagerApprovalId, setRefundManagerApprovalId] = useState<string | undefined>(undefined);
  const [pendingRefundAction, setPendingRefundAction] = useState(false);
  const [pendingVoidItem, setPendingVoidItem] = useState<CheckItem | null>(null);
  const [editingItem, setEditingItem] = useState<CheckItem | null>(null);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [approvalError, setApprovalError] = useState<string | null>(null);
  const [cashChangeDue, setCashChangeDue] = useState<number | null>(null);
  const [pendingCashOverTender, setPendingCashOverTender] = useState<{ tenderId: string; amount: number } | null>(null);

  const { data: paymentInfo, isLoading: paymentsLoading } = useQuery<{ payments: any[]; paidAmount: number }>({
    queryKey: ["/api/checks", currentCheck?.id, "payments"],
    queryFn: async () => {
      if (!currentCheck?.id) return { payments: [], paidAmount: 0 };
      const res = await fetch(`/api/checks/${currentCheck.id}/payments`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch payments");
      return res.json();
    },
    enabled: !!currentCheck?.id,
  });

  const paidAmount = paymentInfo?.paidAmount || 0;
  const paymentsReady = !paymentsLoading && paymentInfo !== undefined;

  const { data: slus = [], isLoading: slusLoading } = useQuery<Slu[]>({
    queryKey: ["/api/slus", currentRvc?.id],
    enabled: !!currentRvc,
  });

  const { data: menuItems = [], isLoading: itemsLoading } = useQuery<MenuItemWithModifiers[]>({
    queryKey: ["/api/menu-items", { sluId: selectedSlu?.id }],
    queryFn: async () => {
      const res = await fetch(`/api/menu-items?sluId=${selectedSlu?.id}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch menu items");
      return res.json();
    },
    enabled: !!selectedSlu,
  });

  const { data: tenders = [] } = useQuery<Tender[]>({
    queryKey: ["/api/tenders", currentRvc?.id],
    enabled: !!currentRvc,
  });

  const [itemModifierGroups, setItemModifierGroups] = useState<(ModifierGroup & { modifiers: Modifier[] })[]>([]);

  const { data: taxGroups = [] } = useQuery<TaxGroup[]>({
    queryKey: ["/api/tax-groups"],
  });

  const { data: allMenuItems = [] } = useQuery<MenuItem[]>({
    queryKey: ["/api/menu-items", "all"],
    queryFn: async () => {
      const res = await fetch("/api/menu-items", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch menu items");
      return res.json();
    },
  });

  const { data: activeLayout } = useQuery<PosLayout | null>({
    queryKey: ["/api/pos-layouts/default", currentRvc?.id],
    queryFn: async () => {
      const res = await fetch(`/api/pos-layouts/default/${currentRvc?.id}`, { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!currentRvc?.id,
  });

  const { data: layoutCells = [] } = useQuery<PosLayoutCell[]>({
    queryKey: ["/api/pos-layouts", activeLayout?.id, "cells"],
    queryFn: async () => {
      if (!activeLayout?.id) return [];
      const res = await fetch(`/api/pos-layouts/${activeLayout.id}/cells`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!activeLayout?.id && activeLayout.mode === "custom_grid",
  });

  const createCheckMutation = useMutation({
    mutationFn: async (orderType: OrderType) => {
      const response = await apiRequest("POST", "/api/checks", {
        rvcId: currentRvc?.id,
        employeeId: currentEmployee?.id,
        orderType,
      });
      return response.json();
    },
    onSuccess: (check: Check) => {
      setCurrentCheck(check);
      setCheckItems([]);
      queryClient.invalidateQueries({ queryKey: ["/api/checks"] });
    },
    onError: () => {
      toast({ title: "Failed to create check", variant: "destructive" });
    },
  });

  const addItemMutation = useMutation({
    mutationFn: async (data: { menuItem: MenuItem; modifiers: SelectedModifier[] }) => {
      const response = await apiRequest("POST", "/api/checks/" + currentCheck?.id + "/items", {
        menuItemId: data.menuItem.id,
        menuItemName: data.menuItem.name,
        unitPrice: data.menuItem.price,
        modifiers: data.modifiers,
        quantity: 1,
      });
      return response.json();
    },
    onSuccess: (newItem: CheckItem) => {
      setCheckItems([...checkItems, newItem]);
      setShowModifierModal(false);
      setPendingItem(null);
      setItemModifierGroups([]);
      queryClient.invalidateQueries({ queryKey: ["/api/checks", currentCheck?.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/kds-tickets"] });
    },
    onError: () => {
      toast({ title: "Failed to add item", variant: "destructive" });
    },
  });

  const sendCheckMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/checks/" + currentCheck?.id + "/send", {
        employeeId: currentEmployee?.id,
      });
      return response.json();
    },
    onSuccess: (data: { round: any; updatedItems: CheckItem[] }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/checks", currentCheck?.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/kds-tickets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/checks/open"] });
      // Clear check state and sign out - check remains open for later pickup
      setCurrentCheck(null);
      setCheckItems([]);
      logout();
    },
    onError: () => {
      toast({ title: "Failed to send order", variant: "destructive" });
    },
  });

  const voidItemMutation = useMutation({
    mutationFn: async (data: { itemId: string; reason?: string; managerPin?: string }) => {
      const response = await apiRequest("POST", "/api/check-items/" + data.itemId + "/void", {
        employeeId: currentEmployee?.id,
        reason: data.reason,
        managerPin: data.managerPin,
      });
      return response.json();
    },
    onSuccess: (voidedItem: CheckItem) => {
      setCheckItems(checkItems.map((item) => (item.id === voidedItem.id ? voidedItem : item)));
      setShowManagerApproval(false);
      setPendingVoidItem(null);
      queryClient.invalidateQueries({ queryKey: ["/api/checks", currentCheck?.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/kds-tickets"] });
    },
    onError: (error: any) => {
      if (showManagerApproval) {
        setApprovalError("Invalid manager PIN or insufficient privileges");
      } else {
        toast({ title: "Failed to void item", variant: "destructive" });
      }
    },
  });

  const updateModifiersMutation = useMutation({
    mutationFn: async (data: { itemId: string; modifiers: SelectedModifier[]; finalize?: boolean }) => {
      const response = await apiRequest("PATCH", "/api/check-items/" + data.itemId + "/modifiers", {
        employeeId: currentEmployee?.id,
        modifiers: data.modifiers,
        itemStatus: data.finalize ? "active" : undefined, // Set to active when finalizing pending item
      });
      return response.json();
    },
    onSuccess: (updatedItem: CheckItem) => {
      // Use functional update to get current state (avoids stale closure issue)
      setCheckItems((prevItems: CheckItem[]) => {
        const exists = prevItems.some((item: CheckItem) => item.id === updatedItem.id);
        if (exists) {
          return prevItems.map((item: CheckItem) => (item.id === updatedItem.id ? updatedItem : item));
        }
        // If item doesn't exist yet (race condition), add it
        return [...prevItems, updatedItem];
      });
      setEditingItem(null);
      setShowModifierModal(false);
      setPendingItem(null);
      setItemModifierGroups([]);
      queryClient.invalidateQueries({ queryKey: ["/api/checks", currentCheck?.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/kds-tickets"] });
    },
    onError: () => {
      toast({ title: "Failed to update modifiers", variant: "destructive" });
    },
  });

  const paymentMutation = useMutation({
    mutationFn: async (data: { tenderId: string; amount: number; isCashOverTender?: boolean }) => {
      const response = await apiRequest("POST", "/api/checks/" + currentCheck?.id + "/payments", {
        tenderId: data.tenderId,
        amount: data.amount.toString(),
        employeeId: currentEmployee?.id,
      });
      const result = await response.json();
      return { ...result, isCashOverTender: data.isCashOverTender, tenderedAmount: data.amount };
    },
    onSuccess: (result: Check & { paidAmount: number; isCashOverTender?: boolean; tenderedAmount?: number }) => {
      console.log("Payment result:", result, "status:", result.status);
      queryClient.invalidateQueries({ queryKey: ["/api/checks", currentCheck?.id, "payments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/checks"] });
      if (result.status === "closed") {
        console.log("Check is closed, clearing state");
        if (result.isCashOverTender && result.tenderedAmount && total > 0) {
          const changeAmount = result.tenderedAmount - total;
          if (changeAmount > 0) {
            setCashChangeDue(changeAmount);
            return;
          }
        }
        setShowPaymentModal(false);
        setCurrentCheck(null);
        setCheckItems([]);
      } else {
        setCurrentCheck(result);
      }
    },
    onError: () => {
      setCashChangeDue(null);
      toast({ title: "Payment failed", variant: "destructive" });
    },
  });

  const handleReadyForNextOrder = () => {
    setCashChangeDue(null);
    setShowPaymentModal(false);
    setCurrentCheck(null);
    setCheckItems([]);
  };

  const handlePickupCheck = async (checkId: string) => {
    try {
      const res = await fetch(`/api/checks/${checkId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load check");
      const data = await res.json();
      setCurrentCheck(data.check);
      setCheckItems(data.items);
    } catch (error) {
      toast({ title: "Failed to pick up check", variant: "destructive" });
    }
  };

  const handleLookupClick = () => {
    if (!hasPrivilege("process_refunds")) {
      toast({ title: "You do not have permission to process refunds", variant: "destructive" });
      return;
    }
    setShowTransactionLookup(true);
  };

  const handleSelectCheckForRefund = (check: Check) => {
    setSelectedRefundCheck(check);
    setShowTransactionLookup(false);
    setPendingRefundAction(true);
    setShowManagerApproval(true);
  };

  const handleRefundManagerApproval = async (managerPin: string) => {
    try {
      const res = await fetch("/api/auth/manager-approval", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          pin: managerPin,
          requiredPrivilege: "approve_refunds",
        }),
      });
      if (!res.ok) {
        const error = await res.json();
        setApprovalError(error.message || "Manager approval failed");
        return;
      }
      const { approvedById } = await res.json();
      setRefundManagerApprovalId(approvedById);
      setShowManagerApproval(false);
      setPendingRefundAction(false);
      setApprovalError(null);
      setShowRefundModal(true);
    } catch {
      setApprovalError("Failed to verify manager credentials");
    }
  };

  const handleRefundComplete = () => {
    setSelectedRefundCheck(null);
    setRefundManagerApprovalId(undefined);
    toast({ title: "Refund processed successfully" });
  };

  const handleSelectSlu = (slu: Slu) => {
    setSelectedSlu(slu);
  };

  const handleSelectItem = async (item: MenuItemWithModifiers) => {
    let checkToUse = currentCheck;
    
    if (!checkToUse) {
      if (hasPrivilege("fast_transaction")) {
        const defaultOrderType = (currentRvc?.defaultOrderType as OrderType) || "dine_in";
        checkToUse = await createCheckMutation.mutateAsync(defaultOrderType);
      } else {
        setShowOrderTypeModal(true);
        setPendingItem(item);
        return;
      }
    }

    // Fetch modifier groups for this specific item
    try {
      const res = await fetch(`/api/modifier-groups?menuItemId=${item.id}`, { credentials: "include" });
      const groups: (ModifierGroup & { modifiers: Modifier[] })[] = await res.json();
      
      // Check if any groups have modifiers AND are required (or have at least minSelect > 0)
      const hasRequiredModifiers = groups.some(g => g.modifiers.length > 0 && (g.required || (g.minSelect && g.minSelect > 0)));
      
      if (hasRequiredModifiers) {
        // In dynamic order mode, create a pending item immediately so it shows on KDS
        if (currentRvc?.dynamicOrderMode) {
          const response = await apiRequest("POST", "/api/checks/" + checkToUse.id + "/items", {
            menuItemId: item.id,
            menuItemName: item.name,
            unitPrice: item.price,
            modifiers: [],
            quantity: 1,
            itemStatus: "pending", // Mark as pending until modifiers are selected
          });
          const pendingCheckItem = await response.json();
          setCheckItems([...checkItems, pendingCheckItem]);
          setEditingItem(pendingCheckItem); // Set as editing so we update it rather than create new
          queryClient.invalidateQueries({ queryKey: ["/api/kds-tickets"] });
        }
        
        setItemModifierGroups(groups);
        setPendingItem(item);
        setShowModifierModal(true);
      } else {
        // No required modifiers, add item directly
        const response = await apiRequest("POST", "/api/checks/" + checkToUse.id + "/items", {
          menuItemId: item.id,
          menuItemName: item.name,
          unitPrice: item.price,
          modifiers: [],
          quantity: 1,
        });
        const newItem = await response.json();
        setCheckItems([...checkItems, newItem]);
        queryClient.invalidateQueries({ queryKey: ["/api/checks", checkToUse.id] });
        queryClient.invalidateQueries({ queryKey: ["/api/kds-tickets"] });
      }
    } catch {
      toast({ title: "Failed to add item", variant: "destructive" });
    }
  };

  const handleConfirmModifiers = (modifiers: SelectedModifier[]) => {
    if (editingItem) {
      // Check if this is a pending item being finalized
      const isPendingItem = editingItem.itemStatus === "pending";
      updateModifiersMutation.mutate({ 
        itemId: editingItem.id, 
        modifiers, 
        finalize: isPendingItem 
      });
      // Modal is closed and state cleaned up in onSuccess
    } else if (pendingItem) {
      addItemMutation.mutate({ menuItem: pendingItem, modifiers });
      // Modal is closed and state cleaned up in onSuccess
    }
  };

  const handleModifierModalClose = () => {
    // If there's a pending item being edited (created in dynamic mode), void it on cancel
    if (editingItem && editingItem.itemStatus === "pending" && currentRvc?.dynamicOrderMode) {
      voidItemMutation.mutate({ itemId: editingItem.id });
    }
    setShowModifierModal(false);
    setPendingItem(null);
    setEditingItem(null);
    setItemModifierGroups([]);
  };

  const handleVoidItem = (item: CheckItem) => {
    if (item.sent) {
      setPendingVoidItem(item);
      setApprovalError(null);
      setShowManagerApproval(true);
    } else {
      voidItemMutation.mutate({ itemId: item.id });
    }
  };

  const handleManagerApproval = (managerPin: string, reasonCode: string) => {
    if (pendingVoidItem) {
      voidItemMutation.mutate({
        itemId: pendingVoidItem.id,
        reason: reasonCode,
        managerPin,
      });
    }
  };

  const handleEditModifiers = async (item: CheckItem) => {
    if (item.sent) {
      toast({ title: "Cannot modify sent items", variant: "destructive" });
      return;
    }
    const menuItem = allMenuItems.find((mi) => mi.id === item.menuItemId);
    if (!menuItem) {
      toast({ title: "Menu item not found", variant: "destructive" });
      return;
    }
    setEditingItem(item);
    try {
      // Fetch the link records for this menu item
      const linksRes = await fetch(`/api/menu-items/${menuItem.id}/modifier-groups`, { credentials: "include" });
      if (!linksRes.ok) {
        toast({ title: "Failed to load modifiers", variant: "destructive" });
        setEditingItem(null);
        return;
      }
      const links = await linksRes.json();
      
      // Fetch all modifier groups with their modifiers
      const groupsRes = await fetch("/api/modifier-groups", { credentials: "include" });
      if (!groupsRes.ok) {
        toast({ title: "Failed to load modifier groups", variant: "destructive" });
        setEditingItem(null);
        return;
      }
      const allGroups = await groupsRes.json();
      
      // Filter to only the groups linked to this menu item
      const linkedGroupIds = new Set(links.map((l: any) => l.modifierGroupId));
      const groups = allGroups.filter((g: any) => linkedGroupIds.has(g.id));
      
      setItemModifierGroups(groups);
      setPendingItem(menuItem as any);
      setShowModifierModal(true);
    } catch (error) {
      console.error("Failed to fetch modifier groups:", error);
      toast({ title: "Failed to load modifiers", variant: "destructive" });
      setEditingItem(null);
    }
  };

  const handleSelectCheckItem = (item: CheckItem | null) => {
    setSelectedItemId(item?.id || null);
  };

  const handleOrderTypeSelect = async (orderType: OrderType) => {
    await createCheckMutation.mutateAsync(orderType);
    if (pendingItem) {
      addItemMutation.mutate({ menuItem: pendingItem, modifiers: [] });
      setPendingItem(null);
    }
  };

  const calculateTotals = () => {
    const activeItems = checkItems.filter((item) => !item.voided);
    let displaySubtotal = 0;  // What customer sees as subtotal (item prices sum)
    let addOnTax = 0;

    activeItems.forEach((item) => {
      const unitPrice = parseFloat(item.unitPrice || "0");
      const modifierTotal = (item.modifiers || []).reduce(
        (mSum, mod) => mSum + parseFloat(mod.priceDelta || "0"),
        0
      );
      const itemTotal = (unitPrice + modifierTotal) * (item.quantity || 1);

      // Find the menu item and its tax group
      const menuItem = allMenuItems.find((mi) => mi.id === item.menuItemId);
      const taxGroup = menuItem?.taxGroupId
        ? taxGroups.find((tg) => tg.id === menuItem.taxGroupId)
        : null;

      if (taxGroup) {
        const rate = parseFloat(taxGroup.rate || "0");
        if (taxGroup.taxMode === "inclusive") {
          // For inclusive, item price already contains tax
          // Customer sees the full price, no separate tax line
          displaySubtotal += itemTotal;
        } else {
          // For add-on, add the item total and calculate tax separately
          displaySubtotal += itemTotal;
          addOnTax += itemTotal * rate;
        }
      } else {
        displaySubtotal += itemTotal;
      }
    });

    // Round to 2 decimal places for financial accuracy
    const roundedSubtotal = Math.round(displaySubtotal * 100) / 100;
    const roundedTax = Math.round(addOnTax * 100) / 100;
    const roundedTotal = Math.round((displaySubtotal + addOnTax) * 100) / 100;
    
    return { subtotal: roundedSubtotal, tax: roundedTax, total: roundedTotal };
  };

  const { subtotal, tax, total } = calculateTotals();


  if (!currentEmployee || !currentRvc) {
    return <Redirect to="/" />;
  }

  return (
    <div className="h-screen flex flex-col bg-background">
      <header className="flex-shrink-0 bg-card border-b px-3 py-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center">
              <UtensilsCrossed className="w-4 h-4 text-primary-foreground" />
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-semibold leading-tight" data-testid="text-rvc-name">
                {currentRvc.name}
              </span>
              <span className="text-xs text-muted-foreground leading-tight" data-testid="text-pos-title">
                Cloud POS
              </span>
            </div>
          </div>
          <Separator orientation="vertical" className="h-8" />
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-secondary flex items-center justify-center">
              <User className="w-3.5 h-3.5" />
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-medium leading-tight" data-testid="text-employee-name">
                {currentEmployee.firstName} {currentEmployee.lastName}
              </span>
              <span className="text-xs text-muted-foreground leading-tight">
                #{currentEmployee.employeeNumber || "---"}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {hasPrivilege("admin_access") && (
            <Link href="/admin">
              <Button variant="ghost" size="icon" data-testid="button-admin">
                <Settings className="w-4 h-4" />
              </Button>
            </Link>
          )}
          {hasPrivilege("kds_access") && (
            <Link href="/kds">
              <Button variant="ghost" size="icon" data-testid="button-kds">
                <Receipt className="w-4 h-4" />
              </Button>
            </Link>
          )}
          <ThemeToggle />
          <Button
            variant="ghost"
            size="icon"
            onClick={logout}
            data-testid="button-sign-out"
          >
            <LogOut className="w-4 h-4" />
          </Button>
        </div>
      </header>


      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 flex flex-col overflow-hidden">
          {activeLayout?.mode === "custom_grid" && layoutCells.length > 0 ? (
            <ScrollArea className="flex-1">
              <div
                className="grid gap-2 p-4"
                style={{
                  gridTemplateColumns: `repeat(${activeLayout.gridCols || 6}, minmax(80px, 1fr))`,
                  gridTemplateRows: `repeat(${activeLayout.gridRows || 4}, 80px)`,
                }}
              >
                {layoutCells.map((cell) => {
                  const menuItem = allMenuItems.find(m => m.id === cell.menuItemId);
                  if (!menuItem) return null;
                  return (
                    <Button
                      key={cell.id}
                      className="h-full w-full flex flex-col items-center justify-center text-sm font-medium"
                      style={{
                        backgroundColor: cell.backgroundColor || "#3B82F6",
                        color: cell.textColor || "#FFFFFF",
                        gridRow: `${cell.rowIndex + 1} / span ${cell.rowSpan || 1}`,
                        gridColumn: `${cell.colIndex + 1} / span ${cell.colSpan || 1}`,
                      }}
                      onClick={() => handleSelectItem(menuItem)}
                      data-testid={`button-layout-cell-${cell.id}`}
                    >
                      <span className="truncate max-w-full">
                        {cell.displayLabel || menuItem.shortName || menuItem.name}
                      </span>
                      <span className="text-xs opacity-70">
                        ${parseFloat(menuItem.price || "0").toFixed(2)}
                      </span>
                    </Button>
                  );
                })}
              </div>
            </ScrollArea>
          ) : (
            <>
              <div className="flex-shrink-0 border-b bg-card px-3 py-2 overflow-x-auto">
                <div className="flex gap-2">
                  {slusLoading ? (
                    Array.from({ length: 4 }).map((_, i) => (
                      <div key={i} className="h-12 w-32 bg-muted animate-pulse rounded-md flex-shrink-0" />
                    ))
                  ) : slus.length === 0 ? (
                    <span className="text-sm text-muted-foreground px-2 py-3">No categories configured</span>
                  ) : (
                    slus.map((slu) => (
                      <div key={slu.id} className="h-12 flex-shrink-0">
                        <Button
                          variant={selectedSlu?.id === slu.id ? "default" : "secondary"}
                          size="lg"
                          className="h-full px-5 whitespace-nowrap text-sm font-semibold"
                          onClick={() => handleSelectSlu(slu)}
                          data-testid={`button-slu-tab-${slu.id}`}
                        >
                          {slu.buttonLabel || slu.name}
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <ScrollArea className="flex-1 bg-background">
                <MenuItemGrid
                  items={menuItems}
                  onSelectItem={handleSelectItem}
                  isLoading={itemsLoading && !!selectedSlu}
                />
              </ScrollArea>

              <div className="flex-shrink-0 border-t bg-card p-2">
                <div className="flex gap-2 flex-wrap">
                  <div className="h-14 flex-1 min-w-[100px]">
                    <Button
                      variant="secondary"
                      size="lg"
                      className="w-full h-full font-semibold"
                      onClick={() => setShowOrderTypeModal(true)}
                      data-testid="button-new-check-fn"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      New Check
                    </Button>
                  </div>
                  <div className="h-14 flex-1 min-w-[100px]">
                    <Button
                      variant="secondary"
                      size="lg"
                      className="w-full h-full font-semibold"
                      onClick={() => setShowOpenChecksModal(true)}
                      data-testid="button-open-checks"
                    >
                      <List className="w-4 h-4 mr-2" />
                      Open Checks
                    </Button>
                  </div>
                  <div className="h-14 flex-1 min-w-[100px]">
                    <Button
                      variant="secondary"
                      size="lg"
                      className="w-full h-full font-semibold"
                      onClick={handleLookupClick}
                      data-testid="button-transaction-lookup"
                    >
                      <Search className="w-4 h-4 mr-2" />
                      Lookup
                    </Button>
                  </div>
                  <div className="h-14 flex-1 min-w-[100px]">
                    <Button
                      variant="secondary"
                      size="lg"
                      className="w-full h-full font-semibold"
                      onClick={() => {
                        if (currentCheck && checkItems.length > 0) {
                          setCurrentCheck(null);
                          setCheckItems([]);
                        }
                      }}
                      disabled={!currentCheck || checkItems.filter(i => !i.voided).length === 0}
                      data-testid="button-clear-check"
                    >
                      <RotateCcw className="w-4 h-4 mr-2" />
                      Clear
                    </Button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="w-80 lg:w-96 flex-shrink-0 border-l">
          <CheckPanel
            check={currentCheck}
            items={checkItems}
            orderType={currentCheck?.orderType as OrderType}
            onSend={() => sendCheckMutation.mutate()}
            onVoidItem={(item) => {
              handleVoidItem(item);
              setSelectedItemId(null);
            }}
            onEditModifiers={handleEditModifiers}
            onSelectItem={handleSelectCheckItem}
            selectedItemId={selectedItemId}
            onPay={() => setShowPaymentModal(true)}
            onNewCheck={() => setShowOrderTypeModal(true)}
            onChangeOrderType={() => setShowOrderTypeModal(true)}
            canSend={hasPrivilege("send_to_kitchen")}
            canVoid={hasPrivilege("void_unsent") || hasPrivilege("void_sent")}
            isSending={sendCheckMutation.isPending}
            subtotal={subtotal}
            tax={tax}
            total={total}
            paidAmount={paidAmount}
            paymentsReady={paymentsReady}
          />
        </div>
      </div>

      <ModifierModal
        open={showModifierModal}
        onClose={handleModifierModalClose}
        menuItem={pendingItem}
        modifierGroups={itemModifierGroups}
        onConfirm={handleConfirmModifiers}
        initialModifiers={editingItem?.modifiers as SelectedModifier[] | undefined}
        pendingItemId={editingItem?.itemStatus === "pending" ? editingItem.id : undefined}
        employeeId={currentEmployee?.id}
      />

      <ManagerApprovalModal
        open={showManagerApproval}
        onClose={() => {
          setShowManagerApproval(false);
          setPendingVoidItem(null);
          setPendingRefundAction(false);
          setSelectedRefundCheck(null);
          setApprovalError(null);
        }}
        onApprove={pendingRefundAction ? handleRefundManagerApproval : handleManagerApproval}
        action={pendingRefundAction ? "Process Refund" : "Void Sent Item"}
        targetDescription={pendingRefundAction 
          ? `Check #${selectedRefundCheck?.checkNumber}` 
          : pendingVoidItem ? `${pendingVoidItem.menuItemName}` : ""}
        isLoading={pendingRefundAction ? false : voidItemMutation.isPending}
        error={approvalError}
      />

      <OrderTypeModal
        open={showOrderTypeModal}
        onClose={() => setShowOrderTypeModal(false)}
        onSelect={handleOrderTypeSelect}
        currentOrderType={currentCheck?.orderType as OrderType}
      />

      <PaymentModal
        open={showPaymentModal}
        onClose={() => {
          if (!cashChangeDue) {
            setShowPaymentModal(false);
          }
        }}
        onPayment={(tenderId, amount, isCashOverTender) => {
          if (currentCheck?.id && !paymentMutation.isPending) {
            paymentMutation.mutate({ tenderId, amount, isCashOverTender });
          }
        }}
        tenders={tenders}
        check={currentCheck}
        remainingBalance={Math.max(0, total - paidAmount)}
        isLoading={paymentMutation.isPending}
        changeDue={cashChangeDue}
        onReadyForNextOrder={handleReadyForNextOrder}
      />

      <OpenChecksModal
        open={showOpenChecksModal}
        onClose={() => setShowOpenChecksModal(false)}
        onSelect={handlePickupCheck}
        rvcId={currentRvc?.id}
      />

      <TransactionLookupModal
        open={showTransactionLookup}
        onOpenChange={setShowTransactionLookup}
        rvcId={currentRvc?.id || ""}
        onSelectCheck={handleSelectCheckForRefund}
      />

      <RefundModal
        open={showRefundModal}
        onOpenChange={setShowRefundModal}
        check={selectedRefundCheck}
        rvcId={currentRvc?.id || ""}
        employeeId={currentEmployee?.id || ""}
        managerApprovalId={refundManagerApprovalId}
        onComplete={handleRefundComplete}
      />
    </div>
  );
}
