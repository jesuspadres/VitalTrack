import { useState, useCallback, type ReactNode } from 'react';
import { Navbar } from './Navbar';
import { Sidebar } from './Sidebar';

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleMenuToggle = useCallback(() => {
    setSidebarOpen((prev) => !prev);
  }, []);

  const handleSidebarClose = useCallback(() => {
    setSidebarOpen(false);
  }, []);

  return (
    <div className="min-h-screen bg-[#f0f9ff] relative">
      {/* Ambient gradient mesh background */}
      <div className="bg-mesh" aria-hidden="true">
        <div className="bg-orb-center" />
      </div>

      {/* App chrome */}
      <Navbar onMenuToggle={handleMenuToggle} />
      <Sidebar isOpen={sidebarOpen} onClose={handleSidebarClose} />

      {/* Main content area */}
      <main className="relative z-10 pt-16 lg:pl-60">
        <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
