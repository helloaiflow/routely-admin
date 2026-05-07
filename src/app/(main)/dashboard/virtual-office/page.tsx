import { VirtualOfficeClient } from "@/components/virtual-office/VirtualOfficeClient";
import { Building2 } from "lucide-react";
export const metadata = { title: "Virtual Office — Routely Admin" };
export default function VirtualOfficePage() {
  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-4 border-b border-white/5 shrink-0">
        <div className="flex items-center gap-2 mb-1">
          <Building2 className="size-5 text-blue-400" />
          <h1 className="text-lg font-semibold text-white">Virtual Office</h1>
        </div>
        <p className="text-sm text-white/40">Live AI operations floor — agents coordinate dispatch, calls, QA, billing, and support in real time.</p>
      </div>
      <div className="flex-1 min-h-0"><VirtualOfficeClient /></div>
    </div>
  );
}
