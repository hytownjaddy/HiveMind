import { hashCanonical, type ContentBundle, type Lesson } from "@hivemind/schema";
import {
  courseFixture,
  iprouteSource,
  lessonFixture,
  moduleFixture,
  routingTableSkill,
} from "@hivemind/schema/fixtures";
import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";

import { ContentRepository } from "../src/db/content";
import { ContentService, stripAnswers } from "../src/services/content";
import { fixedClock } from "./clock";

async function bundle(lesson: Lesson): Promise<ContentBundle> {
  const body = {
    bundle_format: 1 as const,
    generated_at: "2026-09-09T12:00:00Z",
    courses: [courseFixture],
    modules: [moduleFixture],
    lessons: [lesson],
    skills: [routingTableSkill],
    sources: [iprouteSource],
  };
  return { ...body, content_hash: await hashCanonical(body) };
}

function service(): ContentService {
  return new ContentService(new ContentRepository(env.DB, fixedClock()));
}

describe("content versions", () => {
  it("publishes a bundle as an immutable version and reuses identical hashes", async () => {
    const content = service();
    const first = await content.publish(await bundle(lessonFixture), "test");
    expect(first.version.id).toBe("HM-CV-0001");
    expect(first.reused).toBe(false);
    expect(first.version.counts).toEqual({
      courses: 1,
      modules: 1,
      lessons: 1,
      skills: 1,
      sources: 1,
    });
    const again = await content.publish(await bundle(lessonFixture), "test");
    expect(again.reused).toBe(true);
    expect(again.version.id).toBe("HM-CV-0001");
    const second = await content.publish(
      await bundle({ ...lessonFixture, version: "0.2.0", qa_state: "published" }),
      "test",
    );
    expect(second.version.id).toBe("HM-CV-0002");
    expect((await content.versions()).map((version) => version.id)).toEqual([
      "HM-CV-0002",
      "HM-CV-0001",
    ]);
  });

  it("hides unpublished lessons from learners and shows them in author view", async () => {
    const content = service();
    await content.publish(await bundle(lessonFixture), "test");
    expect(await content.lesson(lessonFixture.id, { authorView: false })).toBeNull();
    const authored = await content.lesson(lessonFixture.id, { authorView: true });
    expect(authored?.lesson.qa_state).toBe("draft");
    expect(authored?.sources.map((source) => source.id)).toEqual([
      "src.iproute2.ip-route",
    ]);
    expect((await content.courses({ authorView: false })).courses).toEqual([]);
    expect(
      (await content.courses({ authorView: true })).courses.map((course) => course.id),
    ).toEqual(["linux-networking"]);
  });

  it("serves published lessons without answers and builds the course tree", async () => {
    const content = service();
    await content.publish(
      await bundle({ ...lessonFixture, qa_state: "published" }),
      "test",
    );
    const served = await content.lesson(lessonFixture.id, { authorView: false });
    expect(served?.version.id).toBe("HM-CV-0001");
    const question = served?.lesson.questions[0];
    expect(question?.answer).toBeUndefined();
    expect(question?.options?.every((option) => option.correct === false)).toBe(true);
    expect(question?.options?.[0]).not.toHaveProperty("feedback");
    const tree = await content.courseTree("linux-networking", { authorView: false });
    expect(tree?.modules[0]?.lessons.map((lesson) => lesson.id)).toEqual([
      lessonFixture.id,
    ]);
    expect(tree?.modules[0]?.lessons[0]?.qa_state).toBe("published");
  });

  it("stripAnswers keeps structure but removes solutions", () => {
    const stripped = stripAnswers({
      ...lessonFixture,
      questions: [{ ...lessonFixture.questions[0]!, answer: "secret" }],
    });
    expect(stripped.questions[0]).not.toHaveProperty("answer");
    expect(stripped.sections).toEqual(lessonFixture.sections);
  });
});
