import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { db } from "@/lib/db";

export async function GET() {
  try {
    const session = await getServerSession();
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const email = session.user.email;

    const result = await db.query(db.sql`
      SELECT paypal_email, paypal_account_id
      FROM users
      WHERE email = ${email}
    `);

    if (result.rows.length === 0) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const user = result.rows[0];

    return NextResponse.json({
      paypal_account_id: !!user.paypal_account_id,
      paypal_email: user.paypal_email || null,
    });
  } catch (error) {
    console.error("Error checking PayPal status:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
