type BadgeVariant = "default" | "secondary" | "destructive" | "outline";

const STATUS_VARIANTS: Record<string, BadgeVariant> = {
  QUEUED: "secondary",
  PLANNING: "secondary",
  GENERATING: "secondary",
  RENDERING: "secondary",
  QA: "secondary",
  REVIEW: "default",
  APPROVED: "outline",
  REJECTED: "destructive",
  DELIVERED: "outline",
  FAILED: "destructive",
};

export function statusVariant(status: string): BadgeVariant {
  return STATUS_VARIANTS[status] ?? "secondary";
}

export function formatUsd(value: string | number): string {
  const n = typeof value === "string" ? Number.parseFloat(value) : value;
  if (!Number.isFinite(n)) return "$0.00";
  return `$${n.toFixed(4)}`;
}
