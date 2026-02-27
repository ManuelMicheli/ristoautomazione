import { useState, useEffect, createContext, useContext, type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  LayoutDashboard,
  Building2,
  Package,
  ShoppingCart,
  ClipboardCheck,
  FileText,
  Settings,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  Sparkles,
  Repeat,
} from 'lucide-react';
import { cn } from '@/utils/cn';
import { Tooltip } from '@/components/ui/Tooltip';

// --- Sidebar context for sharing collapsed state ---
const SIDEBAR_KEY = 'cph-sidebar-collapsed';

interface SidebarContextValue {
  collapsed: boolean;
  setCollapsed: (value: boolean) => void;
  toggle: () => void;
}

const SidebarContext = createContext<SidebarContextValue>({
  collapsed: false,
  setCollapsed: () => {},
  toggle: () => {},
});

export function useSidebar() {
  return useContext(SidebarContext);
}

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsedState] = useState(() => {
    const stored = localStorage.getItem(SIDEBAR_KEY);
    return stored === 'true';
  });

  useEffect(() => {
    localStorage.setItem(SIDEBAR_KEY, String(collapsed));
  }, [collapsed]);

  const setCollapsed = (value: boolean) => setCollapsedState(value);
  const toggle = () => setCollapsedState((prev) => !prev);

  return (
    <SidebarContext.Provider value={{ collapsed, setCollapsed, toggle }}>
      {children}
    </SidebarContext.Provider>
  );
}

// --- Navigation configuration ---
interface NavItem {
  label: string;
  path: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const navSections: NavSection[] = [
  {
    title: 'Principale',
    items: [
      { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
    ],
  },
  {
    title: 'Acquisti',
    items: [
      { label: 'Lista della Spesa', path: '/spesa', icon: Sparkles },
      { label: 'Template Ordini', path: '/spesa/templates', icon: Repeat },
      { label: 'Fornitori', path: '/suppliers', icon: Building2 },
      { label: 'Prodotti', path: '/products', icon: Package },
      { label: 'Ordini', path: '/orders', icon: ShoppingCart },
    ],
  },
  {
    title: 'Controllo',
    items: [
      { label: 'Ricezione', path: '/receiving', icon: ClipboardCheck },
      { label: 'Fatture', path: '/invoices', icon: FileText },
    ],
  },
  {
    title: 'Sistema',
    items: [
      { label: 'Impostazioni', path: '/settings', icon: Settings },
    ],
  },
];

// --- Sidebar component ---
export function Sidebar() {
  const { collapsed, toggle } = useSidebar();
  const location = useLocation();

  return (
    <motion.aside
      initial={false}
      animate={{ width: collapsed ? 64 : 280 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className="fixed inset-y-0 left-0 z-40 flex flex-col border-r border-gray-200 bg-white dark:border-slate-700 dark:bg-slate-800 overflow-hidden"
    >
      {/* Logo */}
      <div className="flex h-16 items-center gap-3 border-b border-gray-200 px-4 dark:border-slate-700">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-green/10">
          <ShieldCheck className="h-5 w-5 text-accent-green" />
        </div>
        {!collapsed && (
          <motion.span
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-lg font-bold text-slate-900 dark:text-white whitespace-nowrap"
          >
            CPH
          </motion.span>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4">
        {navSections.map((section) => (
          <div key={section.title} className="mb-4">
            {!collapsed && (
              <p className="mb-1 px-4 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                {section.title}
              </p>
            )}
            <ul className="space-y-0.5 px-2">
              {section.items.map((item) => {
                const isActive = location.pathname.startsWith(item.path);
                const linkContent = (
                  <NavLink
                    to={item.path}
                    className={cn(
                      'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors relative',
                      collapsed && 'justify-center px-0',
                      isActive
                        ? 'bg-slate-100 text-accent-green dark:bg-slate-700/50'
                        : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700/50'
                    )}
                  >
                    {isActive && (
                      <div className="absolute left-0 top-1/2 h-6 w-0.5 -translate-y-1/2 rounded-r bg-accent-green" />
                    )}
                    <item.icon className={cn('h-5 w-5 shrink-0', isActive && 'text-accent-green')} />
                    {!collapsed && (
                      <span className="whitespace-nowrap">{item.label}</span>
                    )}
                  </NavLink>
                );

                return (
                  <li key={item.path}>
                    {collapsed ? (
                      <Tooltip content={item.label} position="right" delay={100}>
                        {linkContent}
                      </Tooltip>
                    ) : (
                      linkContent
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Collapse toggle */}
      <div className="border-t border-gray-200 p-2 dark:border-slate-700">
        <button
          type="button"
          onClick={toggle}
          className="flex w-full items-center justify-center gap-2 rounded-lg p-2.5 text-sm text-slate-500 transition-colors hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700"
        >
          {collapsed ? (
            <ChevronRight className="h-5 w-5" />
          ) : (
            <>
              <ChevronLeft className="h-5 w-5" />
              <span className="whitespace-nowrap">Comprimi</span>
            </>
          )}
        </button>
      </div>
    </motion.aside>
  );
}
