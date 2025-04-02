import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Types of reminders
const REMINDER_TYPES = {
  TWENTY_FOUR_HOURS: "winner_24h",
  ONE_HOUR: "winner_1h",
};

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

    // Parse request body to get reminder type
    const body = await request.json();
    const { reminderType } = body;

    if (
      !reminderType ||
      !Object.values(REMINDER_TYPES).includes(reminderType)
    ) {
      return NextResponse.json(
        { error: "Invalid reminder type" },
        { status: 400 },
      );
    }

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
          emailType: reminderType,
        }),
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Error sending winner announcement emails: ${errorText}`);
      return NextResponse.json({
        success: false,
        message: `Failed to send winner announcement emails: ${errorText}`,
      });
    }

    const emailResult = await response.json();

    return NextResponse.json({
      success: true,
      message: `Winner announcement notifications sent successfully`,
      reminderType,
      emailResult,
    });
  } catch (error) {
    console.error(`Error sending winner announcement notifications: ${error}`);
    return NextResponse.json(
      {
        error: "Error sending winner announcement notifications",
        details: String(error),
      },
      { status: 500 },
    );
  }
}
