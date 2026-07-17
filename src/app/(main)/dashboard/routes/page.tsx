import { MapPin } from "lucide-react";

export default function RoutesPage() {
  return (
    <div className="min-h-[calc(100vh-57px)] bg-muted/40">
      <div className="mx-auto max-w-6xl px-4 py-6 lg:px-6">
        <div className="space-y-4">
          <div>
            <h1 className="type-page-title">Active Routes</h1>
            <p className="text-muted-foreground">Live route tracking for your deliveries</p>
          </div>
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-20">
            <MapPin size={32} className="mb-3 text-muted-foreground/40" />
            <p className="font-medium text-sm">Coming Soon</p>
            <p className="mt-1 text-muted-foreground text-xs">Real-time GPS route tracking will be available here.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
