/* Line icons used in the site chrome (Pen uses Lucide: search, package-search, user-round, shopping-bag, menu, x, chevrons). */

const base = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;

export const SearchIcon = ({ className }: { className?: string }) => (
  <svg {...base} className={className}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </svg>
);
export const PackageIcon = ({ className }: { className?: string }) => (
  <svg {...base} className={className}>
    <path d="M21 10V8a2 2 0 0 0-1-1.7l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.7l7 4a2 2 0 0 0 2 0l2-1.1" />
    <path d="M3.3 7 12 12l8.7-5M12 22V12" />
    <circle cx="18.5" cy="15.5" r="2.5" />
    <path d="M20.3 17.3 22 19" />
  </svg>
);
export const UserIcon = ({ className }: { className?: string }) => (
  <svg {...base} className={className}>
    <circle cx="12" cy="8" r="5" />
    <path d="M20 21a8 8 0 0 0-16 0" />
  </svg>
);
export const MenuIcon = ({ className }: { className?: string }) => (
  <svg {...base} className={className}>
    <path d="M4 6h16M4 12h16M4 18h16" />
  </svg>
);
export const CloseIcon = ({ className }: { className?: string }) => (
  <svg {...base} className={className}>
    <path d="M18 6 6 18M6 6l12 12" />
  </svg>
);
export const ChevronDown = ({ className }: { className?: string }) => (
  <svg {...base} className={className}>
    <path d="m6 9 6 6 6-6" />
  </svg>
);
export const ChevronRight = ({ className }: { className?: string }) => (
  <svg {...base} className={className}>
    <path d="m9 18 6-6-6-6" />
  </svg>
);
export const ChevronLeft = ({ className }: { className?: string }) => (
  <svg {...base} className={className}>
    <path d="m15 18-6-6 6-6" />
  </svg>
);
