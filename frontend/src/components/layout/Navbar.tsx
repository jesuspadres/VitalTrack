import { useCallback, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';

interface NavbarProps {
  onMenuToggle: () => void;
}

export function Navbar({ onMenuToggle }: NavbarProps) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [signingOut, setSigningOut] = useState(false);

  const handleSignOut = useCallback(async () => {
    setSigningOut(true);
    try {
      await signOut();
      navigate('/login');
    } catch {
      setSigningOut(false);
    }
  }, [signOut, navigate]);

  return (
    <header className="fixed top-0 left-0 right-0 z-30 flex h-16 items-center justify-between px-4 sm:px-6 glass-heavy border-b-0"
      style={{ borderBottom: '1px solid rgba(255,255,255,0.25)' }}
    >
      {/* Left side: hamburger + logo */}
      <div className="flex items-center gap-3">
        {/* Mobile hamburger */}
        <button
          type="button"
          className="rounded-xl p-2 text-slate-500 hover:bg-white/40 hover:text-slate-700 transition-all duration-200 lg:hidden"
          onClick={onMenuToggle}
          aria-label="Toggle navigation menu"
        >
          <svg
            className="h-5 w-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M4 6h16M4 12h16M4 18h16"
            />
          </svg>
        </button>

        {/* Logo */}
        <Link
          to="/dashboard"
          className="flex items-center gap-2.5 group"
        >
          {/* Heart-pulse icon with gradient */}
          <div className="relative">
            <div className="absolute inset-0 rounded-lg bg-gradient-to-br from-primary-400 to-primary-600 opacity-20 blur-md group-hover:opacity-30 transition-opacity" />
            <svg
              className="relative h-7 w-7 text-primary-500 group-hover:text-primary-600 transition-colors"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M19.5 12.572L12 20l-7.5-7.428A5 5 0 1112 6.006a5 5 0 017.5 6.572" />
              <path d="M4 12h4l2-3 3 6 2-3h5" />
            </svg>
          </div>
          <span className="text-lg font-bold tracking-tight bg-gradient-to-r from-primary-600 to-primary-500 bg-clip-text text-transparent">
            VitalTrack
          </span>
        </Link>
      </div>

      {/* Right side: user info + sign out */}
      <div className="flex items-center gap-4">
        {user && (
          <span className="hidden text-sm text-slate-500 font-medium sm:inline">
            {user.email}
          </span>
        )}
        <button
          type="button"
          className="btn-secondary text-sm !py-2 !px-4"
          onClick={handleSignOut}
          disabled={signingOut}
        >
          {signingOut ? 'Signing out...' : 'Sign Out'}
        </button>
      </div>
    </header>
  );
}
