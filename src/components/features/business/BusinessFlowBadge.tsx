import { Badge } from "@/components/ui/Badge";

type BusinessFlowValue = string | null | undefined;

function toLabel(value: BusinessFlowValue) {
  switch (value) {
    case "GOODS":
      return "Goods";
    case "SERVICE":
      return "Service";
    case "MIXED":
      return "Mixed";
    default:
      return "-";
  }
}

function toVariant(value: BusinessFlowValue): "info" | "success" | "warning" | "default" {
  switch (value) {
    case "GOODS":
      return "info";
    case "SERVICE":
      return "success";
    case "MIXED":
      return "warning";
    default:
      return "default";
  }
}

export function BusinessFlowBadge({ value }: { value: BusinessFlowValue }) {
  return <Badge variant={toVariant(value)}>{toLabel(value)}</Badge>;
}
