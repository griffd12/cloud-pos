import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import {
  AlertCircle,
  CheckCircle2,
  Coffee,
  Clock,
  AlertTriangle,
  XCircle,
  DollarSign,
} from "lucide-react";
import type { Employee, BreakRule } from "@shared/schema";

interface BreakAttestationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employee: Employee;
  propertyId: string;
  clockInTime: Date;
  onConfirm: (attestationData: AttestationData) => void;
  onCancel: () => void;
}

interface AttestationData {
  mealBreakProvided: boolean;
  mealBreakTaken: boolean;
  mealBreakWaived: boolean;
  restBreaksProvided: boolean;
  restBreaksTaken: boolean;
  missedBreakReason?: string;
  employeeNotes?: string;
  cashTipsDeclared?: number;
}

export default function BreakAttestationDialog({
  open,
  onOpenChange,
  employee,
  propertyId,
  clockInTime,
  onConfirm,
  onCancel,
}: BreakAttestationDialogProps) {
  const [mealBreakProvided, setMealBreakProvided] = useState(true);
  const [mealBreakTaken, setMealBreakTaken] = useState(true);
  const [mealBreakWaived, setMealBreakWaived] = useState(false);
  const [restBreaksProvided, setRestBreaksProvided] = useState(true);
  const [restBreaksTaken, setRestBreaksTaken] = useState(true);
  const [missedBreakReason, setMissedBreakReason] = useState("");
  const [employeeNotes, setEmployeeNotes] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [cashTipsDeclared, setCashTipsDeclared] = useState("");

  const { data: breakRules = [] } = useQuery<BreakRule[]>({
    queryKey: ["/api/break-rules?propertyId=" + propertyId],
    enabled: !!propertyId,
  });

  const activeRule = breakRules.find(r => r.active) || null;

  const now = new Date();
  const hoursWorked = (now.getTime() - clockInTime.getTime()) / (1000 * 60 * 60);

  const mealBreakRequired = hoursWorked >= parseFloat(activeRule?.mealBreakThresholdHours || "5");
  const secondMealRequired = hoursWorked >= parseFloat(activeRule?.secondMealBreakThresholdHours || "10");
  const restBreaksRequired = Math.floor(hoursWorked / parseFloat(activeRule?.restBreakIntervalHours || "4"));
  const canWaiveMeal = hoursWorked <= parseFloat(activeRule?.mealWaiverMaxShiftHours || "6");

  const hasIssue = 
    (mealBreakRequired && !mealBreakTaken && !mealBreakWaived) ||
    (restBreaksRequired > 0 && !restBreaksTaken);

  const handleConfirm = () => {
    const tipAmount = parseFloat(cashTipsDeclared) || 0;
    onConfirm({
      mealBreakProvided,
      mealBreakTaken,
      mealBreakWaived,
      restBreaksProvided,
      restBreaksTaken,
      missedBreakReason: hasIssue ? missedBreakReason : undefined,
      employeeNotes: employeeNotes || undefined,
      cashTipsDeclared: tipAmount > 0 ? tipAmount : undefined,
    });
  };

  if (!activeRule || !activeRule.requireClockOutAttestation) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Coffee className="w-5 h-5" />
            Break Attestation
          </DialogTitle>
          <DialogDescription>
            Please confirm your break information before clocking out
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="bg-muted/50 p-3 rounded-lg">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Shift Duration:</span>
              <span className="font-medium">{hoursWorked.toFixed(1)} hours</span>
            </div>
            <div className="flex items-center justify-between text-sm mt-1">
              <span className="text-muted-foreground">State Rules:</span>
              <Badge variant="outline">{activeRule.stateCode}</Badge>
            </div>
          </div>

          <Separator />

          <div className="space-y-4">
            <div className="space-y-3">
              <Label className="text-base font-semibold flex items-center gap-2">
                <Coffee className="w-4 h-4" />
                Meal Break ({activeRule.mealBreakMinutes} minutes)
              </Label>

              {mealBreakRequired ? (
                <div className="space-y-2 pl-6">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="meal-provided"
                      checked={mealBreakProvided}
                      onCheckedChange={(v) => setMealBreakProvided(!!v)}
                      data-testid="checkbox-meal-provided"
                    />
                    <Label htmlFor="meal-provided" className="text-sm">
                      I was offered a meal break opportunity
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="meal-taken"
                      checked={mealBreakTaken}
                      onCheckedChange={(v) => {
                        setMealBreakTaken(!!v);
                        if (v) setMealBreakWaived(false);
                      }}
                      data-testid="checkbox-meal-taken"
                    />
                    <Label htmlFor="meal-taken" className="text-sm">
                      I took my meal break
                    </Label>
                  </div>
                  {!mealBreakTaken && canWaiveMeal && activeRule.allowMealBreakWaiver && (
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="meal-waived"
                        checked={mealBreakWaived}
                        onCheckedChange={(v) => setMealBreakWaived(!!v)}
                        data-testid="checkbox-meal-waived"
                      />
                      <Label htmlFor="meal-waived" className="text-sm">
                        I voluntarily waived my meal break
                      </Label>
                    </div>
                  )}
                  {!mealBreakTaken && !mealBreakWaived && (
                    <div className="flex items-center gap-2 text-sm text-destructive">
                      <AlertTriangle className="w-4 h-4" />
                      <span>Meal break not taken - 1 hour premium pay will be added</span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="pl-6 text-sm text-muted-foreground">
                  Meal break not required for shifts under {activeRule.mealBreakThresholdHours} hours
                </div>
              )}
            </div>

            <Separator />

            <div className="space-y-3">
              <Label className="text-base font-semibold flex items-center gap-2">
                <Clock className="w-4 h-4" />
                Rest Breaks ({activeRule.restBreakMinutes} minutes each)
              </Label>

              {restBreaksRequired > 0 ? (
                <div className="space-y-2 pl-6">
                  <div className="text-sm text-muted-foreground mb-2">
                    {restBreaksRequired} rest break(s) required for your shift
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="rest-provided"
                      checked={restBreaksProvided}
                      onCheckedChange={(v) => setRestBreaksProvided(!!v)}
                      data-testid="checkbox-rest-provided"
                    />
                    <Label htmlFor="rest-provided" className="text-sm">
                      I was offered rest break opportunities
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="rest-taken"
                      checked={restBreaksTaken}
                      onCheckedChange={(v) => setRestBreaksTaken(!!v)}
                      data-testid="checkbox-rest-taken"
                    />
                    <Label htmlFor="rest-taken" className="text-sm">
                      I took all my rest breaks
                    </Label>
                  </div>
                  {!restBreaksTaken && (
                    <div className="flex items-center gap-2 text-sm text-destructive">
                      <AlertTriangle className="w-4 h-4" />
                      <span>Rest break not taken - 1 hour premium pay will be added</span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="pl-6 text-sm text-muted-foreground">
                  No rest breaks required for shifts under {activeRule.restBreakIntervalHours} hours
                </div>
              )}
            </div>
          </div>

          {hasIssue && (
            <>
              <Separator />
              <div className="space-y-2">
                <Label htmlFor="missed-reason">Reason for missed break (optional):</Label>
                <Textarea
                  id="missed-reason"
                  value={missedBreakReason}
                  onChange={(e) => setMissedBreakReason(e.target.value)}
                  placeholder="Explain why break was missed..."
                  rows={2}
                  data-testid="textarea-missed-reason"
                />
              </div>
            </>
          )}

          <Separator />

          <div className="space-y-3">
            <Label className="text-base font-semibold flex items-center gap-2">
              <DollarSign className="w-4 h-4" />
              Cash Tips Declaration
            </Label>
            <div className="pl-6 space-y-2">
              <p className="text-sm text-muted-foreground">
                Enter any cash tips received during your shift for payroll reporting:
              </p>
              <div className="flex items-center gap-2 max-w-48">
                <span className="text-muted-foreground">$</span>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={cashTipsDeclared}
                  onChange={(e) => setCashTipsDeclared(e.target.value)}
                  placeholder="0.00"
                  className="tabular-nums"
                  data-testid="input-cash-tips"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Leave empty if no cash tips were received
              </p>
            </div>
          </div>

          <Separator />

          <div className="bg-muted/50 p-3 rounded-lg">
            <p className="text-sm text-muted-foreground mb-3">
              {activeRule.attestationMessage}
            </p>
            <div className="flex items-start space-x-2">
              <Checkbox
                id="confirmed"
                checked={confirmed}
                onCheckedChange={(v) => setConfirmed(!!v)}
                data-testid="checkbox-confirm-attestation"
              />
              <Label htmlFor="confirmed" className="text-sm font-medium">
                I confirm the above information is accurate
              </Label>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onCancel} data-testid="button-attestation-cancel">
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!confirmed}
            data-testid="button-attestation-confirm"
          >
            <CheckCircle2 className="w-4 h-4 mr-2" />
            Confirm & Clock Out
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
