"use client";

import { useEffect, useState } from "react";

import { Bell, Loader2, Mail, MessageSquare } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";

import { type NotificationPrefs } from "./settings-types";

type PrefKey = keyof NotificationPrefs;

const GROUPS: Array<{
  title: string;
  desc: string;
  icon: React.ElementType;
  items: Array<{ key: PrefKey; label: string; desc: string }>;
}> = [
  {
    title: "Deliveries",
    desc: "Real-time updates about your packages",
    icon: Bell,
    items: [
      { key: "delivery_confirmed", label: "Delivery confirmed", desc: "When a package is successfully delivered" },
      { key: "pickup_notification", label: "Pickup notification", desc: "When your package is picked up by a driver" },
      { key: "delivery_failed", label: "Delivery failed", desc: "When a delivery attempt fails" },
    ],
  },
  {
    title: "Reports",
    desc: "Scheduled summaries of your delivery activity",
    icon: Mail,
    items: [
      { key: "weekly_summary", label: "Weekly summary", desc: "Delivery report every Monday morning" },
      { key: "monthly_report", label: "Monthly report", desc: "Full report on the first of each month" },
    ],
  },
  {
    title: "Channels",
    desc: "How you want to receive notifications",
    icon: MessageSquare,
    items: [
      { key: "email_channel", label: "Email notifications", desc: "Receive all alerts via email" },
      { key: "sms_channel", label: "SMS alerts", desc: "Urgent delivery updates via text" },
    ],
  },
];

export function NotificationsTab() {
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);
  const [savingKey, setSavingKey] = useState<PrefKey | null>(null);

  useEffect(() => {
    fetch("/api/client/settings/notifications")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => setPrefs(d.prefs as NotificationPrefs))
      .catch(() => setPrefs(null));
  }, []);

  async function toggle(key: PrefKey, value: boolean) {
    if (!prefs) return;
    setPrefs({ ...prefs, [key]: value }); // optimistic
    setSavingKey(key);
    const res = await fetch("/api/client/settings/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [key]: value }),
    }).catch(() => null);
    if (res?.ok) {
      const j = await res.json();
      setPrefs(j.prefs as NotificationPrefs);
    } else {
      setPrefs((p) => (p ? { ...p, [key]: !value } : p)); // revert
    }
    setSavingKey(null);
  }

  return (
    <div className="grid max-w-3xl gap-5">
      {GROUPS.map((group) => (
        <Card key={group.title}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <span className="grid size-7 place-items-center rounded-lg bg-primary/10 text-primary">
                <group.icon className="size-4" aria-hidden="true" />
              </span>
              {group.title}
            </CardTitle>
            <p className="text-muted-foreground text-sm">{group.desc}</p>
          </CardHeader>
          <CardContent className="divide-y divide-border/50 pt-0">
            {group.items.map((item) => (
              <div key={item.key} className="flex items-center justify-between gap-4 py-3">
                <div className="min-w-0">
                  <p className="font-medium text-sm leading-tight">{item.label}</p>
                  <p className="text-muted-foreground text-xs">{item.desc}</p>
                </div>
                <div className="flex items-center gap-2">
                  {savingKey === item.key && (
                    <Loader2 className="size-3.5 animate-spin text-muted-foreground" aria-hidden="true" />
                  )}
                  {prefs ? (
                    <Switch
                      checked={prefs[item.key]}
                      onCheckedChange={(v) => toggle(item.key, v)}
                      disabled={savingKey !== null}
                    />
                  ) : (
                    <Skeleton className="h-5 w-9 rounded-full" />
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
      <p className="text-muted-foreground text-xs">Changes are saved automatically.</p>
    </div>
  );
}
