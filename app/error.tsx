"use client";

import { btnPrimary } from "./ui";

export default function AppError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="max-w-prose space-y-4">
      <h1 className="text-3xl font-bold">This page couldn&apos;t load</h1>
      <p className="text-muted">
        The corridor store was unavailable. Navigation still works — try again
        in a moment.
      </p>
      <button onClick={reset} className={btnPrimary}>
        Try again
      </button>
    </div>
  );
}
