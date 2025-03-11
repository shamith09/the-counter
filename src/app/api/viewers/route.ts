import { NextResponse } from "next/server";
import { getRedisClient } from "@/lib/db";

export async function GET() {
  try {
    const redis = getRedisClient();
    const count = await redis.get("counter");

    return NextResponse.json({ count: count || 0 });
  } catch (error) {
    console.error("Error getting viewer count:", error);
    return NextResponse.json(
      { error: "Failed to get viewer count" },
      { status: 500 },
    );
  }
}
