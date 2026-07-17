"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { Loader2, MapPin } from "lucide-react";

import { cn } from "@/lib/utils";

type Prediction = {
  description: string;
  place_id: string;
  main_text: string;
  secondary_text: string;
};

export type PlaceDetails = {
  street: string;
  city: string;
  state: string;
  zip: string;
  formatted_address: string;
  lat?: number;
  lng?: number;
};

interface AddressAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onSelect?: (description: string) => void;
  onPlaceDetails?: (details: PlaceDetails) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  disableDropdown?: boolean;
  error?: string;
}

export function AddressAutocomplete({
  value,
  onChange,
  onSelect,
  onPlaceDetails,
  placeholder = "Start typing an address...",
  className,
  disabled,
  disableDropdown = false,
  error,
}: AddressAutocompleteProps) {
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0, width: 0 });
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  // Calculate dropdown position from input rect
  const updatePosition = useCallback(() => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (rect) {
      setDropdownPos({ top: rect.bottom + 4, left: rect.left, width: rect.width });
    }
  }, []);

  // Fetch predictions on value change
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!value || value.length < 3) {
      setPredictions([]);
      setOpen(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/client/places?input=${encodeURIComponent(value)}`);
        const data = await res.json();
        setPredictions(data.predictions ?? []);
        const hasResults = (data.predictions?.length ?? 0) > 0;
        setOpen(hasResults);
        if (hasResults) updatePosition();
      } catch {
        setPredictions([]);
      } finally {
        setLoading(false);
      }
    }, 350);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [value, updatePosition]);

  // Close on outside click (check portal dropdown too)
  useEffect(() => {
    function handle(e: MouseEvent) {
      const target = e.target as Node;
      if (containerRef.current?.contains(target)) return;
      const portal = document.getElementById("address-dropdown-portal");
      if (portal?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  // Reposition on scroll/resize while open
  useEffect(() => {
    if (!open) return;
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [open, updatePosition]);

  async function handleSelect(p: Prediction) {
    onChange(p.description);
    onSelect?.(p.description);
    setPredictions([]);
    setOpen(false);

    if (onPlaceDetails && p.place_id) {
      try {
        const res = await fetch(`/api/client/place-details?place_id=${encodeURIComponent(p.place_id)}`);
        if (res.ok) {
          const details: PlaceDetails = await res.json();
          onPlaceDetails(details);
        }
      } catch {
        // Fallback: onSelect already fired with description string
      }
    }
  }

  const showDropdown = open && !disableDropdown && predictions.length > 0 && mounted;

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="relative">
        <MapPin className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        {loading && <Loader2 className="absolute right-3 top-1/2 size-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />}
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => {
            if (predictions.length > 0) {
              updatePosition();
              setOpen(true);
            }
          }}
          placeholder={placeholder}
          disabled={disabled}
          autoComplete="off"
          className={cn(
            "flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 pl-9 text-base leading-none",
            "[touch-action:manipulation] placeholder:text-sm placeholder:text-muted-foreground/40",
            "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:border-ring",
            "disabled:cursor-not-allowed disabled:opacity-50",
            error && "border-destructive focus-visible:ring-destructive",
            className,
          )}
        />
      </div>

      {/* Portal dropdown to document.body — avoids overflow clip */}
      {showDropdown &&
        createPortal(
          <div
            id="address-dropdown-portal"
            style={{ position: "fixed", top: dropdownPos.top, left: dropdownPos.left, width: dropdownPos.width, zIndex: 9999 }}
            className="max-h-[240px] overflow-y-auto rounded-lg border bg-popover shadow-lg"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            {predictions.map((p) => (
              <button
                key={p.place_id}
                type="button"
                onClick={() => handleSelect(p)}
                className="flex w-full items-start gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-accent"
              >
                <MapPin className="mt-0.5 size-3.5 shrink-0 text-primary" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{p.main_text}</p>
                  <p className="truncate text-xs text-muted-foreground">{p.secondary_text}</p>
                </div>
              </button>
            ))}
          </div>,
          document.body,
        )}

      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  );
}
