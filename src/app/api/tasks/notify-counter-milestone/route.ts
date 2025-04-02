import { NextRequest, NextResponse } from "next/server";
import { db, getRedisClient } from "@/lib/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Define milestone thresholds
const MILESTONES = [
  1000, 5000, 10000, 50000, 100000, 500000, 1000000,
  // Add more milestones as needed
];

export async function POST(request: NextRequest) {
  try {
    // Check if the request is coming from a Vercel cron job
    const isVercelCron = request.headers.get("x-vercel-cron") === "true";

    // Check if the request has a valid API key
    const authHeader = request.headers.get("Authorization");
    const isValidApiKey = authHeader === `Bearer ${process.env.CRON_SECRET}`;

    if (!isVercelCron && !isValidApiKey) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 403 });
    }

    // Get current counter value from Redis
    const redisClient = getRedisClient();
    const currentCounter = await redisClient.get("counter");

    if (!currentCounter) {
      return NextResponse.json(
        { error: "Could not get counter value" },
        { status: 500 },
      );
    }

    const counterValue = parseInt(currentCounter, 10);

    // Get the last notified milestone from the database
    const lastMilestoneResult = await db.query(db.sql`
      SELECT milestone 
      FROM counter_milestones 
      ORDER BY reached_at DESC 
      LIMIT 1
    `);

    const lastMilestoneRows = Array.isArray(lastMilestoneResult)
      ? lastMilestoneResult
      : lastMilestoneResult.rows || [];

    const lastMilestone =
      lastMilestoneRows.length > 0
        ? parseInt(lastMilestoneRows[0].milestone, 10)
        : 0;

    // Find the current milestone (the highest milestone that is <= current counter)
    const currentMilestone =
      MILESTONES.filter((m) => m <= counterValue).sort((a, b) => b - a)[0] || 0;

    // If we've reached a new milestone that we haven't notified about yet
    if (currentMilestone > lastMilestone) {
      console.log(`Milestone reached: ${currentMilestone}`);

      // Record this milestone in the database
      await db.query(db.sql`
        INSERT INTO counter_milestones (milestone, counter_value, reached_at)
        VALUES (${currentMilestone}, ${counterValue}, now())
      `);

      // Make a request to the send-emails API to notify subscribers
      const response = await fetch(
        new URL("/api/tasks/send-emails", request.url).toString(),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.CRON_SECRET}`,
          },
          body: JSON.stringify({
            emailType: "counter_update",
            counterValue: counterValue,
          }),
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Error sending milestone emails: ${errorText}`);
        return NextResponse.json({
          success: false,
          message: `Milestone recorded but failed to send emails: ${errorText}`,
          milestone: currentMilestone,
          counter: counterValue,
        });
      }

      const emailResult = await response.json();

      return NextResponse.json({
        success: true,
        message: `Milestone ${currentMilestone} reached and notifications sent`,
        milestone: currentMilestone,
        counter: counterValue,
        emailResult,
      });
    }

    // No new milestone reached
    return NextResponse.json({
      success: true,
      message: "No new milestone reached",
      lastMilestone,
      currentCounter: counterValue,
    });
  } catch (error) {
    console.error(`Error checking counter milestone: ${error}`);
    return NextResponse.json(
      { error: "Error checking counter milestone", details: String(error) },
      { status: 500 },
    );
  }
}
