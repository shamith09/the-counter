import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

// Define types for database results
interface HistoryRow {
  count: string;
  timestamp: Date;
}

interface QueryResult {
  rows?: HistoryRow[];
  [key: string]: unknown;
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const timeRange = searchParams.get("range");

    let query: string;

    switch (timeRange) {
      case "hour":
        // For hourly view, we only need detailed records from the last hour
        query = `
          SELECT count, timestamp 
          FROM counter_history 
          WHERE 
            granularity = 'detailed' AND
            timestamp > NOW() - INTERVAL '1 hour'
          ORDER BY timestamp DESC`;
        break;
      case "day":
        // For daily view, we use detailed records for recent data and hourly for older data
        query = `
          WITH time_ranges AS (
            SELECT 
              NOW() - INTERVAL '1 day' as start_time,
              NOW() - INTERVAL '1 hour' as recent_cutoff
          ),
          detailed_data AS (
            SELECT count, timestamp 
            FROM counter_history, time_ranges
            WHERE 
              granularity = 'detailed' AND
              timestamp > time_ranges.recent_cutoff
          ),
          hourly_data AS (
            SELECT count, timestamp 
            FROM counter_history, time_ranges
            WHERE 
              granularity = 'hourly' AND
              timestamp <= time_ranges.recent_cutoff AND
              timestamp > time_ranges.start_time
          )
          SELECT * FROM detailed_data
          UNION ALL
          SELECT * FROM hourly_data
          ORDER BY timestamp DESC`;
        break;
      case "week":
        // For weekly view, use detailed for very recent, hourly for recent, and daily for older data
        query = `
          WITH time_ranges AS (
            SELECT 
              NOW() - INTERVAL '7 days' as start_time,
              NOW() - INTERVAL '1 day' as daily_cutoff,
              NOW() - INTERVAL '1 hour' as hourly_cutoff
          ),
          detailed_data AS (
            SELECT count, timestamp 
            FROM counter_history, time_ranges
            WHERE 
              granularity = 'detailed' AND
              timestamp > time_ranges.hourly_cutoff
          ),
          hourly_data AS (
            SELECT count, timestamp 
            FROM counter_history, time_ranges
            WHERE 
              granularity = 'hourly' AND
              timestamp <= time_ranges.hourly_cutoff AND
              timestamp > time_ranges.daily_cutoff
          ),
          daily_data AS (
            SELECT count, timestamp 
            FROM counter_history, time_ranges
            WHERE 
              granularity = 'daily' AND
              timestamp <= time_ranges.daily_cutoff AND
              timestamp > time_ranges.start_time
          )
          SELECT * FROM detailed_data
          UNION ALL
          SELECT * FROM hourly_data
          UNION ALL
          SELECT * FROM daily_data
          ORDER BY timestamp DESC`;
        break;
      case "month":
        // For monthly view, use detailed for very recent, hourly for recent, and daily for older data
        query = `
          WITH time_ranges AS (
            SELECT 
              NOW() - INTERVAL '30 days' as start_time,
              NOW() - INTERVAL '1 day' as daily_cutoff,
              NOW() - INTERVAL '1 hour' as hourly_cutoff
          ),
          detailed_data AS (
            SELECT count, timestamp 
            FROM counter_history, time_ranges
            WHERE 
              granularity = 'detailed' AND
              timestamp > time_ranges.hourly_cutoff
          ),
          hourly_data AS (
            SELECT count, timestamp 
            FROM counter_history, time_ranges
            WHERE 
              granularity = 'hourly' AND
              timestamp <= time_ranges.hourly_cutoff AND
              timestamp > time_ranges.daily_cutoff
          ),
          daily_data AS (
            SELECT count, timestamp 
            FROM counter_history, time_ranges
            WHERE 
              granularity = 'daily' AND
              timestamp <= time_ranges.daily_cutoff AND
              timestamp > time_ranges.start_time
          )
          SELECT * FROM detailed_data
          UNION ALL
          SELECT * FROM hourly_data
          UNION ALL
          SELECT * FROM daily_data
          ORDER BY timestamp DESC`;
        break;
      case "year":
        // For yearly view, use detailed for very recent, hourly for recent, and daily for older data
        query = `
          WITH time_ranges AS (
            SELECT 
              NOW() - INTERVAL '365 days' as start_time,
              NOW() - INTERVAL '1 day' as daily_cutoff,
              NOW() - INTERVAL '1 hour' as hourly_cutoff
          ),
          detailed_data AS (
            SELECT count, timestamp 
            FROM counter_history, time_ranges
            WHERE 
              granularity = 'detailed' AND
              timestamp > time_ranges.hourly_cutoff
          ),
          hourly_data AS (
            SELECT count, timestamp 
            FROM counter_history, time_ranges
            WHERE 
              granularity = 'hourly' AND
              timestamp <= time_ranges.hourly_cutoff AND
              timestamp > time_ranges.daily_cutoff
          ),
          daily_data AS (
            SELECT count, timestamp 
            FROM counter_history, time_ranges
            WHERE 
              granularity = 'daily' AND
              timestamp <= time_ranges.daily_cutoff AND
              timestamp > time_ranges.start_time
          )
          SELECT * FROM detailed_data
          UNION ALL
          SELECT * FROM hourly_data
          UNION ALL
          SELECT * FROM daily_data
          ORDER BY timestamp DESC`;
        break;
      default:
        // For all-time view, use a similar approach but without the start_time constraint
        query = `
          WITH time_ranges AS (
            SELECT 
              NOW() - INTERVAL '1 day' as daily_cutoff,
              NOW() - INTERVAL '1 hour' as hourly_cutoff
          ),
          detailed_data AS (
            SELECT count, timestamp 
            FROM counter_history, time_ranges
            WHERE 
              granularity = 'detailed' AND
              timestamp > time_ranges.hourly_cutoff
          ),
          hourly_data AS (
            SELECT count, timestamp 
            FROM counter_history, time_ranges
            WHERE 
              granularity = 'hourly' AND
              timestamp <= time_ranges.hourly_cutoff AND
              timestamp > time_ranges.daily_cutoff
          ),
          daily_data AS (
            SELECT count, timestamp 
            FROM counter_history, time_ranges
            WHERE 
              granularity = 'daily' AND
              timestamp <= time_ranges.daily_cutoff
          )
          SELECT * FROM detailed_data
          UNION ALL
          SELECT * FROM hourly_data
          UNION ALL
          SELECT * FROM daily_data
          ORDER BY timestamp DESC`;
    }

    // Use the defined type for the raw query result
    const result = (await sql(query)) as HistoryRow[] | QueryResult;

    // Format the response to match the expected structure
    const formattedResult = Array.isArray(result) ? result : result.rows || [];

    return NextResponse.json(formattedResult);
  } catch (error) {
    console.error("Error getting counter history:", error);
    return NextResponse.json(
      { error: "Failed to get counter history" },
      { status: 500 },
    );
  }
}
