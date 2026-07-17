import { NextResponse } from "next/server";

import { auth } from "@clerk/nextjs/server";

import clientPromise from "@/lib/mongodb";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ hasCompletedOnboarding: false });

  try {
    const client = await clientPromise;
    const db = client.db();
    const tenant = await db.collection("tenants").findOne({ clerk_user_id: userId });

    return NextResponse.json({
      hasCompletedOnboarding: !!tenant,
      tenant: tenant
        ? {
            company_name: tenant.company_name,
            plan_type: tenant.plan_type,
            trial_ends_at: tenant.trial_ends_at,
          }
        : null,
    });
  } catch {
    return NextResponse.json({ hasCompletedOnboarding: false });
  }
}
