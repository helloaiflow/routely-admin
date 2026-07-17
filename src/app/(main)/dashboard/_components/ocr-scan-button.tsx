"use client";

import { useRouter } from "next/navigation";

import { ScanLine } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

/** Top-bar quick action: opens the OCR label scanner. Navigates to the Stops
 *  page with ?ocr=1, which auto-opens the (fully-wired) OCR scan modal there. */
export function OcrScanButton({ className }: { className?: string }) {
  const router = useRouter();
  return (
    <TooltipProvider delayDuration={400}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            size="icon"
            onClick={() => router.push("/dashboard/stops?ocr=1")}
            aria-label="Scan a label with OCR"
            className={className}
          >
            <ScanLine />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-[11px]">
          Scan label (OCR)
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
