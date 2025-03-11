import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ count: string }> },
) {
  try {
    const { count } = await params;
    const countNum = parseInt(count);

    // Ensure count is valid
    const limit = Math.min(Math.max(1, countNum), 100);

    const result = await db.sql`
      SELECT u.id, u.username, us.increment_count, us.total_value_added, us.last_increment
      FROM users u
      JOIN user_stats us ON u.id = us.user_id
      WHERE u.username IS NOT NULL
      ORDER BY us.total_value_added DESC
      LIMIT ${limit}
    `;

    const users = result.map((row) => ({
      user_id: row.id,
      username: row.username,
      increment_count: parseInt(row.increment_count),
      total_value_added: parseInt(row.total_value_added),
      last_increment: row.last_increment,
    }));

    return NextResponse.json(users);
  } catch (error) {
    console.error("Error getting top users:", error);
    return NextResponse.json([]);
  }
}
