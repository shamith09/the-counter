import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest) {
  try {
    // Get token from URL
    const url = new URL(request.url);
    const token = url.searchParams.get("token");

    if (!token) {
      return NextResponse.json(
        { error: "Unsubscribe token is required" },
        { status: 400 },
      );
    }

    // Find subscription by token
    const subscription = await db.query(db.sql`
      SELECT id, email FROM email_subscriptions 
      WHERE unsubscribe_token = ${token}::uuid
    `);

    if (!subscription.rows || subscription.rows.length === 0) {
      return NextResponse.json(
        { error: "Invalid unsubscribe token" },
        { status: 404 },
      );
    }

    const subscriptionId = subscription.rows[0].id;
    const email = subscription.rows[0].email;

    // Delete the subscription
    await db.query(db.sql`
      DELETE FROM email_subscriptions WHERE id = ${subscriptionId}
    `);

    return NextResponse.json({
      success: true,
      message: `Successfully unsubscribed ${email} from all email notifications`,
    });
  } catch (error) {
    console.error("Error unsubscribing:", error);
    return NextResponse.json(
      { error: "Error processing unsubscribe request" },
      { status: 500 },
    );
  }
}
