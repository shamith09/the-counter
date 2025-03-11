import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { db } from "@/lib/db";

export async function GET() {
  try {
    const session = await getServerSession();
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user ID from email
    const userResult = await db.query(
      db.sql`SELECT id FROM users WHERE email = ${session.user.email}`,
    );

    if (userResult.rows.length === 0) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const userId = userResult.rows[0].id;

    // Get user stats including streak information
    const statsResult = await db.query(
      db.sql`
        SELECT 
          us.increment_count,
          us.total_value_added,
          us.last_increment,
          us.streak_days,
          us.longest_streak,
          us.last_streak_date,
          (
            SELECT COUNT(*) + 1
            FROM user_stats
            WHERE total_value_added > (SELECT total_value_added FROM user_stats WHERE user_id = ${userId})
          ) as rank
        FROM user_stats us
        WHERE us.user_id = ${userId}
      `,
    );

    // Get recent activity
    const activityResult = await db.query(
      db.sql`
        SELECT 
          created_at,
          value_diff
        FROM user_activity
        WHERE user_id = ${userId}
        ORDER BY created_at DESC
        LIMIT 10
      `,
    );

    // Calculate daily activity for the last 7 days
    const dailyActivityResult = await db.query(
      db.sql`
        SELECT 
          DATE_TRUNC('day', created_at) as day,
          COUNT(*) as count,
          SUM(value_diff) as total_value
        FROM user_activity
        WHERE 
          user_id = ${userId} AND
          created_at > NOW() - INTERVAL '7 days'
        GROUP BY DATE_TRUNC('day', created_at)
        ORDER BY day DESC
      `,
    );

    // Format the response
    const stats =
      statsResult.rows.length > 0
        ? {
            increment_count: parseInt(
              String(statsResult.rows[0].increment_count || "0"),
            ),
            total_value_added: parseInt(
              String(statsResult.rows[0].total_value_added || "0"),
            ),
            last_increment: statsResult.rows[0].last_increment,
            streak_days: parseInt(
              String(statsResult.rows[0].streak_days || "0"),
            ),
            longest_streak: parseInt(
              String(statsResult.rows[0].longest_streak || "0"),
            ),
            last_streak_date: statsResult.rows[0].last_streak_date,
            rank: parseInt(String(statsResult.rows[0].rank || "0")),
          }
        : null;

    const activity = activityResult.rows.map((row) => ({
      timestamp: row.created_at,
      value_diff: parseInt(String(row.value_diff)),
    }));

    const dailyActivity = dailyActivityResult.rows.map((row) => ({
      day: row.day,
      count: parseInt(String(row.count)),
      total_value: parseInt(String(row.total_value)),
    }));

    return NextResponse.json({
      stats,
      activity,
      dailyActivity,
    });
  } catch (error) {
    console.error("Error getting personal stats:", error);
    return NextResponse.json(
      { error: "Error retrieving personal stats" },
      { status: 500 },
    );
  }
}
