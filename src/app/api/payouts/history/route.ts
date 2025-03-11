import { NextResponse } from "next/server";
import { db } from "@/lib/db";

import { getServerSession } from "next-auth";

export async function GET() {
  try {
    const session = await getServerSession();

    // Check if user is authenticated
    if (!session?.user?.email) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    // Get payouts history
    const result = await db.query(db.sql`
      SELECT 
        p.id,
        p.user_id,
        p.user_email,
        p.paypal_email,
        p.amount,
        p.batch_id,
        p.status,
        p.created_at,
        u.username
      FROM 
        payouts p
      LEFT JOIN 
        users u ON p.user_id = u.id::text
      ORDER BY 
        p.created_at DESC
      LIMIT 50
    `);

    return NextResponse.json({
      payouts: result.rows,
    });
  } catch (error) {
    console.error("Error fetching payout history:", error);
    return NextResponse.json(
      { message: "Error fetching payout history" },
      { status: 500 },
    );
  }
}
