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

    // Keep user_activity records for 14 days (2 weeks) for accurate weekly stats
    const userActivityResult = await db.query(db.sql`
      DELETE FROM user_activity 
      WHERE 
        created_at < NOW() - INTERVAL '14 days'
      RETURNING id
    `);

    const userActivityCount = Array.isArray(userActivityResult)
      ? userActivityResult.length
      : userActivityResult.rows.length;

    // Keep country_activity records for 7 days
    const countryActivityResult = await db.query(db.sql`
      DELETE FROM country_activity 
      WHERE 
        created_at < NOW() - INTERVAL '7 days'
      RETURNING id
    `);

    const countryActivityCount = Array.isArray(countryActivityResult)
      ? countryActivityResult.length
      : countryActivityResult.rows.length;

    return NextResponse.json({
      success: true,
      message: "Old activity records cleaned up successfully",
      userActivityRecordsRemoved: userActivityCount,
      countryActivityRecordsRemoved: countryActivityCount,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error cleaning up old activity records:", error);
    return NextResponse.json(
      {
        message: "Error cleaning up old activity records",
        error: String(error),
      },
      { status: 500 },
    );
  }
}
