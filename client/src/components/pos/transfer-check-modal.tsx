import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ArrowRightLeft, User, Loader2 } from "lucide-react";
import type { Employee } from "@shared/schema";

interface TransferCheckModalProps {
  open: boolean;
  onClose: () => void;
  checkNumber: number;
  currentEmployeeId: string;
  rvcId: string;
  onTransfer: (toEmployeeId: string) => void;
  isTransferring?: boolean;
}

export function TransferCheckModal({
  open,
  onClose,
  checkNumber,
  currentEmployeeId,
  rvcId,
  onTransfer,
  isTransferring,
}: TransferCheckModalProps) {
  const [selectedEmployee, setSelectedEmployee] = useState<string | null>(null);

  const { data: employees = [], isLoading } = useQuery<Employee[]>({
    queryKey: ["/api/employees"],
    enabled: open,
  });

  const activeEmployees = employees.filter(
    (emp) => emp.active && emp.id !== currentEmployeeId
  );

  const handleTransfer = () => {
    if (selectedEmployee) {
      onTransfer(selectedEmployee);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeft className="w-5 h-5" />
            Transfer Check #{checkNumber}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Select an employee to transfer this check to:
          </p>

          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : activeEmployees.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              No other employees available
            </p>
          ) : (
            <ScrollArea className="h-64">
              <div className="space-y-2">
                {activeEmployees.map((emp) => (
                  <div key={emp.id} className="h-14">
                    <Button
                      variant={selectedEmployee === emp.id ? "default" : "secondary"}
                      className="w-full h-full justify-start gap-3"
                      onClick={() => setSelectedEmployee(emp.id)}
                      data-testid={`button-transfer-to-${emp.id}`}
                    >
                      <User className="w-4 h-4" />
                      <div className="text-left">
                        <div className="font-medium">
                          {emp.firstName} {emp.lastName}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          #{emp.employeeNumber}
                        </div>
                      </div>
                    </Button>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </div>

        <div className="flex gap-2 justify-end pt-4 border-t">
          <Button variant="secondary" onClick={onClose} data-testid="button-cancel-transfer">
            Cancel
          </Button>
          <Button
            onClick={handleTransfer}
            disabled={!selectedEmployee || isTransferring}
            data-testid="button-confirm-transfer"
          >
            {isTransferring ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Transferring...
              </>
            ) : (
              <>
                <ArrowRightLeft className="w-4 h-4 mr-2" />
                Transfer
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
