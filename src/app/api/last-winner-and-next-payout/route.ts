import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// Helper function to calculate next Monday at midnight UTC
function calculateNextMondayMidnight(now: Date): Date {
  // Get days until next Monday (0 = Sunday, 1 = Monday, ..., 6 = Saturday)
  const daysUntilMonday = (1 + 7 - now.getUTCDay()) % 7;

  // If today is Monday and it's exactly midnight, return today
  if (
    daysUntilMonday === 0 &&
    now.getUTCHours() === 0 &&
    now.getUTCMinutes() === 0 &&
    now.getUTCSeconds() === 0
  ) {
    return now;
  }

  // If today is Monday but after midnight, return next Monday
  const daysToAdd = daysUntilMonday === 0 ? 7 : daysUntilMonday;

  // Create date for next Monday at midnight UTC
  const nextMonday = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + daysToAdd,
      0,
      0,
      0,
      0,
    ),
  );

  return nextMonday;
}

export async function GET() {
  try {
    // Get the last winner from the payouts table
    const lastWinnerResult = await db.query(db.sql`
      SELECT p.user_id, p.user_email, COALESCE(u.username, '') as username, p.amount, p.created_at
      FROM payouts p
      LEFT JOIN users u ON p.user_id = u.id::text
      ORDER BY p.created_at DESC
      LIMIT 1
    `);

    let lastWinner = {
      username: "",
      amount: 0,
      payoutDate: new Date(),
    };

    if (lastWinnerResult.rows.length > 0) {
      const winner = lastWinnerResult.rows[0];

      // If no username is found, use the email with domain removed
      if (winner.username === "" && winner.user_email) {
        const parts = (winner.user_email as string).split("@");
        if (parts.length > 0) {
          winner.username = parts[0];
        }
      }

      lastWinner = {
        username: winner.username as string,
        amount: parseFloat(winner.amount as string),
        payoutDate: new Date(winner.created_at as string),
      };
    }

    // Calculate the next payout time (next Monday at 00:00 UTC)
    const now = new Date();
    const nextMonday = calculateNextMondayMidnight(now);
    const timeUntilNextMonday = nextMonday.getTime() - now.getTime();

    // Extract days, hours, minutes, and seconds
    const days = Math.floor(timeUntilNextMonday / (1000 * 60 * 60 * 24));
    const hours = Math.floor(
      (timeUntilNextMonday % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60),
    );
    const minutes = Math.floor(
      (timeUntilNextMonday % (1000 * 60 * 60)) / (1000 * 60),
    );
    const seconds = Math.floor((timeUntilNextMonday % (1000 * 60)) / 1000);

    const response = {
      lastWinner: lastWinner,
      nextPayout: {
        timestamp: nextMonday,
        timeLeft: {
          days,
          hours,
          minutes,
          seconds,
        },
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("Error getting last winner and next payout:", error);
    return NextResponse.json(
      { error: "Failed to get last winner and next payout" },
      { status: 500 },
    );
  }
}
