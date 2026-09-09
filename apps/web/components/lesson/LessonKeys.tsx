"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** `j` / `k` move to the next / previous lesson (04-course-workspace shortcuts). */
export function LessonKeys({
  previous,
  next,
}: {
  readonly previous: string | null;
  readonly next: string | null;
}) {
  const router = useRouter();
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null;
      if (
        target !== null &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA")
      ) {
        return;
      }
      if (event.key === "j" && next !== null) {
        router.push(next);
      } else if (event.key === "k" && previous !== null) {
        router.push(previous);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, previous, router]);
  return null;
}
