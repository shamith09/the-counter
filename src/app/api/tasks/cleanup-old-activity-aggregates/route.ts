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

    // Keep daily user activity records for 365 days (1 year)
    const userDailyResult = await db.query(db.sql`
      DELETE FROM user_activity_daily 
      WHERE 
        day_timestamp < NOW() - INTERVAL '365 days'
      RETURNING id
    `);

    const userDailyCount = Array.isArray(userDailyResult)
      ? userDailyResult.length
      : userDailyResult.rows.length;

    // Keep daily country activity records for 365 days (1 year)
    const countryDailyResult = await db.query(db.sql`
      DELETE FROM country_activity_daily 
      WHERE 
        day_timestamp < NOW() - INTERVAL '365 days'
      RETURNING id
    `);

    const countryDailyCount = Array.isArray(countryDailyResult)
      ? countryDailyResult.length
      : countryDailyResult.rows.length;

    return NextResponse.json({
      success: true,
      message: "Old daily activity records cleaned up successfully",
      userDailyRecordsRemoved: userDailyCount,
      countryDailyRecordsRemoved: countryDailyCount,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error cleaning up old daily activity records:", error);
    return NextResponse.json(
      {
        message: "Error cleaning up old daily activity records",
        error: String(error),
      },
      { status: 500 },
    );
  }
}
