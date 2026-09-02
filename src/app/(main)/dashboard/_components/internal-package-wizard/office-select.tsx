"use client";

/* OfficeSelect + inline AddOfficeForm — ported from the pre-wizard dialog
 * unchanged in behavior: offices ARE pickup-locations (D48), adding one goes
 * through the existing POST /api/client/pickup-locations. */

import { useState } from "react";

import { Loader2, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { EMPTY_OFFICE, formatPhone, type NewOfficeDraft, type PickupLocation } from "./types";

function AddOfficeForm({ onCancel, onCreated }: { onCancel: () => void; onCreated: (loc: PickupLocation) => void }) {
  const [draft, setDraft] = useState<NewOfficeDraft>({ ...EMPTY_OFFICE });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (k: keyof NewOfficeDraft, v: string) => setDraft((d) => ({ ...d, [k]: v }));
  const canSave = draft.name.trim() && draft.street.trim() && draft.city.trim() && draft.zip.trim();

  async function save() {
    if (!canSave) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/client/pickup-locations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: draft.name,
          street: draft.street,
          city: draft.city,
          state: draft.state,
          zip: draft.zip,
          contact_phone: draft.phone,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't add office");
      onCreated(data.location as PickupLocation);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "You may not have permission to add offices.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-2.5 rounded-lg border border-dashed border-border bg-muted/20 p-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div className="grid gap-1">
          <Label className="text-xs">Office name</Label>
          <Input value={draft.name} onChange={(e) => set("name", e.target.value)} placeholder="Deerfield Branch" />
        </div>
        <div className="grid gap-1">
          <Label className="text-xs">Phone (optional)</Label>
          <Input
            value={draft.phone}
            inputMode="numeric"
            onChange={(e) => set("phone", formatPhone(e.target.value))}
            placeholder="(305) 555-0100"
          />
        </div>
      </div>
      <div className="grid gap-1">
        <Label className="text-xs">Street</Label>
        <Input value={draft.street} onChange={(e) => set("street", e.target.value)} placeholder="1950 W Hillsboro Blvd" />
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <div className="grid gap-1">
          <Label className="text-xs">City</Label>
          <Input value={draft.city} onChange={(e) => set("city", e.target.value)} placeholder="Deerfield Beach" />
        </div>
        <div className="grid gap-1">
          <Label className="text-xs">State</Label>
          <Input value={draft.state} onChange={(e) => set("state", e.target.value.toUpperCase().slice(0, 2))} />
        </div>
        <div className="grid gap-1">
          <Label className="text-xs">ZIP</Label>
          <Input value={draft.zip} onChange={(e) => set("zip", e.target.value)} placeholder="33442" />
        </div>
      </div>
      {error && <p className="text-[11px] text-destructive">{error}</p>}
      <div className="flex justify-end gap-2 pt-0.5">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button type="button" size="sm" onClick={save} disabled={!canSave || saving}>
          {saving ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : null}
          Save office
        </Button>
      </div>
    </div>
  );
}

export function OfficeSelect({
  label,
  locations,
  valueId,
  onSelect,
  onAdd,
  addOpen,
  onAddOpenChange,
}: {
  label: string;
  locations: PickupLocation[];
  valueId: string;
  onSelect: (loc: PickupLocation) => void;
  onAdd: (loc: PickupLocation) => void;
  addOpen: boolean;
  onAddOpenChange: (v: boolean) => void;
}) {
  return (
    <div className="grid gap-1.5">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-medium">{label}</Label>
        <button
          type="button"
          onClick={() => onAddOpenChange(!addOpen)}
          className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
        >
          <Plus className="size-3" /> Add new office
        </button>
      </div>
      {!addOpen && (
        <Select
          value={valueId}
          onValueChange={(v) => {
            const loc = locations.find((l) => l.id === v || l.location_id === v);
            if (loc) onSelect(loc);
          }}
        >
          <SelectTrigger className="w-full [&>span]:truncate">
            <SelectValue placeholder={locations.length ? "Select an office" : "No offices yet"} />
          </SelectTrigger>
          <SelectContent>
            {locations.map((l) => (
              <SelectItem key={l.id} value={l.id}>
                {l.name} — {[l.address.street, l.address.city].filter(Boolean).join(", ")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      {addOpen && (
        <AddOfficeForm
          onCancel={() => onAddOpenChange(false)}
          onCreated={(loc) => {
            onAdd(loc);
            onAddOpenChange(false);
          }}
        />
      )}
    </div>
  );
}
