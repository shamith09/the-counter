import { NextRequest, NextResponse } from "next/server";
import { postTweet } from "@/lib/twitter";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest) {
  console.log("[post-winner-reminder-1h] GET request received");

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
      "⏰ 1 HOUR REMAINING ⏰\n\n" +
      "Our weekly winner will be announced in just 1 hour!\n\n" +
      "Last chance to increment at thecounter [.] live for your chance to win!\n\n" +
      "https://thecounter.live";

    // Post tweet using our utility
    const result = await postTweet(tweetText);

    console.log("1-hour reminder tweeted successfully:", result);

    return NextResponse.json({
      success: true,
      message: "1-hour reminder posted to Twitter",
      tweetId: result.data?.id,
    });
  } catch (error) {
    console.error(`Error in post-winner-reminder-1h: ${error}`);
    return NextResponse.json(
      { message: "Internal server error", error: String(error) },
      { status: 500 },
    );
  }
}
