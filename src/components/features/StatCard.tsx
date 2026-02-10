import { type ReactNode } from "react";
import { cn } from "@/lib/utils/format";

interface StatCardProps {
  label: string;
  value: string | number;
  delta?: string;
  trend?: "up" | "down" | "neutral";
  icon?: ReactNode;
  variant?: "default" | "success" | "warning" | "info";
}

export function StatCard({
  label,
  value,
  delta,
  trend = "neutral",
  icon,
  variant = "default",
}: StatCardProps) {
  const variants = {
    default: "border-gray-200 bg-white",
    success: "border-green-200 bg-green-50",
    warning: "border-orange-200 bg-orange-50",
    info: "border-blue-200 bg-blue-50",
  };

  const trendColors = {
    up: "text-green-600",
    down: "text-red-600",
    neutral: "text-gray-600",
  };

  const trendIcons = {
    up: "↗",
    down: "↘",
    neutral: "→",
  };

  return (
    <div className={cn("rounded-lg border p-6", variants[variant])}>
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-600">{label}</p>
        {icon && <div className="text-2xl">{icon}</div>}
      </div>
      <p className="mt-2 text-3xl font-bold text-gray-900">{value}</p>
      {delta && (
        <div className={cn("mt-2 flex items-center text-sm", trendColors[trend])}>
          <span className="mr-1">{trendIcons[trend]}</span>
          <span>{delta}</span>
        </div>
      )}
    </div>
  );
}