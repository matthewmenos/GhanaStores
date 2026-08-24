/**
 * pages/ThemeCustomizer.jsx
 * WordPress-style live preview canvas.
 *
 * Visual language mirrors the WP customiser preview pane:
 *   - light grey dotted backdrop behind a floating, deeply-shadowed frame
 *   - icon-only device dock pinned to the BOTTOM-LEFT of the canvas
 *   - live pixel badge beside the dock, updating during transitions
 *   - storefront page context tabs along the top
 *   - edge collapse handle that slides the control rail away (md+) via the
 *     `gs:customizer-collapse` event handled by DashboardLayout
 *
 * The storefront itself lives in components/storefront/Storefront.jsx;
 * theming state flows in through localStorage + `gs:theme-preview` events
 * broadcast by the accordion rail on every edit.
 *
 * Re-exports the token schema utilities for legacy import paths.
 */
import { useEffect, useRef, useState } from 'react';
import { Monitor, Smartphone, Tablet } from 'lucide-react';
import StorefrontRouter from '../components/storefront/Storefront.jsx';
import { useElementSize } from '../hooks/useElementSize.js';
import { DEFAULT_CUSTOM_THEME_CONFIG, normalizeCustomThemeConfig, PAGE_TABS } from '../theme/config.js';

export { DEFAULT_CUSTOM_THEME_CONFIG, normalizeCustomThemeConfig, seedConfigFromTheme } from '../theme/config.js';

/* Device presets - width/height classes morph via transition-all. */
const DEVICES = {
  desktop: {
    key: 'desktop', label: 'Desktop', Icon: Monitor,
    fallbackWidth: 1024, height: 800,
    className: 'w-full max-w-5xl h-[800px] rounded-xl',
  },
  tablet: {
    key: 'tablet', label: 'Tablet', Icon: Tablet,
    fallbackWidth: 768, height: 900,
    className: 'w-[768px] h-[900px] max-w-full rounded-[18px]',
  },
  mobile: {
    key: 'mobile', label: 'Mobile', Icon: Smartphone,
    fallbackWidth: 375, height: 667,
    className: 'w-[375px] h-[667px] max-w-full rounded-[28px]',
  },
};
const DEVICE_ORDER = ['desktop', 'tablet', 'mobile'];

export default function ThemeCustomizer() {
  const readCachedConfig = () => {
    try {
      const raw = localStorage.getItem('gs_custom_theme');
      return raw ? normalizeCustomThemeConfig(JSON.parse(raw)) : DEFAULT_CUSTOM_THEME_CONFIG;
    } catch {
      return DEFAULT_CUSTOM_THEME_CONFIG;
    }
  };

  const [config, setConfig] = useState(readCachedConfig);
  const [device, setDevice] = useState('desktop');
  const [activePage, setActivePage] = useState('home');
  const frameRef = useRef(null);
  const frameSize = useElementSize(frameRef);

  /* Mirror live edits broadcast by the accordion rail. */
  useEffect(() => {
    const onPreviewUpdate = (e) => {
      if (e?.detail) setConfig(normalizeCustomThemeConfig(e.detail));
    };
    window.addEventListener('gs:theme-preview', onPreviewUpdate);
    return () => window.removeEventListener('gs:theme-preview', onPreviewUpdate);
  }, []);

  const preset = DEVICES[device];
  const badgeW = frameSize.width ? Math.round(frameSize.width) : preset.fallbackWidth;
  const badgeH = frameSize.height ? Math.round(frameSize.height) : preset.height;

  return (
    <div className="relative flex h-[calc(100vh-9rem)] min-h-[600px] w-full">
      {/* Collapse handle - slides the control rail away (WordPress behaviour) */}
      <button
        type="button"
        onClick={() => window.dispatchEvent(new Event('gs:customizer-collapse'))}
        title="Collapse controls"
        aria-label="Collapse customizer controls"
        className="absolute left-0 top-1/2 z-20 hidden h-16 w-6 -translate-y-1/2 items-center justify-center rounded-r-lg border border-l-0 border-slate-700/60 bg-slate-800 text-slate-300 transition hover:bg-slate-700 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 md:flex"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
      </button>

      {/* Preview surface - WP grey with dot grid */}
      <section
        className="relative flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-300/70 shadow-inner"
        style={{
          backgroundColor: '#f0f0f1',
          backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(15,23,42,.09) 1px, transparent 0)',
          backgroundSize: '16px 16px',
        }}
      >
        {/* Storefront page context tabs */}
        <div className="flex items-center gap-1 overflow-x-auto border-b border-slate-200 bg-white px-2 py-1.5" role="tablist" aria-label="Storefront pages">
          <span className="hidden shrink-0 pl-1 pr-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 sm:inline">Previewing</span>
          {PAGE_TABS.map(({ key, label }) => {
            const on = activePage === key;
            return (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => setActivePage(key)}
                className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-bold transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ${
                  on ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>

        {/* Canvas hosting the simulated device frame */}
        <div className="relative flex flex-1 items-start justify-center overflow-auto p-4 pt-9 md:p-8 md:pt-10">
          {/* Floating device label */}
          <span className="pointer-events-none absolute left-1/2 top-3 z-10 -translate-x-1/2 whitespace-nowrap rounded-full border border-slate-200 bg-white/95 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-500 shadow-sm">
            {preset.label} · {badgeW} × {badgeH}
          </span>

          {/* Simulated device frame - smooth size morphing */}
          <div
            ref={frameRef}
            data-device={device}
            className={`shrink-0 overflow-hidden bg-white ring-1 ring-black/25 shadow-[0_30px_60px_-12px_rgba(15,23,42,.35),0_8px_20px_-8px_rgba(15,23,42,.2)] transition-all duration-300 ease-in-out ${preset.className}`}
          >
            <StorefrontRouter
              config={config}
              viewportWidth={frameSize.width}
              page={activePage}
              onNavigate={setActivePage}
            />
          </div>
        </div>

        {/* Bottom-left device dock - WordPress placement */}
        <div className="absolute bottom-3 left-3 z-10 flex items-center gap-0.5 rounded-lg border border-slate-300 bg-white p-1 shadow-md">
          {DEVICE_ORDER.map((key) => {
            const { Icon, label } = DEVICES[key];
            const active = key === device;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setDevice(key)}
                aria-pressed={active}
                title={`${label} preview`}
                className={`rounded-md p-2 transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ${
                  active ? 'bg-blue-600 text-white' : 'text-slate-500 hover:bg-slate-100 hover:text-charcoal'
                }`}
              >
                <Icon size={15} aria-hidden="true" />
              </button>
            );
          })}
          <span className="mx-1 h-4 w-px bg-slate-200" aria-hidden="true" />
          <span className="whitespace-nowrap px-1.5 font-mono text-[10px] font-semibold tabular-nums text-slate-500" title="Rendered preview dimensions">
            {badgeW}px × {badgeH}px
          </span>
        </div>
      </section>
    </div>
  );
}
