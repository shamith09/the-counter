import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { db } from "@/lib/db";

export async function GET(request: Request) {
  try {
    const session = await getServerSession();
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get time range from query params
    const url = new URL(request.url);
    const range = url.searchParams.get("range") || "all";

    // Calculate date range based on the selected time range
    const now = new Date();
    let startDate = new Date(0); // Default to epoch start for "all"

    if (range === "hour") {
      startDate = new Date(now);
      startDate.setHours(now.getHours() - 1);
    } else if (range === "day") {
      startDate = new Date(now);
      startDate.setDate(now.getDate() - 1);
    } else if (range === "week") {
      startDate = new Date(now);
      startDate.setDate(now.getDate() - 7);
    } else if (range === "month") {
      startDate = new Date(now);
      startDate.setMonth(now.getMonth() - 1);
    } else if (range === "year") {
      startDate = new Date(now);
      startDate.setFullYear(now.getFullYear() - 1);
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

    // Get activity for the selected time range
    const activityResult = await db.query(
      db.sql`
        SELECT 
          created_at,
          value_diff
        FROM user_activity
        WHERE 
          user_id = ${userId}
          AND created_at >= ${startDate.toISOString()}
        ORDER BY created_at DESC
        LIMIT 50
      `,
    );

    // Calculate total value added in the selected time range
    const rangeStatsResult = await db.query(
      db.sql`
        SELECT 
          COUNT(*) as increment_count,
          SUM(value_diff) as total_value_added,
          MAX(created_at) as last_increment
        FROM user_activity
        WHERE 
          user_id = ${userId}
          AND created_at >= ${startDate.toISOString()}
      `,
    );

    // Calculate daily activity for the selected time range
    const dailyActivityResult = await db.query(
      db.sql`
        SELECT 
          DATE_TRUNC('day', created_at) as day,
          COUNT(*) as count,
          SUM(value_diff) as total_value
        FROM user_activity
        WHERE 
          user_id = ${userId}
          AND created_at >= ${startDate.toISOString()}
        GROUP BY DATE_TRUNC('day', created_at)
        ORDER BY day DESC
      `,
    );

    // Get rank for the selected time range
    const rankResult = await db.query(
      db.sql`
        WITH user_totals AS (
          SELECT 
            user_id,
            SUM(value_diff) as total_added
          FROM 
            user_activity
          WHERE 
            created_at >= ${startDate.toISOString()}
          GROUP BY 
            user_id
        ),
        user_ranks AS (
          SELECT 
            user_id,
            RANK() OVER (ORDER BY total_added DESC) as rank
          FROM 
            user_totals
        )
        SELECT rank FROM user_ranks WHERE user_id = ${userId}
      `,
    );

    // Format the response
    let stats = null;
    if (statsResult.rows.length > 0) {
      // Base stats from user_stats table
      const baseStats = {
        streak_days: parseInt(String(statsResult.rows[0].streak_days || "0")),
        longest_streak: parseInt(
          String(statsResult.rows[0].longest_streak || "0"),
        ),
        last_streak_date: statsResult.rows[0].last_streak_date,
      };

      // Stats for the selected time range
      if (rangeStatsResult.rows.length > 0) {
        stats = {
          ...baseStats,
          increment_count: parseInt(
            String(rangeStatsResult.rows[0].increment_count || "0"),
          ),
          total_value_added: parseInt(
            String(rangeStatsResult.rows[0].total_value_added || "0"),
          ),
          last_increment: rangeStatsResult.rows[0].last_increment,
          rank:
            rankResult.rows.length > 0
              ? parseInt(String(rankResult.rows[0].rank || "0"))
              : parseInt(String(statsResult.rows[0].rank || "0")),
        };
      } else {
        // Fallback to all-time stats if no activity in the selected range
        stats = {
          ...baseStats,
          increment_count: 0,
          total_value_added: 0,
          last_increment: null,
          rank:
            rankResult.rows.length > 0
              ? parseInt(String(rankResult.rows[0].rank || "0"))
              : parseInt(String(statsResult.rows[0].rank || "0")),
        };
      }
    }

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
