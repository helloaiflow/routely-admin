import { create } from "zustand";

interface InternalPackageStore {
  open: boolean;
  openInternalPackage: () => void;
  closeInternalPackage: () => void;
}

export const useInternalPackageStore = create<InternalPackageStore>((set) => ({
  open: false,
  openInternalPackage: () => set({ open: true }),
  closeInternalPackage: () => set({ open: false }),
}));
