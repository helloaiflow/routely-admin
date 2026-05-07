import { VirtualOfficeClient } from "@/components/virtual-office/VirtualOfficeClient";

export default function VirtualOfficePage() {
  return (
    <div className="-m-6 overflow-hidden" style={{ height: "calc(100dvh - 48px)" }}>
      <VirtualOfficeClient />
    </div>
  );
}
