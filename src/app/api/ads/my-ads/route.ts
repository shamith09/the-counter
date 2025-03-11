import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { db } from "@/lib/db";

export async function GET() {
  try {
    // Check if user is authenticated
    const session = await getServerSession();
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: "You must be logged in to view your ads" },
        { status: 401 },
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

    // Get all ads for the user
    const adsResult = await db.query(
      db.sql`
        SELECT id, content, created_at, expires_at, active, stripe_subscription_id, auto_renew
        FROM ads 
        WHERE user_id = ${userId}
        ORDER BY created_at DESC
      `,
    );

    return NextResponse.json({ ads: adsResult.rows });
  } catch (error) {
    console.error("Error fetching ads:", error);
    return NextResponse.json(
      { error: "Error fetching your ads" },
      { status: 500 },
    );
  }
}
