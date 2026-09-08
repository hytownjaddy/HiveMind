import { labSessionIdSchema } from "@hivemind/protocol";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { LabWorkspace } from "@/components/labs/LabWorkspace";

export const metadata: Metadata = { title: "Lab session" };

export default async function LabSessionPage({
  params,
}: {
  readonly params: Promise<{ readonly sessionId: string }>;
}) {
  const { sessionId } = await params;
  const parsed = labSessionIdSchema.safeParse(sessionId);
  if (!parsed.success) {
    notFound();
  }
  return <LabWorkspace sessionId={parsed.data} />;
}
