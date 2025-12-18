import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { PosPage, PosPageKey, Slu, MenuItem } from "@shared/schema";
import { ArrowLeft } from "lucide-react";

interface DynamicPageGridProps {
  page: PosPage;
  pageKeys: PosPageKey[];
  slus: Slu[];
  menuItems: MenuItem[];
  onSelectSlu: (slu: Slu) => void;
  onSelectMenuItem: (menuItem: MenuItem) => void;
  onNavigateToPage: (pageId: string) => void;
  onExecuteFunction: (functionCode: string) => void;
  onBack?: () => void;
  isLoading?: boolean;
}

export function DynamicPageGrid({
  page,
  pageKeys,
  slus,
  menuItems,
  onSelectSlu,
  onSelectMenuItem,
  onNavigateToPage,
  onExecuteFunction,
  onBack,
  isLoading,
}: DynamicPageGridProps) {
  if (isLoading) {
    return (
      <div
        className="grid gap-1 p-2"
        style={{
          gridTemplateColumns: `repeat(${page.gridColumns || 8}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${page.gridRows || 6}, minmax(60px, 1fr))`,
        }}
      >
        {Array.from({ length: (page.gridColumns || 8) * (page.gridRows || 6) }).map((_, i) => (
          <div key={i} className="h-full bg-muted animate-pulse rounded-md" />
        ))}
      </div>
    );
  }

  const handleKeyPress = (key: PosPageKey) => {
    switch (key.actionType) {
      case "slu": {
        const slu = slus.find((s) => s.id === key.actionTarget);
        if (slu) onSelectSlu(slu);
        break;
      }
      case "menu_item": {
        const menuItem = menuItems.find((m) => m.id === key.actionTarget);
        if (menuItem) onSelectMenuItem(menuItem);
        break;
      }
      case "navigation": {
        if (key.actionTarget) onNavigateToPage(key.actionTarget);
        break;
      }
      case "function": {
        if (key.actionTarget) onExecuteFunction(key.actionTarget);
        break;
      }
    }
  };

  const rows = page.gridRows || 6;
  const cols = page.gridColumns || 8;
  const grid: (PosPageKey | null)[][] = Array(rows).fill(null).map(() => Array(cols).fill(null));
  const occupied: boolean[][] = Array(rows).fill(false).map(() => Array(cols).fill(false));

  pageKeys.forEach((key) => {
    const r = key.gridRow || 0;
    const c = key.gridColumn || 0;
    const rs = key.rowSpan || 1;
    const cs = key.colSpan || 1;
    for (let i = r; i < r + rs && i < rows; i++) {
      for (let j = c; j < c + cs && j < cols; j++) {
        occupied[i][j] = true;
      }
    }
    if (r < rows && c < cols) {
      grid[r][c] = key;
    }
  });

  return (
    <div className="flex flex-col h-full">
      {onBack && (
        <div className="flex items-center gap-2 p-2 border-b">
          <Button variant="ghost" size="sm" onClick={onBack} data-testid="button-page-back">
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back
          </Button>
          <span className="text-sm font-medium">{page.name}</span>
        </div>
      )}
      <div
        className="grid gap-1 p-2 flex-1"
        style={{
          gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${rows}, minmax(50px, 1fr))`,
        }}
      >
        {Array.from({ length: rows * cols }).map((_, idx) => {
          const row = Math.floor(idx / cols);
          const col = idx % cols;
          const key = grid[row][col];

          if (key) {
            return (
              <button
                key={`${row}-${col}`}
                data-testid={`pos-key-${row}-${col}`}
                className="rounded-md flex flex-col items-center justify-center text-center p-1 cursor-pointer transition-all active:scale-[0.98]"
                style={{
                  backgroundColor: key.color || "#3B82F6",
                  color: key.textColor || "#FFFFFF",
                  gridRow: `span ${key.rowSpan || 1}`,
                  gridColumn: `span ${key.colSpan || 1}`,
                }}
                onClick={() => handleKeyPress(key)}
              >
                <span
                  className={`font-medium leading-tight ${
                    key.fontSize === "small" ? "text-xs" : key.fontSize === "large" ? "text-base" : "text-sm"
                  }`}
                >
                  {key.label}
                </span>
                {key.labelLine2 && <span className="text-xs opacity-80 leading-tight">{key.labelLine2}</span>}
              </button>
            );
          }

          if (occupied[row][col]) {
            return null;
          }

          return <div key={`${row}-${col}`} className="rounded-md" />;
        })}
      </div>
    </div>
  );
}

interface PageNavigationState {
  pageStack: string[];
  currentPageId: string | null;
}

export function usePosPageNavigation(defaultPageId?: string | null) {
  const [state, setState] = useState<PageNavigationState>({
    pageStack: [],
    currentPageId: defaultPageId || null,
  });

  const navigateToPage = (pageId: string) => {
    setState((prev) => ({
      pageStack: prev.currentPageId ? [...prev.pageStack, prev.currentPageId] : prev.pageStack,
      currentPageId: pageId,
    }));
  };

  const goBack = () => {
    setState((prev) => {
      if (prev.pageStack.length === 0) return prev;
      const newStack = [...prev.pageStack];
      const prevPageId = newStack.pop() || null;
      return {
        pageStack: newStack,
        currentPageId: prevPageId,
      };
    });
  };

  const goHome = () => {
    setState({
      pageStack: [],
      currentPageId: defaultPageId || null,
    });
  };

  return {
    currentPageId: state.currentPageId,
    canGoBack: state.pageStack.length > 0,
    navigateToPage,
    goBack,
    goHome,
  };
}
