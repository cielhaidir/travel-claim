import { type ReactNode } from "react";
import { Button } from "@/components/ui/Button";

interface PageHeaderProps {
  title: string;
  description?: string;
  badge?: ReactNode;
  primaryAction?: {
    label: string;
    href?: string;
    onClick?: () => void;
  };
  secondaryAction?: {
    label: string;
    href?: string;
    onClick?: () => void;
  };
}

export function PageHeader({
  title,
  description,
  badge,
  primaryAction,
  secondaryAction,
}: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex-1">
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-bold text-gray-900">{title}</h1>
          {badge}
        </div>
        {description && (
          <p className="mt-2 text-gray-600">{description}</p>
        )}
      </div>

      {(primaryAction || secondaryAction) && (
        <div className="flex items-center gap-3">
          {secondaryAction && (
            <>
              {secondaryAction.href ? (
                <a
                  href={secondaryAction.href}
                  className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                >
                  {secondaryAction.label}
                </a>
              ) : (
                <Button
                  variant="secondary"
                  onClick={secondaryAction.onClick}
                >
                  {secondaryAction.label}
                </Button>
              )}
            </>
          )}
          {primaryAction && (
            <>
              {primaryAction.href ? (
                <a
                  href={primaryAction.href}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                >
                  {primaryAction.label}
                </a>
              ) : (
                <Button onClick={primaryAction.onClick}>
                  {primaryAction.label}
                </Button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}