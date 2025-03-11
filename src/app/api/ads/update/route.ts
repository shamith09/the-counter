import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { db } from "@/lib/db";

export async function POST(request: Request) {
  try {
    // Check if user is authenticated
    const session = await getServerSession();
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: "You must be logged in to update an ad" },
        { status: 401 },
      );
    }

    const { adId, content } = await request.json();

    if (!adId) {
      return NextResponse.json({ error: "Ad ID is required" }, { status: 400 });
    }

    if (!content || typeof content !== "string") {
      return NextResponse.json(
        { error: "Ad content is required" },
        { status: 400 },
      );
    }

    if (content.length > 50) {
      return NextResponse.json(
        { error: "Ad content must be 50 characters or less" },
        { status: 400 },
      );
    }

    // First, get the user's ID from their email
    const userResult = await db.query(
      db.sql`SELECT id FROM users WHERE email = ${session.user.email}`,
    );

    const users = userResult.rows || [];
    if (users.length === 0) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const userId = users[0].id;

    // Verify the ad belongs to the user
    const adResult = await db.query(
      db.sql`
        SELECT * FROM ads 
        WHERE id = ${adId}
        AND user_id = ${userId}
      `,
    );

    const ads = adResult.rows;
    if (ads.length === 0) {
      return NextResponse.json(
        { error: "Ad not found or does not belong to you" },
        { status: 404 },
      );
    }

    // Update the ad content
    await db.query(
      db.sql`
        UPDATE ads
        SET content = ${content}
        WHERE id = ${adId}
      `,
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating ad:", error);
    return NextResponse.json({ error: "Error updating ad" }, { status: 500 });
  }
}
