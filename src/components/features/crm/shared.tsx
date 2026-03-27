"use client";

import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils/format";

export const crmInputClassName =
  "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500";

export const crmTextareaClassName = cn(crmInputClassName, "min-h-28 resize-y");

type CrmActionTone = "default" | "primary" | "danger" | "success";

function crmActionIconClassName(tone: CrmActionTone, className?: string) {
  return cn(
    "inline-flex h-9 w-9 items-center justify-center rounded-lg border bg-white transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-40",
    {
      default: "border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50 hover:text-gray-900 focus:ring-gray-300",
      primary: "border-blue-200 text-blue-600 hover:bg-blue-50 hover:text-blue-700 focus:ring-blue-400",
      danger: "border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 focus:ring-red-300",
      success: "border-emerald-200 text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700 focus:ring-emerald-300",
    }[tone],
    className,
  );
}

export function CrmActionIconLink({
  href,
  label,
  tone = "default",
  className,
  children,
}: {
  href: string;
  label: string;
  tone?: CrmActionTone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      title={label}
      className={crmActionIconClassName(tone, className)}
    >
      {children}
    </Link>
  );
}

export function CrmActionIconButton({
  label,
  tone = "default",
  className,
  children,
  type = "button",
  ...props
}: {
  label: string;
  tone?: CrmActionTone;
  className?: string;
  children: ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={crmActionIconClassName(tone, className)}
      {...props}
    >
      {children}
    </button>
  );
}

export function CrmMetricCard({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper?: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="mt-2 text-2xl font-bold text-gray-900">{value}</p>
      {helper ? <p className="mt-2 text-xs text-gray-500">{helper}</p> : null}
    </div>
  );
}

export function CrmPanel({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-xl border border-gray-200 bg-white p-5 shadow-sm", className)}>
      <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
      {description ? <p className="mt-1 text-sm text-gray-500">{description}</p> : null}
      <div className="mt-4 space-y-3">{children}</div>
    </section>
  );
}

export function CrmInfoRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-gray-400">{label}</p>
      <div className="mt-1 text-sm text-gray-700">{value}</div>
    </div>
  );
}

export function CrmEmptyHint({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 p-4 text-sm text-gray-500">
      {text}
    </div>
  );
}

export function CrmTabs<T extends string>({
  value,
  onChange,
  items,
}: {
  value: T;
  onChange: (value: T) => void;
  items: Array<{ id: T; label: string; count?: number }>;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => {
        const active = item.id === value;

        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onChange(item.id)}
            className={cn(
              "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-colors",
              active
                ? "border-blue-200 bg-blue-50 text-blue-700"
                : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50",
            )}
          >
            <span>{item.label}</span>
            {item.count !== undefined ? (
              <span className="rounded-full bg-white/80 px-2 py-0.5 text-xs text-gray-500">
                {item.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
