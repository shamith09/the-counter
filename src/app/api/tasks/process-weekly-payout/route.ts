import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getServerSession } from "next-auth";

// Types for payout data
interface PayoutItem {
  recipient_type: string;
  amount: {
    value: string;
    currency: string;
  };
  note: string;
  receiver: string;
  sender_item_id: string;
}

interface PayoutBatch {
  sender_batch_header: {
    sender_batch_id: string;
    email_subject: string;
    email_message: string;
  };
  items: PayoutItem[];
}

// Only allow admin users to trigger payouts
const ADMIN_EMAILS = process.env.ADMIN_EMAILS?.split(",") || [];

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Add GET handler to handle cron job requests which use GET by default
export async function GET(request: NextRequest) {
  console.log("[process-weekly-payout] GET request received", {
    headers: Object.fromEntries(request.headers.entries()),
    url: request.url,
    isCron: request.headers.get("x-vercel-cron") === "true",
  });

  // Redirect to POST handler logic
  return handlePayoutRequest(request);
}

export async function POST(request: NextRequest) {
  console.log("[process-weekly-payout] POST request received", {
    headers: Object.fromEntries(request.headers.entries()),
    url: request.url,
  });

  return handlePayoutRequest(request);
}

async function handlePayoutRequest(request: NextRequest) {
  try {
    // Check if the request is coming from a Vercel cron job
    const isVercelCron = request.headers.get("x-vercel-cron") === "true";
    console.log("[process-weekly-payout] isVercelCron:", isVercelCron);

    // Check if the request has a valid API key
    const authHeader = request.headers.get("Authorization");
    const isValidApiKey = authHeader === `Bearer ${process.env.CRON_SECRET}`;
    console.log(
      "[process-weekly-payout] Authorization header present:",
      !!authHeader,
    );
    console.log("[process-weekly-payout] isValidApiKey:", isValidApiKey);

    // If not a cron job or doesn't have valid API key, verify admin authentication
    if (!isVercelCron && !isValidApiKey) {
      const session = await getServerSession();
      console.log("[process-weekly-payout] User session:", {
        email: session?.user?.email,
        isAdmin: session?.user?.email
          ? ADMIN_EMAILS.includes(session.user.email)
          : false,
      });

      // Check if user is authorized to process payouts
      if (!session?.user?.email || !ADMIN_EMAILS.includes(session.user.email)) {
        console.error(
          `Unauthorized weekly payout attempt by ${session?.user?.email}`,
        );
        return NextResponse.json({ message: "Unauthorized" }, { status: 403 });
      }
    }

    // Check if weekly payouts are enabled
    const enableWeeklyPayouts = process.env.ENABLE_WEEKLY_PAYOUTS === "true";
    console.log(
      "[process-weekly-payout] Weekly payouts enabled:",
      enableWeeklyPayouts,
    );

    if (!enableWeeklyPayouts) {
      return NextResponse.json({
        success: false,
        message:
          "Weekly payouts are disabled. Set ENABLE_WEEKLY_PAYOUTS=true to enable them.",
      });
    }

    // Get the top user from the previous week
    const lastWeekStart = new Date();
    lastWeekStart.setUTCDate(lastWeekStart.getUTCDate() - 7);
    lastWeekStart.setUTCHours(0, 0, 0, 0);

    const lastWeekEnd = new Date();
    lastWeekEnd.setUTCHours(0, 0, 0, 0);

    console.log("[process-weekly-payout] Querying for top users between:", {
      lastWeekStart: lastWeekStart.toISOString(),
      lastWeekEnd: lastWeekEnd.toISOString(),
    });

    // Find the top user by activity in the last week
    const topUsers = await db.query(db.sql`
      WITH weekly_stats AS (
        SELECT 
          user_id,
          SUM(value_diff) as total_value_added
        FROM 
          user_activity
        WHERE 
          created_at >= ${lastWeekStart.toISOString()}
          AND created_at < ${lastWeekEnd.toISOString()}
        GROUP BY 
          user_id
        ORDER BY 
          total_value_added DESC
        LIMIT 1
      )
      SELECT 
        u.id,
        u.username,
        u.email,
        u.paypal_email,
        ws.total_value_added
      FROM 
        weekly_stats ws
      JOIN 
        users u ON ws.user_id = u.id
      WHERE 
        u.paypal_email IS NOT NULL
        AND u.paypal_email != ''
    `);

    // Ensure we're handling the Neon database result format correctly
    const users = Array.isArray(topUsers) ? topUsers : topUsers.rows || [];
    console.log("[process-weekly-payout] Top users found:", users.length);

    if (users.length === 0) {
      return NextResponse.json({
        success: false,
        message: "No eligible users found for payout",
      });
    }

    const winner = users[0];
    console.log("[process-weekly-payout] Winner selected:", {
      id: winner.id,
      username: winner.username,
      hasEmail: !!winner.email,
      hasPaypalEmail: !!winner.paypal_email,
      totalValueAdded: winner.total_value_added,
    });

    // Get payout amount from settings
    const payoutSettings = await db.query(db.sql`
      SELECT amount FROM payout_settings ORDER BY id DESC LIMIT 1
    `);

    const settingsRows = Array.isArray(payoutSettings)
      ? payoutSettings
      : payoutSettings.rows || [];
    const payoutAmount =
      settingsRows.length > 0 ? parseFloat(settingsRows[0].amount) : 10.0; // Default to $10 if no settings found

    console.log("[process-weekly-payout] Payout amount:", {
      amount: payoutAmount,
      fromSettings: settingsRows.length > 0,
    });

    if (isNaN(payoutAmount) || payoutAmount <= 0) {
      console.error(`Invalid payout amount: ${payoutAmount}`);
      return NextResponse.json({
        success: false,
        message: "Invalid payout amount in settings",
      });
    }

    // Generate a unique batch ID
    const batchId = `WEEKLY_PAYOUT_${Date.now()}`;

    // Create payout data
    const payoutData: PayoutBatch = {
      sender_batch_header: {
        sender_batch_id: batchId,
        email_subject: "You've received a payout from The Counter!",
        email_message:
          "Congratulations! You've received a payout for topping The Counter leaderboard this week.",
      },
      items: [
        {
          recipient_type: "EMAIL",
          amount: {
            value: payoutAmount.toFixed(2),
            currency: "USD",
          },
          note: `Weekly leaderboard payout for user ${winner.email || winner.username}`,
          receiver: winner.paypal_email,
          sender_item_id: `ITEM_${winner.id}_${Date.now()}`,
        },
      ],
    };

    console.log(
      `Initiating weekly payout to ${winner.paypal_email} for $${payoutAmount.toFixed(2)}`,
      { batchId, userId: winner.id },
    );

    // Get access token
    const baseUrl =
      process.env.NODE_ENV === "development"
        ? "https://api-m.sandbox.paypal.com"
        : "https://api-m.paypal.com";

    console.log("[process-weekly-payout] Using PayPal API URL:", baseUrl);
    console.log(
      "[process-weekly-payout] PayPal client ID exists:",
      !!process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID,
    );
    console.log(
      "[process-weekly-payout] PayPal secret exists:",
      !!process.env.PAYPAL_SECRET,
    );

    const authResponse = await fetch(`${baseUrl}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(`${process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID}:${process.env.PAYPAL_SECRET}`).toString("base64")}`,
      },
      body: "grant_type=client_credentials",
    });

    console.log(
      "[process-weekly-payout] PayPal auth response status:",
      authResponse.status,
    );

    if (!authResponse.ok) {
      const errorText = await authResponse.text();
      console.error("Failed to get PayPal access token:", errorText);
      return NextResponse.json(
        { message: "Failed to authenticate with PayPal" },
        { status: 500 },
      );
    }

    const { access_token } = await authResponse.json();
    console.log("[process-weekly-payout] PayPal access token received");

    // Create payout
    const payoutResponse = await fetch(`${baseUrl}/v1/payments/payouts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${access_token}`,
      },
      body: JSON.stringify(payoutData),
    });

    console.log(
      "[process-weekly-payout] PayPal payout response status:",
      payoutResponse.status,
    );

    const payoutResult = await payoutResponse.json();

    if (!payoutResponse.ok) {
      console.error("PayPal payout failed:", payoutResult);
      return NextResponse.json(
        {
          message: "Payout failed",
          error: payoutResult,
        },
        { status: payoutResponse.status },
      );
    }

    // Log successful payout
    console.log("PayPal weekly payout successful:", {
      batchId,
      payoutBatchId: payoutResult.batch_header.payout_batch_id,
      status: payoutResult.batch_header.batch_status,
      userId: winner.id,
      userEmail: winner.email,
      paypalEmail: winner.paypal_email,
      amount: payoutAmount.toFixed(2),
    });

    // Record payout in database
    await db.query(db.sql`
      INSERT INTO payouts (
        user_id, 
        user_email, 
        paypal_email, 
        amount, 
        batch_id, 
        status, 
        created_at
      ) VALUES (
        ${winner.id}, 
        ${winner.email || winner.username}, 
        ${winner.paypal_email}, 
        ${payoutAmount}, 
        ${payoutResult.batch_header.payout_batch_id}, 
        ${payoutResult.batch_header.batch_status}, 
        NOW()
      )
    `);

    return NextResponse.json({
      success: true,
      batchId: payoutResult.batch_header.payout_batch_id,
      status: payoutResult.batch_header.batch_status,
      winner: {
        id: winner.id,
        username: winner.username,
        email: winner.email,
        amount: payoutAmount,
      },
    });
  } catch (error) {
    console.error("Error processing weekly payout:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to process weekly payout",
      },
      { status: 500 },
    );
  }
}
