import {
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  BookOpen,
  Boxes,
  Calendar,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Clock3,
  Crosshair,
  Lock,
  type LucideIcon,
  Menu,
  PackageSearch,
  Plus,
  Search,
  ShoppingBag,
  Stamp,
  Store,
  UserRound,
  UsersRound,
  X,
  ZoomIn,
} from "lucide-react";

/* The Pen design uses Lucide icons by name (data-icon-name in its exports). */
const ICONS = {
  "arrow-right": ArrowRight,
  "arrow-up-right": ArrowUpRight,
  "badge-check": BadgeCheck,
  "book-open": BookOpen,
  boxes: Boxes,
  calendar: Calendar,
  "chevron-down": ChevronDown,
  "chevron-right": ChevronRight,
  "chevron-up": ChevronUp,
  "clock-3": Clock3,
  crosshair: Crosshair,
  lock: Lock,
  menu: Menu,
  "package-search": PackageSearch,
  plus: Plus,
  search: Search,
  "shopping-bag": ShoppingBag,
  stamp: Stamp,
  store: Store,
  "user-round": UserRound,
  "users-round": UsersRound,
  x: X,
  "zoom-in": ZoomIn,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof ICONS;

export function Icon({ name, size, className }: { name: IconName; size: number; className?: string }) {
  const Glyph = ICONS[name];
  return <Glyph size={size} strokeWidth={2} className={className} aria-hidden="true" focusable="false" />;
}
