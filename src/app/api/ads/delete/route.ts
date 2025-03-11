import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { db } from "@/lib/db";

export async function POST(request: Request) {
  try {
    // Check if user is authenticated
    const session = await getServerSession();
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: "You must be logged in to delete an ad" },
        { status: 401 },
      );
    }

    // Parse request body
    const { adId } = await request.json();

    if (!adId) {
      return NextResponse.json({ error: "Ad ID is required" }, { status: 400 });
    }

    // Get the user ID from the email
    const userResult = await db.query(
      db.sql`SELECT id FROM users WHERE email = ${session.user.email}`,
    );

    if (userResult.rows.length === 0) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const userId = userResult.rows[0].id;

    // Check if the ad exists and belongs to the user
    const adResult = await db.query(
      db.sql`
        SELECT * FROM ads 
        WHERE id = ${adId} 
        AND user_id = ${userId}
      `,
    );

    if (adResult.rows.length === 0) {
      return NextResponse.json(
        { error: "Ad not found or you don't have permission to delete it" },
        { status: 404 },
      );
    }

    const ad = adResult.rows[0];

    // Check if the ad is inactive (canceled)
    if (ad.active) {
      return NextResponse.json(
        { error: "You can only delete ads that have been canceled" },
        { status: 400 },
      );
    }

    // Delete the ad
    await db.query(
      db.sql`DELETE FROM ads WHERE id = ${adId} AND user_id = ${userId}`,
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting ad:", error);
    return NextResponse.json({ error: "Failed to delete ad" }, { status: 500 });
  }
}
