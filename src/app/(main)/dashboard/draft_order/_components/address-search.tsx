"use client";

import { useRef, useState } from "react";

import { Loader2, MapPin } from "lucide-react";

import { Input } from "@/components/ui/input";

type Prediction = {
  description: string;
  place_id: string;
  main_text: string;
  secondary_text: string;
};

export type AddressResult = {
  street: string;
  city: string;
  state: string;
  zip: string;
  lat?: number;
  lng?: number;
};

export function AddressSearch({
  placeholder = "Search address...",
  defaultValue = "",
  onSelect,
}: {
  placeholder?: string;
  defaultValue?: string;
  onSelect: (d: AddressResult) => void;
}) {
  const [input, setInput] = useState(defaultValue);
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setInput(val);
    clearTimeout(debounceRef.current);
    if (val.length < 3) {
      setPredictions([]);
      setOpen(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await fetch(`/api/client/places?input=${encodeURIComponent(val)}`);
        const d = await r.json();
        const preds: Prediction[] = d.predictions ?? [];
        setPredictions(preds);
        setOpen(preds.length > 0);
      } catch {
        setPredictions([]);
      } finally {
        setLoading(false);
      }
    }, 300);
  }

  async function handleSelect(p: Prediction) {
    setInput(p.description);
    setOpen(false);
    setPredictions([]);
    try {
      const r = await fetch(`/api/client/place-details?place_id=${encodeURIComponent(p.place_id)}`);
      const d = await r.json();
      onSelect({
        street: d.street || p.description,
        city: d.city || "",
        state: d.state || "FL",
        zip: d.zip || "",
        lat: d.lat,
        lng: d.lng,
      });
      setInput(d.street || p.description);
    } catch {
      onSelect({ street: p.description, city: "", state: "FL", zip: "" });
    }
  }

  return (
    <div className="relative w-full">
      <div className="relative">
        <MapPin className="pointer-events-none absolute top-1/2 left-2 size-3 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={input}
          onChange={handleChange}
          onKeyDown={(e) => e.stopPropagation()}
          placeholder={placeholder}
          className="h-7 pr-7 pl-6 text-xs"
          autoComplete="off"
        />
        {loading && (
          <Loader2 className="absolute top-1/2 right-2 size-3 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
      </div>
      {open && predictions.length > 0 && (
        <div className="absolute z-50 mt-0.5 w-full overflow-hidden rounded-md border bg-popover shadow-lg">
          {predictions.map((p) => (
            <button
              key={p.place_id}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                handleSelect(p);
              }}
              className="flex w-full items-start gap-2 px-3 py-2 text-left transition-colors hover:bg-accent"
            >
              <MapPin className="mt-0.5 size-3 shrink-0 text-primary" />
              <div className="min-w-0">
                <p className="truncate font-medium text-[11px]">{p.main_text}</p>
                <p className="truncate text-[10px] text-muted-foreground">{p.secondary_text}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
