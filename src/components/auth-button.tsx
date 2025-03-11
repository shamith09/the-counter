"use client";

import { signIn, signOut, useSession } from "next-auth/react";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import Link from "next/link";

// Admin emails that are allowed to access the admin panel
const ADMIN_EMAILS = process.env.ADMIN_EMAILS?.split(",") || [];

export function AuthButton() {
  const { data: session } = useSession();

  // Check if user is an admin
  const isAdmin =
    session?.user?.email && ADMIN_EMAILS.includes(session.user.email);

  if (session) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="relative h-8 w-8 rounded-full">
            <Avatar className="h-8 w-8">
              <AvatarImage
                src={session.user?.image || ""}
                alt={session.user?.name || "User"}
              />
              <AvatarFallback>{session.user?.name?.[0] || "?"}</AvatarFallback>
            </Avatar>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {isAdmin && (
            <DropdownMenuItem asChild>
              <Link href="/admin/payouts" className="cursor-pointer">
                Admin Panel
              </Link>
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            onClick={() => signOut()}
            className="cursor-pointer"
          >
            Sign Out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <Button
      variant="outline"
      onClick={() => signIn(undefined, { callbackUrl: "/" })}
      className="text-sm text-white"
    >
      Sign In
    </Button>
  );
}
