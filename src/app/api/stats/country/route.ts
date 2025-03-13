import { NextRequest, NextResponse } from "next/server";
import { db, sql } from "@/lib/db";

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

    let result;

    if (timeWindow === "ALL TIME") {
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
    } else {
      // For time-based queries, we need to use the raw SQL method since we're dynamically constructing the interval
      const intervalQuery = `
        WITH time_window_stats AS (
          SELECT 
            country_code,
            country_name,
            COUNT(*) as increment_count,
            SUM(value_diff) as total_value_added,
            MAX(created_at) as last_increment
          FROM country_activity
          WHERE created_at > NOW() - INTERVAL '${timeWindow}'
          GROUP BY country_code, country_name
        )
        SELECT 
          country_code, 
          country_name, 
          COALESCE(increment_count, 0) as increment_count,
          COALESCE(total_value_added, 0) as total_value_added,
          COALESCE(last_increment, NOW()) as last_increment
        FROM time_window_stats
        WHERE increment_count > 0
        ORDER BY total_value_added DESC`;

      result = await sql(intervalQuery);
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
