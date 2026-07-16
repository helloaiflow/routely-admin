// Re-export from the consolidated UI modules — single source of truth.
// (Do NOT reimplement these here; see src/lib/ui/status.ts + src/lib/ui/format.ts.)
export { statusColors, statusLabel, sourceColors } from "@/lib/ui/status";
export { formatCurrency, formatDate, formatPhone, formatTime, toTitleCase } from "@/lib/ui/format";
