import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getServerSession } from "next-auth";

// Only allow admin users to access this endpoint
const ADMIN_EMAILS = process.env.ADMIN_EMAILS?.split(",") || [];

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest) {
  try {
    // Check if the request is coming from a Vercel cron job
    const isVercelCron = request.headers.get("x-vercel-cron") === "true";

    // Check if the request has a valid API key
    const authHeader = request.headers.get("Authorization");
    const isValidApiKey = authHeader === `Bearer ${process.env.CRON_SECRET}`;

    // If not a cron job or doesn't have valid API key, verify admin authentication
    if (!isVercelCron && !isValidApiKey) {
      const session = await getServerSession();

      // Check if user is authorized
      if (!session?.user?.email || !ADMIN_EMAILS.includes(session.user.email)) {
        console.error(`Unauthorized access attempt by ${session?.user?.email}`);
        return NextResponse.json({ message: "Unauthorized" }, { status: 403 });
      }
    }

    // Get the top user from the previous week
    const today = new Date();
    const day = today.getUTCDay();
    // Calculate the Monday of the current week
    const currentWeekMonday = new Date(today);
    currentWeekMonday.setUTCDate(today.getUTCDate() - day + 1);
    currentWeekMonday.setUTCHours(0, 0, 0, 0);

    // Calculate the Monday of the previous week
    const lastWeekStart = new Date(currentWeekMonday);
    lastWeekStart.setUTCDate(currentWeekMonday.getUTCDate() - 7);

    // Calculate the Monday of the current week (end date)
    const lastWeekEnd = new Date(currentWeekMonday);

    console.log("[get-last-week-winner] Querying for top users between:", {
      lastWeekStart: lastWeekStart.toISOString(),
      lastWeekEnd: lastWeekEnd.toISOString(),
    });

    // Find the top user by activity in the last week
    const topUsers = await db.query(db.sql`
      WITH weekly_stats AS (
        SELECT 
          user_id,
          SUM(value_diff) as total_value_added
        FROM 
          user_activity
        WHERE 
          created_at >= ${lastWeekStart.toISOString()}
          AND created_at < ${lastWeekEnd.toISOString()}
        GROUP BY 
          user_id
        ORDER BY 
          total_value_added DESC
        LIMIT 1
      )
      SELECT 
        u.id,
        u.username,
        u.email,
        u.paypal_email,
        ws.total_value_added
      FROM 
        weekly_stats ws
      JOIN 
        users u ON ws.user_id = u.id
    `);

    // Ensure we're handling the Neon database result format correctly
    const users = Array.isArray(topUsers) ? topUsers : topUsers.rows || [];
    console.log("[get-last-week-winner] Top users found:", users.length);

    if (users.length === 0) {
      return NextResponse.json({
        success: false,
        message: "No eligible users found for last week",
      });
    }

    const winner = users[0];
    console.log("[get-last-week-winner] Winner found:", {
      id: winner.id,
      username: winner.username,
      totalValueAdded: winner.total_value_added,
    });

    return NextResponse.json({
      success: true,
      winner: {
        id: winner.id,
        username: winner.username,
        email: winner.email,
        paypalEmail: winner.paypal_email,
        totalValueAdded: winner.total_value_added,
        weekStart: lastWeekStart.toISOString(),
        weekEnd: lastWeekEnd.toISOString(),
      },
    });
  } catch (error) {
    console.error("[get-last-week-winner] Error:", error);
    return NextResponse.json(
      { success: false, message: "Failed to get last week's winner" },
      { status: 500 },
    );
  }
}
