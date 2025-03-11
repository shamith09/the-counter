import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { db } from "@/lib/db";

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

export async function POST(req: Request) {
  // Check if the request has a valid API key
  const apiKey = req.headers.get("x-api-key");
  const isValidApiKey =
    apiKey === process.env.ADMIN_API_KEY && process.env.ADMIN_API_KEY;

  // If no valid API key, verify admin authentication
  if (!isValidApiKey) {
    const session = await getServerSession();

    // Check if user is authorized to process payouts
    if (!session?.user?.email || !ADMIN_EMAILS.includes(session.user.email)) {
      console.error(`Unauthorized payout attempt by ${session?.user?.email}`);
      return new NextResponse(JSON.stringify({ message: "Unauthorized" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  try {
    const { userId, userEmail, paypalEmail, amount } = await req.json();

    if (!userId || !userEmail || !paypalEmail || !amount) {
      console.error("Missing required payout parameters", {
        userId,
        userEmail,
        paypalEmail,
        amount,
      });
      return new NextResponse(
        JSON.stringify({ message: "Missing required parameters" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // Validate amount
    const payoutAmount = parseFloat(amount);
    if (isNaN(payoutAmount) || payoutAmount <= 0) {
      console.error(`Invalid payout amount: ${amount}`);
      return new NextResponse(JSON.stringify({ message: "Invalid amount" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
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
          note: `Weekly leaderboard payout for user ${userEmail}`,
          receiver: paypalEmail,
          sender_item_id: `ITEM_${userId}_${Date.now()}`,
        },
      ],
    };

    console.log(
      `Initiating payout to ${paypalEmail} for $${payoutAmount.toFixed(2)}`,
      { batchId, userId },
    );

    // Get access token
    const baseUrl =
      process.env.NODE_ENV === "development"
        ? "https://api-m.sandbox.paypal.com"
        : "https://api-m.paypal.com";

    const authResponse = await fetch(`${baseUrl}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(`${process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID}:${process.env.PAYPAL_SECRET}`).toString("base64")}`,
      },
      body: "grant_type=client_credentials",
    });

    if (!authResponse.ok) {
      const errorText = await authResponse.text();
      console.error("Failed to get PayPal access token:", errorText);
      return new NextResponse(
        JSON.stringify({ message: "Failed to authenticate with PayPal" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const { access_token } = await authResponse.json();

    // Create payout
    const payoutResponse = await fetch(`${baseUrl}/v1/payments/payouts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${access_token}`,
      },
      body: JSON.stringify(payoutData),
    });

    const payoutResult = await payoutResponse.json();

    if (!payoutResponse.ok) {
      console.error("PayPal payout failed:", payoutResult);
      return new NextResponse(
        JSON.stringify({
          message: "Payout failed",
          error: payoutResult,
        }),
        {
          status: payoutResponse.status,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // Log successful payout
    console.log("PayPal payout successful:", {
      batchId,
      payoutBatchId: payoutResult.batch_header.payout_batch_id,
      status: payoutResult.batch_header.batch_status,
      userId,
      userEmail,
      paypalEmail,
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
        ${userId}, 
        ${userEmail}, 
        ${paypalEmail}, 
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
    });
  } catch (error) {
    console.error("Error processing payout:", error);
    return new NextResponse(
      JSON.stringify({ message: "Error processing payout" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
