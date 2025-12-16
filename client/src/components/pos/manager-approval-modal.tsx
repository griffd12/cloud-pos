import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { AlertTriangle, Delete, ShieldCheck } from "lucide-react";
import { VOID_REASONS } from "@shared/schema";

interface ManagerApprovalModalProps {
  open: boolean;
  onClose: () => void;
  onApprove: (managerPin: string, reasonCode: string) => void;
  action: string;
  targetDescription: string;
  isLoading?: boolean;
  error?: string | null;
}

export function ManagerApprovalModal({
  open,
  onClose,
  onApprove,
  action,
  targetDescription,
  isLoading = false,
  error = null,
}: ManagerApprovalModalProps) {
  const [managerPin, setManagerPin] = useState("");
  const [reasonCode, setReasonCode] = useState("");

  const handleDigit = (digit: string) => {
    if (managerPin.length < 6) {
      setManagerPin((prev) => prev + digit);
    }
  };

  const handleDelete = () => {
    setManagerPin((prev) => prev.slice(0, -1));
  };

  const handleSubmit = () => {
    if (managerPin.length >= 4 && reasonCode) {
      onApprove(managerPin, reasonCode);
    }
  };

  const handleClose = () => {
    setManagerPin("");
    setReasonCode("");
    onClose();
  };

  const digits = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"];

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5 text-amber-500" />
            </div>
            <DialogTitle data-testid="text-approval-title">
              Manager Approval Required
            </DialogTitle>
          </div>
          <DialogDescription className="space-y-2">
            <div className="flex items-center gap-2 text-foreground font-medium">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              <span>{action}</span>
            </div>
            <p className="text-muted-foreground">{targetDescription}</p>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Reason</Label>
            <Select value={reasonCode} onValueChange={setReasonCode}>
              <SelectTrigger data-testid="select-void-reason">
                <SelectValue placeholder="Select a reason..." />
              </SelectTrigger>
              <SelectContent>
                {VOID_REASONS.map((reason) => (
                  <SelectItem key={reason.code} value={reason.code}>
                    {reason.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Manager PIN</Label>
            <div className="flex justify-center gap-2 py-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className={`w-3 h-3 rounded-full border-2 transition-colors ${
                    i < managerPin.length
                      ? "bg-primary border-primary"
                      : "border-muted-foreground/30"
                  }`}
                />
              ))}
            </div>

            <div className="grid grid-cols-3 gap-2">
              {digits.slice(0, 9).map((digit) => (
                <Button
                  key={digit}
                  variant="secondary"
                  className="h-12 text-lg font-semibold"
                  onClick={() => handleDigit(digit)}
                  disabled={isLoading}
                  data-testid={`button-manager-pin-${digit}`}
                >
                  {digit}
                </Button>
              ))}
              <div />
              <Button
                variant="secondary"
                className="h-12 text-lg font-semibold"
                onClick={() => handleDigit("0")}
                disabled={isLoading}
                data-testid="button-manager-pin-0"
              >
                0
              </Button>
              <Button
                variant="ghost"
                className="h-12"
                onClick={handleDelete}
                disabled={isLoading}
              >
                <Delete className="w-5 h-5" />
              </Button>
            </div>
          </div>

          {error && (
            <p className="text-center text-destructive text-sm" data-testid="text-approval-error">
              {error}
            </p>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={handleClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={managerPin.length < 4 || !reasonCode || isLoading}
            data-testid="button-approve"
          >
            {isLoading ? "Verifying..." : "Approve"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
