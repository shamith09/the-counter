import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { db } from "@/lib/db";

export async function GET() {
  try {
    // Check if user is authenticated
    const session = await getServerSession();
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: "You must be logged in to check ad status" },
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

    // Check if the user has any active ads
    const adsResult = await db.query(
      db.sql`
        SELECT COUNT(*) as count
        FROM ads 
        WHERE user_id = ${userId}
      `,
    );

    const count = parseInt(adsResult.rows[0].count as string, 10);

    return NextResponse.json({
      hasActiveAds: count > 0,
      count,
    });
  } catch (error) {
    console.error("Error checking ad status:", error);
    return NextResponse.json(
      { error: "Error checking ad status" },
      { status: 500 },
    );
  }
}
