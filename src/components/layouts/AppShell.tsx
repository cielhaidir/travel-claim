"use client";

import { useState } from "react";
import type { Session } from "next-auth";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { PanelLeftClose } from "lucide-react";
import { SidebarNav } from "@/components/navigation/SidebarNav";
import { TopHeader } from "@/components/navigation/TopHeader";
import { ToastProvider } from "@/components/ui/Toast";

interface AppShellProps {
  children: React.ReactNode;
  session: Session;
}

export function AppShell({ children, session }: AppShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [desktopSidebarVisible, setDesktopSidebarVisible] = useState(true);
  const pathname = usePathname();
  const handleMenuClick = () => {
    if (typeof window !== "undefined" && window.innerWidth >= 1024) {
      setDesktopSidebarVisible((prev) => !prev);
      return;
    }

    setSidebarOpen((prev) => !prev);
  };

  return (
    <ToastProvider>
      <div className="flex h-screen overflow-hidden bg-[#f7f7f8]">
        {/* Mobile sidebar backdrop */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/25 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Sidebar */}
        <aside
          className={`fixed inset-y-0 left-0 z-50 w-[250px] transform border-r border-gray-200 bg-white transition-transform duration-300 ease-in-out lg:transition-[width,opacity] lg:duration-300 lg:ease-in-out ${
            sidebarOpen ? "translate-x-0" : "-translate-x-full"
          } ${
            desktopSidebarVisible
              ? "lg:static lg:w-[250px] lg:translate-x-0 lg:opacity-100"
              : "lg:static lg:w-0 lg:translate-x-0 lg:border-r-0 lg:opacity-0 lg:overflow-hidden lg:pointer-events-none"
          }`}
        >
          <div className="flex h-full flex-col">
            {/* Logo */}
            <div className="flex h-[72px] items-center justify-between border-b border-gray-200 px-5">
              <Link href="/" className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center text-blue-700">
                  <img
                    src="/svg/erp-icon.svg"
                    alt="ERP Logo"
                    className="h-5 w-5"
                    draggable={false}
                  />
                </div>
                <span className="text-[31px] font-semibold tracking-tight text-[#2f5ec7]">
                  ERP
                </span>
              </Link>
              <button
                onClick={() => setSidebarOpen(false)}
                className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 lg:hidden"
                aria-label="Close menu"
              >
                <PanelLeftClose className="h-4 w-4" />
              </button>
            </div>

            {/* Navigation */}
            <SidebarNav
              session={session}
              currentPath={pathname}
              onNavigate={() => setSidebarOpen(false)}
            />
          </div>
        </aside>

        {/* Main content */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Top header */}
          <TopHeader
            session={session}
            onMenuClick={handleMenuClick}
          />

          {/* Page content */}
          <main className="flex-1 overflow-y-auto">
            <div className="px-4 py-6 lg:px-8">
              {/* <Breadcrumbs currentPath={pathname} /> */}
              <div>{children}</div>
            </div>
          </main>
        </div>
      </div>
    </ToastProvider>
  );
}
