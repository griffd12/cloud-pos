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
import { FunctionsModal } from "@/components/pos/functions-modal";
import { TransferCheckModal } from "@/components/pos/transfer-check-modal";
import { AdvancedSplitCheckModal } from "@/components/pos/advanced-split-check-modal";
import { MergeChecksModal } from "@/components/pos/merge-checks-modal";
import { ReopenCheckModal } from "@/components/pos/reopen-check-modal";
import { PriceOverrideModal } from "@/components/pos/price-override-modal";
import { CustomerModal } from "@/components/pos/customer-modal";
import { GiftCardModal } from "@/components/pos/gift-card-modal";
import { ThemeToggle } from "@/components/theme-toggle";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest, getAuthHeaders } from "@/lib/queryClient";
import { usePosContext } from "@/lib/pos-context";
import type { Slu, MenuItem, Check, CheckItem, CheckPayment, ModifierGroup, Modifier, Tender, OrderType, TaxGroup, PosLayout, PosLayoutCell } from "@shared/schema";
import { LogOut, User, Receipt, Clock, Settings, Search, Square, UtensilsCrossed, Plus, List, Grid3X3, CreditCard, Star, Wifi, WifiOff, X } from "lucide-react";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CircleDollarSign } from "lucide-react";

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
    workstationId,
    setCurrentCheck,
    setCheckItems,
    setSelectedSlu,
    setPendingItem,
    setCurrentRvc,
    hasPrivilege,
    logout,
  } = usePosContext();

  // Fetch workstation context to get RVC if not already set
  const { data: wsContext } = useQuery<{ workstation: any; rvcs: any[]; property: any }>({
    queryKey: ["/api/workstations", workstationId, "context"],
    queryFn: async () => {
      const res = await fetch(`/api/workstations/${workstationId}/context`, { credentials: "include", headers: getAuthHeaders() });
      if (!res.ok) {
        setApiConnected(false);
        throw new Error("Failed to fetch workstation context");
      }
      setApiConnected(true);
      return res.json();
    },
    enabled: !!workstationId && !currentRvc,
  });

  // Auto-set RVC from workstation if not already set
  useEffect(() => {
    if (!currentRvc && wsContext?.rvcs && wsContext.rvcs.length > 0) {
      // Find the RVC that matches the workstation's rvc_id, or use the first one
      const workstationRvcId = wsContext.workstation?.rvcId;
      const matchingRvc = workstationRvcId 
        ? wsContext.rvcs.find((r: any) => r.id === workstationRvcId)
        : wsContext.rvcs[0];
      if (matchingRvc) {
        setCurrentRvc(matchingRvc);
      }
    }
  }, [currentRvc, wsContext, setCurrentRvc]);

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
  const [showFunctionsModal, setShowFunctionsModal] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [showSplitModal, setShowSplitModal] = useState(false);
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [showReopenModal, setShowReopenModal] = useState(false);
  const [showPriceOverrideModal, setShowPriceOverrideModal] = useState(false);
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [showGiftCardModal, setShowGiftCardModal] = useState(false);
  const [showTipCaptureDialog, setShowTipCaptureDialog] = useState(false);
  const [tipCapturePayment, setTipCapturePayment] = useState<CheckPayment | null>(null);
  const [tipAmount, setTipAmount] = useState("");
  const [isCapturingTip, setIsCapturingTip] = useState(false);
  // Health check query to verify API connection when RVC is already set
  const healthQuery = useQuery({
    queryKey: ["/api/health"],
    queryFn: async () => {
      const res = await fetch("/api/health", { credentials: "include", headers: getAuthHeaders() });
      if (!res.ok) throw new Error("API health check failed");
      return res.json();
    },
    enabled: !!currentRvc,
    refetchInterval: 30000, // Check every 30 seconds
    retry: 2,
    staleTime: 25000, // Consider data fresh for 25 seconds
  });
  
  // Derive connection status from query state
  const apiConnected = healthQuery.isSuccess ? true : healthQuery.isError ? false : null;

  const { data: paymentInfo, isLoading: paymentsLoading } = useQuery<{ payments: any[]; paidAmount: number }>({
    queryKey: ["/api/checks", currentCheck?.id, "payments"],
    queryFn: async () => {
      if (!currentCheck?.id) return { payments: [], paidAmount: 0 };
      const res = await fetch(`/api/checks/${currentCheck.id}/payments`, { credentials: "include", headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch payments");
      return res.json();
    },
    enabled: !!currentCheck?.id,
  });

  const paidAmount = paymentInfo?.paidAmount || 0;
  const paymentsReady = !paymentsLoading && paymentInfo !== undefined;
  
  // Filter authorized payments awaiting tip/capture
  const authorizedPayments = (paymentInfo?.payments || []).filter(
    (p: CheckPayment) => p.paymentStatus === "authorized"
  );

  // Fetch customer details when a customer is attached to the check
  const { data: attachedCustomer } = useQuery<{ firstName: string; lastName: string } | null>({
    queryKey: ["/api/loyalty-members", currentCheck?.customerId],
    queryFn: async () => {
      if (!currentCheck?.customerId) return null;
      const res = await fetch(`/api/loyalty-members/${currentCheck.customerId}`, { credentials: "include", headers: getAuthHeaders() });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!currentCheck?.customerId,
  });

  const customerName = attachedCustomer 
    ? `${attachedCustomer.firstName} ${attachedCustomer.lastName}` 
    : null;

  // Mutation to remove customer from check
  const removeCustomerMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("DELETE", `/api/pos/checks/${currentCheck?.id}/customer`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Customer Removed", description: "Customer removed from this check" });
      queryClient.invalidateQueries({ queryKey: ["/api/checks", currentCheck?.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/loyalty-members", currentCheck?.customerId] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to remove customer", variant: "destructive" });
    },
  });
  
  // Handler for opening tip capture dialog
  const handleTipCapture = (payment: CheckPayment) => {
    setTipCapturePayment(payment);
    setTipAmount("");
    setShowTipCaptureDialog(true);
  };
  
  // Handle capture with tip
  const handleConfirmTipCapture = async () => {
    if (!tipCapturePayment) return;
    
    setIsCapturingTip(true);
    try {
      const tipValue = parseFloat(tipAmount) || 0;
      const res = await apiRequest("POST", "/api/pos/capture-with-tip", {
        checkPaymentId: tipCapturePayment.id,
        tipAmount: tipValue,
        employeeId: currentEmployee?.id,
      });
      
      const result = await res.json();
      if (result.success) {
        toast({
          title: "Payment Captured",
          description: `$${result.finalAmount.toFixed(2)} captured (includes $${tipValue.toFixed(2)} tip)`,
        });
        setShowTipCaptureDialog(false);
        setTipCapturePayment(null);
        setTipAmount("");
        // Invalidate queries to update UI
        queryClient.invalidateQueries({ queryKey: ["/api/checks", currentCheck?.id] });
        queryClient.invalidateQueries({ queryKey: ["/api/checks", currentCheck?.id, "payments"] });
      } else {
        toast({
          title: "Capture Failed",
          description: result.message || "Could not capture payment",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Capture Failed",
        description: "An error occurred while capturing",
        variant: "destructive",
      });
    } finally {
      setIsCapturingTip(false);
    }
  };

  const { data: slus = [], isLoading: slusLoading } = useQuery<Slu[]>({
    queryKey: ["/api/slus", currentRvc?.id],
    enabled: !!currentRvc,
  });

  const { data: menuItems = [], isLoading: itemsLoading } = useQuery<MenuItemWithModifiers[]>({
    queryKey: ["/api/menu-items", { sluId: selectedSlu?.id }],
    queryFn: async () => {
      const res = await fetch(`/api/menu-items?sluId=${selectedSlu?.id}`, { credentials: "include", headers: getAuthHeaders() });
      if (!res.ok) {
        setApiConnected(false);
        throw new Error("Failed to fetch menu items");
      }
      setApiConnected(true);
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
      const res = await fetch("/api/menu-items", { credentials: "include", headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch menu items");
      return res.json();
    },
  });

  const { data: activeLayout } = useQuery<PosLayout | null>({
    queryKey: ["/api/pos-layouts/default", currentRvc?.id],
    queryFn: async () => {
      const res = await fetch(`/api/pos-layouts/default/${currentRvc?.id}`, { credentials: "include", headers: getAuthHeaders() });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!currentRvc?.id,
  });

  const { data: layoutCells = [] } = useQuery<PosLayoutCell[]>({
    queryKey: ["/api/pos-layouts", activeLayout?.id, "cells"],
    queryFn: async () => {
      if (!activeLayout?.id) return [];
      const res = await fetch(`/api/pos-layouts/${activeLayout.id}/cells`, { credentials: "include", headers: getAuthHeaders() });
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
      setCheckItems((prev) => [...prev, newItem]);
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

  // Cancel transaction - voids all unsent items without sending to KDS, then signs out
  const cancelTransactionMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/checks/" + currentCheck?.id + "/cancel-transaction", {
        employeeId: currentEmployee?.id,
        reason: "Transaction cancelled by cashier",
      });
      return response.json();
    },
    onSuccess: (data: { success: boolean; voidedCount: number; remainingActiveItems: number }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/checks", currentCheck?.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/kds-tickets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/checks/open"] });
      // Clear check state and sign out
      setCurrentCheck(null);
      setCheckItems([]);
      if (data.voidedCount > 0) {
        toast({ title: `Transaction cancelled - ${data.voidedCount} item(s) voided` });
      }
      logout();
    },
    onError: () => {
      toast({ title: "Failed to cancel transaction", variant: "destructive" });
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
    mutationFn: async (data: { tenderId: string; amount: number; isCashOverTender?: boolean; paymentTransactionId?: string }) => {
      const response = await apiRequest("POST", "/api/checks/" + currentCheck?.id + "/payments", {
        tenderId: data.tenderId,
        amount: data.amount.toString(),
        employeeId: currentEmployee?.id,
        paymentTransactionId: data.paymentTransactionId,
      });
      const result = await response.json();
      return { ...result, isCashOverTender: data.isCashOverTender, tenderedAmount: data.amount };
    },
    onSuccess: async (result: Check & { paidAmount: number; isCashOverTender?: boolean; tenderedAmount?: number }) => {
      console.log("Payment result:", result, "status:", result.status);
      queryClient.invalidateQueries({ queryKey: ["/api/checks", currentCheck?.id, "payments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/checks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/checks/open"] });
      if (result.status === "closed") {
        console.log("Check is closed, clearing state");
        
        // Earn loyalty points if customer is attached
        if (result.customerId) {
          try {
            const earnRes = await apiRequest("POST", "/api/pos/loyalty/earn", {
              checkId: result.id,
              customerId: result.customerId,
              employeeId: currentEmployee?.id,
            });
            const earnData = await earnRes.json();
            if (earnData.pointsEarned > 0) {
              toast({
                title: "Loyalty Points Earned",
                description: `${earnData.pointsEarned} points added. New balance: ${earnData.newBalance}`,
              });
            }
            // Invalidate customer queries so profile shows updated points
            queryClient.invalidateQueries({ queryKey: ["/api/pos/customers", result.customerId] });
            queryClient.invalidateQueries({ queryKey: ["/api/loyalty-members", result.customerId] });
          } catch (error) {
            console.error("Failed to earn loyalty points:", error);
          }
        }
        
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

  const reopenCheckMutation = useMutation({
    mutationFn: async (checkId: string) => {
      const response = await apiRequest("POST", `/api/checks/${checkId}/reopen`, {
        employeeId: currentEmployee?.id,
      });
      return response.json();
    },
    onSuccess: async (reopenedCheck: Check) => {
      setShowReopenModal(false);
      toast({ title: "Check Reopened", description: `Check #${reopenedCheck.checkNumber} is now open` });
      try {
        const res = await fetch(`/api/checks/${reopenedCheck.id}`, { credentials: "include", headers: getAuthHeaders() });
        if (res.ok) {
          const data = await res.json();
          setCurrentCheck(data.check);
          setCheckItems(data.items);
        }
      } catch (e) {
        console.error("Error loading reopened check:", e);
      }
      queryClient.invalidateQueries({ queryKey: ["/api/rvcs", currentRvc?.id, "closed-checks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/checks/open"] });
    },
    onError: (error: any) => {
      toast({ title: "Failed to reopen check", description: error.message, variant: "destructive" });
    },
  });

  const transferCheckMutation = useMutation({
    mutationFn: async (toEmployeeId: string) => {
      if (!currentCheck) throw new Error("No check selected");
      const response = await apiRequest("POST", `/api/checks/${currentCheck.id}/transfer`, {
        employeeId: currentEmployee?.id,
        toEmployeeId,
      });
      return response.json();
    },
    onSuccess: (updatedCheck: Check) => {
      setShowTransferModal(false);
      toast({ title: "Check Transferred", description: `Check #${updatedCheck.checkNumber} transferred successfully` });
      setCurrentCheck(null);
      setCheckItems([]);
      queryClient.invalidateQueries({ queryKey: ["/api/checks/open"] });
    },
    onError: (error: any) => {
      toast({ title: "Failed to transfer check", description: error.message, variant: "destructive" });
    },
  });

  const splitCheckMutation = useMutation({
    mutationFn: async (operations: Array<{ type: "move" | "share"; itemId: string; targetCheckIndex: number; shareRatio?: number }>) => {
      if (!currentCheck) throw new Error("No check selected");
      const response = await apiRequest("POST", `/api/checks/${currentCheck.id}/split`, {
        employeeId: currentEmployee?.id,
        operations,
      });
      return response.json();
    },
    onSuccess: (result: any) => {
      setShowSplitModal(false);
      const newCheckCount = result.newChecks?.length || 0;
      toast({ 
        title: "Check Split", 
        description: `Created ${newCheckCount} new check(s) from split` 
      });
      if (result.sourceCheck) {
        setCurrentCheck(result.sourceCheck.check);
        setCheckItems(result.sourceCheck.items);
      }
      queryClient.invalidateQueries({ queryKey: ["/api/checks/open"] });
    },
    onError: (error: any) => {
      toast({ title: "Failed to split check", description: error.message, variant: "destructive" });
    },
  });

  const mergeChecksMutation = useMutation({
    mutationFn: async (sourceCheckIds: string[]) => {
      if (!currentCheck) throw new Error("No check selected");
      const response = await apiRequest("POST", "/api/checks/merge", {
        targetCheckId: currentCheck.id,
        sourceCheckIds,
        employeeId: currentEmployee?.id,
      });
      return response.json();
    },
    onSuccess: (result: any) => {
      setShowMergeModal(false);
      toast({ title: "Checks Merged", description: "All items combined into current check" });
      if (result.check && result.items) {
        setCurrentCheck(result.check);
        setCheckItems(result.items);
      }
      queryClient.invalidateQueries({ queryKey: ["/api/checks/open"] });
    },
    onError: (error: any) => {
      toast({ title: "Failed to merge checks", description: error.message, variant: "destructive" });
    },
  });

  const priceOverrideMutation = useMutation({
    mutationFn: async ({ itemId, newPrice, reason, managerPin }: { itemId: string; newPrice: number; reason: string; managerPin?: string }) => {
      const response = await apiRequest("POST", `/api/check-items/${itemId}/price-override`, {
        newPrice,
        reason,
        employeeId: currentEmployee?.id,
        managerPin,
      });
      return response.json();
    },
    onSuccess: async () => {
      setShowPriceOverrideModal(false);
      toast({ title: "Price Updated", description: "Item price has been overridden" });
      if (currentCheck) {
        try {
          const res = await fetch(`/api/checks/${currentCheck.id}`, { credentials: "include", headers: getAuthHeaders() });
          if (res.ok) {
            const data = await res.json();
            setCurrentCheck(data.check);
            setCheckItems(data.items);
          }
        } catch (e) {
          console.error("Error reloading check:", e);
        }
      }
    },
    onError: (error: any) => {
      toast({ title: "Failed to override price", description: error.message, variant: "destructive" });
    },
  });

  const handlePickupCheck = async (checkId: string) => {
    try {
      const res = await fetch(`/api/checks/${checkId}`, { credentials: "include", headers: getAuthHeaders() });
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
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
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
      const res = await fetch(`/api/modifier-groups?menuItemId=${item.id}`, { credentials: "include", headers: getAuthHeaders() });
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
          setCheckItems((prev) => [...prev, pendingCheckItem]);
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
        setCheckItems((prev) => [...prev, newItem]);
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
      const linksRes = await fetch(`/api/menu-items/${menuItem.id}/modifier-groups`, { credentials: "include", headers: getAuthHeaders() });
      if (!linksRes.ok) {
        toast({ title: "Failed to load modifiers", variant: "destructive" });
        setEditingItem(null);
        return;
      }
      const links = await linksRes.json();
      
      // Fetch all modifier groups with their modifiers
      const groupsRes = await fetch("/api/modifier-groups", { credentials: "include", headers: getAuthHeaders() });
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
          <Separator orientation="vertical" className="h-8" />
          <Badge 
            variant={apiConnected === true ? "default" : apiConnected === false ? "destructive" : "secondary"}
            className="text-xs"
            data-testid="status-api-connection"
          >
            {apiConnected === true ? (
              <><Wifi className="w-3 h-3 mr-1" /> API</>
            ) : apiConnected === false ? (
              <><WifiOff className="w-3 h-3 mr-1" /> API</>
            ) : (
              "Connecting..."
            )}
          </Badge>
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
            <>
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
                    // Font size classes based on layout setting
                    const fontSizeClasses = {
                      small: "text-xs",
                      medium: "text-sm",
                      large: "text-base",
                      xlarge: "text-lg",
                    };
                    const priceFontSizeClasses = {
                      small: "text-[10px]",
                      medium: "text-xs",
                      large: "text-sm",
                      xlarge: "text-base",
                    };
                    const layoutFontSize = (activeLayout?.fontSize as keyof typeof fontSizeClasses) || "medium";
                    return (
                      <Button
                        key={cell.id}
                        className={`h-full w-full flex flex-col items-center justify-center font-medium ${fontSizeClasses[layoutFontSize]}`}
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
                        <span className={`${priceFontSizeClasses[layoutFontSize]} opacity-70`}>
                          ${parseFloat(menuItem.price || "0").toFixed(2)}
                        </span>
                      </Button>
                    );
                  })}
                </div>
              </ScrollArea>

              <div className="flex-shrink-0 border-t bg-card p-2">
                <div className="flex gap-2 flex-wrap">
                  <div className="h-14 flex-1 min-w-[100px]">
                    <Button
                      variant="secondary"
                      size="lg"
                      className="w-full h-full font-semibold"
                      onClick={() => setShowOrderTypeModal(true)}
                      data-testid="button-new-check-fn-grid"
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
                      data-testid="button-open-checks-grid"
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
                      data-testid="button-transaction-lookup-grid"
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
                        if (currentCheck) {
                          cancelTransactionMutation.mutate();
                        }
                      }}
                      disabled={!currentCheck || cancelTransactionMutation.isPending}
                      data-testid="button-cancel-transaction-grid"
                    >
                      <X className="w-4 h-4 mr-2" />
                      Cancel
                    </Button>
                  </div>
                  <div className="h-14 flex-1 min-w-[100px]">
                    <Button
                      variant="secondary"
                      size="lg"
                      className="w-full h-full font-semibold"
                      onClick={() => setShowFunctionsModal(true)}
                      data-testid="button-functions-grid"
                    >
                      <Grid3X3 className="w-4 h-4 mr-2" />
                      Functions
                    </Button>
                  </div>
                  <div className="h-14 flex-1 min-w-[100px]">
                    <Button
                      variant="secondary"
                      size="lg"
                      className="w-full h-full font-semibold"
                      onClick={() => setShowCustomerModal(true)}
                      data-testid="button-customer-grid"
                    >
                      <Star className="w-4 h-4 mr-2" />
                      Loyalty
                    </Button>
                  </div>
                  <div className="h-14 flex-1 min-w-[100px]">
                    <Button
                      variant="secondary"
                      size="lg"
                      className="w-full h-full font-semibold"
                      onClick={() => setShowGiftCardModal(true)}
                      data-testid="button-gift-card-grid"
                    >
                      <CreditCard className="w-4 h-4 mr-2" />
                      Gift Card
                    </Button>
                  </div>
                </div>
              </div>
            </>
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
                        if (currentCheck) {
                          cancelTransactionMutation.mutate();
                        }
                      }}
                      disabled={!currentCheck || cancelTransactionMutation.isPending}
                      data-testid="button-cancel-transaction"
                    >
                      <X className="w-4 h-4 mr-2" />
                      Cancel
                    </Button>
                  </div>
                  <div className="h-14 flex-1 min-w-[100px]">
                    <Button
                      variant="secondary"
                      size="lg"
                      className="w-full h-full font-semibold"
                      onClick={() => setShowFunctionsModal(true)}
                      data-testid="button-functions"
                    >
                      <Grid3X3 className="w-4 h-4 mr-2" />
                      Functions
                    </Button>
                  </div>
                  <div className="h-14 flex-1 min-w-[100px]">
                    <Button
                      variant="secondary"
                      size="lg"
                      className="w-full h-full font-semibold"
                      onClick={() => setShowCustomerModal(true)}
                      data-testid="button-customer"
                    >
                      <Star className="w-4 h-4 mr-2" />
                      Loyalty
                    </Button>
                  </div>
                  <div className="h-14 flex-1 min-w-[100px]">
                    <Button
                      variant="secondary"
                      size="lg"
                      className="w-full h-full font-semibold"
                      onClick={() => setShowGiftCardModal(true)}
                      data-testid="button-gift-card"
                    >
                      <CreditCard className="w-4 h-4 mr-2" />
                      Gift Card
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
            onPriceOverride={(item) => {
              setSelectedItemId(item.id);
              setShowPriceOverrideModal(true);
            }}
            canSend={hasPrivilege("send_to_kitchen")}
            canVoid={hasPrivilege("void_unsent") || hasPrivilege("void_sent")}
            canPriceOverride={hasPrivilege("modify_price")}
            isSending={sendCheckMutation.isPending}
            subtotal={subtotal}
            tax={tax}
            total={total}
            paidAmount={paidAmount}
            paymentsReady={paymentsReady}
            authorizedPayments={authorizedPayments}
            onTipCapture={handleTipCapture}
            customerName={customerName}
            onRemoveCustomer={currentCheck?.customerId ? () => removeCustomerMutation.mutate() : undefined}
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
        onPayment={(tenderId, amount, isCashOverTender, paymentTransactionId) => {
          if (currentCheck?.id && !paymentMutation.isPending) {
            paymentMutation.mutate({ tenderId, amount, isCashOverTender, paymentTransactionId });
          }
        }}
        tenders={tenders}
        check={currentCheck}
        remainingBalance={Math.max(0, total - paidAmount)}
        isLoading={paymentMutation.isPending}
        changeDue={cashChangeDue}
        onReadyForNextOrder={handleReadyForNextOrder}
        propertyId={currentRvc?.propertyId}
        employeeId={currentEmployee?.id}
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

      <FunctionsModal
        open={showFunctionsModal}
        onClose={() => setShowFunctionsModal(false)}
        hasActiveCheck={!!currentCheck}
        onTransferCheck={() => {
          const hasUnsentItems = checkItems.some(item => !item.sent);
          if (hasUnsentItems) {
            toast({
              title: "Cannot Transfer Check",
              description: "All items must be sent to KDS before transferring. Please send the order first.",
              variant: "destructive",
            });
            setShowFunctionsModal(false);
            return;
          }
          setShowFunctionsModal(false);
          setShowTransferModal(true);
        }}
        onSplitCheck={() => {
          const hasUnsentItems = checkItems.some(item => !item.sent);
          if (hasUnsentItems) {
            toast({
              title: "Cannot Split Check",
              description: "All items must be sent to KDS before splitting. Please send the order first.",
              variant: "destructive",
            });
            setShowFunctionsModal(false);
            return;
          }
          setShowFunctionsModal(false);
          setShowSplitModal(true);
        }}
        onMergeChecks={() => {
          const hasUnsentItems = checkItems.some(item => !item.sent);
          if (hasUnsentItems) {
            toast({
              title: "Cannot Merge Checks",
              description: "All items must be sent to KDS before merging. Please send the order first.",
              variant: "destructive",
            });
            setShowFunctionsModal(false);
            return;
          }
          setShowFunctionsModal(false);
          setShowMergeModal(true);
        }}
        onReopenCheck={() => {
          setShowFunctionsModal(false);
          setShowReopenModal(true);
        }}
        onPriceOverride={() => {
          setShowFunctionsModal(false);
          if (selectedItemId) {
            setShowPriceOverrideModal(true);
          } else {
            toast({
              title: "No item selected",
              description: "Select an item on the check first",
              variant: "destructive",
            });
          }
        }}
        onAssignTable={() => {
          toast({
            title: "Coming Soon",
            description: "Table assignment will be available in a future update",
          });
        }}
        privileges={{
          canTransfer: hasPrivilege("transfer_check"),
          canSplit: hasPrivilege("split_check"),
          canMerge: hasPrivilege("merge_checks"),
          canReopen: hasPrivilege("reopen_check"),
          canPriceOverride: hasPrivilege("modify_price"),
        }}
      />

      {currentCheck && currentEmployee && currentRvc && (
        <TransferCheckModal
          open={showTransferModal}
          onClose={() => setShowTransferModal(false)}
          checkNumber={currentCheck.checkNumber}
          currentEmployeeId={currentEmployee.id}
          rvcId={currentRvc.id}
          onTransfer={(toEmployeeId) => {
            transferCheckMutation.mutate(toEmployeeId);
          }}
          isTransferring={transferCheckMutation.isPending}
        />
      )}

      {currentCheck && (
        <AdvancedSplitCheckModal
          open={showSplitModal}
          onClose={() => setShowSplitModal(false)}
          check={currentCheck}
          items={checkItems}
          onSplit={(operations) => {
            splitCheckMutation.mutate(operations);
          }}
          isSplitting={splitCheckMutation.isPending}
        />
      )}

      {currentCheck && currentRvc && (
        <MergeChecksModal
          open={showMergeModal}
          onClose={() => setShowMergeModal(false)}
          currentCheckId={currentCheck.id}
          currentCheckNumber={currentCheck.checkNumber}
          rvcId={currentRvc.id}
          onMerge={(checkIds) => {
            mergeChecksMutation.mutate(checkIds);
          }}
          isMerging={mergeChecksMutation.isPending}
        />
      )}

      {currentRvc && (
        <ReopenCheckModal
          open={showReopenModal}
          onClose={() => setShowReopenModal(false)}
          rvcId={currentRvc.id}
          onReopen={(checkId) => {
            reopenCheckMutation.mutate(checkId);
          }}
          isReopening={reopenCheckMutation.isPending}
        />
      )}

      <PriceOverrideModal
        key={selectedItemId || 'none'}
        open={showPriceOverrideModal}
        onClose={() => setShowPriceOverrideModal(false)}
        item={checkItems.find(i => i.id === selectedItemId) || null}
        onOverride={(itemId, newPrice, reason, managerPin) => {
          priceOverrideMutation.mutate({ itemId, newPrice, reason, managerPin });
        }}
        isOverriding={priceOverrideMutation.isPending}
      />

      <CustomerModal
        open={showCustomerModal}
        onClose={() => setShowCustomerModal(false)}
        currentCheck={currentCheck}
        currentCustomerId={currentCheck?.customerId || null}
        employeeId={currentEmployee?.id}
        onCustomerAttached={(customer) => {
          toast({
            title: "Customer Attached",
            description: `${customer.firstName} ${customer.lastName} linked to check`,
          });
          // Update local check state with the new customerId so the UI shows the customer name
          if (currentCheck) {
            setCurrentCheck({ ...currentCheck, customerId: customer.id });
          }
          queryClient.invalidateQueries({ queryKey: ["/api/checks", currentCheck?.id] });
        }}
        onReorderRequested={async (items) => {
          try {
            // Create a new check if there isn't one open
            let checkToUse = currentCheck;
            if (!checkToUse) {
              const newCheckRes = await apiRequest("POST", "/api/checks", {
                rvcId: currentRvc?.id,
                employeeId: currentEmployee?.id,
                orderType: "dine_in",
              });
              const newCheck = await newCheckRes.json();
              checkToUse = newCheck;
              setCurrentCheck(newCheck);
              setCheckItems([]);
            }
            
            // Add each item from the previous order
            for (const item of items) {
              await apiRequest("POST", `/api/checks/${checkToUse?.id}/items`, {
                menuItemId: item.menuItemId,
                menuItemName: item.menuItemName,
                unitPrice: item.unitPrice,
                quantity: item.quantity,
                modifiers: item.modifiers || [],
              });
            }
            
            // Refresh the check data
            const refreshRes = await fetch(`/api/checks/${checkToUse?.id}`, { credentials: "include", headers: getAuthHeaders() });
            if (refreshRes.ok) {
              const data = await refreshRes.json();
              setCurrentCheck(data.check);
              setCheckItems(data.items);
            }
            
            queryClient.invalidateQueries({ queryKey: ["/api/checks/open"] });
            toast({
              title: "Repeat Order Complete",
              description: `${items.length} item(s) added to check`,
            });
          } catch (error) {
            toast({
              title: "Error",
              description: "Failed to repeat order",
              variant: "destructive",
            });
          }
        }}
      />

      <GiftCardModal
        open={showGiftCardModal}
        onClose={() => setShowGiftCardModal(false)}
        checkId={currentCheck?.id}
        propertyId={currentRvc?.propertyId}
        employeeId={currentEmployee?.id}
        onGiftCardRedeemed={(amount) => {
          toast({
            title: "Gift Card Applied",
            description: `$${amount} redeemed from gift card`,
          });
          queryClient.invalidateQueries({ queryKey: ["/api/checks", currentCheck?.id] });
        }}
        onGiftCardSold={(checkItem) => {
          // Add the gift card sale item to the local check items state
          if (checkItem) {
            setCheckItems((prev) => [...prev, checkItem]);
            // Also refresh check to update totals
            queryClient.invalidateQueries({ queryKey: ["/api/checks", currentCheck?.id] });
          }
        }}
      />

      <Dialog open={showTipCaptureDialog} onOpenChange={setShowTipCaptureDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CircleDollarSign className="w-5 h-5 text-amber-600" />
              Add Tip & Capture
            </DialogTitle>
            <DialogDescription>
              {`Enter tip amount for this $${tipCapturePayment ? parseFloat(tipCapturePayment.amount).toFixed(2) : "0.00"} authorization`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="tip-amount">Tip Amount</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                <Input
                  id="tip-amount"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={tipAmount}
                  onChange={(e) => setTipAmount(e.target.value)}
                  className="pl-7"
                  data-testid="input-tip-amount"
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {[15, 18, 20, 25].map((pct) => {
                const baseAmount = tipCapturePayment ? parseFloat(tipCapturePayment.amount) : 0;
                const tipValue = (baseAmount * pct) / 100;
                return (
                  <Button
                    key={pct}
                    variant="outline"
                    size="sm"
                    onClick={() => setTipAmount(tipValue.toFixed(2))}
                    data-testid={`button-tip-${pct}`}
                  >
                    {pct}% (${tipValue.toFixed(2)})
                  </Button>
                );
              })}
            </div>
            {tipAmount && tipCapturePayment && (
              <div className="p-3 bg-muted rounded-md">
                <div className="flex justify-between text-sm">
                  <span>Authorization:</span>
                  <span>${parseFloat(tipCapturePayment.amount).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Tip:</span>
                  <span>${(parseFloat(tipAmount) || 0).toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-semibold border-t mt-2 pt-2">
                  <span>Total to Capture:</span>
                  <span>${(parseFloat(tipCapturePayment.amount) + (parseFloat(tipAmount) || 0)).toFixed(2)}</span>
                </div>
              </div>
            )}
          </div>
          <DialogFooter className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setShowTipCaptureDialog(false)}
              disabled={isCapturingTip}
              data-testid="button-cancel-tip-capture"
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmTipCapture}
              disabled={isCapturingTip}
              className="bg-green-600 hover:bg-green-700"
              data-testid="button-confirm-tip-capture"
            >
              {isCapturingTip ? "Capturing..." : "Capture Payment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
