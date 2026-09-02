"use client";

import { useInternalPackageStore } from "@/stores/internal-package/internal-package-store";
import { usePickupStore } from "@/stores/pickup/pickup-store";

import { NewInternalPackageDialog } from "./new-internal-package-dialog";
import { NewPickupDialog } from "./new-pickup-dialog";

export function GlobalDialogs() {
  const { open, closePickup } = usePickupStore();
  const { open: internalOpen, closeInternalPackage } = useInternalPackageStore();
  return (
    <>
      <NewPickupDialog open={open} onOpenChange={(o) => !o && closePickup()} />
      <NewInternalPackageDialog open={internalOpen} onOpenChange={(o) => !o && closeInternalPackage()} />
    </>
  );
}
