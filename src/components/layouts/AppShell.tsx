"use client";

import { useState } from "react";
import type { Session } from "next-auth";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { SidebarNav } from "@/components/navigation/SidebarNav";
import { TopHeader } from "@/components/navigation/TopHeader";
import { ToastProvider } from "@/components/ui/Toast";

interface AppShellProps {
  children: React.ReactNode;
  session: Session;
}

export function AppShell({ children, session }: AppShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = usePathname();

  return (
    <ToastProvider>
      <div className="flex h-screen overflow-hidden bg-gray-50">
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-40 bg-gray-900 bg-opacity-50 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        <aside
          className={`fixed inset-y-0 left-0 z-50 w-64 transform bg-white transition-transform duration-300 ease-in-out lg:static lg:translate-x-0 ${
            sidebarOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="flex h-full flex-col">
            <div className="flex h-16 items-center border-b px-6">
              <Link href="/" className="flex items-center space-x-2">
                <div className="h-8 w-8 rounded-lg bg-blue-600" />
                <span className="text-lg font-semibold text-gray-900">
                  Travel & Claim
                </span>
              </Link>
            </div>

            <SidebarNav
              session={session}
              currentPath={pathname}
              onNavigate={() => setSidebarOpen(false)}
            />

            <div className="border-t p-4">
              <div className="flex items-center space-x-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-600 font-semibold text-white">
                  {session.user.name?.charAt(0) ?? "U"}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-gray-900">
                    {session.user.name}
                  </p>
                  <p className="truncate text-xs text-gray-500">
                    {session.user.email}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </aside>

        <div className="flex flex-1 flex-col overflow-hidden">
          <TopHeader
            session={session}
            onMenuClick={() => setSidebarOpen(!sidebarOpen)}
          />

          <main className="flex-1 overflow-y-auto">
            <div className="container mx-auto px-4 py-6 lg:px-8">
              <div className="mt-6">{children}</div>
            </div>
          </main>
        </div>
      </div>
    </ToastProvider>
  );
}
