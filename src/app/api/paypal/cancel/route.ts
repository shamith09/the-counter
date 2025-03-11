import { NextResponse } from "next/server";

export async function GET(request: Request) {
  // Simply redirect back to the stats page
  return NextResponse.redirect(new URL("/stats", request.url));
}
