"use client";

import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils/format";

type PaginationToken = number | "left-ellipsis" | "right-ellipsis";

interface PaginationProps {
  page: number;
  pageSize: number;
  totalItems: number;
  onPageChange: (page: number) => void;
  itemLabel?: string;
  className?: string;
}

function buildPaginationTokens(
  currentPage: number,
  totalPages: number,
): PaginationToken[] {
  if (totalPages <= 5) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const tokens: PaginationToken[] = [1];
  const windowStart = Math.max(2, currentPage - 1);
  const windowEnd = Math.min(totalPages - 1, currentPage + 1);

  if (windowStart > 2) {
    tokens.push("left-ellipsis");
  }

  for (let page = windowStart; page <= windowEnd; page += 1) {
    tokens.push(page);
  }

  if (windowEnd < totalPages - 1) {
    tokens.push("right-ellipsis");
  }

  tokens.push(totalPages);

  return tokens;
}

export function Pagination({
  page,
  pageSize,
  totalItems,
  onPageChange,
  itemLabel = "items",
  className,
}: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const currentPage = Math.min(Math.max(page, 1), totalPages);
  const startItem = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endItem = totalItems === 0
    ? 0
    : Math.min(totalItems, currentPage * pageSize);
  const paginationTokens = buildPaginationTokens(currentPage, totalPages);
  const shouldShowControls = totalPages > 1;

  return (
    <div
      className={cn(
        "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
    >
      <p className="text-sm text-gray-500">
        Showing <span className="font-semibold text-gray-900">{startItem}</span>
        {" "}-{" "}
        <span className="font-semibold text-gray-900">{endItem}</span> of{" "}
        <span className="font-semibold text-gray-900">{totalItems}</span>{" "}
        {itemLabel}
      </p>

      {shouldShowControls ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage === 1}
          >
            Previous
          </Button>

          {paginationTokens.map((token) =>
            typeof token === "number" ? (
              <Button
                key={token}
                type="button"
                size="sm"
                variant={token === currentPage ? "primary" : "secondary"}
                onClick={() => onPageChange(token)}
              >
                {token}
              </Button>
            ) : (
              <span
                key={token}
                className="px-1 text-sm font-semibold text-gray-400"
              >
                ...
              </span>
            ),
          )}

          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
          >
            Next
          </Button>
        </div>
      ) : null}
    </div>
  );
}
