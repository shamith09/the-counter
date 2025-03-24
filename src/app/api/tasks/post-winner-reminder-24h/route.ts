import { NextRequest, NextResponse } from "next/server";
import { postTweet } from "@/lib/twitter";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest) {
  console.log("[post-winner-reminder-24h] GET request received");

  // Check if the request is coming from a Vercel cron job
  const isVercelCron = request.headers.get("x-vercel-cron") === "true";

  // Check if the request has a valid API key
  const authHeader = request.headers.get("Authorization");
  const isValidApiKey = authHeader === `Bearer ${process.env.CRON_SECRET}`;

  if (!isVercelCron && !isValidApiKey) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 403 });
  }

  try {
    // Create tweet text
    const tweetText =
      "🚨 24 HOURS REMAINING 🚨\n\n" +
      "Our weekly winner will be announced in 24 hours!\n\n" +
      "Keep incrementing at thecounter [.] live for your chance to win!\n\n" +
      "https://thecounter.live";

    // Post tweet using our utility
    const result = await postTweet(tweetText);

    console.log("24-hour reminder tweeted successfully:", result);

    return NextResponse.json({
      success: true,
      message: "24-hour reminder posted to Twitter",
      tweetId: result.data?.id,
    });
  } catch (error) {
    console.error(`Error in post-winner-reminder-24h: ${error}`);
    return NextResponse.json(
      { message: "Internal server error", error: String(error) },
      { status: 500 },
    );
  }
}
