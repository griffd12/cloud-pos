import { Badge } from "@/components/ui/badge";

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
