/**
 * Ghana Stores icon system - pure inline SVGs (24x24 stroke, lucide-style).
 * STRICT RULE: zero emojis anywhere in the UI. Always import from here.
 */
const base = {
  width: 20,
  height: 20,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
};

function Svg({ children, size = 20, className = '', ...rest }) {
  return (
    <svg {...base} {...rest} width={size} height={size} className={className} aria-hidden="true">
      {children}
    </svg>
  );
}

export const IconStore = (p) => (
  <Svg {...p}><path d="M3 9l1.5-5h15L21 9" /><path d="M4 9v11a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V9" /><path d="M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0" /><path d="M9 21v-6h6v6" /></Svg>
);
export const IconDashboard = (p) => (
  <Svg {...p}><rect x="3" y="3" width="7" height="9" rx="1" /><rect x="14" y="3" width="7" height="5" rx="1" /><rect x="14" y="12" width="7" height="9" rx="1" /><rect x="3" y="16" width="7" height="5" rx="1" /></Svg>
);
export const IconCart = (p) => (
  <Svg {...p}><circle cx="8" cy="21" r="1.5" /><circle cx="18" cy="21" r="1.5" /><path d="M2.5 3h2l2.6 12.4a1 1 0 0 0 1 .8h9.7a1 1 0 0 0 1-.8L20.5 7H6" /></Svg>
);
export const IconBox = (p) => (
  <Svg {...p}><path d="M21 8l-9-5-9 5v8l9 5 9-5V8z" /><path d="M3.3 8.3L12 13l8.7-4.7" /><path d="M12 22V13" /></Svg>
);
export const IconReceipt = (p) => (
  <Svg {...p}><path d="M5 3h14v18l-2.3-1.6L14.4 21l-2.4-1.6L9.6 21l-2.3-1.6L5 21V3z" /><path d="M9 8h6M9 12h6" /></Svg>
);
export const IconWallet = (p) => (
  <Svg {...p}><path d="M20 7H5a2 2 0 0 1 0-4h13v4" /><path d="M20 7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5" /><circle cx="17" cy="14" r="1.4" /></Svg>
);
export const IconGlobe = (p) => (
  <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M3 12h18" /><path d="M12 3c2.7 2.6 4 5.6 4 9s-1.3 6.4-4 9c-2.7-2.6-4-5.6-4-9s1.3-6.4 4-9z" /></Svg>
);
export const IconLogout = (p) => (
  <Svg {...p}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5" /><path d="M21 12H9" /></Svg>
);
export const IconTimer = (p) => (
  <Svg {...p}><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2.5 2.5" /><path d="M9 2h6" /></Svg>
);

export const IconPlus = (p) => (
  <Svg {...p}><path d="M12 5v14M5 12h14" /></Svg>
);
export const IconMinus = (p) => (
  <Svg {...p}><path d="M5 12h14" /></Svg>
);
export const IconTrash = (p) => (
  <Svg {...p}><path d="M3 6h18" /><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" /><path d="M19 6l-1 14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1L5 6" /><path d="M10 11v6M14 11v6" /></Svg>
);
export const IconSearch = (p) => (
  <Svg {...p}><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></Svg>
);
export const IconCheck = (p) => (
  <Svg {...p}><path d="M20 6L9 17l-5-5" /></Svg>
);
export const IconAlert = (p) => (
  <Svg {...p}><path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><path d="M12 9v4M12 17h.01" /></Svg>
);
export const IconCash = (p) => (
  <Svg {...p}><rect x="2" y="6" width="20" height="12" rx="2" /><circle cx="12" cy="12" r="2.6" /><path d="M6 12h.01M18 12h.01" /></Svg>
);
export const IconPhone = (p) => (
  <Svg {...p}><rect x="7" y="2" width="10" height="20" rx="2" /><path d="M11 18h2" /></Svg>
);
export const IconWhatsApp = (p) => (
  <Svg {...p}><path d="M12 3a9 9 0 0 0-7.8 13.5L3 21l4.6-1.2A9 9 0 1 0 12 3z" /><path d="M9 9.5c0 3 2.5 5.5 5.5 5.5.6 0 1-.4 1-1v-.8l-1.8-.7-.9.9a5.4 5.4 0 0 1-2.2-2.2l.9-.9-.7-1.8H10c-.6 0-1 .4-1 1z" /></Svg>
);
export const IconDownload = (p) => (
  <Svg {...p}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="M7 10l5 5 5-5" /><path d="M12 15V3" /></Svg>
);
export const IconSend = (p) => (
  <Svg {...p}><path d="M22 2L11 13" /><path d="M22 2l-7 20-4-9-9-4 20-7z" /></Svg>
);

