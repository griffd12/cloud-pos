import { useQuery } from "@tanstack/react-query";
import { useEmcFilter } from "@/lib/emc-context";
import type { Property, Rvc, Enterprise } from "@shared/schema";

export function useScopeLookup() {
  const { selectedEnterpriseId } = useEmcFilter();

  const { data: enterprises = [] } = useQuery<Enterprise[]>({
    queryKey: ["/api/enterprises"],
  });

  const { data: properties = [] } = useQuery<Property[]>({
    queryKey: ["/api/properties"],
  });

  const { data: rvcs = [] } = useQuery<Rvc[]>({
    queryKey: ["/api/rvcs"],
  });

  const enterprise = enterprises.find(e => e.id === selectedEnterpriseId);

  return {
    properties: properties.map(p => ({ id: p.id, name: p.name })),
    rvcs: rvcs.map(r => ({ id: r.id, name: r.name })),
    enterpriseName: enterprise?.name || "Enterprise",
  };
}
