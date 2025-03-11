import { Button } from "@/components/ui/button";
import Link from "next/link";

export default function AuthError() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-black p-4">
      <div className="w-full max-w-sm space-y-6 text-center">
        <h1 className="text-2xl font-bold text-white">Authentication Error</h1>
        <p className="text-gray-400">There was a problem signing you in.</p>
        <Button
          asChild
          variant="outline"
          className="bg-white hover:bg-gray-100"
        >
          <Link href="/auth/signin">Try Again</Link>
        </Button>
      </div>
    </div>
  );
}
