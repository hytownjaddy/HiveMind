import type {
  ContentBundle,
  ContentVersion,
  CourseManifest,
  Lesson,
  Module,
  QaState,
  SourceRecord,
} from "@hivemind/schema";

import type { ContentRepository } from "../db/content";

/*
 * Content application service (04-course-workspace.md). Learners see only
 * `published` lessons; `author view` exposes every QA state. Answers and
 * `correct` flags on questions never leave the service for learner views
 * (UI-SYSTEM §10).
 */

export interface ContentView {
  readonly authorView: boolean;
}

export interface CourseTree {
  readonly version: ContentVersion;
  readonly course: CourseManifest;
  readonly modules: readonly {
    readonly module: Module;
    readonly lessons: readonly {
      readonly id: string;
      readonly title: string;
      readonly order: number;
      readonly qa_state: QaState;
      readonly slug: string;
    }[];
  }[];
}

export type LearnerLesson = Omit<Lesson, "questions"> & {
  readonly questions: readonly Omit<Lesson["questions"][number], "answer" | "options">[] &
    readonly { readonly options?: readonly { id: string; text: string }[] }[];
};

export class ContentService {
  constructor(private readonly content: ContentRepository) {}

  async publish(
    bundle: ContentBundle,
    publishedBy: string,
    note?: string,
  ): Promise<{ version: ContentVersion; reused: boolean }> {
    const existing = await this.content.findVersionByHash(bundle.content_hash);
    if (existing !== null) {
      return { version: existing, reused: true };
    }
    return {
      version: await this.content.publish({ bundle, published_by: publishedBy, note }),
      reused: false,
    };
  }

  async versions(): Promise<ContentVersion[]> {
    return this.content.listVersions();
  }

  /** What `hivemind content diff` compares against: the latest version's course and lesson identities. */
  async summary(): Promise<{
    content_version_id: string | null;
    courses: { id: string; version: string }[];
    lessons: { id: string; version: string; body_hash: string; qa_state: string }[];
  }> {
    const versionId = await this.content.latestVersionId();
    if (versionId === null) {
      return { content_version_id: null, courses: [], lessons: [] };
    }
    const [courses, lessons] = await Promise.all([
      this.content.listCourses(versionId),
      this.content.lessonStates(versionId),
    ]);
    return {
      content_version_id: versionId,
      courses: courses.map((course) => ({ id: course.id, version: course.version })),
      lessons: lessons.map((lesson) => ({
        id: lesson.id,
        version: lesson.version,
        body_hash: lesson.body_hash,
        qa_state: lesson.qa_state,
      })),
    };
  }

  async latestVersion(): Promise<ContentVersion | null> {
    const id = await this.content.latestVersionId();
    return id === null ? null : this.content.getVersion(id);
  }

  async courses(
    view: ContentView,
    contentVersionId?: string,
  ): Promise<{ version: ContentVersion | null; courses: CourseManifest[] }> {
    const versionId = contentVersionId ?? (await this.content.latestVersionId());
    if (versionId === null) {
      return { version: null, courses: [] };
    }
    const version = await this.content.getVersion(versionId);
    const courses = await this.content.listCourses(versionId);
    if (view.authorView) {
      return { version, courses };
    }
    const states = await this.content.lessonStates(versionId);
    const publishedCourses = new Set(
      states
        .filter((state) => state.qa_state === "published")
        .map((state) => state.course_id),
    );
    return {
      version,
      courses: courses.filter((course) => publishedCourses.has(course.id)),
    };
  }

  async courseTree(
    courseId: string,
    view: ContentView,
    contentVersionId?: string,
  ): Promise<CourseTree | null> {
    const versionId = contentVersionId ?? (await this.content.latestVersionId());
    if (versionId === null) {
      return null;
    }
    const [version, course] = await Promise.all([
      this.content.getVersion(versionId),
      this.content.getCourse(versionId, courseId),
    ]);
    if (version === null || course === null) {
      return null;
    }
    const [modules, lessons] = await Promise.all([
      this.content.listModules(versionId, courseId),
      this.content.listLessons(versionId, courseId),
    ]);
    const visible = lessons.filter(
      (lesson) => view.authorView || lesson.qa_state === "published",
    );
    return {
      version,
      course,
      modules: modules.map((module) => ({
        module,
        lessons: visible
          .filter((lesson) => lesson.module_id === module.id)
          .map((lesson) => ({
            id: lesson.id,
            title: lesson.title,
            order: lesson.order,
            qa_state: lesson.qa_state,
            slug: lesson.slug,
          })),
      })),
    };
  }

  async lesson(
    lessonId: string,
    view: ContentView,
    contentVersionId?: string,
  ): Promise<{
    version: ContentVersion;
    lesson: Lesson;
    sources: SourceRecord[];
  } | null> {
    const versionId = contentVersionId ?? (await this.content.latestVersionId());
    if (versionId === null) {
      return null;
    }
    const [version, lesson] = await Promise.all([
      this.content.getVersion(versionId),
      this.content.getLesson(versionId, lessonId),
    ]);
    if (version === null || lesson === null) {
      return null;
    }
    if (!view.authorView && lesson.qa_state !== "published") {
      return null;
    }
    const sources = (await this.content.listSources(versionId)).filter((source) =>
      lesson.source_ids.includes(source.id),
    );
    return { version, lesson: view.authorView ? lesson : stripAnswers(lesson), sources };
  }
}

/** Learner-facing lesson: no model answers, no `correct` flags, no option feedback (UI-SYSTEM §10). */
export function stripAnswers(lesson: Lesson): Lesson {
  return {
    ...lesson,
    questions: lesson.questions.map((question) => {
      const { answer: _answer, options, ...rest } = question;
      return {
        ...rest,
        ...(options === undefined
          ? {}
          : {
              options: options.map((option) => ({
                id: option.id,
                text: option.text,
                correct: false,
              })),
            }),
      };
    }),
  };
}
