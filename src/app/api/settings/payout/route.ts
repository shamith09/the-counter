import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { db } from "@/lib/db";

// Helper function to check if user is an admin
async function isAdmin(userId: string) {
  const result = await db.sql`
    SELECT is_admin FROM users WHERE id = ${userId}
  `;

  return result.length > 0 && result[0].is_admin;
}

export async function GET() {
  try {
    const result = await db.sql`
      SELECT amount FROM payout_settings LIMIT 1
    `;

    if (result.length === 0) {
      return NextResponse.json({ amount: 10.0 }); // Default value
    }

    return NextResponse.json({ amount: parseFloat(result[0].amount) });
  } catch (error) {
    console.error("Error getting payout settings:", error);
    return NextResponse.json(
      { error: "Failed to get payout settings" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if user is an admin
    const admin = await isAdmin(session.user.id);
    if (!admin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const amount = parseFloat(body.amount);

    if (isNaN(amount) || amount <= 0) {
      return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
    }

    await db.sql`
      UPDATE payout_settings SET amount = ${amount}
    `;

    return NextResponse.json({ amount });
  } catch (error) {
    console.error("Error updating payout settings:", error);
    return NextResponse.json(
      { error: "Failed to update payout settings" },
      { status: 500 },
    );
  }
}
