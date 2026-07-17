"use client";

import { useEffect, useState } from "react";

import dynamic from "next/dynamic";

import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";

import { CreateStopModal } from "./_components/create-stop-modal";
import { DraftDetail } from "./_components/draft-detail";
import { DraftList } from "./_components/draft-list";
import type { DraftFilter, DraftOrder } from "./_lib/helpers";

const DraftMap = dynamic(() => import("./_components/draft-map").then((m) => m.DraftMap), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center bg-muted/20">
      <p className="text-muted-foreground text-xs">Loading map...</p>
    </div>
  ),
});

const NOW = new Date().toISOString();
// NOW kept for new draft timestamps

export default function DraftOrderPage() {
  const [drafts, setDrafts] = useState<DraftOrder[]>([]);
  const [loading, setLoading] = useState(true);
  // null = nothing selected on load
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<DraftFilter>("all");
  const [search, setSearch] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [pickupLocations, setPickupLocations] = useState<
    { id: string; name: string; address: string; lat?: number; lng?: number }[]
  >([]);

  // Mobile: show "list" or "detail"
  const [mobileView, setMobileView] = useState<"list" | "detail">("list");

  const selectedDraft = drafts.find((d) => d.id === selectedId) ?? null;

  // Load pickup locations on mount
  useEffect(() => {
    // Load drafts from MongoDB
    fetch("/api/client/draft-stops")
      .then((r) => r.json())
      .then((d) => { setDrafts(d.drafts ?? []); setLoading(false); })
      .catch(() => setLoading(false));

    // Load pickup locations
    fetch("/api/client/tenant")
      .then((r) => r.json())
      .then((d) => {
        const locs = (d.pickup_locations ?? []).map((l: Record<string, unknown>) => {
          // address may be object {street,city,state,zip}, string, or absent
          const a = l.address;
          const isAddrObj = a !== null && typeof a === "object" && !Array.isArray(a);
          const addrObj = isAddrObj ? (a as Record<string, unknown>) : {};
          const street = String(addrObj.street ?? l.street ?? "");
          const city   = String(addrObj.city   ?? l.city   ?? "");
          const state  = String(addrObj.state  ?? l.state  ?? "");
          const zip    = String(addrObj.zip    ?? l.zip    ?? "");
          const stateZip = [state, zip].filter(Boolean).join(" ");
          const formatted = [street, city, stateZip].filter(Boolean).join(", ");
          return {
            id: String(l.location_id ?? l.id ?? l.name ?? ""),
            name: String(l.name ?? ""),
            address: formatted || (typeof a === "string" ? a : ""),
            lat: typeof l.lat === "number" ? l.lat : undefined,
            lng: typeof l.lng === "number" ? l.lng : undefined,
          };
        });
        setPickupLocations(locs);
      })
      .catch(() => {
        /* ignore */
      });
  }, []);

  function updateDraft(id: string, field: keyof DraftOrder, value: DraftOrder[keyof DraftOrder]) {
    setDrafts((prev) =>
      prev.map((d) => (d.id === id ? { ...d, [field]: value, updated_at: new Date().toISOString() } : d)),
    );
  }

  function deleteDraft(id: string) {
    const remaining = drafts.filter((d) => d.id !== id);
    setDrafts(remaining);
    setSelectedId(null);
    setMobileView("list");
  }

  function approveDraft(id: string) {
    updateDraft(id, "status", "approved");
    // TODO: POST to /api/client/orders/create
  }

  function handleSelect(id: string) {
    setSelectedId(id);
    setMobileView("detail");
  }

  function handleDraftCreated(draft: DraftOrder) {
    setDrafts((prev) => [draft, ...prev]);
    setSelectedId(draft.id);
    setShowCreateModal(false);
  }

  function handleBack() {
    setMobileView("list");
  }

  return (
    <div
      className="h-full w-full overflow-hidden p-4"
      style={{ boxSizing: "border-box", maxHeight: "calc(100svh - 49px)" }}
    >
      <div className="h-full w-full overflow-hidden rounded-md border">
        <CreateStopModal
          open={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          onCreated={handleDraftCreated}
          pickupLocations={pickupLocations}
        />
        {/* ── DESKTOP: 3 resizable panels ───────────────────── */}
        <div className="hidden h-full md:block">
          <ResizablePanelGroup orientation="horizontal" className="h-full w-full" style={{ overflow: "hidden" }}>
            {/* COL 1 — 20% */}
            <ResizablePanel defaultSize={20} style={{ overflow: "hidden", minWidth: 0 }}>
              <DraftList
                drafts={drafts}
                selectedId={selectedId}
                filter={filter}
                search={search}
                onSelect={handleSelect}
                onFilterChange={setFilter}
                onSearchChange={setSearch}
                onNew={() => setShowCreateModal(true)}
              />
            </ResizablePanel>

            <ResizableHandle withHandle />

            {/* COL 2 — 30% */}
            <ResizablePanel defaultSize={30} style={{ overflow: "hidden", minWidth: 0 }}>
              <DraftDetail
                draft={selectedDraft}
                pickupLocations={pickupLocations}
                onChange={(field, value) => selectedDraft && updateDraft(selectedDraft.id, field, value)}
                onDelete={() => selectedDraft && deleteDraft(selectedDraft.id)}
                onApprove={() => selectedDraft && approveDraft(selectedDraft.id)}
              />
            </ResizablePanel>

            <ResizableHandle withHandle />

            {/* COL 3 — 50% Map */}
            <ResizablePanel defaultSize={50} style={{ overflow: "hidden", minWidth: 0 }}>
              <DraftMap draft={selectedDraft} />
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>

        {/* ── MOBILE: full-width panels, toggle between list/detail ── */}
        <div className="flex h-full flex-col md:hidden">
          {mobileView === "list" ? (
            <DraftList
              drafts={drafts}
              selectedId={selectedId}
              filter={filter}
              search={search}
              onSelect={handleSelect}
              onFilterChange={setFilter}
              onSearchChange={setSearch}
              onNew={() => setShowCreateModal(true)}
            />
          ) : (
            <div className="flex h-full flex-col overflow-hidden">
              {/* Mobile back bar */}
              <div className="flex shrink-0 items-center gap-2 border-b px-3 py-2">
                <button
                  type="button"
                  onClick={handleBack}
                  className="flex items-center gap-1 font-medium text-[11px] text-primary"
                >
                  ← Stops
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-hidden">
                <DraftDetail
                  draft={selectedDraft}
                  pickupLocations={pickupLocations}
                  onChange={(field, value) => selectedDraft && updateDraft(selectedDraft.id, field, value)}
                  onDelete={() => selectedDraft && deleteDraft(selectedDraft.id)}
                  onApprove={() => selectedDraft && approveDraft(selectedDraft.id)}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
