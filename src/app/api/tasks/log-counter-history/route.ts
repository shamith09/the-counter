import { NextRequest, NextResponse } from "next/server";
import { db, getRedisClient } from "@/lib/db";

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

    // Get current counter value from Redis
    const redis = getRedisClient();
    const count = await redis.get("counter");

    if (!count) {
      return NextResponse.json(
        { message: "Counter value not found in Redis" },
        { status: 404 },
      );
    }

    // Store in PostgreSQL counter_history table
    await db.query(db.sql`
      INSERT INTO counter_history (count, timestamp, granularity) 
      VALUES (${count}, NOW(), 'detailed') 
      ON CONFLICT (timestamp, granularity) 
      DO UPDATE SET count = ${count}
    `);

    return NextResponse.json({
      success: true,
      message: "Counter history logged successfully",
      count,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error logging counter history:", error);
    return NextResponse.json(
      { message: "Error logging counter history", error: String(error) },
      { status: 500 },
    );
  }
}
