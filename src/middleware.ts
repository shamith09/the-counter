import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// This function can be marked `async` if using `await` inside
export function middleware(request: NextRequest) {
  // Get the origin from the request headers
  const origin = request.headers.get("origin") || "";

  // Define allowed origins
  const allowedOrigins = [
    "http://localhost:3000",
    "https://thecounter.live",
    "https://www.thecounter.live",
  ];

  // Check if the origin is allowed
  const isAllowedOrigin = allowedOrigins.includes(origin);

  // Get the response
  const response = NextResponse.next();

  // Set CORS headers
  if (isAllowedOrigin) {
    response.headers.set("Access-Control-Allow-Origin", origin);
  }

  response.headers.set(
    "Access-Control-Allow-Methods",
    "GET, POST, OPTIONS, PUT, DELETE",
  );
  response.headers.set(
    "Access-Control-Allow-Headers",
    "Content-Type, X-Client-ID, Authorization",
  );
  response.headers.set("Access-Control-Max-Age", "3600");

  return response;
}

// See "Matching Paths" below to learn more
export const config = {
  matcher: "/api/:path*",
};
