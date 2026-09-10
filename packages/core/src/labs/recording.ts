import { recordingHeaderSchema, type RecordingHeader } from "@hivemind/schema";

/*
 * asciicast v2 writer (D-019, Stage 02 "recording format"). One recording
 * per node per session: a JSON header line followed by `[t, kind, data]`
 * event lines with `t` in seconds since the header timestamp. Only redacted
 * data may be added; the header carries the redaction version.
 */

export type RecordingEventKind = "o" | "i" | "r";

export interface RecordingFrame {
  readonly at_ms: number;
  readonly kind: RecordingEventKind;
  readonly data: string;
}

export const RECORDING_CONTENT_TYPE = "application/x-asciicast";

export function recordingKey(labSessionId: string, node: string, stamp: string): string {
  return `recordings/${labSessionId}/${node}-${stamp.replace(/[:.]/gu, "")}.cast`;
}

export function serializeRecording(
  header: RecordingHeader,
  frames: readonly RecordingFrame[],
): string {
  const parsed = recordingHeaderSchema.parse(header);
  const start = parsed.timestamp * 1000;
  const lines = [JSON.stringify(parsed)];
  for (const frame of frames) {
    const seconds = Math.max(0, frame.at_ms - start) / 1000;
    lines.push(JSON.stringify([Number(seconds.toFixed(6)), frame.kind, frame.data]));
  }
  return `${lines.join("\n")}\n`;
}

export function parseRecording(text: string): {
  header: RecordingHeader;
  events: [number, RecordingEventKind, string][];
} {
  const [first, ...rest] = text.split("\n").filter((line) => line.length > 0);
  if (first === undefined) {
    throw new Error("empty recording");
  }
  const header = recordingHeaderSchema.parse(JSON.parse(first));
  const events = rest.map((line) => {
    const parsed = JSON.parse(line) as unknown;
    if (
      !Array.isArray(parsed) ||
      parsed.length !== 3 ||
      typeof parsed[0] !== "number" ||
      (parsed[1] !== "o" && parsed[1] !== "i" && parsed[1] !== "r") ||
      typeof parsed[2] !== "string"
    ) {
      throw new Error(`malformed recording event: ${line}`);
    }
    return [parsed[0], parsed[1], parsed[2]] as [number, RecordingEventKind, string];
  });
  return { header, events };
}
