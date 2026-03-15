import { CSSProperties, useEffect, useMemo, useState } from 'react';
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

const desktopLinkStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  padding: '12px 10px',
  fontSize: 14,
  fontWeight: 500,
  borderBottom: '2px solid transparent',
  textDecoration: 'none',
  whiteSpace: 'nowrap',
};

const mobileLinkStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '12px 14px',
  fontSize: 14,
  fontWeight: 500,
  borderRadius: 10,
  textDecoration: 'none',
};

function LinkItem({ item, onClick, mobile = false }: { item: NavItem; onClick?: () => void; mobile?: boolean }): JSX.Element {
  return (
    <NavLink
      to={item.path}
      onClick={onClick}
      style={({ isActive }) => ({
        ...(mobile ? mobileLinkStyle : desktopLinkStyle),
        color: isActive ? '#c4622d' : '#5a5570',
        borderBottomColor: mobile ? 'transparent' : isActive ? '#c4622d' : 'transparent',
        background: mobile && isActive ? 'var(--surface2)' : 'transparent',
        fontWeight: isActive ? 700 : 500,
      })}
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
    <nav
      style={{
        position: 'relative',
        zIndex: 20,
        background: '#ffffff',
        borderBottom: '1px solid #e8e2d9',
      }}
    >
      <div
        style={{
          maxWidth: '1280px',
          margin: '0 auto',
          padding: isMobile ? '0 16px' : '0 24px',
          minHeight: 52,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        {!isMobile ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 2,
              overflowX: 'auto',
              scrollbarWidth: 'thin',
              width: '100%',
            }}
          >
            {filteredItems.map((item) => (
              <LinkItem key={item.path} item={item} />
            ))}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              minHeight: 40,
              padding: '8px 12px',
              borderRadius: 10,
              border: '1px solid var(--border)',
              background: 'var(--surface)',
              color: 'var(--text-hi)',
              cursor: 'pointer',
              margin: '6px 0',
            }}
          >
            {open ? <X size={18} /> : <Menu size={18} />}
            <span style={{ fontSize: 14, fontWeight: 600 }}>Menu</span>
          </button>
        )}
      </div>

      {isMobile && open ? (
        <div
          style={{
            borderTop: '1px solid #e8e2d9',
            padding: '10px 16px 14px',
            background: '#ffffff',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxWidth: '1280px', margin: '0 auto' }}>
            {filteredItems.map((item) => (
              <LinkItem key={item.path} item={item} mobile onClick={() => setOpen(false)} />
            ))}
          </div>
        </div>
      ) : null}
    </nav>
  );
}