export const IconStar = (p) => (
  <Svg {...p}><path d="M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1L12 2z" /></Svg>
);
export const IconTruck = (p) => (
  <Svg {...p}><path d="M1 4h13v12H1z" /><path d="M14 8h4l3 3v5h-7" /><circle cx="6" cy="19" r="2" /><circle cx="17.5" cy="19" r="2" /></Svg>
);
export const IconTrendUp = (p) => (
  <Svg {...p}><path d="M22 7l-8.5 8.5-5-5L2 17" /><path d="M16 7h6v6" /></Svg>
);
export const IconUsers = (p) => (
  <Svg {...p}><circle cx="9" cy="8" r="3.5" /><path d="M2.5 21a6.5 6.5 0 0 1 13 0" /><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8" /><path d="M17.5 14.7a6.5 6.5 0 0 1 4 6.3" /></Svg>
);
export const IconMenu = (p) => (
  <Svg {...p}><path d="M3 6h18M3 12h18M3 18h18" /></Svg>
);
export const IconX = (p) => (
  <Svg {...p}><path d="M18 6L6 18M6 6l12 12" /></Svg>
);
export const IconCoins = (p) => (
  <Svg {...p}><circle cx="8" cy="8" r="5.5" /><path d="M14.2 9.2a5.5 5.5 0 1 1-5 5" /><path d="M6.5 8h3M8 6.5v3" /><path d="M15 14.5h3M16.5 13v3" /></Svg>
);

export const IconPhonePay = (p) => (
  <Svg {...p}><rect x="6" y="2" width="12" height="20" rx="2.5" /><path d="M10.5 18.5h3" /><path d="M9.5 8.5l2.5-2 2.5 2" /><path d="M12 6.5V13" /><path d="M9.5 11.5h5" /></Svg>
);

export const IconClock = (p) => (
  <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></Svg>
);

export const IconShield = (p) => (
  <Svg {...p}><path d="M12 2.5l8 3v6c0 5-3.4 8.6-8 10-4.6-1.4-8-5-8-10v-6l8-3z" /><path d="M8.8 12l2.2 2.2 4.2-4.4" /></Svg>
);

export const IconSpinner = ({ size = 20, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={`animate-spin ${className}`} aria-hidden="true">
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" opacity="0.25" />
    <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
  </svg>
);
export const IconLogo = ({ size = 28, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="none" className={className} aria-hidden="true">
    <rect x="2" y="2" width="28" height="28" rx="8" fill="#2563EB" />
    <path d="M8 13l1.6-5h12.8L24 13" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M9 13v10.4a.6.6 0 0 0 .6.6h12.8a.6.6 0 0 0 .6-.6V13" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M8 13a2.6 2.6 0 0 0 5.3 0A2.6 2.6 0 0 0 18.7 13 2.6 2.6 0 0 0 24 13" stroke="#F59E0B" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M13 24v-5h6v5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** Brand mark + wordmark for sidebars and auth screens. */
export function LogoLockup({ compact = false }) {
  return (
    <div className="flex items-center gap-2.5">
      <IconLogo size={30} />
      {!compact && (
        <div className="leading-tight">
          <div className="text-white font-bold text-[15px] tracking-tight">Ghana Stores</div>
          <div className="text-slate-400 text-[10px] uppercase tracking-[0.18em]">Seller Platform</div>
        </div>
      )}
    </div>
  );
}


