import { useEffect, useMemo } from "react";

const FONT_SCALE_MAP: Record<number, { label: string; factor: number }> = {
  85: { label: "Small", factor: 0.85 },
  100: { label: "Medium", factor: 1.0 },
  120: { label: "Large", factor: 1.2 },
  140: { label: "Extra Large", factor: 1.4 },
};

export function useFontScale(fontScale?: number | null) {
  return useMemo(() => {
    const scale = fontScale ?? 100;
    const entry = FONT_SCALE_MAP[scale] || { label: `${scale}%`, factor: scale / 100 };
    const factor = entry.factor;
    return {
      factor,
      label: entry.label,
      percent: scale,
      style: {} as React.CSSProperties,
    };
  }, [fontScale]);
}

export function useDocumentFontScale(fontScale?: number | null) {
  const scale = useFontScale(fontScale);

  useEffect(() => {
    const el = document.documentElement;
    const baseFontSize = 16;
    if (scale.factor !== 1.0) {
      el.style.fontSize = `${baseFontSize * scale.factor}px`;
    }
    return () => {
      el.style.fontSize = "";
    };
  }, [scale.factor]);

  return scale;
}
