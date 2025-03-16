import { NextRequest, NextResponse } from "next/server";
import { db, sql } from "@/lib/db";
import { getStartOfWeek } from "@/lib/utils";

// Define types for database results
interface DatabaseResult {
  rows?: CountryRow[];
  [key: string]: unknown;
}

interface CountryRow {
  country_code: string;
  country_name: string;
  increment_count: number;
  total_value_added: number;
  last_increment: Date;
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const timeRange = searchParams.get("range");

    let result;

    // For "all time" queries, use the country_stats table
    if (!timeRange || timeRange === "all") {
      result = (await db.sql`
        SELECT 
          cs.country_code, 
          cs.country_name, 
          cs.increment_count, 
          COALESCE(SUM(ca.value_diff), 0) as total_value_added,
          cs.last_increment 
        FROM country_stats cs
        LEFT JOIN country_activity ca ON cs.country_code = ca.country_code
        WHERE cs.increment_count > 0
        GROUP BY cs.country_code, cs.country_name, cs.increment_count, cs.last_increment
        ORDER BY total_value_added DESC`) as unknown as
        | CountryRow[]
        | DatabaseResult;
    } else if (timeRange === "hour") {
      // For hourly data, query directly from country_activity
      const intervalQuery = `
        SELECT 
          country_code,
          country_name,
          COUNT(*) as increment_count,
          SUM(value_diff) as total_value_added,
          MAX(created_at) as last_increment
        FROM country_activity
        WHERE created_at > NOW() - INTERVAL '1 HOUR'
        GROUP BY country_code, country_name
        HAVING COUNT(*) > 0
        ORDER BY total_value_added DESC`;

      result = await sql(intervalQuery);
    } else if (timeRange === "day") {
      // For daily data (last 24 hours), combine hourly aggregates and recent raw activity
      const intervalQuery = `
        WITH combined_activity AS (
          -- Data from hourly aggregates
          SELECT 
            country_code,
            country_name,
            SUM(increment_count) as increment_count,
            SUM(total_value_added) as total_value_added,
            MAX(hour_timestamp) as last_increment
          FROM country_activity_hourly
          WHERE hour_timestamp > NOW() - INTERVAL '24 HOURS'
          GROUP BY country_code, country_name
          
          UNION ALL
          
          -- Data from raw activity (for recent data that might not be aggregated yet)
          SELECT 
            country_code,
            country_name,
            COUNT(*) as increment_count,
            SUM(value_diff) as total_value_added,
            MAX(created_at) as last_increment
          FROM country_activity
          WHERE 
            created_at > NOW() - INTERVAL '24 HOURS'
            -- Exclude data that's already been aggregated to avoid double counting
            AND created_at >= (SELECT COALESCE(MAX(hour_timestamp), '1970-01-01'::timestamptz) FROM country_activity_hourly)
          GROUP BY country_code, country_name
        ),
        country_totals AS (
          SELECT 
            country_code,
            MAX(country_name) as country_name, -- Use MAX to get a single value when grouping
            SUM(increment_count) as increment_count,
            SUM(total_value_added) as total_value_added,
            MAX(last_increment) as last_increment
          FROM combined_activity
          GROUP BY country_code
        )
        SELECT 
          country_code,
          country_name,
          increment_count,
          total_value_added,
          last_increment
        FROM country_totals
        WHERE increment_count > 0
        ORDER BY total_value_added DESC`;

      result = await sql(intervalQuery);
    } else if (
      timeRange === "week" ||
      timeRange === "month" ||
      timeRange === "year"
    ) {
      // For weekly, monthly, and yearly data, combine daily aggregates, hourly aggregates, and recent raw activity
      let interval;
      let startDate;

      if (timeRange === "week") {
        startDate = getStartOfWeek().toISOString();
      } else if (timeRange === "month") {
        interval = "30 DAYS";
      } else {
        interval = "365 DAYS";
      }

      let intervalQuery;

      if (timeRange === "week") {
        // For week, use the start of the current week (Monday at 12 AM UTC)
        intervalQuery = `
          WITH combined_activity AS (
            -- Data from daily aggregates
            SELECT 
              country_code,
              country_name,
              SUM(increment_count) as increment_count,
              SUM(total_value_added) as total_value_added,
              MAX(day_timestamp) as last_increment
            FROM country_activity_daily
            WHERE day_timestamp >= '${startDate}'
            GROUP BY country_code, country_name
            
            UNION ALL
            
            -- Data from hourly aggregates (for recent data that might not be in daily aggregates yet)
            SELECT 
              country_code,
              country_name,
              SUM(increment_count) as increment_count,
              SUM(total_value_added) as total_value_added,
              MAX(hour_timestamp) as last_increment
            FROM country_activity_hourly
            WHERE 
              hour_timestamp >= '${startDate}'
              AND hour_timestamp >= (SELECT COALESCE(MAX(day_timestamp), '1970-01-01'::timestamptz) FROM country_activity_daily)
            GROUP BY country_code, country_name
            
            UNION ALL
            
            -- Data from raw activity (for very recent data that might not be aggregated yet)
            SELECT 
              country_code,
              country_name,
              COUNT(*) as increment_count,
              SUM(value_diff) as total_value_added,
              MAX(created_at) as last_increment
            FROM country_activity
            WHERE 
              created_at >= '${startDate}'
              AND created_at >= (SELECT COALESCE(MAX(hour_timestamp), '1970-01-01'::timestamptz) FROM country_activity_hourly)
            GROUP BY country_code, country_name
          ),
          country_totals AS (
            SELECT 
              country_code,
              MAX(country_name) as country_name, -- Use MAX to get a single value when grouping
              SUM(increment_count) as increment_count,
              SUM(total_value_added) as total_value_added,
              MAX(last_increment) as last_increment
            FROM combined_activity
            GROUP BY country_code
          )
          SELECT 
            country_code,
            country_name,
            increment_count,
            total_value_added,
            last_increment
          FROM country_totals
          WHERE increment_count > 0
          ORDER BY total_value_added DESC`;
      } else {
        // For month and year, use the existing interval-based query
        intervalQuery = `
          WITH combined_activity AS (
            -- Data from daily aggregates
            SELECT 
              country_code,
              country_name,
              SUM(increment_count) as increment_count,
              SUM(total_value_added) as total_value_added,
              MAX(day_timestamp) as last_increment
            FROM country_activity_daily
            WHERE day_timestamp > NOW() - INTERVAL '${interval}'
            GROUP BY country_code, country_name
            
            UNION ALL
            
            -- Data from hourly aggregates (for recent data that might not be in daily aggregates yet)
            SELECT 
              country_code,
              country_name,
              SUM(increment_count) as increment_count,
              SUM(total_value_added) as total_value_added,
              MAX(hour_timestamp) as last_increment
            FROM country_activity_hourly
            WHERE 
              hour_timestamp > NOW() - INTERVAL '${interval}'
              AND hour_timestamp >= (SELECT COALESCE(MAX(day_timestamp), '1970-01-01'::timestamptz) FROM country_activity_daily)
            GROUP BY country_code, country_name
            
            UNION ALL
            
            -- Data from raw activity (for very recent data that might not be aggregated yet)
            SELECT 
              country_code,
              country_name,
              COUNT(*) as increment_count,
              SUM(value_diff) as total_value_added,
              MAX(created_at) as last_increment
            FROM country_activity
            WHERE 
              created_at > NOW() - INTERVAL '${interval}'
              AND created_at >= (SELECT COALESCE(MAX(hour_timestamp), '1970-01-01'::timestamptz) FROM country_activity_hourly)
            GROUP BY country_code, country_name
          ),
          country_totals AS (
            SELECT 
              country_code,
              MAX(country_name) as country_name, -- Use MAX to get a single value when grouping
              SUM(increment_count) as increment_count,
              SUM(total_value_added) as total_value_added,
              MAX(last_increment) as last_increment
            FROM combined_activity
            GROUP BY country_code
          )
          SELECT 
            country_code,
            country_name,
            increment_count,
            total_value_added,
            last_increment
          FROM country_totals
          WHERE increment_count > 0
          ORDER BY total_value_added DESC`;
      }

      result = await sql(intervalQuery);
    } else {
      // Default to all time if timeRange is not recognized
      result = (await db.sql`
        SELECT 
          cs.country_code, 
          cs.country_name, 
          cs.increment_count, 
          COALESCE(SUM(ca.value_diff), 0) as total_value_added,
          cs.last_increment 
        FROM country_stats cs
        LEFT JOIN country_activity ca ON cs.country_code = ca.country_code
        WHERE cs.increment_count > 0
        GROUP BY cs.country_code, cs.country_name, cs.increment_count, cs.last_increment
        ORDER BY total_value_added DESC`) as unknown as
        | CountryRow[]
        | DatabaseResult;
    }

    // Format the response to match the expected structure
    const resultData = Array.isArray(result) ? result : result.rows || [];
    const stats = resultData.map((row) => ({
      country_code: row.country_code,
      country_name: row.country_name,
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
    console.error("Error getting country stats:", error);
    return NextResponse.json(
      { error: "Failed to get country stats" },
      { status: 500 },
    );
  }
}
