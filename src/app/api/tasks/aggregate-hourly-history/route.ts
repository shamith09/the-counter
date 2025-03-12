import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest) {
  try {
    // Check if the request is coming from a Vercel cron job
    const isVercelCron = request.headers.get("x-vercel-cron") === "true";

    // Check if the request has a valid API key
    const isValidApiKey =
      request.headers.get("Authorization") ===
      `Bearer ${process.env.CRON_SECRET}`;

    // Only allow cron jobs or requests with valid API key
    if (!isVercelCron && !isValidApiKey) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 403 });
    }

    // Aggregate detailed records into hourly records for the previous hour
    await db.query(db.sql`
      INSERT INTO counter_history (count, timestamp, granularity, start_count, end_count, avg_count, min_count, max_count)
      SELECT 
        (array_agg(count ORDER BY timestamp DESC))[1] as count,
        date_trunc('hour', timestamp) as hour_timestamp,
        'hourly' as granularity,
        (array_agg(count ORDER BY timestamp ASC))[1] as start_count,
        (array_agg(count ORDER BY timestamp DESC))[1] as end_count,
        (array_agg(count ORDER BY timestamp DESC))[1] as avg_count, -- Using last count as avg since we can't average strings
        min(count) as min_count,             -- This works for lexicographical comparison
        max(count) as max_count              -- This works for lexicographical comparison
      FROM counter_history
      WHERE 
        granularity = 'detailed' AND
        timestamp >= date_trunc('hour', NOW() - INTERVAL '1 hour') AND
        timestamp < date_trunc('hour', NOW())
      GROUP BY hour_timestamp
      ON CONFLICT (timestamp, granularity)
      DO UPDATE SET 
        count = EXCLUDED.count,
        start_count = EXCLUDED.start_count,
        end_count = EXCLUDED.end_count,
        avg_count = EXCLUDED.avg_count,
        min_count = EXCLUDED.min_count,
        max_count = EXCLUDED.max_count
    `);

    return NextResponse.json({
      success: true,
      message: "Hourly counter history aggregated successfully",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error aggregating hourly counter history:", error);
    return NextResponse.json(
      {
        message: "Error aggregating hourly counter history",
        error: String(error),
      },
      { status: 500 },
    );
  }
}
