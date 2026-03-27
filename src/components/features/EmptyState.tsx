import { type ReactNode } from "react";
import { FileText } from "lucide-react";
import { Button } from "@/components/ui/Button";

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description: string;
  action?: {
    label: string;
    href?: string;
    onClick?: () => void;
  };
  children?: ReactNode;
}

export function EmptyState({
  icon = <FileText className="h-14 w-14 text-gray-400" strokeWidth={1.75} />,
  title,
  description,
  action,
  children,
}: EmptyStateProps) {
  return (
    <div className="py-12 text-center">
      <div className="mb-4 flex justify-center">{icon}</div>
      <h3 className="mb-2 text-lg font-semibold text-gray-900">{title}</h3>
      <p className="mx-auto mb-6 max-w-md text-gray-600">{description}</p>
      {action && (
        <>
          {action.href ? (
            <a
              href={action.href}
              className="inline-block rounded-lg bg-blue-600 px-6 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              {action.label}
            </a>
          ) : (
            <Button onClick={action.onClick}>{action.label}</Button>
          )}
        </>
      )}
      {children}
    </div>
  );
}
