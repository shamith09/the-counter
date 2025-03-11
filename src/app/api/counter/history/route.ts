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
        query = `
          SELECT count, timestamp 
          FROM counter_history 
          WHERE 
            granularity = 'detailed' AND
            timestamp > NOW() - INTERVAL '1 hour'
          ORDER BY timestamp DESC`;
        break;
      case "day":
        query = `
          SELECT count, timestamp 
          FROM counter_history 
          WHERE 
            CASE 
              WHEN timestamp > NOW() - INTERVAL '1 hour' THEN granularity = 'detailed'
              ELSE granularity = 'hourly'
            END AND
            timestamp > NOW() - INTERVAL '1 day'
          ORDER BY timestamp DESC`;
        break;
      case "week":
        query = `
          SELECT count, timestamp 
          FROM counter_history 
          WHERE 
            CASE 
              WHEN timestamp > NOW() - INTERVAL '1 hour' THEN granularity = 'detailed'
              WHEN timestamp > NOW() - INTERVAL '1 day' THEN granularity = 'hourly'
              ELSE granularity = 'daily'
            END AND
            timestamp > NOW() - INTERVAL '7 days'
          ORDER BY timestamp DESC`;
        break;
      case "month":
        query = `
          SELECT count, timestamp 
          FROM counter_history 
          WHERE 
            CASE 
              WHEN timestamp > NOW() - INTERVAL '1 hour' THEN granularity = 'detailed'
              WHEN timestamp > NOW() - INTERVAL '1 day' THEN granularity = 'hourly'
              ELSE granularity = 'daily'
            END AND
            timestamp > NOW() - INTERVAL '30 days'
          ORDER BY timestamp DESC`;
        break;
      case "year":
        query = `
          SELECT count, timestamp 
          FROM counter_history 
          WHERE 
            CASE 
              WHEN timestamp > NOW() - INTERVAL '1 hour' THEN granularity = 'detailed'
              WHEN timestamp > NOW() - INTERVAL '1 day' THEN granularity = 'hourly'
              ELSE granularity = 'daily'
            END AND
            timestamp > NOW() - INTERVAL '365 days'
          ORDER BY timestamp DESC`;
        break;
      default:
        query = `
          SELECT count, timestamp 
          FROM counter_history 
          WHERE 
            CASE 
              WHEN timestamp > NOW() - INTERVAL '1 hour' THEN granularity = 'detailed'
              WHEN timestamp > NOW() - INTERVAL '1 day' THEN granularity = 'hourly'
              ELSE granularity = 'daily'
            END
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
