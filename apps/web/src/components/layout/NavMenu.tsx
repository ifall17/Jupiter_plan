import { useEffect, useMemo, useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeftRight,
  BarChart2,
  FileSpreadsheet,
  FileText,
  GitBranch,
  LayoutDashboard,
  Menu,
  Settings,
  TrendingUp,
  Users,
  X,
} from 'lucide-react';
import { UserRole } from '@web/shared/enums';
import { useAuthStore } from '../../stores/auth.store';

type NavItem = {
  label: string;
  path: string;
  roles: UserRole[];
  icon: typeof LayoutDashboard;
};

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', path: '/dashboard', roles: [UserRole.SUPER_ADMIN, UserRole.FPA, UserRole.LECTEUR], icon: LayoutDashboard },
  { label: 'Budget', path: '/budget', roles: [UserRole.SUPER_ADMIN, UserRole.FPA, UserRole.CONTRIBUTEUR], icon: FileSpreadsheet },
  { label: 'Transactions', path: '/transactions', roles: [UserRole.SUPER_ADMIN, UserRole.FPA, UserRole.CONTRIBUTEUR], icon: ArrowLeftRight },
  { label: 'Scenarios', path: '/scenarios', roles: [UserRole.SUPER_ADMIN, UserRole.FPA, UserRole.LECTEUR], icon: GitBranch },
  { label: 'Cash Flow', path: '/cashflow', roles: [UserRole.SUPER_ADMIN, UserRole.FPA], icon: TrendingUp },
  { label: 'KPIs', path: '/kpis', roles: [UserRole.SUPER_ADMIN, UserRole.FPA, UserRole.LECTEUR], icon: BarChart2 },
  { label: 'Alertes', path: '/alerts', roles: [UserRole.SUPER_ADMIN, UserRole.FPA, UserRole.LECTEUR], icon: AlertTriangle },
  { label: 'Rapports', path: '/reports', roles: [UserRole.SUPER_ADMIN, UserRole.FPA, UserRole.LECTEUR], icon: FileText },
  { label: 'Utilisateurs', path: '/users', roles: [UserRole.SUPER_ADMIN], icon: Users },
  { label: 'Parametres', path: '/settings', roles: [UserRole.SUPER_ADMIN], icon: Settings },
];

function LinkItem({ item, onClick, mobile = false }: { item: NavItem; onClick?: () => void; mobile?: boolean }): JSX.Element {
  return (
    <NavLink
      to={item.path}
      onClick={onClick}
      className={({ isActive }) => {
        const base = mobile ? 'nav-menu-link nav-menu-link-mobile' : 'nav-menu-link nav-menu-link-desktop';
        return isActive ? `${base} nav-menu-link-active` : base;
      }}
    >
      <item.icon size={16} />
      <span>{item.label}</span>
    </NavLink>
  );
}

export default function NavMenu(): JSX.Element {
  const hasRole = useAuthStore((state) => state.hasRole);
  const [open, setOpen] = useState<boolean>(false);
  const [isMobile, setIsMobile] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.matchMedia('(max-width: 767px)').matches : false,
  );

  const filteredItems = useMemo(() => NAV_ITEMS.filter((item) => hasRole(item.roles)), [hasRole]);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 767px)');
    const onChange = (event: MediaQueryListEvent) => {
      setIsMobile(event.matches);
      if (!event.matches) {
        setOpen(false);
      }
    };

    setIsMobile(mediaQuery.matches);
    mediaQuery.addEventListener('change', onChange);
    return () => mediaQuery.removeEventListener('change', onChange);
  }, []);

  return (
    <nav className="nav-menu-root">
      <div className={`nav-menu-inner ${isMobile ? 'nav-menu-inner-mobile' : 'nav-menu-inner-desktop'}`}>
        {!isMobile ? (
          <div className="nav-menu-desktop-links">
            {filteredItems.map((item) => (
              <LinkItem key={item.path} item={item} />
            ))}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            className="nav-menu-mobile-toggle"
          >
            {open ? <X size={18} /> : <Menu size={18} />}
            <span className="nav-menu-mobile-toggle-text">Menu</span>
          </button>
        )}
      </div>

      {isMobile && open ? (
        <div className="nav-menu-mobile-panel">
          <div className="nav-menu-mobile-links">
            {filteredItems.map((item) => (
              <LinkItem key={item.path} item={item} mobile onClick={() => setOpen(false)} />
            ))}
          </div>
        </div>
      ) : null}
    </nav>
  );
}
