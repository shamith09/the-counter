import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getServerSession } from "next-auth";

// Admin emails that are allowed to access admin features
const ADMIN_EMAILS =
  process.env.ADMIN_EMAILS?.split(",").map((email) =>
    email.trim().toLowerCase(),
  ) || [];

export async function GET(request: Request) {
  try {
    // Check if the request has a valid API key
    const apiKey = request.headers.get("x-api-key");
    const isValidApiKey =
      apiKey === process.env.ADMIN_API_KEY && process.env.ADMIN_API_KEY;

    // If no valid API key, verify admin authentication
    if (!isValidApiKey) {
      const session = await getServerSession();

      // Check if user is authenticated
      if (!session?.user?.email) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
      }

      // Check if user is admin
      if (!ADMIN_EMAILS.includes(session.user.email.toLowerCase())) {
        console.error(
          `Unauthorized admin leaderboard access attempt by ${session.user.email}`,
        );
        return NextResponse.json({ message: "Unauthorized" }, { status: 403 });
      }
    }

    // Get users with their stats and paypal emails
    const result = await db.query(db.sql`
      SELECT 
        u.id,
        u.username,
        u.email,
        u.paypal_email,
        us.total_value_added as score,
        RANK() OVER (ORDER BY us.total_value_added DESC) as rank
      FROM 
        users u
      JOIN 
        user_stats us ON u.id = us.user_id
      ORDER BY 
        us.total_value_added DESC
      LIMIT 100
    `);

    // Ensure we're handling the Neon database result format correctly
    const users = Array.isArray(result) ? result : result.rows || [];

    // Log the number of users found for debugging
    console.log(`Admin leaderboard: Found ${users.length} users`);

    return NextResponse.json({ users });
  } catch (error) {
    console.error("Error fetching admin leaderboard:", error);
    return NextResponse.json(
      { message: "Error fetching leaderboard data" },
      { status: 500 },
    );
  }
}
