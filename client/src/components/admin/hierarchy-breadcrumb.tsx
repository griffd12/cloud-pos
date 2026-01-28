import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Building2, Store, LayoutGrid } from "lucide-react";
import type { Enterprise, Property, Rvc } from "@shared/schema";

interface HierarchyBreadcrumbProps {
  enterprises: Enterprise[];
  properties: Property[];
  rvcs: Rvc[];
  selectedEnterprise: Enterprise | null;
  selectedProperty: Property | null;
  selectedRvc: Rvc | null;
  onEnterpriseChange: (id: string | null) => void;
  onPropertyChange: (id: string | null) => void;
  onRvcChange: (id: string | null) => void;
  showOverrideBadge?: boolean;
  isPropertyLocked?: boolean;
}

export function HierarchyBreadcrumb({
  enterprises,
  properties,
  rvcs,
  selectedEnterprise,
  selectedProperty,
  selectedRvc,
  onEnterpriseChange,
  onPropertyChange,
  onRvcChange,
  showOverrideBadge = false,
  isPropertyLocked = false,
}: HierarchyBreadcrumbProps) {
  const filteredProperties = selectedEnterprise
    ? properties.filter((p) => p.enterpriseId === selectedEnterprise.id)
    : [];

  const filteredRvcs = selectedProperty
    ? rvcs.filter((r) => r.propertyId === selectedProperty.id)
    : [];

  // Don't render if no enterprise is selected (enterprise selector is in the main header)
  if (!selectedEnterprise) {
    return null;
  }

  return (
    <div className="flex items-center gap-4 p-4 border-b bg-muted/30">
      <Breadcrumb>
        <BreadcrumbList>
          {/* Show enterprise name as static text (not a selector - that's in the header) */}
          <BreadcrumbItem>
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-muted-foreground" />
              <span className="font-medium">{selectedEnterprise.name}</span>
            </div>
          </BreadcrumbItem>

          {/* Property selector - only shown after enterprise is selected */}
          {selectedEnterprise && (
            <>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <div className="flex items-center gap-2">
                  <Store className="w-4 h-4 text-muted-foreground" />
                  {isPropertyLocked && selectedProperty ? (
                    <span className="font-medium">{selectedProperty.name}</span>
                  ) : (
                    <Select
                      value={selectedProperty?.id || "all"}
                      onValueChange={(val) =>
                        onPropertyChange(val === "all" ? null : val)
                      }
                    >
                      <SelectTrigger
                        className="w-48 border-0 bg-transparent h-auto p-0 font-medium"
                        data-testid="select-property"
                      >
                        <SelectValue placeholder="All Properties" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Properties</SelectItem>
                        {filteredProperties.map((prop) => (
                          <SelectItem key={prop.id} value={prop.id}>
                            {prop.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              </BreadcrumbItem>
            </>
          )}

          {selectedProperty && (
            <>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <div className="flex items-center gap-2">
                  <LayoutGrid className="w-4 h-4 text-muted-foreground" />
                  <Select
                    value={selectedRvc?.id || "all"}
                    onValueChange={(val) =>
                      onRvcChange(val === "all" ? null : val)
                    }
                  >
                    <SelectTrigger
                      className="w-48 border-0 bg-transparent h-auto p-0 font-medium"
                      data-testid="select-rvc"
                    >
                      <SelectValue placeholder="All RVCs" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All RVCs</SelectItem>
                      {filteredRvcs.map((rvc) => (
                        <SelectItem key={rvc.id} value={rvc.id}>
                          {rvc.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </BreadcrumbItem>
            </>
          )}
        </BreadcrumbList>
      </Breadcrumb>

      {showOverrideBadge && (selectedProperty || selectedRvc) && (
        <Badge variant="outline" className="ml-auto">
          {selectedRvc ? "RVC Override" : "Property Override"}
        </Badge>
      )}
    </div>
  );
}
