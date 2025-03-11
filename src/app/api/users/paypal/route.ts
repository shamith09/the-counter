import { NextResponse } from "next/server";
import { db } from "@/lib/db";

import { getServerSession } from "next-auth";

export async function POST(req: Request) {
  try {
    const session = await getServerSession();

    // Check if user is authenticated
    if (!session?.user?.email) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { email, paypal_account_id, paypal_email } = await req.json();

    // Validate input
    if (!email) {
      return NextResponse.json(
        { message: "Email is required" },
        { status: 400 },
      );
    }

    // Verify the email matches the authenticated user
    if (email !== session.user.email) {
      return NextResponse.json(
        { message: "Unauthorized to update this user" },
        { status: 403 },
      );
    }

    // Update user's PayPal information
    await db.query(db.sql`
      UPDATE users 
      SET 
        paypal_account_id = COALESCE(${paypal_account_id}, paypal_account_id),
        paypal_email = COALESCE(${paypal_email}, paypal_email)
      WHERE 
        email = ${email}
    `);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating PayPal information:", error);
    return NextResponse.json(
      { message: "Error updating PayPal information" },
      { status: 500 },
    );
  }
}
