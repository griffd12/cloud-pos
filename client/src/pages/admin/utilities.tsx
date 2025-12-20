import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { usePosContext } from "@/lib/pos-context";
import { AlertTriangle, Trash2, Database, ShieldAlert, FileText, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface SalesDataSummary {
  checks: number;
  checkItems: number;
  payments: number;
  rounds: number;
  kdsTickets: number;
  auditLogs: number;
}

interface ClearResult {
  success: boolean;
  message: string;
  deleted: {
    checks: number;
    checkItems: number;
    payments: number;
    discounts: number;
    rounds: number;
    kdsTicketItems: number;
    kdsTickets: number;
    auditLogs: number;
  };
}

export default function UtilitiesPage() {
  const { toast } = useToast();
  const { currentEmployee } = usePosContext();
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [authCode, setAuthCode] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [lastResult, setLastResult] = useState<ClearResult | null>(null);

  const { data: summary, isLoading: summaryLoading, refetch: refetchSummary } = useQuery<SalesDataSummary>({
    queryKey: ["/api/admin/sales-data-summary"],
  });

  const clearMutation = useMutation({
    mutationFn: async (data: { authCode: string; confirmText: string; employeeId: string | null }) => {
      const response = await apiRequest("POST", "/api/admin/clear-sales-data", data);
      return response.json() as Promise<ClearResult>;
    },
    onSuccess: (result) => {
      setLastResult(result);
      setShowResetDialog(false);
      setAuthCode("");
      setConfirmText("");
      setAcknowledged(false);
      refetchSummary();
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/checks"] });
      toast({
        title: "Sales Data Cleared",
        description: result.message,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Reset Failed",
        description: error.message || "Failed to clear sales data",
        variant: "destructive",
      });
    },
  });

  const handleReset = () => {
    if (!acknowledged) {
      toast({ title: "Please acknowledge the warning", variant: "destructive" });
      return;
    }
    if (!currentEmployee?.id) {
      toast({ title: "Employee session required for audit logging", variant: "destructive" });
      return;
    }
    clearMutation.mutate({
      authCode,
      confirmText,
      employeeId: currentEmployee.id,
    });
  };

  const totalRecords = summary
    ? summary.checks + summary.checkItems + summary.payments + summary.rounds + summary.kdsTickets + summary.auditLogs
    : 0;

  const canSubmit = acknowledged && authCode.length > 0 && confirmText === "RESET";

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-utilities-title">Admin Utilities</h1>
        <p className="text-muted-foreground">System maintenance and administrative operations</p>
      </div>

      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Danger Zone</AlertTitle>
        <AlertDescription>
          Operations on this page can permanently delete data. Use with extreme caution.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trash2 className="w-5 h-5" />
            Clear All Sales Data
          </CardTitle>
          <CardDescription>
            Reset all transactional data to zero. This removes all checks, payments, KDS tickets, and unlocks menu items for deletion.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <div className="text-center p-4 bg-muted rounded-md">
              <div className="text-2xl font-bold tabular-nums" data-testid="text-summary-checks">
                {summaryLoading ? "-" : summary?.checks || 0}
              </div>
              <div className="text-sm text-muted-foreground">Checks</div>
            </div>
            <div className="text-center p-4 bg-muted rounded-md">
              <div className="text-2xl font-bold tabular-nums" data-testid="text-summary-items">
                {summaryLoading ? "-" : summary?.checkItems || 0}
              </div>
              <div className="text-sm text-muted-foreground">Check Items</div>
            </div>
            <div className="text-center p-4 bg-muted rounded-md">
              <div className="text-2xl font-bold tabular-nums" data-testid="text-summary-payments">
                {summaryLoading ? "-" : summary?.payments || 0}
              </div>
              <div className="text-sm text-muted-foreground">Payments</div>
            </div>
            <div className="text-center p-4 bg-muted rounded-md">
              <div className="text-2xl font-bold tabular-nums" data-testid="text-summary-rounds">
                {summaryLoading ? "-" : summary?.rounds || 0}
              </div>
              <div className="text-sm text-muted-foreground">Rounds</div>
            </div>
            <div className="text-center p-4 bg-muted rounded-md">
              <div className="text-2xl font-bold tabular-nums" data-testid="text-summary-kds">
                {summaryLoading ? "-" : summary?.kdsTickets || 0}
              </div>
              <div className="text-sm text-muted-foreground">KDS Tickets</div>
            </div>
            <div className="text-center p-4 bg-muted rounded-md">
              <div className="text-2xl font-bold tabular-nums" data-testid="text-summary-audit">
                {summaryLoading ? "-" : summary?.auditLogs || 0}
              </div>
              <div className="text-sm text-muted-foreground">Audit Logs</div>
            </div>
          </div>

          <div className="flex items-center justify-between p-4 border rounded-md">
            <div>
              <div className="font-medium">Total Records to Delete</div>
              <div className="text-sm text-muted-foreground">
                This action cannot be undone
              </div>
            </div>
            <div className="text-3xl font-bold tabular-nums text-destructive" data-testid="text-total-records">
              {totalRecords.toLocaleString()}
            </div>
          </div>

          <Button
            variant="destructive"
            className="w-full"
            onClick={() => setShowResetDialog(true)}
            disabled={totalRecords === 0}
            data-testid="button-open-reset-dialog"
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Clear All Sales Data
          </Button>
        </CardContent>
      </Card>

      {lastResult && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Last Reset Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Checks Deleted:</span>{" "}
                <span className="font-medium">{lastResult.deleted.checks}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Check Items:</span>{" "}
                <span className="font-medium">{lastResult.deleted.checkItems}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Payments:</span>{" "}
                <span className="font-medium">{lastResult.deleted.payments}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Discounts:</span>{" "}
                <span className="font-medium">{lastResult.deleted.discounts}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Rounds:</span>{" "}
                <span className="font-medium">{lastResult.deleted.rounds}</span>
              </div>
              <div>
                <span className="text-muted-foreground">KDS Ticket Items:</span>{" "}
                <span className="font-medium">{lastResult.deleted.kdsTicketItems}</span>
              </div>
              <div>
                <span className="text-muted-foreground">KDS Tickets:</span>{" "}
                <span className="font-medium">{lastResult.deleted.kdsTickets}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Audit Logs:</span>{" "}
                <span className="font-medium">{lastResult.deleted.auditLogs}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={showResetDialog} onOpenChange={setShowResetDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <ShieldAlert className="w-5 h-5" />
              Confirm Sales Data Reset
            </DialogTitle>
            <DialogDescription>
              This will permanently delete all sales transactions, payments, and KDS tickets.
              Menu items will be unlocked for deletion.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <Alert variant="destructive">
              <Database className="h-4 w-4" />
              <AlertTitle>Warning</AlertTitle>
              <AlertDescription>
                {totalRecords.toLocaleString()} records will be permanently deleted.
                This action cannot be undone.
              </AlertDescription>
            </Alert>

            <div className="flex items-start gap-2">
              <Checkbox
                id="acknowledge"
                checked={acknowledged}
                onCheckedChange={(checked) => setAcknowledged(checked === true)}
                data-testid="checkbox-acknowledge"
              />
              <Label htmlFor="acknowledge" className="text-sm leading-tight">
                I understand that this will permanently delete all sales data and this action cannot be reversed.
              </Label>
            </div>

            <div className="space-y-2">
              <Label htmlFor="authCode">Admin Authorization Code</Label>
              <Input
                id="authCode"
                type="password"
                value={authCode}
                onChange={(e) => setAuthCode(e.target.value)}
                placeholder="Enter admin code"
                data-testid="input-auth-code"
              />
              <p className="text-xs text-muted-foreground">
                Default code: RESETADMIN (can be changed via ADMIN_RESET_CODE env variable)
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmText">Type RESET to confirm</Label>
              <Input
                id="confirmText"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value.toUpperCase())}
                placeholder="Type RESET"
                data-testid="input-confirm-text"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowResetDialog(false)}
              data-testid="button-cancel-reset"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleReset}
              disabled={!canSubmit || clearMutation.isPending}
              data-testid="button-confirm-reset"
            >
              {clearMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Clearing...
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4 mr-2" />
                  Clear All Data
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
