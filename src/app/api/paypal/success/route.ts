import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(request: Request) {
  const session = await getServerSession();
  if (!session?.user?.email) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token");

  if (!token) {
    return new NextResponse("No token provided", { status: 400 });
  }

  try {
    // Get access token
    const baseUrl =
      process.env.NODE_ENV === "development"
        ? "https://api-m.sandbox.paypal.com"
        : "https://api-m.paypal.com";

    const authResponse = await fetch(`${baseUrl}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(`${process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID}:${process.env.PAYPAL_SECRET}`).toString("base64")}`,
      },
      body: "grant_type=client_credentials",
    });

    const { access_token } = await authResponse.json();

    // Execute agreement
    const executeResponse = await fetch(
      `${baseUrl}/v1/payments/billing-agreements/${token}/agreement-execute`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${access_token}`,
        },
      },
    );

    if (!executeResponse.ok) {
      console.error(
        "Failed to execute agreement:",
        await executeResponse.text(),
      );
      throw new Error("Failed to execute agreement");
    }

    const agreement = await executeResponse.json();
    console.log("Agreement executed successfully:", agreement);

    // Save PayPal info directly to database
    await db.query(db.sql`
      UPDATE users 
      SET paypal_account_id = ${agreement.id}
      WHERE email = ${session.user.email}
    `);

    // For direct API calls, return success
    if (request.headers.get("accept") === "application/json") {
      return NextResponse.json({ success: true, agreement });
    }

    // For browser redirects, redirect back to the main page
    return NextResponse.redirect(new URL("/", request.url));
  } catch (error) {
    console.error("Error executing PayPal agreement:", error);
    return new NextResponse("Error executing PayPal agreement", {
      status: 500,
    });
  }
}
