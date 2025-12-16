import { Button } from "@/components/ui/button";
import type { Slu } from "@shared/schema";

interface SluGridProps {
  slus: Slu[];
  selectedSluId: string | null;
  onSelectSlu: (slu: Slu) => void;
  isLoading?: boolean;
}

export function SluGrid({ slus, selectedSluId, onSelectSlu, isLoading }: SluGridProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-2 p-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="h-14 bg-muted animate-pulse rounded-md"
          />
        ))}
      </div>
    );
  }

  if (slus.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
        No categories configured
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 gap-2 p-2">
      {slus.map((slu) => (
        <Button
          key={slu.id}
          variant={selectedSluId === slu.id ? "default" : "secondary"}
          className="h-14 text-sm font-medium relative overflow-visible"
          onClick={() => onSelectSlu(slu)}
          data-testid={`button-slu-${slu.id}`}
        >
          <span className="truncate">{slu.buttonLabel || slu.name}</span>
        </Button>
      ))}
    </div>
  );
}
