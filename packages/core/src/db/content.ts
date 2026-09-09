import {
  contentBundleSchema,
  contentVersionSchema,
  courseManifestSchema,
  lessonSchema,
  moduleSchema,
  skillDefinitionSchema,
  sourceRecordSchema,
  formatContentVersionId,
  type ContentBundle,
  type ContentVersion,
  type CourseManifest,
  type Lesson,
  type Module,
  type QaState,
  type SkillDefinition,
  type SourceRecord,
} from "@hivemind/schema";

import {
  allRows,
  nextSequence,
  parseJsonColumn,
  type Clock,
  type Database,
} from "./index";

/*
 * Content storage (invariant 6). A content version is an immutable snapshot;
 * every course, module, lesson, skill version, source, and claim row is keyed
 * by the content version it belongs to. Publishing never rewrites a row.
 */

export interface PublishInput {
  readonly bundle: ContentBundle;
  readonly published_by: string;
  readonly note?: string | undefined;
}

export class ContentRepository {
  constructor(
    private readonly db: Database,
    private readonly clock: Clock,
  ) {}

  async listVersions(): Promise<ContentVersion[]> {
    const rows = await allRows<{ version_json: string }>(
      this.db.prepare("SELECT version_json FROM content_versions ORDER BY id DESC"),
    );
    return rows.map((row) =>
      parseJsonColumn(row.version_json, (v) => contentVersionSchema.parse(v)),
    );
  }

  async getVersion(id: string): Promise<ContentVersion | null> {
    const row = await this.db
      .prepare("SELECT version_json FROM content_versions WHERE id = ?")
      .bind(id)
      .first<{ version_json: string }>();
    return row === null
      ? null
      : parseJsonColumn(row.version_json, (v) => contentVersionSchema.parse(v));
  }

  async latestVersionId(): Promise<string | null> {
    const row = await this.db
      .prepare("SELECT id FROM content_versions ORDER BY id DESC LIMIT 1")
      .first<{ id: string }>();
    return row?.id ?? null;
  }

  async findVersionByHash(contentHash: string): Promise<ContentVersion | null> {
    const row = await this.db
      .prepare(
        "SELECT version_json FROM content_versions WHERE content_hash = ? ORDER BY id DESC LIMIT 1",
      )
      .bind(contentHash)
      .first<{ version_json: string }>();
    return row === null
      ? null
      : parseJsonColumn(row.version_json, (v) => contentVersionSchema.parse(v));
  }

