"use client";

import type { Session } from "next-auth";
import { signOut } from "next-auth/react";
import { Bell, ChevronDown, PanelLeft, Search } from "lucide-react";
import { TenantSwitcher } from "@/components/navigation/TenantSwitcher";

interface TopHeaderProps {
  session: Session;
  onMenuClick: () => void;
}

export function TopHeader({ session, onMenuClick }: TopHeaderProps) {
  const roleLabel =
    session.user.role
      ?.toLowerCase()
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ") ?? "User";

  return (
    <header className="flex h-[72px] items-center justify-between border-b border-gray-200 bg-white px-4 lg:px-6">
      <button
        onClick={onMenuClick}
        className="rounded-md p-2 text-gray-500 hover:bg-gray-100 lg:hidden"
        aria-label="Toggle menu"
      >
        <PanelLeft className="h-5 w-5" />
      </button>

      <button
        onClick={onMenuClick}
        className="hidden rounded-md p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 lg:inline-flex"
        aria-label="Toggle sidebar"
      >
        <PanelLeft className="h-5 w-5" />
      </button>

      <div className="mx-3 hidden max-w-3xl flex-1 lg:block">
        <div className="relative">
          <input
            type="search"
            placeholder="Cari permintaan bisnis trip dan claim..."
            className="h-11 w-full rounded-md border border-gray-300 bg-[#f5f5f6] py-2 pr-4 pl-11 text-sm text-gray-700 placeholder:text-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none"
          />
          <Search className="absolute top-3 left-3.5 h-4.5 w-4.5 text-gray-400" />
        </div>
      </div>

      <div className="flex items-center gap-2 lg:gap-4">
        <div className="hidden 2xl:block">
          <TenantSwitcher session={session} />
        </div>
        <button
          className="relative rounded-md p-2 text-gray-700 hover:bg-gray-100"
          aria-label="Notifications"
        >
          <Bell className="h-5 w-5" />
        </button>

        <div className="h-8 w-px bg-gray-200" />

        <div className="relative hidden sm:block">
          <button
            className="flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-gray-100"
            aria-label="User menu"
          >
            <div className="text-right leading-tight">
              <p className="text-sm font-medium text-gray-700">
                {session.user.name}
              </p>
              <p className="text-xs text-gray-400">{roleLabel}</p>
            </div>
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-violet-200 text-sm font-medium text-violet-700">
              {session.user.name?.charAt(0) ?? "U"}
            </div>
            <ChevronDown className="h-4 w-4 text-gray-500" />
          </button>
        </div>

        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="hidden rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 xl:block"
        >
          Sign Out
        </button>
      </div>
    </header>
  );
}
