import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json({ message: "pong" });
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers":
        "Content-Type, X-Client-ID, Authorization",
      "Access-Control-Max-Age": "3600",
    },
  });
}
