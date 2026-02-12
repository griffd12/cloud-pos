import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ChevronLeft,
  ChevronRight,
  Edit2,
  MoreVertical,
  Plus,
  Search,
  Trash2,
  Copy,
  LucideIcon,
} from "lucide-react";

export interface Column<T> {
  key: keyof T | string;
  header: string;
  render?: (value: any, row: T) => React.ReactNode;
  sortable?: boolean;
}

export interface CustomAction<T> {
  label: string;
  icon: LucideIcon;
  onClick: (item: T) => void;
  variant?: "default" | "destructive";
  hidden?: (item: T) => boolean;
}

interface DataTableProps<T extends { id: string }> {
  data: T[];
  columns: Column<T>[];
  onAdd?: () => void;
  onEdit?: (item: T) => void;
  onDelete?: (item: T) => void;
  onDuplicate?: (item: T) => void;
  customActions?: CustomAction<T>[];
  actionButtons?: (item: T) => React.ReactNode;
  isLoading?: boolean;
  title?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  pageSize?: number;
  hideSearch?: boolean;
  addLabel?: string;
}

export function DataTable<T extends { id: string }>({
  data,
  columns,
  onAdd,
  onEdit,
  onDelete,
  onDuplicate,
  customActions = [],
  actionButtons,
  isLoading = false,
  title,
  searchPlaceholder = "Search...",
  emptyMessage = "No items found",
  pageSize = 10,
  hideSearch = false,
  addLabel = "Add New",
}: DataTableProps<T>) {
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const filteredData = data.filter((item) => {
    if (!search) return true;
    const searchLower = search.toLowerCase();
    return columns.some((col) => {
      const value = getNestedValue(item, col.key as string);
      return String(value || "")
        .toLowerCase()
        .includes(searchLower);
    });
  });

  const sortedData = sortKey
    ? [...filteredData].sort((a, b) => {
        const aVal = getNestedValue(a, sortKey);
        const bVal = getNestedValue(b, sortKey);
        const comparison = String(aVal || "").localeCompare(String(bVal || ""));
        return sortDir === "asc" ? comparison : -comparison;
      })
    : filteredData;

  const totalPages = Math.ceil(sortedData.length / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const paginatedData = sortedData.slice(startIndex, startIndex + pageSize);

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  return (
    <div className="space-y-4">
      {(title || !hideSearch || onAdd) && (
        <div className="flex items-center justify-between gap-4">
          {title && <h2 className="text-lg font-semibold">{title}</h2>}
          <div className="flex items-center gap-2 ml-auto">
            {!hideSearch && (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder={searchPlaceholder}
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="pl-9 w-64"
                  data-testid="input-table-search"
                />
              </div>
            )}
            {onAdd && (
              <Button type="button" onClick={onAdd} data-testid="button-add-item">
                <Plus className="w-4 h-4 mr-2" />
                {addLabel}
              </Button>
            )}
          </div>
        </div>
      )}

      <div className="border rounded-lg">
        <ScrollArea className="h-[calc(100vh-320px)]">
          <Table>
            <TableHeader>
              <TableRow>
                {columns.map((col) => (
                  <TableHead
                    key={col.key as string}
                    className={col.sortable ? "cursor-pointer select-none" : ""}
                    onClick={() => col.sortable && handleSort(col.key as string)}
                  >
                    <div className="flex items-center gap-1">
                      {col.header}
                      {sortKey === col.key && (
                        <span className="text-xs">
                          {sortDir === "asc" ? "↑" : "↓"}
                        </span>
                      )}
                    </div>
                  </TableHead>
                ))}
                {actionButtons && <TableHead>Actions</TableHead>}
                {(onEdit || onDelete || onDuplicate || customActions.length > 0) && (
                  <TableHead className="w-12" />
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {columns.map((col, j) => (
                      <TableCell key={j}>
                        <div className="h-4 bg-muted animate-pulse rounded" />
                      </TableCell>
                    ))}
                    {actionButtons && <TableCell />}
                    {(onEdit || onDelete || onDuplicate || customActions.length > 0) && <TableCell />}
                  </TableRow>
                ))
              ) : paginatedData.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={columns.length + (onEdit || onDelete ? 1 : 0)}
                    className="h-32 text-center text-muted-foreground"
                  >
                    {emptyMessage}
                  </TableCell>
                </TableRow>
              ) : (
                paginatedData.map((item) => (
                  <TableRow key={item.id} data-testid={`row-${item.id}`}>
                    {columns.map((col) => (
                      <TableCell key={col.key as string}>
                        {col.render
                          ? col.render(getNestedValue(item, col.key as string), item)
                          : String(getNestedValue(item, col.key as string) ?? "")}
                      </TableCell>
                    ))}
                    {actionButtons && (
                      <TableCell>{actionButtons(item)}</TableCell>
                    )}
                    {(onEdit || onDelete || onDuplicate || customActions.length > 0) && (
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              data-testid={`button-actions-${item.id}`}
                            >
                              <MoreVertical className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {onEdit && (
                              <DropdownMenuItem onClick={() => onEdit(item)}>
                                <Edit2 className="w-4 h-4 mr-2" />
                                Edit
                              </DropdownMenuItem>
                            )}
                            {onDuplicate && (
                              <DropdownMenuItem onClick={() => onDuplicate(item)}>
                                <Copy className="w-4 h-4 mr-2" />
                                Duplicate
                              </DropdownMenuItem>
                            )}
                            {customActions.map((action, idx) => {
                              if (action.hidden && action.hidden(item)) return null;
                              const ActionIcon = action.icon;
                              return (
                                <DropdownMenuItem
                                  key={idx}
                                  onClick={() => action.onClick(item)}
                                  className={action.variant === "destructive" ? "text-destructive" : ""}
                                >
                                  <ActionIcon className="w-4 h-4 mr-2" />
                                  {action.label}
                                </DropdownMenuItem>
                              );
                            })}
                            {onDelete && (
                              <DropdownMenuItem
                                onClick={() => onDelete(item)}
                                className="text-destructive"
                              >
                                <Trash2 className="w-4 h-4 mr-2" />
                                Delete
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </ScrollArea>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {startIndex + 1}-{Math.min(startIndex + pageSize, sortedData.length)}{" "}
            of {sortedData.length}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              data-testid="button-prev-page"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-sm tabular-nums">
              Page {currentPage} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              data-testid="button-next-page"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function getNestedValue(obj: any, path: string): any {
  return path.split(".").reduce((acc, part) => acc?.[part], obj);
}
