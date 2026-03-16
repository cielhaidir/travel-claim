import { Badge } from "@/components/ui/Badge";
import {
  TRAVEL_STATUS_CONFIG,
  CLAIM_STATUS_CONFIG,
  type TravelStatus,
  type ClaimStatus,
} from "@/lib/constants/status";

interface StatusBadgeProps {
  status: TravelStatus | ClaimStatus;
  type: "travel" | "claim";
}

export function StatusBadge({ status, type }: StatusBadgeProps) {
  const config =
    type === "travel"
      ? TRAVEL_STATUS_CONFIG[status as TravelStatus]
      : CLAIM_STATUS_CONFIG[status as ClaimStatus];

  if (!config) {
    return (
      <Badge variant="default">
        {status}
      </Badge>
    );
  }

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${config.color} ${config.bgColor}`}
    >
      {config.label}
    </span>
  );
}