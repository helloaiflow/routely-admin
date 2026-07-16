import { Suspense } from "react";
import { SearchShell } from "./_components/search-shell";

export default function SearchPage() {
  return (
    // Fill the layout container height exactly — layout is overflowY:auto at calc(100svh-49px)
    // We take that full height and manage scroll internally
    <div
      className="flex flex-col overflow-hidden bg-background"
      style={{ height: "calc(100svh - 49px)" }}
    >
      <Suspense>
        <SearchShell />
      </Suspense>
    </div>
  );
}
