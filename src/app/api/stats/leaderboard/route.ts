import { NextRequest, NextResponse } from "next/server";
import { db, sql } from "@/lib/db";
import { getServerSession } from "next-auth";

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
    const page = parseInt(searchParams.get("page") || "1");
    const pageSize = parseInt(searchParams.get("pageSize") || "10");

    // Calculate offset for pagination
    const offset = (page - 1) * pageSize;

    // Get the current user's ID if they're logged in
    const session = await getServerSession();
    let currentUserId = null;
    let userRank = null;

    if (session?.user?.email) {
      const userResult = await db.query(
        db.sql`SELECT id FROM users WHERE email = ${session.user.email}`,
      );

      if (userResult.rows.length > 0) {
        currentUserId = userResult.rows[0].id;
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let result: any;
    let totalUsers = 0;

    // Get total count for pagination and leaderboard data based on time range
    if (!timeRange || timeRange === "all") {
      // For "all time" queries, use the user_stats table
      try {
        const countResult = await db.query(
          db.sql`
            SELECT COUNT(*) as total
            FROM users u
            LEFT JOIN user_stats us ON u.id = us.user_id
            WHERE u.username IS NOT NULL AND us.increment_count > 0
          `,
        );
        totalUsers = parseInt(String(countResult.rows[0]?.total || "0"));
      } catch (error) {
        console.error("Error getting total count:", error);
        totalUsers = 0;
      }

      // Get user's rank if logged in
      if (currentUserId) {
        try {
          const rankResult = await db.query(
            db.sql`
              SELECT 
                (
                  SELECT COUNT(*) + 1
                  FROM user_stats
                  WHERE total_value_added > (SELECT total_value_added FROM user_stats WHERE user_id = ${currentUserId})
                ) as rank
            `,
          );

          if (
            rankResult &&
            rankResult.rows &&
            rankResult.rows.length > 0 &&
            rankResult.rows[0].rank
          ) {
            userRank = parseInt(String(rankResult.rows[0].rank));
          }
        } catch (error) {
          console.error("Error getting user rank:", error);
        }
      }

      // Get leaderboard data
      result = (await db.sql`
        SELECT 
          u.id, 
          u.username, 
          COALESCE(us.increment_count, 0) as increment_count, 
          COALESCE(us.increment_count, 0) as total_value_added,
          us.last_increment
        FROM 
          users u
        LEFT JOIN user_stats us ON u.id = us.user_id
        WHERE 
          u.username IS NOT NULL AND
          COALESCE(us.increment_count, 0) > 0
        ORDER BY 
          total_value_added DESC
        LIMIT ${pageSize} OFFSET ${offset}`) as unknown as
        | LeaderboardRow[]
        | DatabaseResult;
    } else if (timeRange === "hour") {
      // For hourly data, query directly from user_activity
      try {
        const countQuery = `
          SELECT COUNT(*) as total
          FROM users u
          LEFT JOIN (
            SELECT 
              user_id,
              COUNT(*) as increment_count
            FROM user_activity
            WHERE created_at > NOW() - INTERVAL '1 HOUR'
            GROUP BY user_id
          ) tws ON u.id = tws.user_id
          WHERE u.username IS NOT NULL AND tws.increment_count > 0
        `;
        const countResult = await sql(countQuery);

        if (
          countResult &&
          typeof countResult === "object" &&
          "rows" in countResult &&
          Array.isArray(countResult.rows) &&
          countResult.rows.length > 0 &&
          countResult.rows[0].total
        ) {
          totalUsers = parseInt(countResult.rows[0].total);
        }
      } catch (error) {
        console.error("Error getting total count:", error);
      }

      // Get user's rank if logged in
      if (currentUserId) {
        try {
          const rankQuery = `
            WITH user_ranks AS (
              SELECT 
                user_id,
                SUM(value_diff) as total_value_added,
                RANK() OVER (ORDER BY SUM(value_diff) DESC) as rank
              FROM user_activity
              WHERE created_at > NOW() - INTERVAL '1 HOUR'
              GROUP BY user_id
            )
            SELECT rank
            FROM user_ranks
            WHERE user_id = '${currentUserId}'
          `;
          const rankResult = await sql(rankQuery);

          if (
            rankResult &&
            typeof rankResult === "object" &&
            "rows" in rankResult &&
            Array.isArray(rankResult.rows) &&
            rankResult.rows.length > 0 &&
            rankResult.rows[0].rank
          ) {
            userRank = parseInt(String(rankResult.rows[0].rank));
          }
        } catch (error) {
          console.error("Error getting user rank:", error);
        }
      }

      // Get leaderboard data
      const intervalQuery = `
        WITH time_window_stats AS (
          SELECT 
            user_id,
            SUM(value_diff) as total_value_added,
            COUNT(*) as increment_count,
            MAX(created_at) as last_increment
          FROM user_activity
          WHERE created_at > NOW() - INTERVAL '1 HOUR'
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
          u.username IS NOT NULL AND
          COALESCE(tws.increment_count, 0) > 0
        ORDER BY 
          total_value_added DESC
        LIMIT ${pageSize} OFFSET ${offset}`;

      result = await sql(intervalQuery);
    } else if (timeRange === "day") {
      // For daily data (last 24 hours), combine hourly aggregates and recent raw activity
      try {
        const countQuery = `
          WITH combined_users AS (
            -- Users from hourly aggregates
            SELECT user_id FROM user_activity_hourly
            WHERE hour_timestamp > NOW() - INTERVAL '24 HOURS'
            
            UNION
            
            -- Users from raw activity (for recent data that might not be aggregated yet)
            SELECT user_id FROM user_activity
            WHERE created_at > NOW() - INTERVAL '24 HOURS'
          )
          SELECT COUNT(DISTINCT u.id) as total
          FROM users u
          JOIN combined_users cu ON u.id = cu.user_id
          WHERE u.username IS NOT NULL
        `;
        const countResult = await sql(countQuery);

        if (
          countResult &&
          typeof countResult === "object" &&
          "rows" in countResult &&
          Array.isArray(countResult.rows) &&
          countResult.rows.length > 0 &&
          countResult.rows[0].total
        ) {
          totalUsers = parseInt(countResult.rows[0].total);
        }
      } catch (error) {
        console.error("Error getting total count:", error);
      }

      // Get user's rank if logged in
      if (currentUserId) {
        try {
          const rankQuery = `
            WITH combined_activity AS (
              -- Data from hourly aggregates
              SELECT 
                user_id,
                SUM(total_value_added) as total_value_added
              FROM user_activity_hourly
              WHERE hour_timestamp > NOW() - INTERVAL '24 HOURS'
              GROUP BY user_id
              
              UNION ALL
              
              -- Data from raw activity (for recent data that might not be aggregated yet)
              SELECT 
                user_id,
                SUM(value_diff) as total_value_added
              FROM user_activity
              WHERE 
                created_at > NOW() - INTERVAL '24 HOURS'
                -- Exclude data that's already been aggregated to avoid double counting
                AND created_at >= (SELECT COALESCE(MAX(hour_timestamp), '1970-01-01'::timestamptz) FROM user_activity_hourly)
              GROUP BY user_id
            ),
            user_totals AS (
              SELECT 
                user_id,
                SUM(total_value_added) as total_value_added
              FROM combined_activity
              GROUP BY user_id
            ),
            user_ranks AS (
              SELECT 
                user_id,
                RANK() OVER (ORDER BY total_value_added DESC) as rank
              FROM user_totals
            )
            SELECT rank
            FROM user_ranks
            WHERE user_id = '${currentUserId}'
          `;
          const rankResult = await sql(rankQuery);

          if (
            rankResult &&
            typeof rankResult === "object" &&
            "rows" in rankResult &&
            Array.isArray(rankResult.rows) &&
            rankResult.rows.length > 0 &&
            rankResult.rows[0].rank
          ) {
            userRank = parseInt(String(rankResult.rows[0].rank));
          }
        } catch (error) {
          console.error("Error getting user rank:", error);
        }
      }

      // Get leaderboard data
      const intervalQuery = `
        WITH combined_activity AS (
          -- Data from hourly aggregates
          SELECT 
            user_id,
            SUM(total_value_added) as total_value_added,
            SUM(increment_count) as increment_count,
            MAX(hour_timestamp) as last_increment
          FROM user_activity_hourly
          WHERE hour_timestamp > NOW() - INTERVAL '24 HOURS'
          GROUP BY user_id
          
          UNION ALL
          
          -- Data from raw activity (for recent data that might not be aggregated yet)
          SELECT 
            user_id,
            SUM(value_diff) as total_value_added,
            COUNT(*) as increment_count,
            MAX(created_at) as last_increment
          FROM user_activity
          WHERE 
            created_at > NOW() - INTERVAL '24 HOURS'
            -- Exclude data that's already been aggregated to avoid double counting
            AND created_at >= (SELECT COALESCE(MAX(hour_timestamp), '1970-01-01'::timestamptz) FROM user_activity_hourly)
          GROUP BY user_id
        ),
        user_totals AS (
          SELECT 
            user_id,
            SUM(total_value_added) as total_value_added,
            SUM(increment_count) as increment_count,
            MAX(last_increment) as last_increment
          FROM combined_activity
          GROUP BY user_id
        )
        SELECT 
          u.id, 
          u.username, 
          COALESCE(ut.increment_count, 0) as increment_count, 
          COALESCE(ut.total_value_added, 0) as total_value_added,
          ut.last_increment
        FROM 
          users u
        LEFT JOIN user_totals ut ON u.id = ut.user_id
        WHERE 
          u.username IS NOT NULL AND
          COALESCE(ut.increment_count, 0) > 0
        ORDER BY 
          total_value_added DESC
        LIMIT ${pageSize} OFFSET ${offset}`;

      result = await sql(intervalQuery);
    } else if (
      timeRange === "week" ||
      timeRange === "month" ||
      timeRange === "year"
    ) {
      // For weekly, monthly, and yearly data, combine daily aggregates, hourly aggregates, and recent raw activity
      let interval;
      if (timeRange === "week") {
        interval = "7 DAYS";
      } else if (timeRange === "month") {
        interval = "30 DAYS";
      } else {
        interval = "365 DAYS";
      }

      try {
        const countQuery = `
          WITH combined_users AS (
            -- Users from daily aggregates
            SELECT user_id FROM user_activity_daily
            WHERE day_timestamp > NOW() - INTERVAL '${interval}'
            
            UNION
            
            -- Users from hourly aggregates (for recent data that might not be in daily aggregates yet)
            SELECT user_id FROM user_activity_hourly
            WHERE 
              hour_timestamp > NOW() - INTERVAL '${interval}'
              AND hour_timestamp >= (SELECT COALESCE(MAX(day_timestamp), '1970-01-01'::timestamptz) FROM user_activity_daily)
            
            UNION
            
            -- Users from raw activity (for very recent data that might not be aggregated yet)
            SELECT user_id FROM user_activity
            WHERE 
              created_at > NOW() - INTERVAL '${interval}'
              AND created_at >= (SELECT COALESCE(MAX(hour_timestamp), '1970-01-01'::timestamptz) FROM user_activity_hourly)
          )
          SELECT COUNT(DISTINCT u.id) as total
          FROM users u
          JOIN combined_users cu ON u.id = cu.user_id
          WHERE u.username IS NOT NULL
        `;
        const countResult = await sql(countQuery);

        if (
          countResult &&
          typeof countResult === "object" &&
          "rows" in countResult &&
          Array.isArray(countResult.rows) &&
          countResult.rows.length > 0 &&
          countResult.rows[0].total
        ) {
          totalUsers = parseInt(countResult.rows[0].total);
        }
      } catch (error) {
        console.error("Error getting total count:", error);
      }

      // Get user's rank if logged in
      if (currentUserId) {
        try {
          const rankQuery = `
            WITH combined_activity AS (
              -- Data from daily aggregates
              SELECT 
                user_id,
                SUM(total_value_added) as total_value_added
              FROM user_activity_daily
              WHERE day_timestamp > NOW() - INTERVAL '${interval}'
              GROUP BY user_id
              
              UNION ALL
              
              -- Data from hourly aggregates (for recent data that might not be in daily aggregates yet)
              SELECT 
                user_id,
                SUM(total_value_added) as total_value_added
              FROM user_activity_hourly
              WHERE 
                hour_timestamp > NOW() - INTERVAL '${interval}'
                AND hour_timestamp >= (SELECT COALESCE(MAX(day_timestamp), '1970-01-01'::timestamptz) FROM user_activity_daily)
              GROUP BY user_id
              
              UNION ALL
              
              -- Data from raw activity (for very recent data that might not be aggregated yet)
              SELECT 
                user_id,
                SUM(value_diff) as total_value_added
              FROM user_activity
              WHERE 
                created_at > NOW() - INTERVAL '${interval}'
                AND created_at >= (SELECT COALESCE(MAX(hour_timestamp), '1970-01-01'::timestamptz) FROM user_activity_hourly)
              GROUP BY user_id
            ),
            user_totals AS (
              SELECT 
                user_id,
                SUM(total_value_added) as total_value_added
              FROM combined_activity
              GROUP BY user_id
            ),
            user_ranks AS (
              SELECT 
                user_id,
                RANK() OVER (ORDER BY total_value_added DESC) as rank
              FROM user_totals
            )
            SELECT rank
            FROM user_ranks
            WHERE user_id = '${currentUserId}'
          `;
          const rankResult = await sql(rankQuery);

          if (
            rankResult &&
            typeof rankResult === "object" &&
            "rows" in rankResult &&
            Array.isArray(rankResult.rows) &&
            rankResult.rows.length > 0 &&
            rankResult.rows[0].rank
          ) {
            userRank = parseInt(String(rankResult.rows[0].rank));
          }
        } catch (error) {
          console.error("Error getting user rank:", error);
        }
      }

      // Get leaderboard data
      const intervalQuery = `
        WITH combined_activity AS (
          -- Data from daily aggregates
          SELECT 
            user_id,
            SUM(total_value_added) as total_value_added,
            SUM(increment_count) as increment_count,
            MAX(day_timestamp) as last_increment
          FROM user_activity_daily
          WHERE day_timestamp > NOW() - INTERVAL '${interval}'
          GROUP BY user_id
          
          UNION ALL
          
          -- Data from hourly aggregates (for recent data that might not be in daily aggregates yet)
          SELECT 
            user_id,
            SUM(total_value_added) as total_value_added,
            SUM(increment_count) as increment_count,
            MAX(hour_timestamp) as last_increment
          FROM user_activity_hourly
          WHERE 
            hour_timestamp > NOW() - INTERVAL '${interval}'
            AND hour_timestamp >= (SELECT COALESCE(MAX(day_timestamp), '1970-01-01'::timestamptz) FROM user_activity_daily)
          GROUP BY user_id
          
          UNION ALL
          
          -- Data from raw activity (for very recent data that might not be aggregated yet)
          SELECT 
            user_id,
            SUM(value_diff) as total_value_added,
            COUNT(*) as increment_count,
            MAX(created_at) as last_increment
          FROM user_activity
          WHERE 
            created_at > NOW() - INTERVAL '${interval}'
            AND created_at >= (SELECT COALESCE(MAX(hour_timestamp), '1970-01-01'::timestamptz) FROM user_activity_hourly)
          GROUP BY user_id
        ),
        user_totals AS (
          SELECT 
            user_id,
            SUM(total_value_added) as total_value_added,
            SUM(increment_count) as increment_count,
            MAX(last_increment) as last_increment
          FROM combined_activity
          GROUP BY user_id
        )
        SELECT 
          u.id, 
          u.username, 
          COALESCE(ut.increment_count, 0) as increment_count, 
          COALESCE(ut.total_value_added, 0) as total_value_added,
          ut.last_increment
        FROM 
          users u
        LEFT JOIN user_totals ut ON u.id = ut.user_id
        WHERE 
          u.username IS NOT NULL AND
          COALESCE(ut.increment_count, 0) > 0
        ORDER BY 
          total_value_added DESC
        LIMIT ${pageSize} OFFSET ${offset}`;

      result = await sql(intervalQuery);
    }

    // Format the response to match the expected structure
    const resultData = Array.isArray(result) ? result : result.rows || [];
    const users = resultData.map((row: LeaderboardRow, index: number) => ({
      id: row.id,
      username: row.username,
      increment_count:
        typeof row.increment_count === "string"
          ? parseInt(row.increment_count)
          : row.increment_count,
      total_value_added:
        typeof row.total_value_added === "string"
          ? parseInt(row.total_value_added)
          : row.total_value_added,
      last_increment: row.last_increment,
      rank: (page - 1) * pageSize + index + 1, // Calculate rank based on pagination
    }));

    return NextResponse.json({
      users: users,
      pagination: {
        page,
        pageSize,
        totalPages: Math.ceil(totalUsers / pageSize),
        totalUsers,
      },
      currentUser: {
        id: currentUserId,
        rank: userRank,
      },
    });
  } catch (error) {
    console.error("Error getting leaderboard:", error);
    return NextResponse.json(
      { error: "Failed to fetch leaderboard" },
      { status: 500 },
    );
  }
}
