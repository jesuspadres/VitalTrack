import { useCallback } from 'react';
import { Link, useLocation } from 'react-router-dom';
import clsx from 'clsx';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

interface NavItem {
  label: string;
  to: string;
  icon: React.ReactNode;
}

const navItems: NavItem[] = [
  {
    label: 'Dashboard',
    to: '/dashboard',
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h3a2 2 0 012 2v3a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM13 6a2 2 0 012-2h3a2 2 0 012 2v3a2 2 0 01-2 2h-3a2 2 0 01-2-2V6zM4 15a2 2 0 012-2h3a2 2 0 012 2v3a2 2 0 01-2 2H6a2 2 0 01-2-2v-3zM13 15a2 2 0 012-2h3a2 2 0 012 2v3a2 2 0 01-2 2h-3a2 2 0 01-2-2v-3z" />
      </svg>
    ),
  },
  {
    label: 'Biomarkers',
    to: '/biomarkers',
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 13h2l3-8 4 16 3-8h6" />
      </svg>
    ),
  },
  {
    label: 'Upload',
    to: '/upload',
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5-5m0 0l5 5m-5-5v12" />
      </svg>
    ),
  },
  {
    label: 'Insights',
    to: '/insights',
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
      </svg>
    ),
  },
  {
    label: 'Profile',
    to: '/profile',
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
    ),
  },
];

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const location = useLocation();

  const isActive = useCallback(
    (path: string) => location.pathname === path || location.pathname.startsWith(path + '/'),
    [location.pathname],
  );

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/20 backdrop-blur-sm lg:hidden transition-opacity"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside
        className={clsx(
          'fixed top-16 left-0 z-40 h-[calc(100vh-4rem)] w-60 transition-transform duration-300 ease-out',
          'glass-heavy border-r-0',
          isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
        )}
        style={{ borderRight: '1px solid rgba(255,255,255,0.25)' }}
      >
        <nav className="flex flex-col gap-1 p-4" aria-label="Main navigation">
          {navItems.map((item) => {
            const active = isActive(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={onClose}
                className={clsx(
                  'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200',
                  active
                    ? 'glass-teal text-primary-700 shadow-sm'
                    : 'text-slate-500 hover:bg-white/40 hover:text-slate-700',
                )}
                aria-current={active ? 'page' : undefined}
              >
                <span
                  className={clsx(
                    'transition-colors duration-200',
                    active ? 'text-primary-500' : 'text-slate-400',
                  )}
                >
                  {item.icon}
                </span>
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Decorative bottom gradient */}
        <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-primary-50/30 to-transparent pointer-events-none" />
      </aside>
    </>
  );
}
