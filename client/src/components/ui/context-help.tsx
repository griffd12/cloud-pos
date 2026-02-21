import { useState, useRef, useEffect } from "react";
import { HelpCircle, X } from "lucide-react";
import { getConfigHelp } from "@/lib/config-help-registry";

interface ContextHelpWrapperProps {
  fieldName: string;
  children: React.ReactNode;
}

export function ContextHelpWrapper({ fieldName, children }: ContextHelpWrapperProps) {
  const [showHelp, setShowHelp] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const help = getConfigHelp(fieldName);

  useEffect(() => {
    if (!showHelp) return;
    function handleClickOutside(e: MouseEvent) {
      if (
        popoverRef.current && !popoverRef.current.contains(e.target as Node) &&
        buttonRef.current && !buttonRef.current.contains(e.target as Node)
      ) {
        setShowHelp(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showHelp]);

  if (!help) return <>{children}</>;

  return (
    <div className="relative inline-flex items-center gap-1.5">
      {children}
      <button
        ref={buttonRef}
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setShowHelp(!showHelp);
        }}
        className="inline-flex items-center justify-center w-4 h-4 rounded-full text-muted-foreground/60 hover:text-primary hover:bg-primary/10 transition-colors shrink-0"
        data-testid={`help-${fieldName}`}
        aria-label={`Help for ${help.label}`}
      >
        <HelpCircle className="w-3.5 h-3.5" />
      </button>
      {showHelp && (
        <div
          ref={popoverRef}
          className="absolute left-0 top-full mt-1 z-50 w-[320px] rounded-lg border bg-popover p-3 shadow-lg animate-in fade-in-0 zoom-in-95"
          data-testid={`help-popover-${fieldName}`}
        >
          <div className="flex items-start justify-between gap-2 mb-1.5">
            <div className="flex items-center gap-1.5">
              <HelpCircle className="w-3.5 h-3.5 text-primary shrink-0" />
              <span className="text-xs font-semibold text-primary">{help.label}</span>
            </div>
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); setShowHelp(false); }}
              className="text-muted-foreground/60 hover:text-foreground transition-colors"
              data-testid={`help-close-${fieldName}`}
            >
              <X className="w-3 h-3" />
            </button>
          </div>
          {help.category && (
            <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded mb-1.5 inline-block">
              {help.category}
            </span>
          )}
          <p className="text-xs text-muted-foreground leading-relaxed">
            {help.description}
          </p>
        </div>
      )}
    </div>
  );
}
