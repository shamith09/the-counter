import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { token } = body;

    if (!token) {
      return NextResponse.json(
        { error: "Unsubscribe token is required" },
        { status: 400 },
      );
    }

    // Find the subscription by token
    const subscriptionResult = await db.query(db.sql`
      SELECT id, email FROM email_subscriptions
      WHERE unsubscribe_token = ${token}
      LIMIT 1
    `);

    const subscriptionRows = Array.isArray(subscriptionResult)
      ? subscriptionResult
      : subscriptionResult.rows || [];

    if (subscriptionRows.length === 0) {
      return NextResponse.json(
        { error: "Invalid or expired unsubscribe token" },
        { status: 404 },
      );
    }

    const subscription = subscriptionRows[0];

    // Update the subscription to unsubscribe from all notification types
    await db.query(db.sql`
      UPDATE email_subscriptions
      SET 
        subscribe_counter_updates = false,
        subscribe_winner_24h = false,
        subscribe_winner_1h = false,
        subscribe_leaderboard_changes = false,
        updated_at = now()
      WHERE id = ${subscription.id}
    `);

    // Log the unsubscribe action
    await db.query(db.sql`
      INSERT INTO email_logs (
        subscription_id, 
        email, 
        subject, 
        email_type, 
        success
      )
      VALUES (
        ${subscription.id}, 
        ${subscription.email}, 
        'Unsubscribe Confirmation', 
        'unsubscribe', 
        true
      )
    `);

    return NextResponse.json({
      success: true,
      message: `You have been successfully unsubscribed from all email notifications.`,
    });
  } catch (error) {
    console.error(`Error processing unsubscribe request: ${error}`);
    return NextResponse.json(
      { error: "An error occurred while processing your unsubscribe request" },
      { status: 500 },
    );
  }
}
