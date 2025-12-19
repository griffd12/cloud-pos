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
import { ThemeToggle } from "@/components/theme-toggle";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { usePosContext } from "@/lib/pos-context";
import type { Slu, MenuItem, Check, CheckItem, ModifierGroup, Modifier, Tender, OrderType, TaxGroup } from "@shared/schema";
import { LogOut, User, Receipt, Clock, Settings } from "lucide-react";
import { Link, Redirect } from "wouter";

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
      setCheckItems(data.updatedItems);
      toast({ title: "Order sent to kitchen" });
      queryClient.invalidateQueries({ queryKey: ["/api/checks", currentCheck?.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/kds-tickets"] });
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
      toast({ title: "Item voided" });
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
    mutationFn: async (data: { itemId: string; modifiers: SelectedModifier[] }) => {
      const response = await apiRequest("PATCH", "/api/check-items/" + data.itemId + "/modifiers", {
        employeeId: currentEmployee?.id,
        modifiers: data.modifiers,
      });
      return response.json();
    },
    onSuccess: (updatedItem: CheckItem) => {
      setCheckItems(checkItems.map((item) => (item.id === updatedItem.id ? updatedItem : item)));
      toast({ title: "Modifiers updated" });
      setEditingItem(null);
      setShowModifierModal(false);
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
        toast({ title: "Check closed successfully" });
      } else {
        setCurrentCheck(result);
        toast({ title: "Payment applied" });
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
    toast({ title: "Check closed successfully" });
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
      updateModifiersMutation.mutate({ itemId: editingItem.id, modifiers });
    } else if (pendingItem) {
      addItemMutation.mutate({ menuItem: pendingItem, modifiers });
      setPendingItem(null);
    }
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
      const res = await fetch(`/api/menu-items/${menuItem.id}/modifier-groups`, { credentials: "include" });
      if (!res.ok) {
        toast({ title: "Failed to load modifiers", variant: "destructive" });
        setEditingItem(null);
        return;
      }
      const groups = await res.json();
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

    // Total = subtotal + add-on taxes (inclusive taxes are already in the item prices)
    return { subtotal: displaySubtotal, tax: addOnTax, total: displaySubtotal + addOnTax };
  };

  const { subtotal, tax, total } = calculateTotals();

  if (!currentEmployee || !currentRvc) {
    return <Redirect to="/" />;
  }

  return (
    <div className="h-screen flex flex-col bg-background">
      <header className="flex-shrink-0 border-b px-4 py-2 flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-semibold" data-testid="text-pos-title">
            Cloud POS
          </h1>
          <Separator orientation="vertical" className="h-6" />
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <User className="w-4 h-4" />
            <span data-testid="text-employee-name">
              {currentEmployee.firstName} {currentEmployee.lastName}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {hasPrivilege("admin_access") && (
            <Link href="/admin">
              <Button variant="ghost" size="sm" data-testid="button-admin">
                <Settings className="w-4 h-4 mr-2" />
                Admin
              </Button>
            </Link>
          )}
          {hasPrivilege("kds_access") && (
            <Link href="/kds">
              <Button variant="ghost" size="sm" data-testid="button-kds">
                <Receipt className="w-4 h-4 mr-2" />
                KDS
              </Button>
            </Link>
          )}
          <ThemeToggle />
          <Button variant="ghost" size="icon" onClick={logout} data-testid="button-logout">
            <LogOut className="w-4 h-4" />
          </Button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        <div className="w-48 lg:w-56 flex-shrink-0 border-r bg-muted/30">
          <ScrollArea className="h-full">
            <div className="p-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-2 py-2">
                Categories
              </p>
              <SluGrid
                slus={slus}
                selectedSluId={selectedSlu?.id || null}
                onSelectSlu={handleSelectSlu}
                isLoading={slusLoading}
              />
            </div>
          </ScrollArea>
        </div>

        <div className="flex-1 overflow-hidden">
          <ScrollArea className="h-full">
            <MenuItemGrid
              items={menuItems}
              onSelectItem={handleSelectItem}
              isLoading={itemsLoading && !!selectedSlu}
            />
          </ScrollArea>
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
        onClose={() => {
          setShowModifierModal(false);
          setPendingItem(null);
          setEditingItem(null);
          setItemModifierGroups([]);
        }}
        menuItem={pendingItem}
        modifierGroups={itemModifierGroups}
        onConfirm={handleConfirmModifiers}
        initialModifiers={editingItem?.modifiers as SelectedModifier[] | undefined}
      />

      <ManagerApprovalModal
        open={showManagerApproval}
        onClose={() => {
          setShowManagerApproval(false);
          setPendingVoidItem(null);
          setApprovalError(null);
        }}
        onApprove={handleManagerApproval}
        action="Void Sent Item"
        targetDescription={pendingVoidItem ? `${pendingVoidItem.menuItemName}` : ""}
        isLoading={voidItemMutation.isPending}
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
    </div>
  );
}
