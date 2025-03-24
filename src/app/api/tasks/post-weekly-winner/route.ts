import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { postTweet } from "@/lib/twitter";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest) {
  console.log("[post-weekly-winner] GET request received");

  // Check if the request is coming from a Vercel cron job
  const isVercelCron = request.headers.get("x-vercel-cron") === "true";

  // Check if the request has a valid API key
  const authHeader = request.headers.get("Authorization");
  const isValidApiKey = authHeader === `Bearer ${process.env.CRON_SECRET}`;

  if (!isVercelCron && !isValidApiKey) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 403 });
  }

  try {
    // Calculate the date range for the past week
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 7);

    // Query to get the most recent successful payout from the past week
    const completedPayouts = await db.query(db.sql`
      SELECT 
        p.user_id,
        p.user_email,
        p.paypal_email,
        p.amount,
        p.batch_id,
        p.created_at,
        u.username
      FROM 
        payouts p
      JOIN 
        users u ON p.user_id = u.id::text
      WHERE 
        p.status = 'completed' AND
        p.created_at BETWEEN ${startDate.toISOString()} AND ${endDate.toISOString()}
      ORDER BY 
        p.amount DESC, p.created_at DESC
      LIMIT 1
    `);

    // If no completed payouts in the past week, try to find any pending ones
    let winner = Array.isArray(completedPayouts)
      ? completedPayouts[0]
      : completedPayouts.rows && completedPayouts.rows[0];

    if (!winner) {
      console.log("No completed payouts found, checking for pending ones...");
      const pendingPayouts = await db.query(db.sql`
        SELECT 
          p.user_id,
          p.user_email,
          p.paypal_email,
          p.amount,
          p.batch_id,
          p.created_at,
          u.username
        FROM 
          payouts p
        JOIN 
          users u ON p.user_id = u.id::text
        WHERE 
          p.created_at BETWEEN ${startDate.toISOString()} AND ${endDate.toISOString()}
        ORDER BY 
          p.amount DESC, p.created_at DESC
        LIMIT 1
      `);

      winner = Array.isArray(pendingPayouts)
        ? pendingPayouts[0]
        : pendingPayouts.rows && pendingPayouts.rows[0];
    }

    if (!winner) {
      console.error("No weekly winner found");
      return NextResponse.json(
        { message: "No weekly winner found" },
        { status: 404 },
      );
    }

    // Create tweet text
    const tweetText =
      `🏆 Weekly Winner Announcement 🏆\n\n` +
      `Congratulations to ${winner.username} for winning $${winner.amount} this week!\n\n` +
      `Join the competition at thecounter [.] live\n\n` +
      `https://thecounter.live`;

    // Post tweet using our utility
    const result = await postTweet(tweetText);

    console.log("Weekly winner tweeted successfully:", result);

    return NextResponse.json({
      success: true,
      message: "Weekly winner posted to Twitter",
      tweetId: result.data?.id,
      winner: {
        username: winner.username,
        amount: winner.amount,
      },
    });
  } catch (error) {
    console.error(`Error in post-weekly-winner: ${error}`);
    return NextResponse.json(
      { message: "Internal server error", error: String(error) },
      { status: 500 },
    );
  }
}
