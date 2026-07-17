import { FileText } from "lucide-react";

export default function HistoryPage() {
  return (
    <div className="min-h-[calc(100vh-57px)] bg-muted/40">
      <div className="mx-auto max-w-6xl px-4 py-6 lg:px-6">
        <div className="space-y-4">
          <div>
            <h1 className="type-page-title">Delivery History</h1>
            <p className="text-muted-foreground">Past deliveries and completed orders</p>
          </div>
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-20">
            <FileText size={32} className="mb-3 text-muted-foreground/40" />
            <p className="font-medium text-sm">Coming Soon</p>
            <p className="mt-1 text-muted-foreground text-xs">
              Full delivery history with export will be available here.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
