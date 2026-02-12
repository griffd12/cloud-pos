import { Badge } from "@/components/ui/badge";
import { Building2, Store, LayoutGrid } from "lucide-react";

interface ScopeableRow {
  rvcId?: string | null;
  propertyId?: string | null;
  enterpriseId?: string | null;
}

export function renderScopeBadge<T extends ScopeableRow>(_: unknown, row: T) {
  if (row.rvcId) return <Badge variant="outline">RVC</Badge>;
  if (row.propertyId) return <Badge variant="outline">Property</Badge>;
  if (row.enterpriseId) return <Badge variant="outline">Enterprise</Badge>;
  return <Badge variant="outline">Global</Badge>;
}

export function getScopeColumn<T extends ScopeableRow>() {
  return {
    key: "scope" as keyof T & string,
    header: "Scope",
    render: renderScopeBadge<T>,
  };
}

type ScopeLevel = "enterprise" | "property" | "rvc";

function getItemLevel(row: ScopeableRow): ScopeLevel {
  if (row.rvcId) return "rvc";
  if (row.propertyId) return "property";
  return "enterprise";
}

function getViewLevel(selectedPropertyId: string | null, selectedRvcId: string | null): ScopeLevel {
  if (selectedRvcId) return "rvc";
  if (selectedPropertyId) return "property";
  return "enterprise";
}

const levelRank: Record<ScopeLevel, number> = { enterprise: 0, property: 1, rvc: 2 };

interface LookupData {
  properties?: Array<{ id: string; name: string }>;
  rvcs?: Array<{ id: string; name: string }>;
  enterpriseName?: string;
}

export function renderZoneBadge<T extends ScopeableRow>(
  lookupData: LookupData
) {
  return (_: unknown, row: T) => {
    const itemLevel = getItemLevel(row);
    if (itemLevel === "rvc") {
      const rvc = lookupData.rvcs?.find(r => r.id === row.rvcId);
      return (
        <div className="flex items-center gap-1.5 text-xs">
          <LayoutGrid className="w-3 h-3 text-muted-foreground shrink-0" />
          <span className="truncate">{rvc?.name || "RVC"}</span>
        </div>
      );
    }
    if (itemLevel === "property") {
      const prop = lookupData.properties?.find(p => p.id === row.propertyId);
      return (
        <div className="flex items-center gap-1.5 text-xs">
          <Store className="w-3 h-3 text-muted-foreground shrink-0" />
          <span className="truncate">{prop?.name || "Property"}</span>
        </div>
      );
    }
    return (
      <div className="flex items-center gap-1.5 text-xs">
        <Building2 className="w-3 h-3 text-muted-foreground shrink-0" />
        <span className="truncate">{lookupData.enterpriseName || "Enterprise"}</span>
      </div>
    );
  };
}

export function getZoneColumn<T extends ScopeableRow>(lookupData: LookupData) {
  return {
    key: "zone" as keyof T & string,
    header: "Zone",
    render: renderZoneBadge<T>(lookupData),
  };
}

export function renderInheritanceBadge<T extends ScopeableRow>(
  selectedPropertyId: string | null,
  selectedRvcId: string | null
) {
  return (_: unknown, row: T) => {
    const itemLevel = getItemLevel(row);
    const viewLevel = getViewLevel(selectedPropertyId, selectedRvcId);

    if (levelRank[itemLevel] < levelRank[viewLevel]) {
      return (
        <Badge variant="secondary" className="text-[10px]">
          Inherited
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="text-[10px]">
        Defined Here
      </Badge>
    );
  };
}

export function getInheritanceColumn<T extends ScopeableRow>(
  selectedPropertyId: string | null,
  selectedRvcId: string | null
) {
  return {
    key: "inheritance" as keyof T & string,
    header: "Inheritance",
    render: renderInheritanceBadge<T>(selectedPropertyId, selectedRvcId),
  };
}
