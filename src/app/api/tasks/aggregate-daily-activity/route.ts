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

    // Begin transaction to ensure data consistency
    await db.query(db.sql`BEGIN`);

    try {
      // Aggregate user hourly activity records into daily records for the previous day
      await db.query(db.sql`
        INSERT INTO user_activity_daily (user_id, day_timestamp, increment_count, total_value_added)
        SELECT 
          user_id,
          date_trunc('day', hour_timestamp) as day_timestamp,
          SUM(increment_count) as increment_count,
          SUM(total_value_added) as total_value_added
        FROM user_activity_hourly
        WHERE 
          hour_timestamp >= date_trunc('day', NOW() - INTERVAL '1 day') AND
          hour_timestamp < date_trunc('day', NOW())
        GROUP BY user_id, date_trunc('day', hour_timestamp)
        ON CONFLICT (user_id, day_timestamp)
        DO UPDATE SET 
          increment_count = EXCLUDED.increment_count,
          total_value_added = EXCLUDED.total_value_added
      `);

      // Delete the aggregated user hourly activity records
      const userHourlyDeleteResult = await db.query(db.sql`
        DELETE FROM user_activity_hourly
        WHERE 
          hour_timestamp >= date_trunc('day', NOW() - INTERVAL '1 day') AND
          hour_timestamp < date_trunc('day', NOW())
        RETURNING id
      `);

      const userHourlyDeletedCount = Array.isArray(userHourlyDeleteResult)
        ? userHourlyDeleteResult.length
        : userHourlyDeleteResult.rows.length;

      // Aggregate country hourly activity records into daily records for the previous day
      await db.query(db.sql`
        INSERT INTO country_activity_daily (country_code, country_name, day_timestamp, increment_count, total_value_added)
        SELECT 
          country_code,
          country_name,
          date_trunc('day', hour_timestamp) as day_timestamp,
          SUM(increment_count) as increment_count,
          SUM(total_value_added) as total_value_added
        FROM country_activity_hourly
        WHERE 
          hour_timestamp >= date_trunc('day', NOW() - INTERVAL '1 day') AND
          hour_timestamp < date_trunc('day', NOW())
        GROUP BY country_code, country_name, date_trunc('day', hour_timestamp)
        ON CONFLICT (country_code, day_timestamp)
        DO UPDATE SET 
          increment_count = EXCLUDED.increment_count,
          total_value_added = EXCLUDED.total_value_added,
          country_name = EXCLUDED.country_name
      `);

      // Delete the aggregated country hourly activity records
      const countryHourlyDeleteResult = await db.query(db.sql`
        DELETE FROM country_activity_hourly
        WHERE 
          hour_timestamp >= date_trunc('day', NOW() - INTERVAL '1 day') AND
          hour_timestamp < date_trunc('day', NOW())
        RETURNING id
      `);

      const countryHourlyDeletedCount = Array.isArray(countryHourlyDeleteResult)
        ? countryHourlyDeleteResult.length
        : countryHourlyDeleteResult.rows.length;

      // Commit the transaction
      await db.query(db.sql`COMMIT`);

      return NextResponse.json({
        success: true,
        message: "Activity data aggregated into daily records successfully",
        userHourlyRecordsDeleted: userHourlyDeletedCount,
        countryHourlyRecordsDeleted: countryHourlyDeletedCount,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      // Rollback the transaction in case of error
      await db.query(db.sql`ROLLBACK`);
      throw error;
    }
  } catch (error) {
    console.error("Error aggregating daily activity data:", error);
    return NextResponse.json(
      {
        message: "Error aggregating daily activity data",
        error: String(error),
      },
      { status: 500 },
    );
  }
}
