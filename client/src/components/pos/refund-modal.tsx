import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest, getAuthHeaders, fetchWithTimeout } from "@/lib/queryClient";
import { RefreshCw, DollarSign, AlertTriangle, Check as CheckIcon } from "lucide-react";
import type { Check, CheckItem, CheckPayment } from "@shared/schema";
import { format } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";

interface RefundModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  check: Check | null;
  rvcId: string;
  employeeId: string;
  managerApprovalId?: string;
  onComplete: () => void;
  timezone?: string;
}

interface SelectedItem {
  originalCheckItemId: string;
  quantity: number;
}

export function RefundModal({
  open,
  onOpenChange,
  check,
  rvcId,
  employeeId,
  managerApprovalId,
  onComplete,
  timezone = "America/New_York",
}: RefundModalProps) {
  const { toast } = useToast();
  
  const formatDateTime = (dateVal: string | Date | null) => {
    if (!dateVal) return "-";
    try {
      return formatInTimeZone(new Date(dateVal), timezone, "MMM d, yyyy h:mm a");
    } catch {
      return format(new Date(dateVal), "MMM d, yyyy h:mm a");
    }
  };
  const [refundType, setRefundType] = useState<"full" | "partial">("full");
  const [selectedItems, setSelectedItems] = useState<SelectedItem[]>([]);
  const [reason, setReason] = useState("");

  const { data: checkDetails, isLoading } = useQuery<{
    check: Check;
    items: CheckItem[];
    payments: CheckPayment[];
  }>({
    queryKey: ["/api/checks", check?.id, "full-details"],
    queryFn: async () => {
      const res = await fetchWithTimeout(`/api/checks/${check?.id}/full-details`, { credentials: "include", headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch check details");
      return res.json();
    },
    enabled: open && !!check?.id,
  });

  useEffect(() => {
    if (!open) {
      setRefundType("full");
      setSelectedItems([]);
      setReason("");
    }
  }, [open]);

  const createRefundMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", "/api/refunds", data);
      return response.json();
    },
    onSuccess: (data: any) => {
      if (data.warning) {
        toast({
          title: "Refund recorded with warnings",
          description: data.warning,
          variant: "destructive",
          duration: 10000,
        });
      } else {
        toast({ title: "Refund processed successfully" });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/rvcs", rvcId, "refunds"] });
      onComplete();
      onOpenChange(false);
    },
    onError: () => {
      toast({ title: "Failed to process refund", variant: "destructive" });
    },
  });

  const toggleItemSelection = (itemId: string, quantity: number) => {
    setSelectedItems((prev) => {
      const existing = prev.find((i) => i.originalCheckItemId === itemId);
      if (existing) {
        return prev.filter((i) => i.originalCheckItemId !== itemId);
      }
      return [...prev, { originalCheckItemId: itemId, quantity }];
    });
  };

  const isItemSelected = (itemId: string) => {
    return selectedItems.some((i) => i.originalCheckItemId === itemId);
  };

  const calculateRefundTotal = () => {
    if (!checkDetails) return 0;
    
    if (refundType === "full") {
      return parseFloat(checkDetails.check.total || "0");
    }

    let subtotal = 0;
    for (const selected of selectedItems) {
      const item = checkDetails.items.find((i) => i.id === selected.originalCheckItemId);
      if (item) {
        const modifierTotal = (item.modifiers || []).reduce(
          (sum: number, m: any) => sum + parseFloat(m.priceDelta || "0"),
          0
        );
        subtotal += (parseFloat(item.unitPrice) + modifierTotal) * selected.quantity;
      }
    }

    const originalSubtotal = parseFloat(checkDetails.check.subtotal || "0");
    const originalTax = parseFloat(checkDetails.check.taxTotal || "0");
    const proportionalTax = originalSubtotal > 0 ? (subtotal / originalSubtotal) * originalTax : 0;

    return subtotal + proportionalTax;
  };

  const handleProcessRefund = () => {
    if (!check) return;

    if (refundType === "partial" && selectedItems.length === 0) {
      toast({ title: "Please select at least one item to refund", variant: "destructive" });
      return;
    }

    createRefundMutation.mutate({
      rvcId,
      originalCheckId: check.id,
      refundType,
      reason,
      processedByEmployeeId: employeeId,
      managerApprovalId,
      items: refundType === "partial" ? selectedItems : undefined,
    });
  };

  const nonVoidedItems = checkDetails?.items.filter((i) => !i.voided) || [];
  const refundTotal = calculateRefundTotal();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DollarSign className="w-5 h-5" />
            Process Refund - Check #{check?.checkNumber}
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : checkDetails ? (
          <div className="flex flex-col gap-4 flex-1 min-h-0">
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>Original Date: {check?.businessDate || "-"}</span>
              <span>
                Closed: {formatDateTime(check?.closedAt || null)}
              </span>
            </div>

            <Separator />

            <div className="space-y-3">
              <Label>Refund Type</Label>
              <RadioGroup
                value={refundType}
                onValueChange={(v) => setRefundType(v as "full" | "partial")}
                className="flex gap-4"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="full" id="refund-full" data-testid="radio-refund-full" />
                  <Label htmlFor="refund-full" className="cursor-pointer">
                    Full Refund (${parseFloat(checkDetails.check.total || "0").toFixed(2)})
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="partial" id="refund-partial" data-testid="radio-refund-partial" />
                  <Label htmlFor="refund-partial" className="cursor-pointer">
                    Partial Refund (Select Items)
                  </Label>
                </div>
              </RadioGroup>
            </div>

            {refundType === "partial" && (
              <>
                <Label>Select Items to Refund</Label>
                <ScrollArea className="flex-1 max-h-48 border rounded-lg">
                  <div className="p-2 space-y-1">
                    {nonVoidedItems.map((item) => {
                      const modifierTotal = (item.modifiers || []).reduce(
                        (sum: number, m: any) => sum + parseFloat(m.priceDelta || "0"),
                        0
                      );
                      const itemTotal =
                        (parseFloat(item.unitPrice) + modifierTotal) * (item.quantity || 1);

                      return (
                        <div
                          key={item.id}
                          className="flex items-center gap-3 p-2 rounded-md hover-elevate cursor-pointer"
                          onClick={() => toggleItemSelection(item.id, item.quantity || 1)}
                          data-testid={`refund-item-${item.id}`}
                        >
                          <Checkbox
                            checked={isItemSelected(item.id)}
                            onCheckedChange={() => toggleItemSelection(item.id, item.quantity || 1)}
                          />
                          <div className="flex-1">
                            <div className="font-medium">{item.menuItemName}</div>
                            {item.modifiers && item.modifiers.length > 0 && (
                              <div className="text-xs text-muted-foreground">
                                {(item.modifiers as any[]).map((m) => m.name).join(", ")}
                              </div>
                            )}
                          </div>
                          <div className="text-right">
                            <div className="font-medium">${itemTotal.toFixed(2)}</div>
                            <div className="text-xs text-muted-foreground">Qty: {item.quantity || 1}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              </>
            )}

            <div className="space-y-2">
              <Label htmlFor="refund-reason">Reason (Optional)</Label>
              <Textarea
                id="refund-reason"
                placeholder="Enter reason for refund..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="resize-none"
                rows={2}
                data-testid="textarea-refund-reason"
              />
            </div>

            <Separator />

            <div className="space-y-2">
              <div className="flex items-center justify-between font-medium">
                <span>Original Payment Methods:</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {checkDetails.payments.map((payment) => (
                  <Badge key={payment.id} variant="secondary">
                    {payment.tenderName}: ${parseFloat(payment.amount || "0").toFixed(2)}
                  </Badge>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Refund will be applied proportionally to original payment methods
              </p>
            </div>

            <div className="bg-muted/50 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-lg font-semibold">
                  <AlertTriangle className="w-5 h-5 text-amber-500" />
                  Refund Total:
                </div>
                <span className="text-2xl font-bold text-destructive">
                  ${refundTotal.toFixed(2)}
                </span>
              </div>
            </div>
          </div>
        ) : null}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel-refund">
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleProcessRefund}
            disabled={createRefundMutation.isPending || (refundType === "partial" && selectedItems.length === 0)}
            data-testid="button-process-refund"
          >
            {createRefundMutation.isPending ? (
              <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <CheckIcon className="w-4 h-4 mr-2" />
            )}
            Process Refund
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
