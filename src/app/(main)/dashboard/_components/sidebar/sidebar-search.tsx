"use client";

import * as React from "react";

import { useRouter } from "next/navigation";

import { KeyRound, MapPin, Package, Search, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

export function SidebarSearch() {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<Record<string, any[]>>({});
  const [loading, setLoading] = React.useState(false);
  const router = useRouter();

  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  React.useEffect(() => {
    if (!query || query.length < 2) {
      setResults({});
      return;
    }
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
        if (res.ok) setResults(await res.json());
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const navigate = (path: string) => {
    router.push(path);
    setOpen(false);
    setQuery("");
  };

  return (
    <>
      <Button
        variant="outline"
        className="relative h-9 w-full justify-start rounded-md px-3 text-muted-foreground text-sm"
        onClick={() => setOpen(true)}
      >
        <Search className="mr-2 h-4 w-4" />
        Search...
        <kbd className="pointer-events-none absolute right-2 inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-medium font-mono text-[10px]">
          <span className="text-xs">⌘</span>K
        </kbd>
      </Button>
      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput
          placeholder="Search recipients, scans, stops, gate codes..."
          value={query}
          onValueChange={setQuery}
        />
        <CommandList>
          <CommandEmpty>{loading ? "Searching..." : "No results found."}</CommandEmpty>
          {(results.recipients ?? []).length > 0 && (
            <CommandGroup heading="Recipients">
              {results.recipients.map((r: any) => (
                <CommandItem
                  key={r._id}
                  onSelect={() => navigate(`/dashboard/recipients?search=${encodeURIComponent(r.name || "")}`)}
                >
                  <Users className="mr-2 h-4 w-4 shrink-0" />
                  <div className="min-w-0">
                    <div className="truncate font-medium">{r.name}</div>
                    <div className="truncate text-muted-foreground text-xs">
                      {r.phone} · {r.address}
                    </div>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {(results.scans ?? []).length > 0 && (
            <CommandGroup heading="Package Scans">
              {results.scans.map((s: any) => (
                <CommandItem
                  key={s._id}
                  onSelect={() =>
                    navigate(`/dashboard/scans?search=${encodeURIComponent(s.rx_pharma_id || s.full_name || "")}`)
                  }
                >
                  <Package className="mr-2 h-4 w-4 shrink-0" />
                  <div className="min-w-0">
                    <div className="truncate font-medium">{s.full_name}</div>
                    <div className="truncate text-muted-foreground text-xs">Rx: {s.rx_pharma_id}</div>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {(results.stops ?? []).length > 0 && (
            <CommandGroup heading="Stops">
              {results.stops.map((s: any) => (
                <CommandItem
                  key={s._id}
                  onSelect={() =>
                    navigate(`/dashboard/stops?search=${encodeURIComponent(s.recipient_name || s.address || "")}`)
                  }
                >
                  <MapPin className="mr-2 h-4 w-4 shrink-0" />
                  <div className="min-w-0">
                    <div className="truncate font-medium">{s.recipient_name}</div>
                    <div className="truncate text-muted-foreground text-xs">{s.address}</div>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {(results.gateCodes ?? []).length > 0 && (
            <CommandGroup heading="Gate Codes">
              {results.gateCodes.map((g: any) => (
                <CommandItem
                  key={g._id}
                  onSelect={() => navigate(`/dashboard/gate-codes?search=${encodeURIComponent(g.address || "")}`)}
                >
                  <KeyRound className="mr-2 h-4 w-4 shrink-0" />
                  <div className="min-w-0">
                    <div className="truncate font-medium">{g.address}</div>
                    <div className="truncate text-muted-foreground text-xs">Code: {g.gate_code}</div>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
      </CommandDialog>
    </>
  );
}
