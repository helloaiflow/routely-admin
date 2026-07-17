import { z } from "zod";

export const orderSchema = z.object({
  pickup_address: z.string().min(5, "Pickup address is required"),
  delivery_address: z.string().min(3, "Delivery street is required"),
  delivery_city: z.string().min(2, "City is required"),
  delivery_state: z.string().min(2, "State is required"),
  delivery_zip: z.string().min(5, "ZIP code is required"),
  delivery_date: z.string().min(4, "Delivery date is required"),
  delivery_type: z.enum(["same_day", "next_day"]),
  recipient_name: z.string().min(2, "Recipient name is required"),
  recipient_phone: z
    .string()
    .min(10, "Phone must be 10 digits")
    .refine((v) => v.replace(/\D/g, "").length === 10, "Phone must be 10 digits"),
  recipient_email: z.string().email("Invalid email").optional().or(z.literal("")),
  package_type: z.enum(["rx", "cold", "regular"]),
  rx_number: z.string().optional().or(z.literal("")),
  gate_code: z.string().optional().or(z.literal("")),
  notes: z.string().optional().or(z.literal("")),
  requires_signature: z.boolean(),
  collect_cod: z.boolean(),
  is_same_day: z.boolean().optional(),
  collect_amount: z.string().optional().or(z.literal("")),
  estimated_miles: z.number(),
  pickup_location_id: z.string().optional().or(z.literal("")),
  weight_oz: z.number().min(0).optional(),
  length_in: z.number().min(0).optional(),
  width_in: z.number().min(0).optional(),
  height_in: z.number().min(0).optional(),
  pickup_lat: z.number().optional(),
  pickup_lng: z.number().optional(),
  delivery_lat: z.number().optional(),
  delivery_lng: z.number().optional(),
});

export type OrderFormValues = z.infer<typeof orderSchema>;

function tomorrowISO(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

export const defaultOrderValues: OrderFormValues = {
  pickup_address: "",
  delivery_address: "",
  delivery_city: "",
  delivery_state: "FL",
  delivery_zip: "",
  delivery_date: tomorrowISO(),
  delivery_type: "next_day",
  recipient_name: "",
  recipient_phone: "",
  recipient_email: "",
  package_type: "rx",
  rx_number: "",
  gate_code: "",
  notes: "",
  requires_signature: false,
  collect_cod: false,
  is_same_day: false,
  collect_amount: "",
  estimated_miles: 0,
  pickup_location_id: "",
  weight_oz: 8,
  length_in: 10,
  width_in: 7,
  height_in: 2,
  pickup_lat: undefined,
  pickup_lng: undefined,
  delivery_lat: undefined,
  delivery_lng: undefined,
};

export const PLAN_PRICES: Record<string, { stop: number; mile: number }> = {
  trial: { stop: 0, mile: 0 },
  free: { stop: 0, mile: 0 },
  starter: { stop: 16.0, mile: 1.65 },
  professional: { stop: 14.0, mile: 1.5 },
  enterprise: { stop: 12.0, mile: 1.35 },
};

export function computePricing(plan: string, miles: number, sameDay: boolean, stops = 2) {
  const prices = PLAN_PRICES[plan] ?? PLAN_PRICES.trial;
  const stopTotal = stops * prices.stop;
  const mileTotal = miles * prices.mile;
  const sameDayFee = sameDay ? 49.99 : 0;
  const subtotal = stopTotal + mileTotal + sameDayFee;
  return {
    pricePerStop: prices.stop,
    pricePerMile: prices.mile,
    stops,
    stopTotal,
    mileTotal,
    sameDayFee,
    subtotal: Math.round(subtotal * 100) / 100,
  };
}

export function estimateEta(miles: number): number {
  if (miles <= 0) return 0;
  return Math.max(15, Math.round(miles * 2.5 + 10));
}
