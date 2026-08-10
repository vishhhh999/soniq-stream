import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getUserPlan, isPaidStatus } from "@/lib/billing";

async function getUserId() {
  const session = await auth();
  return session?.user && (session.user as any).id;
}

export async function GET() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const plan = await getUserPlan(userId);
  const isPaid = isPaidStatus(plan?.subscriptionStatus, plan?.subscriptionPeriodEnd);
  return NextResponse.json({ isPaid });
}
