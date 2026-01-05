import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getAuthHeaders } from "@/lib/queryClient";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Search, Receipt, RefreshCw, ArrowRight } from "lucide-react";
import type { Check } from "@shared/schema";
import { format } from "date-fns";

interface TransactionLookupModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rvcId: string;
  onSelectCheck: (check: Check) => void;
}

export function TransactionLookupModal({
  open,
  onOpenChange,
  rvcId,
  onSelectCheck,
}: TransactionLookupModalProps) {
  const [searchCheckNumber, setSearchCheckNumber] = useState("");
  const [searchDate, setSearchDate] = useState(format(new Date(), "yyyy-MM-dd"));

  const { data: closedChecks = [], isLoading, refetch } = useQuery<Check[]>({
    queryKey: ["/api/rvcs", rvcId, "closed-checks", searchDate, searchCheckNumber],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (searchDate) params.append("businessDate", searchDate);
      if (searchCheckNumber) params.append("checkNumber", searchCheckNumber);
      params.append("limit", "50");

      const res = await fetch(`/api/rvcs/${rvcId}/closed-checks?${params}`, { credentials: "include", headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Failed to fetch closed checks");
      return res.json();
    },
    enabled: open && !!rvcId,
  });

  const handleSearch = () => {
    refetch();
  };

  const handleSelectCheck = (check: Check) => {
    onSelectCheck(check);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="w-5 h-5" />
            Transaction Lookup
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 flex-1 min-h-0">
          <div className="flex items-end gap-4">
            <div className="flex-1 space-y-2">
              <Label htmlFor="search-date">Business Date</Label>
              <Input
                id="search-date"
                type="date"
                value={searchDate}
                onChange={(e) => setSearchDate(e.target.value)}
                data-testid="input-search-date"
              />
            </div>
            <div className="flex-1 space-y-2">
              <Label htmlFor="search-check-number">Check Number</Label>
              <Input
                id="search-check-number"
                type="number"
                placeholder="Leave empty for all"
                value={searchCheckNumber}
                onChange={(e) => setSearchCheckNumber(e.target.value)}
                data-testid="input-search-check-number"
              />
            </div>
            <Button onClick={handleSearch} data-testid="button-search-transactions">
              <Search className="w-4 h-4 mr-2" />
              Search
            </Button>
          </div>

          <Separator />

          <ScrollArea className="flex-1">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : closedChecks.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <Receipt className="w-12 h-12 mb-2 opacity-50" />
                <p>No closed transactions found</p>
              </div>
            ) : (
              <div className="space-y-2 pr-4">
                {closedChecks.map((check) => (
                  <div
                    key={check.id}
                    className="flex items-center justify-between p-3 border rounded-lg hover-elevate cursor-pointer"
                    onClick={() => handleSelectCheck(check)}
                    data-testid={`check-row-${check.id}`}
                  >
                    <div className="flex items-center gap-4">
                      <div className="text-center">
                        <div className="text-lg font-bold">#{check.checkNumber}</div>
                        <Badge variant="outline" className="text-xs">
                          {check.orderType?.replace("_", " ")}
                        </Badge>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        <div>Closed: {check.closedAt ? format(new Date(check.closedAt), "h:mm a") : "-"}</div>
                        <div>Table: {check.tableNumber || "-"}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <div className="text-lg font-semibold">${parseFloat(check.total || "0").toFixed(2)}</div>
                        <div className="text-xs text-muted-foreground">
                          Tax: ${parseFloat(check.taxTotal || "0").toFixed(2)}
                        </div>
                      </div>
                      <ArrowRight className="w-5 h-5 text-muted-foreground" />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
}
