"use client";

import Link from "next/link";

interface BreadcrumbsProps {
  currentPath: string;
}

export function Breadcrumbs({ currentPath }: BreadcrumbsProps) {
  // Parse the path to generate breadcrumb items
  const pathSegments = currentPath.split("/").filter(Boolean);

  // If we're on the home page, don't show breadcrumbs
  if (pathSegments.length === 0) {
    return null;
  }

  const breadcrumbs = [
    { label: "Home", href: "/" },
    ...pathSegments.map((segment, index) => {
      const href = `/${pathSegments.slice(0, index + 1).join("/")}`;
      const label = segment
        .split("-")
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ");

      return { label, href };
    }),
  ];

  return (
    <nav className="flex" aria-label="Breadcrumb">
      <ol className="flex items-center space-x-2">
        {breadcrumbs.map((crumb, index) => {
          const isLast = index === breadcrumbs.length - 1;

          return (
            <li key={crumb.href} className="flex items-center">
              {index > 0 && (
                <svg
                  className="mx-2 h-5 w-5 text-gray-400"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
              )}
              {isLast ? (
                <span className="text-sm font-medium text-gray-700">
                  {crumb.label}
                </span>
              ) : (
                <Link
                  href={crumb.href}
                  className="text-sm font-medium text-gray-500 hover:text-gray-700"
                >
                  {crumb.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}