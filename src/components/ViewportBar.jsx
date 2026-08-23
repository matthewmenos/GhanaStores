/**
 * ViewportBar.jsx
 * Responsive device-preview toolbar rendered above the theme-customizer
 * sandbox. Lets merchants flip the live storefront preview between
 * Desktop / Tablet / Mobile frame sizes and reports true rendered pixels
 * via a ResizeObserver-backed badge.
 *
 * STRICT RULE: pure SVG / Lucide React icons ONLY - ZERO emojis.
 */
import { useEffect, useState } from 'react';
import { Monitor, Tablet, Smartphone } from 'lucide-react';

/**
 * Device frame presets consumed by the preview canvas wrapper.
 * Width/height classes animate via transition-all on the frame element.
 */
export const DEVICE_PRESETS = {
  desktop: {
    key: 'desktop',
    label: 'Desktop',
    Icon: Monitor,
    fallbackWidth: 1024,
    height: 800,
    title: 'Desktop preview - fluid width up to 1024px',
    /** Required: w-full max-w-5xl h-[800px] (+ chrome only) */
    className: 'w-full max-w-5xl h-[800px] rounded-xl',
  },
  tablet: {
    key: 'tablet',
    label: 'Tablet',
    Icon: Tablet,
    fallbackWidth: 768,
    height: 900,
    title: 'Tablet preview - 768 x 900',
    /** Required: w-[768px] h-[900px] (+ clamps/chrome only) */
    className: 'w-[768px] h-[900px] max-w-full rounded-[18px]',
  },
  mobile: {
    key: 'mobile',
    label: 'Mobile',
    Icon: Smartphone,
    fallbackWidth: 375,
    height: 667,
    title: 'Mobile preview - 375 x 667',
    /** Required: w-[375px] h-[667px] (+ clamps/chrome only) */
    className: 'w-[375px] h-[667px] max-w-full rounded-[28px]',
  },
};

export const DEVICE_ORDER = ['desktop', 'tablet', 'mobile'];

/**
 * Measures an element's rendered box on every resize using ResizeObserver,
 * so the pixel badge reflects the real frame dimensions even while the
 * width/height transition is animating.
 */
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

/**
 * Device toggle strip + live dimension badge.
 *
 * @param {string}   device         Active preset key ('desktop'|'tablet'|'mobile').
 * @param {Function} onDeviceChange Callback receiving the next preset key.
 * @param {{width:number,height:number}} [measured] Live frame box from useElementSize.
 */
export default function ViewportBar({ device, onDeviceChange, measured }) {
  const preset = DEVICE_PRESETS[device] || DEVICE_PRESETS.desktop;
  const w = measured?.width ? Math.round(measured.width) : preset.fallbackWidth;
  const h = measured?.height ? Math.round(measured.height) : preset.height;

  return (
    <div className="relative flex items-center border-b border-slate-200 bg-white px-3 py-2">
      {/* Device toggles - centered pill group */}
      <div
        role="group"
        aria-label="Preview device size"
        className="mx-auto flex items-center gap-1 rounded-lg bg-slate-100 p-1"
      >
        {DEVICE_ORDER.map((key) => {
          const { Icon, label, title } = DEVICE_PRESETS[key];
          const active = key === device;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onDeviceChange(key)}
              aria-pressed={active}
              title={title}
              className={`relative flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-bold transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                active
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-slate-500 hover:bg-white hover:text-charcoal'
              }`}
            >
              <Icon size={14} aria-hidden="true" />
              <span className="hidden sm:inline">{label}</span>
              {/* Active viewport highlight indicator */}
              <span
                className={`absolute -bottom-[7px] left-1/2 h-1 w-1 -translate-x-1/2 rounded-full transition-opacity duration-200 ${
                  active ? 'bg-blue-600 opacity-100' : 'opacity-0'
                }`}
                aria-hidden="true"
              />
            </button>
          );
        })}
      </div>

      {/* Live rendered width x height pixel badge (dynamically updating) */}
      <span
        className="absolute right-3 inline-flex items-center gap-1 rounded-md border border-slate-200 bg-mist px-2 py-1 font-mono text-[11px] font-semibold tabular-nums text-slate-600"
        title="Rendered preview dimensions"
      >
        {w}px × {h}px
      </span>
    </div>
  );
}
