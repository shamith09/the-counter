import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET endpoint to fetch all active ads
export async function GET() {
  try {
    const result = await db.query(
      db.sql`
        SELECT id, content, created_at, expires_at
        FROM ads
        WHERE active = true AND expires_at > NOW()
        ORDER BY created_at DESC
      `,
    );

    // Handle different result formats from Neon database
    const ads = Array.isArray(result) ? result : result.rows || [];

    return NextResponse.json({ ads });
  } catch (error) {
    console.error("Error fetching ads:", error);
    return NextResponse.json({ error: "Error fetching ads" }, { status: 500 });
  }
}
