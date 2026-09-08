import type { Metadata } from "next";

import { Placeholder } from "@/components/ui/Placeholder";

export const metadata: Metadata = { title: "Learn" };

export default function Page() {
  return (
    <Placeholder
      title="Learn"
      rfp="§3.1, §89"
      summary="Hierarchical course browser over content-defined course packages."
      items={[
        "Course packages (courses/*/course.yaml)",
        "Skill graph per course",
        "Lesson renderer (MDX)",
        "Knowledge checks",
        "Filters by domain and difficulty",
      ]}
    />
  );
}
