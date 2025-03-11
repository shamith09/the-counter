import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { db } from "@/lib/db";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2025-02-24.acacia",
});

export async function POST(request: Request) {
  try {
    // Check if user is authenticated
    const session = await getServerSession();
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: "You must be logged in to update subscription settings" },
        { status: 401 },
      );
    }

    // Get subscription ID and auto-renew setting from request
    const { subscriptionId, autoRenew } = await request.json();

    if (!subscriptionId) {
      return NextResponse.json(
        { error: "Subscription ID is required" },
        { status: 400 },
      );
    }

    if (typeof autoRenew !== "boolean") {
      return NextResponse.json(
        { error: "Auto-renew setting must be a boolean" },
        { status: 400 },
      );
    }

    // First, get the user's ID from their email
    const userResult = await db.query(
      db.sql`SELECT id FROM users WHERE email = ${session.user.email}`,
    );

    const users = userResult.rows || [];
    if (users.length === 0) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const userId = users[0].id;

    // Verify the subscription belongs to the user
    const adResult = await db.query(
      db.sql`
        SELECT * FROM ads 
        WHERE stripe_subscription_id = ${subscriptionId}
        AND user_id = ${userId}
      `,
    );

    const ads = adResult.rows;
    if (ads.length === 0) {
      return NextResponse.json(
        { error: "Subscription not found or does not belong to you" },
        { status: 404 },
      );
    }

    // Update the subscription in Stripe
    await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: !autoRenew,
    });

    // Update the auto_renew setting in the database
    await db.query(
      db.sql`
        UPDATE ads
        SET auto_renew = ${autoRenew}
        WHERE stripe_subscription_id = ${subscriptionId}
      `,
    );

    return NextResponse.json({
      success: true,
      autoRenew: autoRenew,
    });
  } catch (error: unknown) {
    console.error("Error updating auto-renew setting:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    return NextResponse.json(
      { error: `Failed to update auto-renew setting: ${errorMessage}` },
      { status: 500 },
    );
  }
}
