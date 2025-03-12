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

    // Keep detailed records for 7 days
    const detailedResult = await db.query(db.sql`
      DELETE FROM counter_history 
      WHERE 
        granularity = 'detailed' AND 
        timestamp < NOW() - INTERVAL '7 days'
      RETURNING id
    `);

    const detailedCount = Array.isArray(detailedResult)
      ? detailedResult.length
      : detailedResult.rows.length;

    // Keep hourly records for 90 days
    const hourlyResult = await db.query(db.sql`
      DELETE FROM counter_history 
      WHERE 
        granularity = 'hourly' AND 
        timestamp < NOW() - INTERVAL '90 days'
      RETURNING id
    `);

    const hourlyCount = Array.isArray(hourlyResult)
      ? hourlyResult.length
      : hourlyResult.rows.length;

    // Daily records are kept indefinitely for historical analysis

    return NextResponse.json({
      success: true,
      message: "Old counter history records cleaned up successfully",
      detailedRecordsRemoved: detailedCount,
      hourlyRecordsRemoved: hourlyCount,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error cleaning up old counter history:", error);
    return NextResponse.json(
      {
        message: "Error cleaning up old counter history",
        error: String(error),
      },
      { status: 500 },
    );
  }
}
