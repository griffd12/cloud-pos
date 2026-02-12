import { useState, useEffect, useCallback } from "react";
import { Building2, Store, LayoutGrid, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Enterprise, Property, Rvc } from "@shared/schema";

interface HierarchyTreeProps {
  enterprises: Enterprise[];
  properties: Property[];
  rvcs: Rvc[];
  selectedEnterpriseId: string | null;
  selectedPropertyId: string | null;
  selectedRvcId: string | null;
  onSelectEnterprise: (id: string) => void;
  onSelectProperty: (id: string | null) => void;
  onSelectRvc: (id: string | null) => void;
  isSystemAdmin?: boolean;
}

export function HierarchyTree({
  enterprises,
  properties,
  rvcs,
  selectedEnterpriseId,
  selectedPropertyId,
  selectedRvcId,
  onSelectEnterprise,
  onSelectProperty,
  onSelectRvc,
  isSystemAdmin = false,
}: HierarchyTreeProps) {
  const [expandedEnterprises, setExpandedEnterprises] = useState<Set<string>>(new Set());
  const [expandedProperties, setExpandedProperties] = useState<Set<string>>(new Set());

  const autoExpand = useCallback(() => {
    if (selectedEnterpriseId) {
      setExpandedEnterprises((prev) => {
        const next = new Set(prev);
        next.add(selectedEnterpriseId);
        return next;
      });
    }
    if (selectedPropertyId) {
      setExpandedProperties((prev) => {
        const next = new Set(prev);
        next.add(selectedPropertyId);
        return next;
      });
      const prop = properties.find((p) => p.id === selectedPropertyId);
      if (prop) {
        setExpandedEnterprises((prev) => {
          const next = new Set(prev);
          next.add(prop.enterpriseId);
          return next;
        });
      }
    }
    if (selectedRvcId) {
      const rvc = rvcs.find((r) => r.id === selectedRvcId);
      if (rvc) {
        setExpandedProperties((prev) => {
          const next = new Set(prev);
          next.add(rvc.propertyId);
          return next;
        });
        const prop = properties.find((p) => p.id === rvc.propertyId);
        if (prop) {
          setExpandedEnterprises((prev) => {
            const next = new Set(prev);
            next.add(prop.enterpriseId);
            return next;
          });
        }
      }
    }
  }, [selectedEnterpriseId, selectedPropertyId, selectedRvcId, properties, rvcs]);

  useEffect(() => {
    autoExpand();
  }, [autoExpand]);

  const toggleEnterprise = (id: string) => {
    setExpandedEnterprises((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleProperty = (id: string) => {
    setExpandedProperties((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSelectEnterprise = (id: string) => {
    onSelectEnterprise(id);
    onSelectProperty(null);
    onSelectRvc(null);
  };

  const handleSelectProperty = (id: string) => {
    onSelectProperty(id);
    onSelectRvc(null);
  };

  const handleSelectRvc = (id: string) => {
    onSelectRvc(id);
  };

  const isEnterpriseSelected = (id: string) =>
    selectedEnterpriseId === id && !selectedPropertyId && !selectedRvcId;

  const isPropertySelected = (id: string) =>
    selectedPropertyId === id && !selectedRvcId;

  const isRvcSelected = (id: string) =>
    selectedRvcId === id;

  const displayedEnterprises = isSystemAdmin
    ? enterprises
    : enterprises.filter((e) => e.id === selectedEnterpriseId);

  return (
    <div className="overflow-y-auto flex-1 py-1">
      {displayedEnterprises.map((enterprise) => {
        const enterpriseProps = properties.filter(
          (p) => p.enterpriseId === enterprise.id
        );
        const isExpanded = expandedEnterprises.has(enterprise.id);
        const hasChildren = enterpriseProps.length > 0;

        return (
          <div key={enterprise.id}>
            <div
              data-testid={`tree-enterprise-${enterprise.id}`}
              className={cn(
                "flex items-center gap-1 px-2 py-1.5 cursor-pointer text-sm select-none",
                "hover-elevate rounded-md mx-1",
                isEnterpriseSelected(enterprise.id) && "bg-accent text-accent-foreground"
              )}
            >
              <button
                type="button"
                className={cn(
                  "flex items-center justify-center w-4 h-4 shrink-0",
                  !hasChildren && "invisible"
                )}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleEnterprise(enterprise.id);
                }}
                tabIndex={-1}
              >
                <ChevronRight
                  className={cn(
                    "w-3.5 h-3.5 transition-transform duration-150",
                    isExpanded && "rotate-90"
                  )}
                />
              </button>
              <div
                className="flex items-center gap-2 flex-1 min-w-0"
                onClick={() => handleSelectEnterprise(enterprise.id)}
              >
                <Building2 className="w-4 h-4 shrink-0 text-muted-foreground" />
                <span className="truncate">{enterprise.name}</span>
              </div>
            </div>

            {isExpanded &&
              enterpriseProps.map((property) => {
                const propertyRvcs = rvcs.filter(
                  (r) => r.propertyId === property.id
                );
                const isPropExpanded = expandedProperties.has(property.id);
                const hasPropChildren = propertyRvcs.length > 0;

                return (
                  <div key={property.id}>
                    <div
                      data-testid={`tree-property-${property.id}`}
                      className={cn(
                        "flex items-center gap-1 pl-6 pr-2 py-1.5 cursor-pointer text-sm select-none",
                        "hover-elevate rounded-md mx-1",
                        isPropertySelected(property.id) && "bg-accent text-accent-foreground"
                      )}
                    >
                      <button
                        type="button"
                        className={cn(
                          "flex items-center justify-center w-4 h-4 shrink-0",
                          !hasPropChildren && "invisible"
                        )}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleProperty(property.id);
                        }}
                        tabIndex={-1}
                      >
                        <ChevronRight
                          className={cn(
                            "w-3.5 h-3.5 transition-transform duration-150",
                            isPropExpanded && "rotate-90"
                          )}
                        />
                      </button>
                      <div
                        className="flex items-center gap-2 flex-1 min-w-0"
                        onClick={() => handleSelectProperty(property.id)}
                      >
                        <Store className="w-4 h-4 shrink-0 text-muted-foreground" />
                        <span className="truncate">{property.name}</span>
                      </div>
                    </div>

                    {isPropExpanded &&
                      propertyRvcs.map((rvc) => (
                        <div
                          key={rvc.id}
                          data-testid={`tree-rvc-${rvc.id}`}
                          className={cn(
                            "flex items-center gap-1 pl-10 pr-2 py-1.5 cursor-pointer text-sm select-none",
                            "hover-elevate rounded-md mx-1",
                            isRvcSelected(rvc.id) && "bg-accent text-accent-foreground"
                          )}
                          onClick={() => handleSelectRvc(rvc.id)}
                        >
                          <div className="w-4 h-4 shrink-0" />
                          <LayoutGrid className="w-4 h-4 shrink-0 text-muted-foreground" />
                          <span className="truncate">{rvc.name}</span>
                        </div>
                      ))}
                  </div>
                );
              })}
          </div>
        );
      })}
    </div>
  );
}
