import { NextRequest, NextResponse } from "next/server";
import { db, sql } from "@/lib/db";
import { getServerSession } from "next-auth";
import { getStartOfWeek } from "@/lib/utils";

// Define types for database results
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

    // Get leaderboard data based on time range - without pagination limits
    if (!timeRange || timeRange === "all") {
      // For "all time" queries, use user_stats table directly
      const allTimeQuery = `
        SELECT 
          u.id, 
          u.username, 
          COALESCE(us.increment_count, 0) as increment_count, 
          COALESCE(us.total_value_added, 0) as total_value_added,
          us.last_increment
        FROM 
          users u
        LEFT JOIN user_stats us ON u.id = us.user_id
        WHERE 
          u.username IS NOT NULL AND
          COALESCE(us.total_value_added, 0) > 0
        ORDER BY 
          total_value_added DESC`;

      result = await sql(allTimeQuery);
    } else if (timeRange === "hour") {
      // For hourly data, query directly from user_activity
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
          COALESCE(tws.total_value_added, 0) > 0
        ORDER BY 
          total_value_added DESC`;

      result = await sql(intervalQuery);
    } else if (timeRange === "day") {
      // For daily data (last 24 hours), use only raw activity data
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
          COALESCE(tws.total_value_added, 0) > 0
        ORDER BY 
          total_value_added DESC`;

      result = await sql(intervalQuery);
    } else if (
      timeRange === "week" ||
      timeRange === "month" ||
      timeRange === "year"
    ) {
      // For weekly, monthly, and yearly data
      if (timeRange === "week") {
        // For week, use the start of the current week (Monday at 12 AM UTC)
        const startOfWeek = getStartOfWeek();
        const weekQuery = `
          WITH time_window_stats AS (
            SELECT 
              user_id,
              SUM(value_diff) as total_value_added,
              COUNT(*) as increment_count,
              MAX(created_at) as last_increment
            FROM user_activity
            WHERE created_at >= '${startOfWeek.toISOString()}'
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
            COALESCE(tws.total_value_added, 0) > 0
          ORDER BY 
            total_value_added DESC`;

        result = await sql(weekQuery);
      } else if (timeRange === "month") {
        // For month, use a simpler approach that combines raw activity with daily aggregates
        const monthQuery = `
          WITH raw_recent AS (
            -- Recent raw activity (last 14 days)
            SELECT 
              user_id,
              SUM(value_diff) as total_value_added,
              COUNT(*) as increment_count,
              MAX(created_at) as last_increment
            FROM user_activity
            WHERE created_at > NOW() - INTERVAL '14 DAYS'
            GROUP BY user_id
          ),
          daily_older AS (
            -- Daily aggregated data for older days (15-30 days ago)
            SELECT 
              user_id,
              SUM(total_value_added) as total_value_added,
              SUM(increment_count) as increment_count,
              MAX(day_timestamp) as last_increment
            FROM user_activity_daily
            WHERE 
              day_timestamp <= NOW() - INTERVAL '14 DAYS' 
              AND day_timestamp > NOW() - INTERVAL '30 DAYS'
            GROUP BY user_id
          ),
          combined_data AS (
            -- Combine recent raw data with older daily aggregates
            SELECT user_id, total_value_added, increment_count, last_increment FROM raw_recent
            UNION ALL
            SELECT user_id, total_value_added, increment_count, last_increment FROM daily_older
          ),
          user_totals AS (
            -- Aggregate the combined data
            SELECT 
              user_id,
              SUM(total_value_added) as total_value_added,
              SUM(increment_count) as increment_count,
              MAX(last_increment) as last_increment
            FROM combined_data
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
            COALESCE(ut.total_value_added, 0) > 0
          ORDER BY 
            total_value_added DESC`;

        result = await sql(monthQuery);
      } else {
        // For year, use a simpler approach that combines raw activity with daily aggregates
        const yearQuery = `
          WITH raw_recent AS (
            -- Recent raw activity (last 14 days)
            SELECT 
              user_id,
              SUM(value_diff) as total_value_added,
              COUNT(*) as increment_count,
              MAX(created_at) as last_increment
            FROM user_activity
            WHERE created_at > NOW() - INTERVAL '14 DAYS'
            GROUP BY user_id
          ),
          daily_older AS (
            -- Daily aggregated data for older days (15-365 days ago)
            SELECT 
              user_id,
              SUM(total_value_added) as total_value_added,
              SUM(increment_count) as increment_count,
              MAX(day_timestamp) as last_increment
            FROM user_activity_daily
            WHERE 
              day_timestamp <= NOW() - INTERVAL '14 DAYS' 
              AND day_timestamp > NOW() - INTERVAL '365 DAYS'
            GROUP BY user_id
          ),
          combined_data AS (
            -- Combine recent raw data with older daily aggregates
            SELECT user_id, total_value_added, increment_count, last_increment FROM raw_recent
            UNION ALL
            SELECT user_id, total_value_added, increment_count, last_increment FROM daily_older
          ),
          user_totals AS (
            -- Aggregate the combined data
            SELECT 
              user_id,
              SUM(total_value_added) as total_value_added,
              SUM(increment_count) as increment_count,
              MAX(last_increment) as last_increment
            FROM combined_data
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
            COALESCE(ut.total_value_added, 0) > 0
          ORDER BY 
            total_value_added DESC`;

        result = await sql(yearQuery);
      }
    }

    // Format the response to match the expected structure
    const resultData = Array.isArray(result) ? result : result.rows || [];

    // Filter out users with zero or negative total_value_added
    const allUsers = resultData
      .filter((row: LeaderboardRow) => {
        const totalValueAdded =
          typeof row.total_value_added === "string"
            ? parseInt(row.total_value_added)
            : row.total_value_added;
        return totalValueAdded > 0;
      })
      .map((row: LeaderboardRow, index: number) => ({
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
        rank: index + 1, // Calculate rank based on overall position
      }));

    // Calculate user rank if logged in
    if (currentUserId) {
      const userIndex = allUsers.findIndex(
        (user: { id: number | string }) => user.id === currentUserId,
      );
      if (userIndex !== -1) {
        userRank = userIndex + 1;
      }
    }

    // Handle pagination in TypeScript
    const totalUsers = allUsers.length;
    const totalPages = Math.max(1, Math.ceil(totalUsers / pageSize));
    const startIndex = (page - 1) * pageSize;
    const endIndex = Math.min(startIndex + pageSize, totalUsers);
    const paginatedUsers = allUsers.slice(startIndex, endIndex);

    console.log("Total users found:", totalUsers);
    console.log("Calculated total pages:", totalPages);
    console.log("Users returned:", paginatedUsers.length);
    console.log("Current page:", page);

    const response = {
      users: paginatedUsers,
      pagination: {
        page,
        pageSize,
        totalPages,
        totalUsers,
      },
      currentUser: {
        id: currentUserId,
        rank: userRank,
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("Error getting leaderboard:", error);
    return NextResponse.json(
      { error: "Failed to fetch leaderboard" },
      { status: 500 },
    );
  }
}
