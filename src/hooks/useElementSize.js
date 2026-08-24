/**
 * hooks/useElementSize.js
 * Measures an element's rendered box on every resize using ResizeObserver,
 * so preview tooling can report true pixel dimensions even while CSS
 * width/height transitions are animating.
 */
import { useEffect, useState } from 'react';

export function useElementSize(ref) {
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;

    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize((prev) =>
        Math.round(prev.width) !== Math.round(width) ||
        Math.round(prev.height) !== Math.round(height)
          ? { width: Math.round(width), height: Math.round(height) }
          : prev,
      );
    });

    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);

  return size;
}

export default useElementSize;
