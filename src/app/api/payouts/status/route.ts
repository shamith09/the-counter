import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

import { getPayPalPayoutDetails } from "@/lib/paypal";
import { getServerSession } from "next-auth";

// Only allow admin users to check payout status
const ADMIN_EMAILS = process.env.ADMIN_EMAILS?.split(",") || [];

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession();

    // Check if user is authenticated and is an admin
    if (!session?.user?.email || !ADMIN_EMAILS.includes(session.user.email)) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { batch_id } = await request.json();

    if (!batch_id) {
      return NextResponse.json(
        { message: "Missing batch_id parameter" },
        { status: 400 },
      );
    }

    // Get payout details from PayPal
    const payoutDetails = await getPayPalPayoutDetails(batch_id);

    // Update payout statuses in database
    if (payoutDetails.items && payoutDetails.items.length > 0) {
      for (const item of payoutDetails.items) {
        const payoutId = item.payout_item.sender_item_id.replace("PAYOUT_", "");
        const status = item.transaction_status;

        await db.query(db.sql`
          UPDATE payouts
          SET 
            status = ${status},
            transaction_id = ${item.transaction_id || null}
          WHERE 
            id = ${payoutId}
        `);
      }
    }

    return NextResponse.json({
      success: true,
      batch_status: payoutDetails.batch_header.batch_status,
      items: payoutDetails.items.map((item) => ({
        id: item.payout_item.sender_item_id.replace("PAYOUT_", ""),
        status: item.transaction_status,
        transaction_id: item.transaction_id,
        amount: item.payout_item.amount.value,
        recipient: item.payout_item.receiver,
        processed_at: item.time_processed,
      })),
    });
  } catch (error) {
    console.error("Error checking payout status:", error);
    return NextResponse.json(
      { message: "Error checking payout status" },
      { status: 500 },
    );
  }
}
