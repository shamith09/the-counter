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
    let activityResult;
    let rangeStatsResult;
    let dailyActivityResult;
    let rankResult;

    if (range === "hour") {
      // For hourly data, query directly from user_activity
      activityResult = await db.query(
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

      rangeStatsResult = await db.query(
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

      dailyActivityResult = await db.query(
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

      rankResult = await db.query(
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
    } else if (range === "day") {
      // For daily data (last 24 hours), combine hourly aggregates and recent raw activity
      activityResult = await db.query(
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

      rangeStatsResult = await db.query(
        db.sql`
          WITH combined_activity AS (
            -- Data from hourly aggregates
            SELECT 
              SUM(increment_count) as increment_count,
              SUM(total_value_added) as total_value_added,
              MAX(hour_timestamp) as last_increment
            FROM user_activity_hourly
            WHERE 
              user_id = ${userId}
              AND hour_timestamp >= ${startDate.toISOString()}
              
            UNION ALL
            
            -- Data from raw activity (for recent data that might not be aggregated yet)
            SELECT 
              COUNT(*) as increment_count,
              SUM(value_diff) as total_value_added,
              MAX(created_at) as last_increment
            FROM user_activity
            WHERE 
              user_id = ${userId}
              AND created_at >= ${startDate.toISOString()}
              -- Exclude data that's already been aggregated to avoid double counting
              AND created_at >= (SELECT COALESCE(MAX(hour_timestamp), '1970-01-01'::timestamptz) FROM user_activity_hourly)
          )
          SELECT 
            SUM(increment_count) as increment_count,
            SUM(total_value_added) as total_value_added,
            MAX(last_increment) as last_increment
          FROM combined_activity
        `,
      );

      dailyActivityResult = await db.query(
        db.sql`
          WITH hourly_data AS (
            SELECT 
              DATE_TRUNC('hour', hour_timestamp) as day,
              increment_count as count,
              total_value_added as total_value
            FROM user_activity_hourly
            WHERE 
              user_id = ${userId}
              AND hour_timestamp >= ${startDate.toISOString()}
          ),
          raw_data AS (
            SELECT 
              DATE_TRUNC('hour', created_at) as day,
              COUNT(*) as count,
              SUM(value_diff) as total_value
            FROM user_activity
            WHERE 
              user_id = ${userId}
              AND created_at >= ${startDate.toISOString()}
              -- Exclude data that's already been aggregated to avoid double counting
              AND created_at >= (SELECT COALESCE(MAX(hour_timestamp), '1970-01-01'::timestamptz) FROM user_activity_hourly)
            GROUP BY DATE_TRUNC('hour', created_at)
          ),
          combined_data AS (
            SELECT * FROM hourly_data
            UNION ALL
            SELECT * FROM raw_data
          )
          SELECT 
            day,
            SUM(count) as count,
            SUM(total_value) as total_value
          FROM combined_data
          GROUP BY day
          ORDER BY day DESC
        `,
      );

      rankResult = await db.query(
        db.sql`
          WITH combined_activity AS (
            -- Data from hourly aggregates
            SELECT 
              user_id,
              SUM(total_value_added) as total_added
            FROM user_activity_hourly
            WHERE hour_timestamp >= ${startDate.toISOString()}
            GROUP BY user_id
            
            UNION ALL
            
            -- Data from raw activity (for recent data that might not be aggregated yet)
            SELECT 
              user_id,
              SUM(value_diff) as total_added
            FROM user_activity
            WHERE 
              created_at >= ${startDate.toISOString()}
              -- Exclude data that's already been aggregated to avoid double counting
              AND created_at >= (SELECT COALESCE(MAX(hour_timestamp), '1970-01-01'::timestamptz) FROM user_activity_hourly)
            GROUP BY user_id
          ),
          user_totals AS (
            SELECT 
              user_id,
              SUM(total_added) as total_added
            FROM combined_activity
            GROUP BY user_id
          ),
          user_ranks AS (
            SELECT 
              user_id,
              RANK() OVER (ORDER BY total_added DESC) as rank
            FROM user_totals
          )
          SELECT rank FROM user_ranks WHERE user_id = ${userId}
        `,
      );
    } else if (range === "week" || range === "month") {
      // For weekly/monthly data, combine daily aggregates, hourly aggregates, and raw activity
      activityResult = await db.query(
        db.sql`
          WITH combined_activity AS (
            -- Data from hourly aggregates
            SELECT 
              hour_timestamp as created_at,
              total_value_added as value_diff
            FROM user_activity_hourly
            WHERE 
              user_id = ${userId}
              AND hour_timestamp >= ${startDate.toISOString()}
              
            UNION ALL
            
            -- Data from raw activity (for recent data that might not be aggregated yet)
            SELECT 
              created_at,
              value_diff
            FROM user_activity
            WHERE 
              user_id = ${userId}
              AND created_at >= ${startDate.toISOString()}
              -- Exclude data that's already been aggregated to avoid double counting
              AND created_at >= (SELECT COALESCE(MAX(hour_timestamp), '1970-01-01'::timestamptz) FROM user_activity_hourly)
          )
          SELECT 
            created_at,
            value_diff
          FROM combined_activity
          ORDER BY created_at DESC
          LIMIT 50
        `,
      );

      rangeStatsResult = await db.query(
        db.sql`
          WITH combined_activity AS (
            -- Data from daily aggregates
            SELECT 
              SUM(increment_count) as increment_count,
              SUM(total_value_added) as total_value_added,
              MAX(day_timestamp) as last_increment
            FROM user_activity_daily
            WHERE 
              user_id = ${userId}
              AND day_timestamp >= ${startDate.toISOString()}
              
            UNION ALL
            
            -- Data from hourly aggregates (for recent data that might not be in daily aggregates yet)
            SELECT 
              SUM(increment_count) as increment_count,
              SUM(total_value_added) as total_value_added,
              MAX(hour_timestamp) as last_increment
            FROM user_activity_hourly
            WHERE 
              user_id = ${userId}
              AND hour_timestamp >= ${startDate.toISOString()}
              AND hour_timestamp >= (SELECT COALESCE(MAX(day_timestamp), '1970-01-01'::timestamptz) FROM user_activity_daily)
              
            UNION ALL
            
            -- Data from raw activity (for very recent data that might not be aggregated yet)
            SELECT 
              COUNT(*) as increment_count,
              SUM(value_diff) as total_value_added,
              MAX(created_at) as last_increment
            FROM user_activity
            WHERE 
              user_id = ${userId}
              AND created_at >= ${startDate.toISOString()}
              AND created_at >= (SELECT COALESCE(MAX(hour_timestamp), '1970-01-01'::timestamptz) FROM user_activity_hourly)
          )
          SELECT 
            SUM(increment_count) as increment_count,
            SUM(total_value_added) as total_value_added,
            MAX(last_increment) as last_increment
          FROM combined_activity
        `,
      );

      dailyActivityResult = await db.query(
        db.sql`
          WITH daily_data AS (
            SELECT 
              day_timestamp as day,
              increment_count as count,
              total_value_added as total_value
            FROM user_activity_daily
            WHERE 
              user_id = ${userId}
              AND day_timestamp >= ${startDate.toISOString()}
          ),
          hourly_data AS (
            SELECT 
              DATE_TRUNC('day', hour_timestamp) as day,
              SUM(increment_count) as count,
              SUM(total_value_added) as total_value
            FROM user_activity_hourly
            WHERE 
              user_id = ${userId}
              AND hour_timestamp >= ${startDate.toISOString()}
              AND hour_timestamp >= (SELECT COALESCE(MAX(day_timestamp), '1970-01-01'::timestamptz) FROM user_activity_daily)
            GROUP BY DATE_TRUNC('day', hour_timestamp)
          ),
          raw_data AS (
            SELECT 
              DATE_TRUNC('day', created_at) as day,
              COUNT(*) as count,
              SUM(value_diff) as total_value
            FROM user_activity
            WHERE 
              user_id = ${userId}
              AND created_at >= ${startDate.toISOString()}
              AND created_at >= (SELECT COALESCE(MAX(hour_timestamp), '1970-01-01'::timestamptz) FROM user_activity_hourly)
            GROUP BY DATE_TRUNC('day', created_at)
          ),
          combined_data AS (
            SELECT * FROM daily_data
            UNION ALL
            SELECT * FROM hourly_data
            UNION ALL
            SELECT * FROM raw_data
          )
          SELECT 
            day,
            SUM(count) as count,
            SUM(total_value) as total_value
          FROM combined_data
          GROUP BY day
          ORDER BY day DESC
        `,
      );

      rankResult = await db.query(
        db.sql`
          WITH combined_activity AS (
            -- Data from daily aggregates
            SELECT 
              user_id,
              SUM(total_value_added) as total_added
            FROM user_activity_daily
            WHERE day_timestamp >= ${startDate.toISOString()}
            GROUP BY user_id
            
            UNION ALL
            
            -- Data from hourly aggregates (for recent data that might not be in daily aggregates yet)
            SELECT 
              user_id,
              SUM(total_value_added) as total_added
            FROM user_activity_hourly
            WHERE 
              hour_timestamp >= ${startDate.toISOString()}
              AND hour_timestamp >= (SELECT COALESCE(MAX(day_timestamp), '1970-01-01'::timestamptz) FROM user_activity_daily)
            GROUP BY user_id
            
            UNION ALL
            
            -- Data from raw activity (for very recent data that might not be aggregated yet)
            SELECT 
              user_id,
              SUM(value_diff) as total_added
            FROM user_activity
            WHERE 
              created_at >= ${startDate.toISOString()}
              AND created_at >= (SELECT COALESCE(MAX(hour_timestamp), '1970-01-01'::timestamptz) FROM user_activity_hourly)
            GROUP BY user_id
          ),
          user_totals AS (
            SELECT 
              user_id,
              SUM(total_added) as total_added
            FROM combined_activity
            GROUP BY user_id
          ),
          user_ranks AS (
            SELECT 
              user_id,
              RANK() OVER (ORDER BY total_added DESC) as rank
            FROM user_totals
          )
          SELECT rank FROM user_ranks WHERE user_id = ${userId}
        `,
      );
    } else if (range === "year") {
      // For yearly data, combine daily aggregates, hourly aggregates, and raw activity
      activityResult = await db.query(
        db.sql`
          WITH combined_activity AS (
            -- Data from daily aggregates
            SELECT 
              day_timestamp as created_at,
              total_value_added as value_diff
            FROM user_activity_daily
            WHERE 
              user_id = ${userId}
              AND day_timestamp >= ${startDate.toISOString()}
              
            UNION ALL
            
            -- Data from hourly aggregates (for recent data that might not be in daily aggregates yet)
            SELECT 
              hour_timestamp as created_at,
              total_value_added as value_diff
            FROM user_activity_hourly
            WHERE 
              user_id = ${userId}
              AND hour_timestamp >= ${startDate.toISOString()}
              AND hour_timestamp >= (SELECT COALESCE(MAX(day_timestamp), '1970-01-01'::timestamptz) FROM user_activity_daily)
              
            UNION ALL
            
            -- Data from raw activity (for very recent data that might not be aggregated yet)
            SELECT 
              created_at,
              value_diff
            FROM user_activity
            WHERE 
              user_id = ${userId}
              AND created_at >= ${startDate.toISOString()}
              AND created_at >= (SELECT COALESCE(MAX(hour_timestamp), '1970-01-01'::timestamptz) FROM user_activity_hourly)
          )
          SELECT 
            created_at,
            value_diff
          FROM combined_activity
          ORDER BY created_at DESC
          LIMIT 50
        `,
      );

      rangeStatsResult = await db.query(
        db.sql`
          WITH combined_activity AS (
            -- Data from daily aggregates
            SELECT 
              SUM(increment_count) as increment_count,
              SUM(total_value_added) as total_value_added,
              MAX(day_timestamp) as last_increment
            FROM user_activity_daily
            WHERE 
              user_id = ${userId}
              AND day_timestamp >= ${startDate.toISOString()}
              
            UNION ALL
            
            -- Data from hourly aggregates (for recent data that might not be in daily aggregates yet)
            SELECT 
              SUM(increment_count) as increment_count,
              SUM(total_value_added) as total_value_added,
              MAX(hour_timestamp) as last_increment
            FROM user_activity_hourly
            WHERE 
              user_id = ${userId}
              AND hour_timestamp >= ${startDate.toISOString()}
              AND hour_timestamp >= (SELECT COALESCE(MAX(day_timestamp), '1970-01-01'::timestamptz) FROM user_activity_daily)
              
            UNION ALL
            
            -- Data from raw activity (for very recent data that might not be aggregated yet)
            SELECT 
              COUNT(*) as increment_count,
              SUM(value_diff) as total_value_added,
              MAX(created_at) as last_increment
            FROM user_activity
            WHERE 
              user_id = ${userId}
              AND created_at >= ${startDate.toISOString()}
              AND created_at >= (SELECT COALESCE(MAX(hour_timestamp), '1970-01-01'::timestamptz) FROM user_activity_hourly)
          )
          SELECT 
            SUM(increment_count) as increment_count,
            SUM(total_value_added) as total_value_added,
            MAX(last_increment) as last_increment
          FROM combined_activity
        `,
      );

      dailyActivityResult = await db.query(
        db.sql`
          WITH monthly_data AS (
            SELECT 
              DATE_TRUNC('month', day_timestamp) as month,
              SUM(increment_count) as count,
              SUM(total_value_added) as total_value
            FROM user_activity_daily
            WHERE 
              user_id = ${userId}
              AND day_timestamp >= ${startDate.toISOString()}
            GROUP BY DATE_TRUNC('month', day_timestamp)
          ),
          hourly_data AS (
            SELECT 
              DATE_TRUNC('month', hour_timestamp) as month,
              SUM(increment_count) as count,
              SUM(total_value_added) as total_value
            FROM user_activity_hourly
            WHERE 
              user_id = ${userId}
              AND hour_timestamp >= ${startDate.toISOString()}
              AND hour_timestamp >= (SELECT COALESCE(MAX(day_timestamp), '1970-01-01'::timestamptz) FROM user_activity_daily)
            GROUP BY DATE_TRUNC('month', hour_timestamp)
          ),
          raw_data AS (
            SELECT 
              DATE_TRUNC('month', created_at) as month,
              COUNT(*) as count,
              SUM(value_diff) as total_value
            FROM user_activity
            WHERE 
              user_id = ${userId}
              AND created_at >= ${startDate.toISOString()}
              AND created_at >= (SELECT COALESCE(MAX(hour_timestamp), '1970-01-01'::timestamptz) FROM user_activity_hourly)
            GROUP BY DATE_TRUNC('month', created_at)
          ),
          combined_data AS (
            SELECT * FROM monthly_data
            UNION ALL
            SELECT * FROM hourly_data
            UNION ALL
            SELECT * FROM raw_data
          )
          SELECT 
            month as day,
            SUM(count) as count,
            SUM(total_value) as total_value
          FROM combined_data
          GROUP BY month
          ORDER BY month DESC
        `,
      );

      rankResult = await db.query(
        db.sql`
          WITH combined_activity AS (
            -- Data from daily aggregates
            SELECT 
              user_id,
              SUM(total_value_added) as total_added
            FROM user_activity_daily
            WHERE day_timestamp >= ${startDate.toISOString()}
            GROUP BY user_id
            
            UNION ALL
            
            -- Data from hourly aggregates (for recent data that might not be in daily aggregates yet)
            SELECT 
              user_id,
              SUM(total_value_added) as total_added
            FROM user_activity_hourly
            WHERE 
              hour_timestamp >= ${startDate.toISOString()}
              AND hour_timestamp >= (SELECT COALESCE(MAX(day_timestamp), '1970-01-01'::timestamptz) FROM user_activity_daily)
            GROUP BY user_id
            
            UNION ALL
            
            -- Data from raw activity (for very recent data that might not be aggregated yet)
            SELECT 
              user_id,
              SUM(value_diff) as total_added
            FROM user_activity
            WHERE 
              created_at >= ${startDate.toISOString()}
              AND created_at >= (SELECT COALESCE(MAX(hour_timestamp), '1970-01-01'::timestamptz) FROM user_activity_hourly)
            GROUP BY user_id
          ),
          user_totals AS (
            SELECT 
              user_id,
              SUM(total_added) as total_added
            FROM combined_activity
            GROUP BY user_id
          ),
          user_ranks AS (
            SELECT 
              user_id,
              RANK() OVER (ORDER BY total_added DESC) as rank
            FROM user_totals
          )
          SELECT rank FROM user_ranks WHERE user_id = ${userId}
        `,
      );
    } else {
      // For "all" time, use user_stats table and sample from activity
      activityResult = await db.query(
        db.sql`
          SELECT 
            created_at,
            value_diff
          FROM user_activity
          WHERE 
            user_id = ${userId}
          ORDER BY created_at DESC
          LIMIT 50
        `,
      );

      // Use the stats from user_stats table directly, but use increment_count for total_value_added
      rangeStatsResult = await db.query(
        db.sql`
          SELECT 
            increment_count,
            increment_count as total_value_added,
            last_increment,
            streak_days,
            longest_streak,
            last_streak_date
          FROM user_stats
          WHERE user_id = ${userId}
        `,
      );

      // Get daily activity from daily aggregates for a better overview
      dailyActivityResult = await db.query(
        db.sql`
          SELECT 
            day_timestamp as day,
            increment_count as count,
            total_value_added as total_value
          FROM user_activity_daily
          WHERE 
            user_id = ${userId}
          ORDER BY day DESC
          LIMIT 30
        `,
      );

      // For all-time rank, use the rank from user_stats
      rankResult = { rows: [{ rank: statsResult.rows[0]?.rank }] };
    }

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
