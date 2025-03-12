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

    let timeWindow: string;

    // Determine time window for query
    switch (timeRange) {
      case "hour":
        timeWindow = "1 HOUR";
        break;
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

    let result;
    let totalUsers = 0;

    // Get total count for pagination
    if (timeWindow === "ALL TIME") {
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
    } else {
      try {
        const countQuery = `
          SELECT COUNT(*) as total
          FROM users u
          LEFT JOIN (
            SELECT 
              user_id,
              SUM(value_diff) as total_value_added,
              COUNT(*) as increment_count
            FROM user_activity
            WHERE created_at > NOW() - INTERVAL '${timeWindow}'
            GROUP BY user_id
          ) tws ON u.id = tws.user_id
          WHERE u.username IS NOT NULL AND tws.increment_count > 0
        `;
        const countResult = await sql(countQuery);

        // Safely handle potentially empty results
        if (
          countResult &&
          typeof countResult === "object" &&
          "rows" in countResult &&
          Array.isArray(countResult.rows) &&
          countResult.rows.length > 0 &&
          countResult.rows[0].total
        ) {
          totalUsers = parseInt(countResult.rows[0].total);
        } else {
          totalUsers = 0;
        }
      } catch (error) {
        console.error("Error getting total count:", error);
        totalUsers = 0;
      }
    }

    // Get user's rank if logged in
    if (currentUserId) {
      if (timeWindow === "ALL TIME") {
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
      } else {
        try {
          const rankQuery = `
            WITH user_ranks AS (
              SELECT 
                user_id,
                SUM(value_diff) as total_value_added,
                RANK() OVER (ORDER BY SUM(value_diff) DESC) as rank
              FROM user_activity
              WHERE created_at > NOW() - INTERVAL '${timeWindow}'
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
    }

    // Get leaderboard data with pagination
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
          u.username IS NOT NULL AND
          COALESCE(ta.increment_count, 0) > 0
        ORDER BY 
          total_value_added DESC
        LIMIT ${pageSize} OFFSET ${offset}`) as unknown as
        | LeaderboardRow[]
        | DatabaseResult;
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
          u.username IS NOT NULL AND
          COALESCE(tws.increment_count, 0) > 0
        ORDER BY 
          total_value_added DESC
        LIMIT ${pageSize} OFFSET ${offset}`;

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
          u.username IS NOT NULL AND
          COALESCE(tws.increment_count, 0) > 0
        ORDER BY 
          total_value_added DESC
        LIMIT ${pageSize} OFFSET ${offset}`;

      result = await sql(intervalQuery);
    }

    // Format the response to match the expected structure
    const resultData = Array.isArray(result) ? result : result.rows || [];
    const stats = resultData.map((row, index) => ({
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
      rank: offset + index + 1,
    }));

    return NextResponse.json({
      users: stats,
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
