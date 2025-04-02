import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getServerSession } from "next-auth";
import { authOptions } from "../../../../lib/auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const EMAIL_TYPES = {
  COUNTER_UPDATE: "counter_update",
  WINNER_24H: "winner_24h",
  WINNER_1H: "winner_1h",
  LEADERBOARD_CHANGE: "leaderboard_change",
};

export async function POST(request: NextRequest) {
  try {
    // Check if user is admin
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 403 });
    }

    // Check if user is admin
    const adminCheckResult = await db.query(db.sql`
      SELECT is_admin FROM users WHERE email = ${session.user.email} LIMIT 1
    `);

    const isAdmin = Array.isArray(adminCheckResult)
      ? adminCheckResult[0]?.is_admin === true
      : adminCheckResult.rows[0]?.is_admin === true;

    if (!isAdmin) {
      return NextResponse.json(
        { message: "Unauthorized, admin access required" },
        { status: 403 },
      );
    }

    // Parse request body
    const body = await request.json();
    const { emailType, testEmail, counterValue } = body;

    if (!emailType || !Object.values(EMAIL_TYPES).includes(emailType)) {
      return NextResponse.json(
        { error: "Invalid email type" },
        { status: 400 },
      );
    }

    if (!testEmail) {
      return NextResponse.json(
        { error: "Test email address required" },
        { status: 400 },
      );
    }

    // Check if the email is subscribed
    const subscriptionResult = await db.query(db.sql`
      SELECT id FROM email_subscriptions
      WHERE email = ${testEmail}
      LIMIT 1
    `);

    const subscriptionRows = Array.isArray(subscriptionResult)
      ? subscriptionResult
      : subscriptionResult.rows || [];

    let subscriptionId;

    if (subscriptionRows.length === 0) {
      // Create a temporary subscription for testing
      const insertResult = await db.query(db.sql`
        INSERT INTO email_subscriptions (
          email, 
          unsubscribe_token,
          subscribe_counter_updates,
          subscribe_winner_24h,
          subscribe_winner_1h,
          subscribe_leaderboard_changes,
          created_at
        )
        VALUES (
          ${testEmail},
          ${crypto.randomUUID()},
          true,
          true,
          true,
          true,
          now()
        )
        RETURNING id
      `);

      subscriptionId = Array.isArray(insertResult)
        ? insertResult[0]?.id
        : insertResult.rows[0]?.id;

      if (!subscriptionId) {
        return NextResponse.json(
          { error: "Failed to create test subscription" },
          { status: 500 },
        );
      }
    } else {
      subscriptionId = subscriptionRows[0].id;
    }

    // Format email content based on type
    let subject, content;
    const formattedCounter = counterValue
      ? Number(counterValue).toLocaleString()
      : "1,000,000";

    switch (emailType) {
      case EMAIL_TYPES.COUNTER_UPDATE:
        subject = `The Counter has reached ${formattedCounter}!`;
        content = `
          <p>The Counter has now reached <strong>${formattedCounter}</strong>!</p>
          <p>Visit <a href="https://thecounter.live">thecounter.live</a> to join the action.</p>
        `;
        break;
      case EMAIL_TYPES.WINNER_24H:
        subject = "24 Hours Until Weekly Winner Announcement";
        content = `
          <p>In just 24 hours, The Counter will announce this week's winner!</p>
          <p>Visit <a href="https://thecounter.live">thecounter.live</a> to increase your chances of winning.</p>
        `;
        break;
      case EMAIL_TYPES.WINNER_1H:
        subject = "1 Hour Until Weekly Winner Announcement";
        content = `
          <p>The weekly winner will be announced in just 1 hour!</p>
          <p>This is your last chance to participate. Visit <a href="https://thecounter.live">thecounter.live</a> now!</p>
        `;
        break;
      case EMAIL_TYPES.LEADERBOARD_CHANGE:
        subject = "You've Been Overtaken on the Leaderboard";
        content = `
          <p>Someone has overtaken your position as #1 on The Counter leaderboard!</p>
          <p>Visit <a href="https://thecounter.live">thecounter.live</a> to reclaim your position.</p>
        `;
        break;
    }

    // Add unsubscribe footer
    const unsubscribeUrl = `https://thecounter.live/unsubscribe?token=test-token`;
    const emailFooter = `
      <p style="font-size: 12px; color: #666; margin-top: 30px; border-top: 1px solid #eee; padding-top: 10px;">
        You're receiving this email because you subscribed to notifications from The Counter.
        <br>
        <a href="${unsubscribeUrl}">Unsubscribe from all emails</a>
        <br><br>
        <em>This is a test email sent from the admin panel.</em>
      </p>
    `;

    const emailContent = content + emailFooter;

    // Log the test email
    await db.query(db.sql`
      INSERT INTO email_logs (subscription_id, email, subject, email_type, success)
      VALUES (${subscriptionId}, ${testEmail}, ${subject}, ${emailType}, true)
    `);

    // In a real implementation, you would send the actual email here
    // For now, we'll just log it
    console.log(`[TEST EMAIL] To: ${testEmail}`);
    console.log(`[TEST EMAIL] Subject: ${subject}`);
    console.log(
      `[TEST EMAIL] Content length: ${emailContent.length} characters`,
    );

    return NextResponse.json({
      success: true,
      message: "Test email logged successfully (would be sent in production)",
      emailType,
      testEmail,
      subject,
      subscriptionId,
    });
  } catch (error) {
    console.error(`Error sending test email: ${error}`);
    return NextResponse.json(
      { error: "Error sending test email", details: String(error) },
      { status: 500 },
    );
  }
}
