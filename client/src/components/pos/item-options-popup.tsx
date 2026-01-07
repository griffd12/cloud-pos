import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Package, Ban } from "lucide-react";
import type { MenuItem } from "@shared/schema";

interface ItemOptionsPopupProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: MenuItem | null;
  onSetAvailability: () => void;
  onQuick86: () => void;
  is86ed?: boolean;
}

export function ItemOptionsPopup({
  open,
  onOpenChange,
  item,
  onSetAvailability,
  onQuick86,
  is86ed,
}: ItemOptionsPopupProps) {
  if (!item) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xs">
        <DialogHeader>
          <DialogTitle className="text-center">{item.shortName || item.name}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <Button
            variant="outline"
            className="w-full h-12 justify-start gap-3"
            onClick={() => {
              onSetAvailability();
              onOpenChange(false);
            }}
            data-testid="button-set-availability"
          >
            <Package className="w-5 h-5" />
            Set Availability
          </Button>
          <Button
            variant={is86ed ? "default" : "destructive"}
            className="w-full h-12 justify-start gap-3"
            onClick={() => {
              onQuick86();
              onOpenChange(false);
            }}
            data-testid="button-quick-86"
          >
            <Ban className="w-5 h-5" />
            {is86ed ? "Un-86 Item" : "86 Item (Sold Out)"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
