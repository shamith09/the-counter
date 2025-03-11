import { NextResponse } from "next/server";
import { db } from "@/lib/db";

import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

export async function POST(req: Request) {
  try {
    const { email, password } = await req.json();

    // Validate input
    if (!email || !password) {
      return NextResponse.json(
        { message: "Email and password are required" },
        { status: 400 },
      );
    }

    // Find user
    const result = await db.query(db.sql`
      SELECT * FROM users WHERE email = ${email}
    `);

    if (result.rows.length === 0) {
      return NextResponse.json(
        { message: "Invalid email or password" },
        { status: 401 },
      );
    }

    const user = result.rows[0];

    // Check password
    const passwordMatch = await bcrypt.compare(
      password,
      user.password_hash as string,
    );
    if (!passwordMatch) {
      return NextResponse.json(
        { message: "Invalid email or password" },
        { status: 401 },
      );
    }

    // Generate JWT token
    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        username: user.username,
      },
      process.env.JWT_SECRET || "default_secret",
      { expiresIn: "7d" },
    );

    return NextResponse.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
      },
    });
  } catch (error) {
    console.error("Error logging in:", error);
    return NextResponse.json({ message: "Error logging in" }, { status: 500 });
  }
}
