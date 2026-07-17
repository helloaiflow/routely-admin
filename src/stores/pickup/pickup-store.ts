import { create } from "zustand";

interface PickupStore {
  open: boolean;
  openPickup: () => void;
  closePickup: () => void;
}

export const usePickupStore = create<PickupStore>((set) => ({
  open: false,
  openPickup: () => set({ open: true }),
  closePickup: () => set({ open: false }),
}));
