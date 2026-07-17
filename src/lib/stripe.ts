import Stripe from "stripe";

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error("STRIPE_SECRET_KEY is not set");
    }
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: "2026-03-25.dahlia",
      appInfo: { name: "Routely Client Portal", version: "1.0.0" },
    });
  }
  return _stripe;
}

export const isLiveMode = process.env.STRIPE_SECRET_KEY?.startsWith("sk_live_") ?? false;