  /** Insert a whole bundle as one immutable content version (single batch, all or nothing). */
  async publish(input: PublishInput): Promise<ContentVersion> {
    const bundle = contentBundleSchema.parse(input.bundle);
    const id = formatContentVersionId(await nextSequence(this.db, "content_versions"));
    const now = this.clock.now();
    const version: ContentVersion = contentVersionSchema.parse({
      id,
      created_at: now,
      content_hash: bundle.content_hash,
      ...(bundle.git_commit === undefined ? {} : { git_commit: bundle.git_commit }),
      published_by: input.published_by,
      ...(input.note === undefined ? {} : { note: input.note }),
      course_ids: bundle.courses.map((course) => course.id),
      counts: {
        courses: bundle.courses.length,
        modules: bundle.modules.length,
        lessons: bundle.lessons.length,
        skills: bundle.skills.length,
        sources: bundle.sources.length,
      },
    });
    const statements: D1PreparedStatement[] = [
      this.db
        .prepare(
          "INSERT INTO content_versions (id, created_at, content_hash, git_commit, published_by, note, version_json) VALUES (?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(
          id,
          now,
          version.content_hash,
          version.git_commit ?? null,
          version.published_by,
          version.note ?? null,
          JSON.stringify(version),
        ),
    ];
    for (const course of bundle.courses) {
      statements.push(
        this.db
          .prepare(
            "INSERT INTO courses (id, title, domain, status, latest_content_version_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET title = excluded.title, domain = excluded.domain, status = excluded.status, latest_content_version_id = excluded.latest_content_version_id, updated_at = excluded.updated_at",
          )
          .bind(course.id, course.title, course.domain, course.status, id, now, now),
        this.db
          .prepare(
            "INSERT INTO course_versions (content_version_id, course_id, version, uses_labs, manifest_json) VALUES (?, ?, ?, ?, ?)",
          )
          .bind(
            id,
            course.id,
            course.version,
            course.uses_labs ? 1 : 0,
            JSON.stringify(course),
          ),
      );
    }
    for (const courseModule of bundle.modules) {
      statements.push(
        this.db
          .prepare(
            'INSERT INTO modules (content_version_id, id, course_id, "order", module_json) VALUES (?, ?, ?, ?, ?)',
          )
          .bind(
            id,
            courseModule.id,
            courseModule.course_id,
            courseModule.order,
            JSON.stringify(courseModule),
          ),
      );
    }
    for (const lesson of bundle.lessons) {
      statements.push(
        this.db
          .prepare(
            'INSERT INTO lessons (content_version_id, id, course_id, module_id, version, slug, title, "order", qa_state, body_hash, lesson_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          )
          .bind(
            id,
            lesson.id,
            lesson.course_id,
            lesson.module_id,
            lesson.version,
            lesson.slug,
            lesson.title,
            lesson.order,
            lesson.qa_state,
            lesson.body_hash,
            JSON.stringify(lesson),
          ),
      );
      for (const question of lesson.questions) {
        statements.push(
          this.db
            .prepare(
              "INSERT INTO lesson_questions (content_version_id, lesson_id, id, kind, question_json) VALUES (?, ?, ?, ?, ?)",
            )
            .bind(id, lesson.id, question.id, question.kind, JSON.stringify(question)),
        );
      }
      for (const claim of lesson.claims) {
        statements.push(
          this.db
            .prepare(
              "INSERT INTO content_claims (content_version_id, lesson_id, id, verification, claim_json) VALUES (?, ?, ?, ?, ?)",
            )
            .bind(
              id,
              lesson.id,
              claim.id,
              claim.verification.status,
              JSON.stringify(claim),
            ),
        );
      }
    }
    for (const skill of bundle.skills) {
      statements.push(
        this.db
          .prepare(
            "INSERT INTO skills (id, name, domain, status, latest_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name, domain = excluded.domain, status = excluded.status, latest_version = excluded.latest_version, updated_at = excluded.updated_at",
          )
          .bind(
            skill.id,
            skill.name,
            skill.domain,
            skill.status,
            skill.version,
            now,
            now,
          ),
        this.db
          .prepare(
            "INSERT INTO skill_versions (skill_id, version, content_version_id, definition_json, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(skill_id, version) DO NOTHING",
          )
          .bind(skill.id, skill.version, id, JSON.stringify(skill), now),
      );
      for (const prerequisite of skill.prerequisites) {
        statements.push(
          this.db
            .prepare(
              "INSERT INTO skill_relationships (content_version_id, skill_id, related_skill_id, kind) VALUES (?, ?, ?, 'prerequisite')",
            )
            .bind(id, skill.id, prerequisite),
        );
      }
      for (const related of skill.related) {
        statements.push(
          this.db
            .prepare(
              "INSERT INTO skill_relationships (content_version_id, skill_id, related_skill_id, kind) VALUES (?, ?, ?, 'related')",
            )
            .bind(id, skill.id, related),
        );
      }
    }
    for (const source of bundle.sources) {
      statements.push(
        this.db
          .prepare(
            "INSERT INTO sources (content_version_id, id, title, kind, trust_tier, ingested, source_json) VALUES (?, ?, ?, ?, ?, ?, ?)",
          )
          .bind(
            id,
            source.id,
            source.title,
            source.kind,
            source.trust_tier,
            source.ingested ? 1 : 0,
            JSON.stringify(source),
          ),
      );
    }
    await this.db.batch(statements);
    return version;
  }

  async listCourses(contentVersionId: string): Promise<CourseManifest[]> {
    const rows = await allRows<{ manifest_json: string }>(
      this.db
        .prepare(
          "SELECT manifest_json FROM course_versions WHERE content_version_id = ? ORDER BY course_id",
        )
        .bind(contentVersionId),
    );
    return rows.map((row) =>
      parseJsonColumn(row.manifest_json, (v) => courseManifestSchema.parse(v)),
    );
  }

  async getCourse(
    contentVersionId: string,
    courseId: string,
  ): Promise<CourseManifest | null> {
    const row = await this.db
      .prepare(
        "SELECT manifest_json FROM course_versions WHERE content_version_id = ? AND course_id = ?",
      )
      .bind(contentVersionId, courseId)
      .first<{ manifest_json: string }>();
    return row === null
      ? null
      : parseJsonColumn(row.manifest_json, (v) => courseManifestSchema.parse(v));
  }

  async listModules(contentVersionId: string, courseId: string): Promise<Module[]> {
    const rows = await allRows<{ module_json: string }>(
      this.db
        .prepare(
          'SELECT module_json FROM modules WHERE content_version_id = ? AND course_id = ? ORDER BY "order"',
        )
        .bind(contentVersionId, courseId),
    );
    return rows.map((row) =>
      parseJsonColumn(row.module_json, (v) => moduleSchema.parse(v)),
    );
  }

  async listLessons(contentVersionId: string, courseId: string): Promise<Lesson[]> {
    const rows = await allRows<{ lesson_json: string }>(
      this.db
        .prepare(
          'SELECT lesson_json FROM lessons WHERE content_version_id = ? AND course_id = ? ORDER BY module_id, "order"',
        )
        .bind(contentVersionId, courseId),
    );
    return rows.map((row) =>
      parseJsonColumn(row.lesson_json, (v) => lessonSchema.parse(v)),
    );
  }

  async getLesson(contentVersionId: string, lessonId: string): Promise<Lesson | null> {
    const row = await this.db
      .prepare("SELECT lesson_json FROM lessons WHERE content_version_id = ? AND id = ?")
      .bind(contentVersionId, lessonId)
      .first<{ lesson_json: string }>();
    return row === null
      ? null
      : parseJsonColumn(row.lesson_json, (v) => lessonSchema.parse(v));
  }

  /** Lesson ids, versions, hashes, and QA states across a version, for trees and diffs. */
  async lessonStates(contentVersionId: string): Promise<
    {
      id: string;
      version: string;
      body_hash: string;
      qa_state: QaState;
      course_id: string;
      module_id: string;
    }[]
  > {
    return allRows(
      this.db
        .prepare(
          'SELECT id, version, body_hash, qa_state, course_id, module_id FROM lessons WHERE content_version_id = ? ORDER BY course_id, module_id, "order"',
        )
        .bind(contentVersionId),
    );
  }

  async listSources(contentVersionId: string): Promise<SourceRecord[]> {
    const rows = await allRows<{ source_json: string }>(
      this.db
        .prepare(
          "SELECT source_json FROM sources WHERE content_version_id = ? ORDER BY id",
        )
        .bind(contentVersionId),
    );
    return rows.map((row) =>
      parseJsonColumn(row.source_json, (v) => sourceRecordSchema.parse(v)),
    );
  }

  async listSkills(contentVersionId: string): Promise<SkillDefinition[]> {
    const rows = await allRows<{ definition_json: string }>(
      this.db
        .prepare(
          "SELECT definition_json FROM skill_versions WHERE content_version_id = ? ORDER BY skill_id",
        )
        .bind(contentVersionId),
    );
    return rows.map((row) =>
      parseJsonColumn(row.definition_json, (v) => skillDefinitionSchema.parse(v)),
    );
  }
}
