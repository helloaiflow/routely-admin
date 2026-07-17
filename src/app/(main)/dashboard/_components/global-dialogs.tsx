"use client";

import { usePickupStore } from "@/stores/pickup/pickup-store";

import { NewPickupDialog } from "./new-pickup-dialog";

export function GlobalDialogs() {
  const { open, closePickup } = usePickupStore();
  return <NewPickupDialog open={open} onOpenChange={(o) => !o && closePickup()} />;
}
