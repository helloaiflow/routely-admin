"use client";

import type { ReactNode } from "react";

import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-is-mobile";

interface PageShellProps {
  sidebar: ReactNode;
  main?: ReactNode;
  detail?: ReactNode;
  detailOpen?: boolean;
  onDetailClose?: () => void;
  sidebarWidth?: number;
  detailWidth?: number;
  mobileSheetHeight?: string;
  className?: string;
}

export function PageShell({
  sidebar,
  main,
  detail,
  detailOpen = false,
  onDetailClose,
  sidebarWidth = 300,
  detailWidth = 320,
  mobileSheetHeight = "88vh",
  className = "",
}: PageShellProps) {
  const isMobile = useIsMobile();

  const gridCols = main
    ? detailOpen && !isMobile
      ? `${sidebarWidth}px 1fr ${detailWidth}px`
      : `${sidebarWidth}px 1fr`
    : detailOpen && !isMobile
      ? `${sidebarWidth}px ${detailWidth}px`
      : `${sidebarWidth}px 1fr`;

  return (
    <div
      className={`h-[calc(100vh-5rem)] overflow-hidden rounded-xl border bg-background shadow-sm ${className}`}
      style={
        isMobile
          ? { display: "flex", flexDirection: "column" as const }
          : { display: "grid", gridTemplateColumns: gridCols, gridTemplateRows: "1fr" }
      }
    >
      {/* Sidebar */}
      <div
        className={`flex min-w-0 flex-col overflow-hidden ${main ? "border-r" : ""} ${isMobile && detailOpen ? "hidden" : "flex"}`}
      >
        {sidebar}
      </div>

      {/* Main (map/table) — desktop only */}
      {main && !isMobile && <div className="flex min-w-0 flex-col overflow-hidden">{main}</div>}

      {/* Detail — desktop 3rd col, mobile Sheet */}
      {detail && (
        <>
          {!isMobile && detailOpen && <div className="flex min-w-0 flex-col overflow-hidden border-l">{detail}</div>}
          {isMobile && (
            <Sheet open={detailOpen} onOpenChange={(o) => !o && onDetailClose?.()}>
              <SheetContent
                side="bottom"
                className="flex flex-col rounded-t-2xl p-0 focus:outline-none"
                style={{ height: mobileSheetHeight }}
                showCloseButton={false}
              >
                {detail}
              </SheetContent>
            </Sheet>
          )}
        </>
      )}
    </div>
  );
}
