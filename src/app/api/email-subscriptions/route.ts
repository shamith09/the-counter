import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getServerSession } from "next-auth";
import { z } from "zod";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Schema for validating subscription requests
const subscriptionSchema = z.object({
  email: z.string().email(),
  subscribeCounterUpdates: z.boolean().default(false),
  subscribeWinner24h: z.boolean().default(false),
  subscribeWinner1h: z.boolean().default(false),
  subscribeLeaderboardChanges: z.boolean().default(false),
});

// POST endpoint for subscribing to emails
export async function POST(request: NextRequest) {
  try {
    // Parse request body
    const body = await request.json();
    const result = subscriptionSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: "Invalid subscription data", details: result.error.format() },
        { status: 400 },
      );
    }

    const {
      email,
      subscribeCounterUpdates,
      subscribeWinner24h,
      subscribeWinner1h,
      subscribeLeaderboardChanges,
    } = result.data;

    // Get user session (optional, user might not be logged in)
    const session = await getServerSession();
    const userId = session?.user?.id;

    // Check if email already exists in subscriptions
    const existingSubscription = await db.query(db.sql`
      SELECT id FROM email_subscriptions WHERE email = ${email}
    `);

    if (existingSubscription.rows && existingSubscription.rows.length > 0) {
      // Update existing subscription
      const subscriptionId = existingSubscription.rows[0].id;

      await db.query(db.sql`
        UPDATE email_subscriptions
        SET 
          subscribe_counter_updates = ${subscribeCounterUpdates},
          subscribe_winner_24h = ${subscribeWinner24h},
          subscribe_winner_1h = ${subscribeWinner1h},
          subscribe_leaderboard_changes = ${subscribeLeaderboardChanges},
          user_id = COALESCE(${userId}, user_id),
          updated_at = NOW()
        WHERE id = ${subscriptionId}
      `);

      return NextResponse.json({
        success: true,
        message: "Subscription preferences updated successfully",
      });
    } else {
      // Create new subscription
      await db.query(db.sql`
        INSERT INTO email_subscriptions (
          email,
          user_id,
          subscribe_counter_updates,
          subscribe_winner_24h,
          subscribe_winner_1h,
          subscribe_leaderboard_changes
        ) VALUES (
          ${email},
          ${userId},
          ${subscribeCounterUpdates},
          ${subscribeWinner24h},
          ${subscribeWinner1h},
          ${subscribeLeaderboardChanges}
        )
        RETURNING id, unsubscribe_token
      `);

      return NextResponse.json({
        success: true,
        message: "Successfully subscribed to email notifications",
      });
    }
  } catch (error) {
    console.error("Error managing subscription:", error);
    return NextResponse.json(
      { error: "Error managing subscription" },
      { status: 500 },
    );
  }
}
