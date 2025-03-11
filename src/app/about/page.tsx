import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export default function AboutPage() {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-4">
        <Link href="/">
          <Button
            variant="ghost"
            className="text-purple-300 hover:text-purple-200 hover:bg-purple-500/20"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
        </Link>
      </div>
      <Card className="bg-black/50 border-purple-500/20">
        <CardHeader>
          <CardTitle className="text-3xl font-bold text-purple-300">
            The Counter
          </CardTitle>
          <CardDescription className="text-purple-400">
            Yes, it&apos;s literally just a number that only goes up.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6 text-purple-300">
          <section>
            <h2 className="text-xl font-semibold text-purple-200 mb-2">
              What is it?
            </h2>
            <p>
              The Counter is exactly what it sounds like: a number that people
              from around the world can increment together. That&apos;s it.
              That&apos;s the whole thing. I know it&apos;s pointless, but
              somehow it&apos;s oddly satisfying to watch the number go up.
              <br />
              <br />
              And guess what? You can pay actual money to make the number
              bigger. If you pay $2, the number gets multiplied by 2. If you pay
              $10, the number gets multiplied by 10. Simple. And you can compete
              with everyone else in the world to climb the{" "}
              <Link
                href="/stats"
                className="text-purple-200 hover:text-purple-100 underline"
              >
                leaderboard
              </Link>
              .
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-purple-200 mb-2">
              But... why?
            </h2>
            <p>
              Why not? Sometimes the simplest things bring people together.
              Besides, the technology behind something like this is surprisingly
              complex. It would be a shame if your increments didn&apos;t show
              up on everyone else&apos;s screen within a few milliseconds.
              {/* Read more about it on my blog post{" "}
              <Link
                href="https://shamithpasula.com/.../"
                className="text-purple-200 hover:text-purple-100 underline"
              >
                here
              </Link>
              . */}
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-purple-200 mb-2">
              How to participate
            </h2>
            <ul className="list-disc list-inside space-y-2">
              <li>
                Hit the spacebar or click &quot;Increment&quot; to add 1
                (it&apos;s free!)
              </li>
              <li>
                Feel like making a bigger impact? Click &quot;Multiply&quot; and
                pay $N to multiply by N, and add however much the counter
                increased by to your stats
              </li>
              <li>Watch the pretty purple number get bigger</li>
              <li>
                Check the stats page to see your contribution - log in to appear
                on the leaderboard and/or allow location access to contribute to
                your country&apos;s count
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-purple-200 mb-2">
              Is this art?
            </h2>
            <p>
              Maybe? It&apos;s a shared experience where people collectively
              make a number bigger, and some even pay money to make it bigger
              faster. Even though incrementing this number doesn&apos;t really
              mean anything, will people still be motivated to increment it?
              Will the indomitable human spirit move people to contribute
              something to the counter, even if it will just get lost in the
              noise?
            </p>
          </section>
        </CardContent>
      </Card>
    </div>
  );
}
