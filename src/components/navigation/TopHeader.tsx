"use client";

import { useEffect, useRef, useState } from "react";
import type { Session } from "next-auth";
import { signOut } from "next-auth/react";
import { Bell, ChevronDown, LogOut, PanelLeft, Search } from "lucide-react";

interface TopHeaderProps {
  session: Session;
  onMenuClick: () => void;
}

export function TopHeader({ session, onMenuClick }: TopHeaderProps) {
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const notificationRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const roleLabel =
    session.user.role
      ?.toLowerCase()
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ") ?? "User";

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        notificationRef.current &&
        !notificationRef.current.contains(event.target as Node)
      ) {
        setIsNotificationOpen(false);
      }

      if (
        userMenuRef.current &&
        !userMenuRef.current.contains(event.target as Node)
      ) {
        setIsUserMenuOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsNotificationOpen(false);
        setIsUserMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  return (
    <header className="flex h-[72px] items-center border-b border-[#B4B4B4] bg-white px-4 lg:px-6">
      <div className="flex min-w-0 flex-1 items-center">
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

        <div className="ml-3 hidden w-full max-w-3xl lg:block">
          <div className="relative">
            <input
              type="search"
              placeholder="Cari permintaan bisnis trip dan claim..."
              className="h-11 w-full rounded-md border border-gray-300 bg-[#f5f5f6] py-2 pr-4 pl-11 text-sm text-gray-700 placeholder:text-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none"
            />
            <Search className="absolute top-3 left-3.5 h-4.5 w-4.5 text-gray-400" />
          </div>
        </div>
      </div>

      <div className="ml-auto flex items-center gap-2 lg:gap-4">
        <div ref={notificationRef} className="relative">
          <button
            onClick={() => {
              setIsNotificationOpen((prev) => !prev);
              setIsUserMenuOpen(false);
            }}
            className="relative rounded-md p-2 text-gray-700 hover:bg-gray-100"
            aria-label="Notifications"
            aria-haspopup="menu"
            aria-expanded={isNotificationOpen}
          >
            <Bell className="h-5 w-5" />
            <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-blue-600" />
          </button>

          <div
            className={`absolute right-0 z-50 mt-2 w-80 origin-top-right rounded-xl border border-gray-200 bg-white p-3 shadow-lg transition-all duration-200 ease-out ${
              isNotificationOpen
                ? "translate-y-0 scale-100 opacity-100"
                : "pointer-events-none -translate-y-1 scale-95 opacity-0"
            }`}
            aria-hidden={!isNotificationOpen}
          >
            <div className="mb-3 flex items-center justify-between border-b border-gray-100 pb-2">
              <p className="text-sm font-semibold text-gray-900">Notifications</p>
              <button className="text-xs font-medium text-blue-600 hover:text-blue-700">
                Mark all as read
              </button>
            </div>

            <div className="space-y-2">
              <div className="rounded-lg bg-blue-50 p-3">
                <p className="text-sm font-medium text-gray-900">
                  Approval baru membutuhkan tindakan
                </p>
                <p className="mt-1 text-xs text-gray-500">
                  PRJ-2026-031 telah diajukan dan menunggu persetujuan Anda.
                </p>
              </div>
              <div className="rounded-lg border border-gray-200 p-3">
                <p className="text-sm font-medium text-gray-900">
                  Klaim disetujui
                </p>
                <p className="mt-1 text-xs text-gray-500">
                  Claim CLM-2026-014 sudah disetujui Finance.
                </p>
              </div>
              <div className="rounded-lg border border-gray-200 p-3">
                <p className="text-sm font-medium text-gray-900">
                  Pengajuan perjalanan direvisi
                </p>
                <p className="mt-1 text-xs text-gray-500">
                  Mohon lengkapi lampiran pada TRV-2026-008.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="h-8 w-px bg-gray-200" />

        <div ref={userMenuRef} className="relative hidden sm:block">
          <button
            onClick={() => {
              setIsUserMenuOpen((prev) => !prev);
              setIsNotificationOpen(false);
            }}
            className="flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-gray-100"
            aria-label="User menu"
            aria-haspopup="menu"
            aria-expanded={isUserMenuOpen}
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

          <div
            className={`absolute right-0 z-50 mt-2 w-72 origin-top-right rounded-xl border border-gray-200 bg-white p-3 shadow-lg transition-all duration-200 ease-out ${
              isUserMenuOpen
                ? "translate-y-0 scale-100 opacity-100"
                : "pointer-events-none -translate-y-1 scale-95 opacity-0"
            }`}
            aria-hidden={!isUserMenuOpen}
          >
              <div className="mb-3 border-b border-gray-100 pb-3">
                <p className="truncate text-sm font-semibold text-gray-900">
                  {session.user.name}
                </p>
                <p className="truncate text-xs text-gray-500">
                  {session.user.email}
                </p>
              </div>

              <div className="space-y-3">
                <button
                  onClick={() => signOut({ callbackUrl: "/login" })}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  <LogOut className="h-4 w-4" />
                  Sign Out
                </button>
              </div>
            </div>
        </div>
      </div>
    </header>
  );
}
