import { NextResponse } from "next/server";
import { db } from "@/lib/db";

import { getServerSession } from "next-auth";

// Only allow admin users to record payouts
const ADMIN_EMAILS = process.env.ADMIN_EMAILS?.split(",") || [];

export async function POST(req: Request) {
  try {
    const session = await getServerSession();

    // Check if user is authenticated and is an admin
    if (!session?.user?.email || !ADMIN_EMAILS.includes(session.user.email)) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { user_id, user_email, paypal_email, amount, batch_id, status } =
      await req.json();

    // Validate input
    if (
      !user_id ||
      !user_email ||
      !paypal_email ||
      !amount ||
      !batch_id ||
      !status
    ) {
      return NextResponse.json(
        { message: "Missing required fields" },
        { status: 400 },
      );
    }

    // Record payout
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
        ${user_id}, 
        ${user_email}, 
        ${paypal_email}, 
        ${amount}, 
        ${batch_id}, 
        ${status}, 
        NOW()
      )
    `);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error recording payout:", error);
    return NextResponse.json(
      { message: "Error recording payout" },
      { status: 500 },
    );
  }
}
