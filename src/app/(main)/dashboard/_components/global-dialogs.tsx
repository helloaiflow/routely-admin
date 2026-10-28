"use client";

import { useInternalPackageStore } from "@/stores/internal-package/internal-package-store";

import { NewInternalPackageDialog } from "./new-internal-package-dialog";

export function GlobalDialogs() {
  const { open: internalOpen, closeInternalPackage } = useInternalPackageStore();
  return <NewInternalPackageDialog open={internalOpen} onOpenChange={(o) => !o && closeInternalPackage()} />;
}
