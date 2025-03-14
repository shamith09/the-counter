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

    // Aggregate user activity records into hourly records for the previous hour
    await db.query(db.sql`
      INSERT INTO user_activity_hourly (user_id, hour_timestamp, increment_count, total_value_added)
      SELECT 
        user_id,
        date_trunc('hour', created_at) as hour_timestamp,
        COUNT(*) as increment_count,
        SUM(value_diff) as total_value_added
      FROM user_activity
      WHERE 
        created_at >= date_trunc('hour', NOW() - INTERVAL '1 hour') AND
        created_at < date_trunc('hour', NOW())
      GROUP BY user_id, date_trunc('hour', created_at)
      ON CONFLICT (user_id, hour_timestamp)
      DO UPDATE SET 
        increment_count = EXCLUDED.increment_count,
        total_value_added = EXCLUDED.total_value_added
    `);

    // Aggregate country activity records into hourly records for the previous hour
    await db.query(db.sql`
      INSERT INTO country_activity_hourly (country_code, country_name, hour_timestamp, increment_count, total_value_added)
      SELECT 
        country_code,
        country_name,
        date_trunc('hour', created_at) as hour_timestamp,
        COUNT(*) as increment_count,
        SUM(value_diff) as total_value_added
      FROM country_activity
      WHERE 
        created_at >= date_trunc('hour', NOW() - INTERVAL '1 hour') AND
        created_at < date_trunc('hour', NOW())
      GROUP BY country_code, country_name, date_trunc('hour', created_at)
      ON CONFLICT (country_code, hour_timestamp)
      DO UPDATE SET 
        increment_count = EXCLUDED.increment_count,
        total_value_added = EXCLUDED.total_value_added,
        country_name = EXCLUDED.country_name
    `);

    return NextResponse.json({
      success: true,
      message: "Activity data aggregated into hourly records successfully",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error aggregating activity data:", error);
    return NextResponse.json(
      {
        message: "Error aggregating activity data",
        error: String(error),
      },
      { status: 500 },
    );
  }
}
