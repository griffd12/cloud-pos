import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getAuthHeaders } from "@/lib/queryClient";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Merge, Loader2 } from "lucide-react";
import type { Check } from "@shared/schema";

interface MergeChecksModalProps {
  open: boolean;
  onClose: () => void;
  currentCheckId: string;
  currentCheckNumber: number;
  rvcId: string;
  onMerge: (checkIds: string[]) => void;
  isMerging?: boolean;
}

export function MergeChecksModal({
  open,
  onClose,
  currentCheckId,
  currentCheckNumber,
  rvcId,
  onMerge,
  isMerging,
}: MergeChecksModalProps) {
  const [selectedChecks, setSelectedChecks] = useState<Set<string>>(new Set());

  const { data: openChecks = [], isLoading } = useQuery<Check[]>({
    queryKey: ["/api/checks/open", rvcId],
    queryFn: async () => {
      if (!rvcId) return [];
      const res = await fetch(`/api/checks/open?rvcId=${rvcId}`, { credentials: "include", headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch open checks");
      return res.json();
    },
    enabled: open && !!rvcId,
  });

  const otherChecks = openChecks.filter((check) => check.id !== currentCheckId);

  const toggleCheck = (checkId: string) => {
    const newSelected = new Set(selectedChecks);
    if (newSelected.has(checkId)) {
      newSelected.delete(checkId);
    } else {
      newSelected.add(checkId);
    }
    setSelectedChecks(newSelected);
  };

  const handleMerge = () => {
    if (selectedChecks.size > 0) {
      onMerge(Array.from(selectedChecks));
    }
  };

  const formatPrice = (price: string | number | null) => {
    const numPrice = typeof price === "string" ? parseFloat(price) : (price || 0);
    return `$${numPrice.toFixed(2)}`;
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Merge className="w-5 h-5" />
            Merge into Check #{currentCheckNumber}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Select checks to merge into the current check:
          </p>

          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : otherChecks.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              No other open checks to merge
            </p>
          ) : (
            <ScrollArea className="h-64">
              <div className="space-y-2">
                {otherChecks.map((check) => (
                  <div
                    key={check.id}
                    className={`flex items-center gap-3 p-3 rounded-md border cursor-pointer transition-colors ${
                      selectedChecks.has(check.id)
                        ? "bg-primary/10 border-primary"
                        : "hover:bg-muted/50"
                    }`}
                    onClick={() => toggleCheck(check.id)}
                    data-testid={`checkbox-merge-check-${check.id}`}
                  >
                    <Checkbox
                      checked={selectedChecks.has(check.id)}
                      onCheckedChange={() => toggleCheck(check.id)}
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold">#{check.checkNumber}</span>
                        <Badge variant="outline">{check.orderType}</Badge>
                        {check.tableNumber && (
                          <span className="text-sm text-muted-foreground">
                            Table {check.tableNumber}
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="font-semibold tabular-nums">
                      {formatPrice(check.subtotal)}
                    </span>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}

          {selectedChecks.size > 0 && (
            <div className="p-3 bg-muted/50 rounded-md text-sm text-muted-foreground">
              {selectedChecks.size} check(s) will be merged into #{currentCheckNumber}
            </div>
          )}
        </div>

        <div className="flex gap-2 justify-end pt-4 border-t">
          <Button variant="secondary" onClick={onClose} data-testid="button-cancel-merge">
            Cancel
          </Button>
          <Button
            onClick={handleMerge}
            disabled={selectedChecks.size === 0 || isMerging}
            data-testid="button-confirm-merge"
          >
            {isMerging ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Merging...
              </>
            ) : (
              <>
                <Merge className="w-4 h-4 mr-2" />
                Merge Checks
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
