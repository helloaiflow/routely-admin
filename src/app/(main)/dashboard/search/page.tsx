"use client";

import { useState } from "react";

import Link from "next/link";

import { MapPin, Package, Search, Users } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface Result {
  type: "recipient" | "scan" | "stop";
  id: string;
  title: string;
  subtitle: string;
  href: string;
}

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const doSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setSearched(true);
    try {
      const [recipientsRes, scansRes, stopsRes] = await Promise.all([
        fetch(`https://routelypro.com/api/data/recipients`),
        fetch(`/api/data/package-scans`),
        fetch(`/api/data/spoke-stops`),
      ]);

      const q = query.toLowerCase();
      const all: Result[] = [];

      if (recipientsRes.ok) {
        const recipients: Record<string, string>[] = await recipientsRes.json();
        for (const r of recipients
          .filter(
            (r) =>
              r.name?.toLowerCase().includes(q) ||
              r.phone?.toLowerCase().includes(q) ||
              r.address?.toLowerCase().includes(q),
          )
          .slice(0, 10)) {
          all.push({
            type: "recipient",
            id: r._id,
            title: r.name || "Unknown",
            subtitle: `${r.phone || ""} - ${r.address || ""}`,
            href: `/dashboard/recipients?search=${encodeURIComponent(r.name || "")}`,
          });
        }
      }

      if (scansRes.ok) {
        const scans: Record<string, string>[] = await scansRes.json();
        for (const s of scans
          .filter(
            (s) =>
              s.full_name?.toLowerCase().includes(q) ||
              s.rx_pharma_id?.toLowerCase().includes(q) ||
              s.address?.toLowerCase().includes(q),
          )
          .slice(0, 10)) {
          all.push({
            type: "scan",
            id: s._id,
            title: s.full_name || "Unknown",
            subtitle: `Rx: ${s.rx_pharma_id || "-"} - ${s.address || ""}`,
            href: `/dashboard/scans?search=${encodeURIComponent(s.rx_pharma_id || s.full_name || "")}`,
          });
        }
      }

      if (stopsRes.ok) {
        const stops: Record<string, string>[] = await stopsRes.json();
        for (const s of stops
          .filter(
            (s) =>
              s.recipient_name?.toLowerCase().includes(q) ||
              s.address?.toLowerCase().includes(q) ||
              s.rx_pharma_id?.toLowerCase().includes(q),
          )
          .slice(0, 10)) {
          all.push({
            type: "stop",
            id: s._id,
            title: s.recipient_name || "Unknown",
            subtitle: `${s.address || ""} - ${s.route_title || ""}`,
            href: `/dashboard/stops?search=${encodeURIComponent(s.recipient_name || s.address || "")}`,
          });
        }
      }

      setResults(all);
    } finally {
      setLoading(false);
    }
  };

  const filteredResults =
    filter === "all"
      ? results
      : results.filter((r) => {
          if (filter === "scans") return r.type === "scan";
          if (filter === "stops") return r.type === "stop";
          if (filter === "recipients") return r.type === "recipient";
          return true;
        });

  const typeIcon = (type: string) => {
    switch (type) {
      case "recipient":
        return <Users className="h-4 w-4" />;
      case "scan":
        return <Package className="h-4 w-4" />;
      case "stop":
        return <MapPin className="h-4 w-4" />;
      default:
        return <Search className="h-4 w-4" />;
    }
  };

  const typeBadge = (type: string) => {
    switch (type) {
      case "recipient":
        return (
          <Badge variant="outline" className="text-blue-600">
            Recipient
          </Badge>
        );
      case "scan":
        return (
          <Badge variant="outline" className="text-green-600">
            Scan
          </Badge>
        );
      case "stop":
        return (
          <Badge variant="outline" className="text-violet-600">
            Stop
          </Badge>
        );
      default:
        return null;
    }
  };

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="mx-auto w-full max-w-2xl space-y-4 pt-8">
        <h1 className="text-center font-semibold text-2xl">Package Search</h1>
        <p className="text-center text-muted-foreground text-sm">Search by patient name, phone, Rx#, or address</p>
        <div className="flex gap-2">
          <Input
            placeholder="Search by patient name, phone, Rx#, or address..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && doSearch()}
            className="h-12 text-base"
          />
          <Button onClick={doSearch} disabled={loading} className="h-12 px-6">
            <Search className="mr-2 h-4 w-4" />
            {loading ? "Searching..." : "Search"}
          </Button>
        </div>
        <Tabs value={filter} onValueChange={setFilter}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="scans">Scans</TabsTrigger>
            <TabsTrigger value="stops">Stops</TabsTrigger>
            <TabsTrigger value="recipients">Recipients</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {loading && (
        <div className="mx-auto w-full max-w-2xl space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-lg" />
          ))}
        </div>
      )}

      {!loading && searched && (
        <div className="mx-auto w-full max-w-2xl space-y-3">
          {filteredResults.length === 0 ? (
            <div className="flex h-40 items-center justify-center rounded-lg border border-dashed">
              <p className="text-muted-foreground text-sm">No results found for &quot;{query}&quot;</p>
            </div>
          ) : (
            <>
              <p className="text-muted-foreground text-sm">{filteredResults.length} results found</p>
              {filteredResults.map((r) => (
                <Card key={`${r.type}-${r.id}`} className="transition-colors hover:bg-muted/50">
                  <CardContent className="flex items-center gap-4 py-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                      {typeIcon(r.type)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate font-medium">{r.title}</p>
                        {typeBadge(r.type)}
                      </div>
                      <p className="truncate text-muted-foreground text-sm">{r.subtitle}</p>
                    </div>
                    <Button variant="outline" size="sm" asChild>
                      <Link href={r.href}>View</Link>
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
