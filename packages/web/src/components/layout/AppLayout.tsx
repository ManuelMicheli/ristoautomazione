import { Outlet } from 'react-router-dom';
import { Sidebar, SidebarProvider, useSidebar } from './Sidebar';
import { Header } from './Header';
import { ToastProvider } from '@/components/ui/Toast';

function MainContent() {
  const { collapsed } = useSidebar();

  return (
    <div
      className="flex flex-1 flex-col overflow-hidden transition-[margin-left] duration-300"
      style={{ marginLeft: collapsed ? 64 : 280 }}
    >
      {/* Header */}
      <Header />

      {/* Page content */}
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-7xl p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

export default function AppLayout() {
  return (
    <ToastProvider>
      <SidebarProvider>
        <div className="flex h-screen overflow-hidden bg-gray-50 dark:bg-slate-900">
          {/* Sidebar */}
          <Sidebar />

          {/* Main area */}
          <MainContent />
        </div>
      </SidebarProvider>
    </ToastProvider>
  );
}
