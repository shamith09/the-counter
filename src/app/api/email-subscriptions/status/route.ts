import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getServerSession } from "next-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest) {
  try {
    // Get email from query params or from session
    const url = new URL(request.url);
    let email = url.searchParams.get("email");

    // Get user session
    const session = await getServerSession();

    if (!email && session?.user?.email) {
      email = session.user.email;
    }

    if (!email) {
      return NextResponse.json(
        { error: "Email is required to check subscription status" },
        { status: 400 },
      );
    }

    // Get subscription status
    const subscription = await db.query(db.sql`
      SELECT 
        id, 
        email, 
        subscribe_counter_updates,
        subscribe_winner_24h,
        subscribe_winner_1h,
        subscribe_leaderboard_changes,
        subscribed_at,
        updated_at
      FROM email_subscriptions 
      WHERE email = ${email}
    `);

    if (!subscription.rows || subscription.rows.length === 0) {
      return NextResponse.json({
        subscribed: false,
        message: "Not subscribed to any email notifications",
      });
    }

    const subscriptionData = subscription.rows[0];

    return NextResponse.json({
      subscribed: true,
      email: subscriptionData.email,
      preferences: {
        counterUpdates: subscriptionData.subscribe_counter_updates,
        winner24h: subscriptionData.subscribe_winner_24h,
        winner1h: subscriptionData.subscribe_winner_1h,
        leaderboardChanges: subscriptionData.subscribe_leaderboard_changes,
      },
      subscribedAt: subscriptionData.subscribed_at,
      updatedAt: subscriptionData.updated_at,
    });
  } catch (error) {
    console.error("Error checking subscription status:", error);
    return NextResponse.json(
      { error: "Error checking subscription status" },
      { status: 500 },
    );
  }
}
