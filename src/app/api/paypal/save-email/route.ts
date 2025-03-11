import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function POST(req: Request) {
  const session = await getServerSession();
  if (!session?.user?.email) {
    return new NextResponse(JSON.stringify({ message: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const { paypalEmail } = await req.json();
    if (!paypalEmail) {
      return new NextResponse(
        JSON.stringify({ message: "Missing PayPal email" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // Validate email format
    if (!paypalEmail.includes("@") || !paypalEmail.includes(".")) {
      return new NextResponse(
        JSON.stringify({ message: "Invalid email format" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    console.log(
      `Saving PayPal email ${paypalEmail} for user ${session.user.email}`,
    );

    // Save PayPal info directly to database using Neon client
    await db.query(db.sql`
      UPDATE users 
      SET paypal_email = ${paypalEmail}
      WHERE email = ${session.user.email}
    `);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error saving PayPal email:", error);
    return new NextResponse(
      JSON.stringify({ message: "Error saving PayPal email" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
