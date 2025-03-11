import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

// Admin emails that are allowed to access admin features
const ADMIN_EMAILS = process.env.ADMIN_EMAILS?.split(",") || [];

export async function GET() {
  try {
    const session = await getServerSession();

    // Check if user is authorized
    if (!session?.user?.email || !ADMIN_EMAILS.includes(session.user.email)) {
      return new NextResponse(JSON.stringify({ authorized: false }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }

    return NextResponse.json({ authorized: true });
  } catch (error) {
    console.error("Error checking admin status:", error);
    return new NextResponse(JSON.stringify({ message: "Server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
