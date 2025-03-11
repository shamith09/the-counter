import { NextRequest, NextResponse } from "next/server";
import { db, sql } from "@/lib/db";

// Define types for database results
interface DatabaseResult {
  rows?: LeaderboardRow[];
  [key: string]: unknown;
}

interface LeaderboardRow {
  id: number;
  username: string;
  increment_count: number;
  total_value_added: number;
  last_increment: Date;
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const timeRange = searchParams.get("range");

    let timeWindow: string;

    // Determine time window for query
    switch (timeRange) {
      case "day":
        timeWindow = "24 HOURS";
        break;
      case "week":
        timeWindow = "7 DAYS";
        break;
      case "month":
        timeWindow = "30 DAYS";
        break;
      case "year":
        timeWindow = "365 DAYS";
        break;
      default:
        timeWindow = "ALL TIME";
    }

    let result;

    if (timeWindow === "ALL TIME") {
      result = (await db.sql`
        WITH total_activity AS (
          SELECT 
            user_id,
            SUM(value_diff) as total_value_added,
            COUNT(*) as increment_count,
            MAX(created_at) as last_increment
          FROM user_activity
          GROUP BY user_id
        )
        SELECT 
          u.id, 
          u.username, 
          COALESCE(ta.increment_count, 0) as increment_count, 
          COALESCE(ta.total_value_added, 0) as total_value_added,
          ta.last_increment
        FROM 
          users u
        LEFT JOIN total_activity ta ON u.id = ta.user_id
        WHERE 
          u.username IS NOT NULL
        ORDER BY 
          total_value_added DESC
        LIMIT 100`) as unknown as LeaderboardRow[] | DatabaseResult;
    } else if (timeWindow === "24 HOURS") {
      // For 24 hour window, use a more precise query
      const intervalQuery = `
        WITH time_window_stats AS (
          SELECT 
            user_id,
            SUM(value_diff) as total_value_added,
            COUNT(*) as increment_count,
            MAX(created_at) as last_increment
          FROM user_activity
          WHERE created_at > NOW() - INTERVAL '24 HOURS'
          GROUP BY user_id
        )
        SELECT 
          u.id, 
          u.username, 
          COALESCE(tws.increment_count, 0) as increment_count, 
          COALESCE(tws.total_value_added, 0) as total_value_added,
          tws.last_increment
        FROM 
          users u
        LEFT JOIN time_window_stats tws ON u.id = tws.user_id
        WHERE 
          u.username IS NOT NULL
        ORDER BY 
          total_value_added DESC
        LIMIT 100`;

      result = await sql(intervalQuery);
    } else {
      // For time-based queries, we need to use the raw SQL method since we're dynamically constructing the interval
      const intervalQuery = `
        WITH time_window_stats AS (
          SELECT 
            user_id,
            SUM(value_diff) as total_value_added,
            COUNT(*) as increment_count,
            MAX(created_at) as last_increment
          FROM user_activity
          WHERE created_at > NOW() - INTERVAL '${timeWindow}'
          GROUP BY user_id
        )
        SELECT 
          u.id, 
          u.username, 
          COALESCE(tws.increment_count, 0) as increment_count, 
          COALESCE(tws.total_value_added, 0) as total_value_added,
          tws.last_increment
        FROM 
          users u
        LEFT JOIN time_window_stats tws ON u.id = tws.user_id
        WHERE 
          u.username IS NOT NULL
        ORDER BY 
          total_value_added DESC
        LIMIT 100`;

      result = await sql(intervalQuery);
    }

    // Format the response to match the expected structure
    const resultData = Array.isArray(result) ? result : result.rows || [];
    const stats = resultData.map((row) => ({
      user_id: row.id,
      username: row.username,
      increment_count:
        typeof row.increment_count === "string"
          ? parseInt(row.increment_count)
          : row.increment_count,
      total_value_added:
        typeof row.total_value_added === "string"
          ? parseFloat(row.total_value_added)
          : row.total_value_added,
      last_increment: row.last_increment,
    }));

    return NextResponse.json(stats);
  } catch (error) {
    console.error("Error getting leaderboard:", error);
    return NextResponse.json([]);
  }
}
