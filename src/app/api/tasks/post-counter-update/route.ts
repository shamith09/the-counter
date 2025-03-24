import { NextRequest, NextResponse } from "next/server";
import { getRedisClient } from "@/lib/db";
import { postTweet } from "@/lib/twitter";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Helper function to format large numbers
function formatLargeNumber(numberStr: string) {
  try {
    // Convert to integer
    const number = parseInt(numberStr, 10);

    // Format with commas
    return new Intl.NumberFormat().format(number);
  } catch (error) {
    console.error(`Error formatting number: ${error}`);
    return numberStr;
  }
}

export async function GET(request: NextRequest) {
  console.log("[post-counter-update] GET request received");

  // Check if the request is coming from a Vercel cron job
  const isVercelCron = request.headers.get("x-vercel-cron") === "true";

  // Check if the request has a valid API key
  const authHeader = request.headers.get("Authorization");
  const isValidApiKey = authHeader === `Bearer ${process.env.CRON_SECRET}`;

  if (!isVercelCron && !isValidApiKey) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 403 });
  }

  try {
    // Connect to Redis
    const redisClient = getRedisClient();

    // Get counter value
    const counterValue = await redisClient.get("counter");
    if (!counterValue) {
      console.error("Failed to get counter value from Redis");
      return NextResponse.json(
        { message: "Failed to get counter value" },
        { status: 500 },
      );
    }

    // Format the counter value
    const formattedValue = formatLargeNumber(counterValue);

    // Create tweet text
    const tweetText = `🔢 The Counter is now at: ${formattedValue} 🔢\n\nKeep incrementing at thecounter [.] live\n\nhttps://thecounter.live`;

    // Post tweet using our utility
    const result = await postTweet(tweetText);

    console.log("Counter update tweeted successfully:", result);

    return NextResponse.json({
      success: true,
      message: "Counter update posted to Twitter",
      tweetId: result.data?.id,
    });
  } catch (error) {
    console.error(`Error in post-counter-update: ${error}`);
    return NextResponse.json(
      { message: "Internal server error", error: String(error) },
      { status: 500 },
    );
  }
}
