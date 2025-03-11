import { NextResponse } from "next/server";
import { db } from "@/lib/db";

import bcrypt from "bcrypt";

export async function POST(req: Request) {
  try {
    const { email, password, username } = await req.json();

    // Validate input
    if (!email || !password || !username) {
      return NextResponse.json(
        { message: "Email, password, and username are required" },
        { status: 400 },
      );
    }

    // Check if user already exists
    const existingUser = await db.query(db.sql`
      SELECT * FROM users WHERE email = ${email}
    `);

    if (existingUser.rows.length > 0) {
      return NextResponse.json(
        { message: "User with this email already exists" },
        { status: 409 },
      );
    }

    // Hash password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Create user
    await db.query(db.sql`
      INSERT INTO users (
        email, 
        password_hash, 
        username, 
        created_at, 
        updated_at
      ) VALUES (
        ${email}, 
        ${hashedPassword}, 
        ${username}, 
        NOW(), 
        NOW()
      )
    `);

    return NextResponse.json({ message: "User registered successfully" });
  } catch (error) {
    console.error("Error registering user:", error);
    return NextResponse.json(
      { message: "Error registering user" },
      { status: 500 },
    );
  }
}
