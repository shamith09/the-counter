import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Get the start of the current week (Monday at 12 AM UTC)
export function getStartOfWeek(): Date {
  const now = new Date();
  const dayOfWeek = now.getUTCDay(); // 0 is Sunday, 1 is Monday, etc.
  const daysToSubtract = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // If Sunday, go back 6 days, otherwise go back to Monday

  const lastMonday = new Date(now);
  lastMonday.setUTCDate(now.getUTCDate() - daysToSubtract);
  lastMonday.setUTCHours(0, 0, 0, 0); // Set to midnight UTC

  return lastMonday;
}
