import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface LeaderboardEntry {
  id: string;
  username: string;
  multiplications: number;
  email?: string;
  uuid?: string;
}

export async function POST(request: NextRequest) {
  try {
    // Check if the request is coming from a Vercel cron job
    const isVercelCron = request.headers.get("x-vercel-cron") === "true";

    // Check if the request has a valid API key
    const authHeader = request.headers.get("Authorization");
    const isValidApiKey = authHeader === `Bearer ${process.env.CRON_SECRET}`;

    if (!isVercelCron && !isValidApiKey) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 403 });
    }

    // Get current leaderboard
    const currentLeaderboardResult = await db.query(db.sql`
      SELECT u.id, u.username, COUNT(m.id) as multiplications
      FROM users u
      JOIN multiplications m ON m.user_id = u.id
      WHERE m.created_at > now() - interval '7 days'
      GROUP BY u.id, u.username
      ORDER BY COUNT(m.id) DESC
      LIMIT 20
    `);

    const currentLeaderboard: LeaderboardEntry[] = Array.isArray(
      currentLeaderboardResult,
    )
      ? currentLeaderboardResult
      : currentLeaderboardResult.rows || [];

    // Get previous leaderboard (stored in leaderboard_history)
    const previousLeaderboardResult = await db.query(db.sql`
      SELECT user_id as id, username, multiplications
      FROM leaderboard_history
      WHERE recorded_at = (
        SELECT MAX(recorded_at)
        FROM leaderboard_history
        WHERE recorded_at < now()
      )
      ORDER BY position ASC
      LIMIT 20
    `);

    const previousLeaderboard: LeaderboardEntry[] = Array.isArray(
      previousLeaderboardResult,
    )
      ? previousLeaderboardResult
      : previousLeaderboardResult.rows || [];

    // No previous leaderboard data, just save current and exit
    if (previousLeaderboard.length === 0) {
      // Store current leaderboard
      await storeCurrentLeaderboard(currentLeaderboard);
      return NextResponse.json({
        success: true,
        message: "First leaderboard snapshot recorded, no notifications sent",
        currentLeaderboard,
      });
    }

    // Find users who have been overtaken
    const overtakenUsers: LeaderboardEntry[] = [];

    for (let i = 0; i < previousLeaderboard.length; i++) {
      const prevUser = previousLeaderboard[i];

      // Find this user's current position
      const currentPosition = currentLeaderboard.findIndex(
        (entry) => entry.id === prevUser.id,
      );

      // If they've fallen in rank and were previously in top 3
      if (currentPosition > i && i < 3 && currentPosition >= 0) {
        overtakenUsers.push(prevUser);
      }
    }

    // Store the current leaderboard for next comparison
    await storeCurrentLeaderboard(currentLeaderboard);

    // If no users have been overtaken, just return
    if (overtakenUsers.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No users have been overtaken",
        currentLeaderboard,
        previousLeaderboard,
      });
    }

    // Get email addresses for overtaken users
    const notificationPromises = overtakenUsers.map(async (user) => {
      try {
        // Get user's email from email_subscriptions
        const userEmailResult = await db.query(db.sql`
          SELECT es.id, es.email, es.unsubscribe_token
          FROM email_subscriptions es
          JOIN users u ON u.uuid = es.user_uuid
          WHERE u.id = ${user.id}
          AND es.subscribe_leaderboard_changes = true
          LIMIT 1
        `);

        const userEmails = Array.isArray(userEmailResult)
          ? userEmailResult
          : userEmailResult.rows || [];

        if (userEmails.length === 0) {
          console.log(
            `User ${user.username} (${user.id}) has been overtaken but has no email subscription`,
          );
          return null;
        }

        const subscription = userEmails[0];

        // Send notification email
        const response = await fetch(
          new URL("/api/tasks/send-emails", request.url).toString(),
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${process.env.CRON_SECRET}`,
            },
            body: JSON.stringify({
              emailType: "leaderboard_change",
              batchSize: 1,
              emails: [subscription.email],
            }),
          },
        );

        if (!response.ok) {
          const errorText = await response.text();
          console.error(
            `Error sending leaderboard change email to ${user.username}: ${errorText}`,
          );
          return {
            success: false,
            username: user.username,
            email: subscription.email,
            error: errorText,
          };
        }

        return {
          success: true,
          username: user.username,
          email: subscription.email,
        };
      } catch (error) {
        console.error(
          `Error processing notification for ${user.username}: ${error}`,
        );
        return {
          success: false,
          username: user.username,
          error: String(error),
        };
      }
    });

    const notificationResults = await Promise.all(notificationPromises);
    const validResults = notificationResults.filter((r) => r !== null);

    return NextResponse.json({
      success: true,
      message: `Processed ${overtakenUsers.length} leaderboard change notifications`,
      notificationResults: validResults,
      overtakenUsers: overtakenUsers.map((u) => u.username),
    });
  } catch (error) {
    console.error(
      `Error processing leaderboard change notifications: ${error}`,
    );
    return NextResponse.json(
      {
        error: "Error processing leaderboard change notifications",
        details: String(error),
      },
      { status: 500 },
    );
  }
}

async function storeCurrentLeaderboard(leaderboard: LeaderboardEntry[]) {
  try {
    // Insert each leaderboard entry
    for (let i = 0; i < leaderboard.length; i++) {
      const entry = leaderboard[i];
      const position = i + 1;

      await db.query(db.sql`
        INSERT INTO leaderboard_history 
        (user_id, username, position, multiplications, recorded_at)
        VALUES (${entry.id}, ${entry.username}, ${position}, ${entry.multiplications}, now())
      `);
    }

    return true;
  } catch (error) {
    console.error(`Error storing leaderboard: ${error}`);
    return false;
  }
}
