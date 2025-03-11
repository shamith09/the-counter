import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

import { createPayPalPayout, PayPalPayoutItem } from "@/lib/paypal";
import { getServerSession } from "next-auth";

// Only allow admin users to manually process payouts
const ADMIN_EMAILS = process.env.ADMIN_EMAILS?.split(",") || [];

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: NextRequest) {
  try {
    // Check if the request has a valid API key
    const apiKey = request.headers.get("x-api-key");
    const isValidApiKey =
      apiKey === process.env.ADMIN_API_KEY && process.env.ADMIN_API_KEY;

    // Check if request is from admin, API key, or from cron job
    const session = await getServerSession();
    const isAdmin =
      !isValidApiKey &&
      session?.user?.email &&
      ADMIN_EMAILS.includes(session.user.email);
    const isCron =
      request.headers.get("x-vercel-cron") === "true" &&
      request.headers.get("Authorization") ===
        `Bearer ${process.env.CRON_SECRET}`;

    if (!isAdmin && !isValidApiKey && !isCron) {
      console.error(
        `Unauthorized payout process attempt by ${session?.user?.email || "unknown user"}`,
      );
      return NextResponse.json(
        {
          success: false,
          message: "Unauthorized",
        },
        { status: 401 },
      );
    }

    // Get all pending payouts
    const pendingPayouts = await db.query(db.sql`
      SELECT 
        id, 
        user_id, 
        user_email, 
        paypal_email, 
        amount, 
        created_at
      FROM 
        payouts
      WHERE 
        status = 'PENDING'
        AND paypal_email IS NOT NULL
        AND paypal_email != ''
      ORDER BY 
        created_at ASC
    `);

    if (pendingPayouts.rows.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No pending payouts to process",
      });
    }

    // Format payouts for PayPal
    const payoutItems: PayPalPayoutItem[] = pendingPayouts.rows.map(
      (payout) => ({
        recipient_type: "EMAIL",
        amount: {
          value: String(payout.amount),
          currency: "USD",
        },
        note: "Payout from The Counter",
        receiver: String(payout.paypal_email),
        sender_item_id: String(payout.id),
      }),
    );

    // Process the payouts
    const payoutResult = await createPayPalPayout(
      payoutItems,
      "Your payment from The Counter",
      "Thank you for participating in The Counter. This is your payment based on your contribution.",
    );

    // Check if the payout was created successfully
    if (
      payoutResult.batch_header &&
      payoutResult.batch_header.batch_status !== "ERROR"
    ) {
      // Update payout status to PROCESSED
      const payoutIds = pendingPayouts.rows.map((p) => p.id);
      await db.query(db.sql`
        UPDATE payouts
        SET 
          status = 'PROCESSED',
          processed_at = NOW(),
          payout_batch_id = ${payoutResult.batch_header.payout_batch_id || ""}
        WHERE 
          id = ANY(${payoutIds})
      `);

      return NextResponse.json({
        success: true,
        message: `Successfully processed ${pendingPayouts.rows.length} payouts`,
        batchId: payoutResult.batch_header.payout_batch_id,
      });
    } else {
      return NextResponse.json(
        {
          success: false,
          message: "Failed to process payouts",
        },
        { status: 500 },
      );
    }
  } catch (error) {
    console.error("Error processing payouts:", error);
    return NextResponse.json(
      {
        success: false,
        message: "Server error while processing payouts",
      },
      { status: 500 },
    );
  }
}
