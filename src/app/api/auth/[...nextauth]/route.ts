import NextAuth from "next-auth";
import GithubProvider from "next-auth/providers/github";
import GoogleProvider from "next-auth/providers/google";
import { db } from "@/lib/db";

const handler = NextAuth({
  providers: [
    ...(process.env.NEXT_PUBLIC_GITHUB_LOGIN !== "false"
      ? [
          GithubProvider({
            clientId: process.env.GITHUB_ID!,
            clientSecret: process.env.GITHUB_SECRET!,
          }),
        ]
      : []),
    ...(process.env.NEXT_PUBLIC_GOOGLE_LOGIN !== "false"
      ? [
          GoogleProvider({
            clientId: process.env.GOOGLE_ID!,
            clientSecret: process.env.GOOGLE_SECRET!,
          }),
        ]
      : []),
  ],
  pages: {
    signIn: "/auth/signin",
    error: "/auth/error",
  },
  callbacks: {
    async signIn({ user, account }) {
      if (!account || !user.email) return false;

      try {
        // Handle OAuth authentication directly with database
        await db.query(db.sql`
          INSERT INTO users (
            oauth_provider, 
            oauth_id, 
            email, 
            username, 
            avatar_url
          ) 
          VALUES (
            ${account.provider}, 
            ${account.providerAccountId}, 
            ${user.email}, 
            ${user.name || ""}, 
            ${user.image || ""}
          )
          ON CONFLICT (email) 
          DO UPDATE SET 
            oauth_provider = ${account.provider},
            oauth_id = ${account.providerAccountId},
            username = ${user.name || ""},
            avatar_url = ${user.image || ""}
        `);
        return true;
      } catch (error) {
        console.error("Error in signIn callback:", error);
        return false;
      }
    },
    async jwt({ token, account, user }) {
      if (account && user) {
        token.userId = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (token.userId) {
        session.user.id = token.userId as string;
      }
      return session;
    },
  },
});

export { handler as GET, handler as POST };
