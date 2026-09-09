import { join } from "node:path";

import {
  competencySchema,
  hashCanonical,
  lessonIdSchema,
  lessonReviewSchema,
  LESSON_ELEMENTS,
  qaStateSchema,
  roleProfileSchema,
  skillDefinitionSchema,
  sourceRecordSchema,
  type ContentBundle,
  type CourseManifest,
  type Lesson,
  type Module,
  type Question,
} from "@hivemind/schema";
import {
  claimSchema,
  courseManifestSchema,
  learningObjectiveSchema,
  lessonLabRefSchema,
  lessonSchema,
  moduleSchema,
  questionSchema,
} from "@hivemind/schema";
import { z } from "zod";

import { Diagnostics } from "./diagnostics";
import { nodeFs, readYaml, repoRelative, type ContentFs } from "./files";
import { parseLessonMarkdown } from "./markdown";

export { Diagnostics, type Diagnostic, type DiagnosticLevel } from "./diagnostics";
export { nodeFs, type ContentFs } from "./files";
export { parseLessonMarkdown } from "./markdown";
export * from "./diff";

/*
 * `hivemind content compile`: content/ files → ContentBundle (COURSE_AUTHORING.md).
 *
 * content/
 *   skills/<domain>/*.yaml                SkillDefinition
 *   sources/<domain>/*.yaml               SourceRecord
 *   careers/roles/*.yaml                  RoleProfile (validated, not bundled)
 *   careers/competencies/*.yaml           Competency (validated, not bundled)
 *   courses/<domain>/<course>/course.yaml
 *     modules/<nn>-<slug>/module.yaml
 *     modules/<nn>-<slug>/lessons/<nn>-<slug>/{lesson.md,metadata.yaml,questions.yaml,claims.yaml}
 *
 * Derived, never authored: module_ids/lesson_ids/order (directory lists),
 * uses_labs, source_path, body_hash, content_hash. Everything else is
 * validated against the canonical contracts and cross-checked.
 */

const courseFileSchema = courseManifestSchema
  .omit({ module_ids: true, uses_labs: true, source_path: true })
  .extend({ modules: z.array(z.string().min(1)).min(1) })
  .strict();

const moduleFileSchema = moduleSchema
  .omit({
    lesson_ids: true,
    order: true,
    course_id: true,
    source_path: true,
    skill_ids: true,
  })
  .extend({
    lessons: z.array(z.string().min(1)).min(1),
    skill_ids: z.array(z.string()).optional(),
  })
  .strict();

const metadataFileSchema = z.strictObject({
  id: lessonIdSchema,
  version: lessonSchema.shape.version,
  slug: lessonSchema.shape.slug,
  title: lessonSchema.shape.title,
  summary: lessonSchema.shape.summary,
  qa_state: qaStateSchema,
  review: lessonReviewSchema.optional(),
  objectives: z.array(learningObjectiveSchema).min(1),
  skill_ids: z.array(z.string()).min(1),
  prerequisite_lesson_ids: z.array(lessonIdSchema).optional(),
  difficulty: lessonSchema.shape.difficulty,
  estimated_minutes: lessonSchema.shape.estimated_minutes,
  labs: z.array(lessonLabRefSchema).optional(),
});

const questionsFileSchema = z.array(questionSchema.omit({ lesson_id: true }).strict());
const claimsFileSchema = z.array(claimSchema.omit({ lesson_id: true }).strict());

export interface CompileOptions {
  /** Repository root; `contentDir` and `source_path` values are relative to it. */
  readonly root: string;
  readonly contentDir?: string | undefined;
  readonly fs?: ContentFs | undefined;
  readonly generatedAt: string;
  readonly gitCommit?: string | undefined;
}

export interface CompileResult {
  readonly bundle: ContentBundle | null;
  readonly diagnostics: Diagnostics;
}

export async function compileContent(options: CompileOptions): Promise<CompileResult> {
  const fs = options.fs ?? nodeFs();
  const diagnostics = new Diagnostics();
  const contentDir = options.contentDir ?? join(options.root, "content");
  const rel = (path: string): string => repoRelative(options.root, path);

  const skills = loadDefinitions(
    fs,
    join(contentDir, "skills"),
    skillDefinitionSchema,
    rel,
    diagnostics,
  );
  const sources = loadDefinitions(
    fs,
    join(contentDir, "sources"),
    sourceRecordSchema,
    rel,
    diagnostics,
  );
  const roles = loadDefinitions(
    fs,
    join(contentDir, "careers", "roles"),
    roleProfileSchema,
    rel,
    diagnostics,
  );
  const competencies = loadDefinitions(
    fs,
    join(contentDir, "careers", "competencies"),
    competencySchema,
    rel,
    diagnostics,
  );

  const skillIds = new Set(skills.map((skill) => skill.id));
  const sourceIds = new Set(sources.map((source) => source.id));
  const competencyIds = new Set(competencies.map((competency) => competency.id));
  for (const competency of competencies) {
    for (const entry of competency.skills) {
      if (!skillIds.has(entry.skill_id)) {
        diagnostics.error(
          "content/careers/competencies",
          `competency ${competency.id} references unknown skill ${entry.skill_id}`,
        );
      }
    }
  }
  for (const role of roles) {
    for (const entry of role.competencies) {
      if (!competencyIds.has(entry.competency_id)) {
        diagnostics.error(
          "content/careers/roles",
          `role ${role.id} references unknown competency ${entry.competency_id}`,
        );
      }
    }
    for (const sourceId of role.source_ids) {
      if (!sourceIds.has(sourceId)) {
        diagnostics.error(
          "content/careers/roles",
          `role ${role.id} cites unknown source ${sourceId}`,
        );
      }
    }
  }
  for (const skill of skills) {
    for (const prerequisite of [...skill.prerequisites, ...skill.related]) {
      if (!skillIds.has(prerequisite)) {
        diagnostics.error(
          `content/skills`,
          `skill ${skill.id} references unknown skill ${prerequisite}`,
        );
      }
    }
  }

  const courses: CourseManifest[] = [];
  const modules: Module[] = [];
  const lessons: Lesson[] = [];
  const coursesDir = join(contentDir, "courses");
  if (fs.isDirectory(coursesDir)) {
    for (const domain of fs.listDirectories(coursesDir)) {
      for (const courseDirName of fs.listDirectories(join(coursesDir, domain))) {
        const courseDir = join(coursesDir, domain, courseDirName);
        const compiled = await compileCourse({
          fs,
          courseDir,
          rel,
          diagnostics,
          skillIds,
          sourceIds,
        });
        if (compiled !== null) {
          courses.push(compiled.course);
          modules.push(...compiled.modules);
          lessons.push(...compiled.lessons);
        }
      }
    }
  }

  const lessonIds = new Set(lessons.map((lesson) => lesson.id));
  for (const lesson of lessons) {
    for (const prerequisite of lesson.prerequisite_lesson_ids) {
      if (!lessonIds.has(prerequisite)) {
        diagnostics.error(
          lesson.source_path ?? lesson.id,
          `prerequisite lesson ${prerequisite} does not exist`,
        );
      }
    }
  }
  const duplicateCourses = duplicates(courses.map((course) => course.id));
  for (const id of duplicateCourses) {
    diagnostics.error("content/courses", `course id ${id} is defined more than once`);
  }
  for (const id of duplicates(lessons.map((lesson) => lesson.id))) {
    diagnostics.error("content/courses", `lesson id ${id} is defined more than once`);
  }

  if (diagnostics.hasErrors) {
    return { bundle: null, diagnostics };
  }
  const body = {
    bundle_format: 1 as const,
    generated_at: options.generatedAt,
    ...(options.gitCommit === undefined ? {} : { git_commit: options.gitCommit }),
    courses: sortBy(courses, (course) => course.id),
    modules: sortBy(modules, (module) => module.id),
    lessons: sortBy(lessons, (lesson) => lesson.id),
    skills: sortBy(skills, (skill) => skill.id),
    sources: sortBy(sources, (source) => source.id),
  };
  const content_hash = await hashCanonical({
    ...body,
    generated_at: undefined,
    git_commit: undefined,
  });
  return { bundle: { ...body, content_hash }, diagnostics };
}

interface CourseContext {
  readonly fs: ContentFs;
  readonly courseDir: string;
  readonly rel: (path: string) => string;
  readonly diagnostics: Diagnostics;
  readonly skillIds: ReadonlySet<string>;
  readonly sourceIds: ReadonlySet<string>;
}

async function compileCourse(
  context: CourseContext,
): Promise<{ course: CourseManifest; modules: Module[]; lessons: Lesson[] } | null> {
  const { fs, courseDir, rel, diagnostics } = context;
  const coursePath = join(courseDir, "course.yaml");
  if (!fs.exists(coursePath)) {
    diagnostics.error(rel(courseDir), "missing course.yaml");
    return null;
  }
  const courseFile = parseWith(
    courseFileSchema,
    readYamlSafe(fs, coursePath, diagnostics, rel),
    rel(coursePath),
    diagnostics,
  );
  if (courseFile === null) {
    return null;
  }
  for (const skillId of courseFile.skill_ids) {
    if (!context.skillIds.has(skillId)) {
      diagnostics.error(rel(coursePath), `unknown skill ${skillId}`);
    }
  }
  for (const sourceId of courseFile.source_ids) {
    if (!context.sourceIds.has(sourceId)) {
      diagnostics.error(rel(coursePath), `unknown source ${sourceId}`);
    }
  }
  const modules: Module[] = [];
  const lessons: Lesson[] = [];
  let order = 0;
  for (const moduleDirName of courseFile.modules) {
    order += 1;
    const moduleDir = join(courseDir, "modules", moduleDirName);
    const modulePath = join(moduleDir, "module.yaml");
    if (!fs.exists(modulePath)) {
      diagnostics.error(rel(moduleDir), "missing module.yaml");
      continue;
    }
    const moduleFile = parseWith(
      moduleFileSchema,
      readYamlSafe(fs, modulePath, diagnostics, rel),
      rel(modulePath),
      diagnostics,
    );
    if (moduleFile === null) {
      continue;
    }
    if (!moduleFile.id.startsWith(`${courseFile.id}.`)) {
      diagnostics.error(
        rel(modulePath),
        `module id ${moduleFile.id} must start with "${courseFile.id}."`,
      );
    }
    const moduleLessons: Lesson[] = [];
    let lessonOrder = 0;
    for (const lessonDirName of moduleFile.lessons) {
      lessonOrder += 1;
      const lesson = await compileLesson({
        ...context,
        lessonDir: join(moduleDir, "lessons", lessonDirName),
        courseId: courseFile.id,
        moduleId: moduleFile.id,
        order: lessonOrder,
      });
      if (lesson !== null) {
        moduleLessons.push(lesson);
      }
    }
    const skillIds =
      moduleFile.skill_ids ?? unique(moduleLessons.flatMap((lesson) => lesson.skill_ids));
    const courseModule = parseWith(
      moduleSchema,
      {
        id: moduleFile.id,
        course_id: courseFile.id,
        title: moduleFile.title,
        summary: moduleFile.summary,
        order,
        lesson_ids: moduleLessons.map((lesson) => lesson.id),
        skill_ids: skillIds,
        source_path: rel(moduleDir),
      },
      rel(modulePath),
      diagnostics,
    );
    if (courseModule !== null) {
      modules.push(courseModule);
      lessons.push(...moduleLessons);
    }
  }
  const usesLabs = lessons.some((lesson) => lesson.labs.length > 0);
  if (!usesLabs && courseFile.capabilities.length > 0) {
    diagnostics.warning(
      rel(coursePath),
      "capabilities declared but no lesson references a lab",
    );
  }
  const { modules: _moduleDirs, ...manifestFields } = courseFile;
  const course = parseWith(
    courseManifestSchema,
    {
      ...manifestFields,
      uses_labs: usesLabs,
      module_ids: modules.map((module) => module.id),
      source_path: rel(courseDir),
    },
    rel(coursePath),
    diagnostics,
  );
  return course === null ? null : { course, modules, lessons };
}

interface LessonContext extends CourseContext {
  readonly lessonDir: string;
  readonly courseId: string;
  readonly moduleId: string;
  readonly order: number;
}

async function compileLesson(context: LessonContext): Promise<Lesson | null> {
  const { fs, lessonDir, rel, diagnostics } = context;
  const paths = {
    metadata: join(lessonDir, "metadata.yaml"),
    body: join(lessonDir, "lesson.md"),
    questions: join(lessonDir, "questions.yaml"),
    claims: join(lessonDir, "claims.yaml"),
  };
  for (const required of [paths.metadata, paths.body]) {
    if (!fs.exists(required)) {
      diagnostics.error(rel(lessonDir), `missing ${rel(required).split("/").pop()}`);
      return null;
    }
  }
  const metadata = parseWith(
    metadataFileSchema,
    readYamlSafe(fs, paths.metadata, diagnostics, rel),
    rel(paths.metadata),
    diagnostics,
  );
  if (metadata === null) {
    return null;
  }
  const questionsRaw = fs.exists(paths.questions)
    ? readYamlSafe(fs, paths.questions, diagnostics, rel)
    : [];
  const claimsRaw = fs.exists(paths.claims)
    ? readYamlSafe(fs, paths.claims, diagnostics, rel)
    : [];
  const questionsFile =
    parseWith(
      questionsFileSchema,
      questionsRaw ?? [],
      rel(paths.questions),
      diagnostics,
    ) ?? [];
  const claimsFile =
    parseWith(claimsFileSchema, claimsRaw ?? [], rel(paths.claims), diagnostics) ?? [];
  const questions: Question[] = questionsFile.map((question) => ({
    ...question,
    lesson_id: metadata.id,
  }));
  const claims = claimsFile.map((claim) => ({ ...claim, lesson_id: metadata.id }));

  const bodyPath = rel(paths.body);
  const parsed = parseLessonMarkdown(fs.readText(paths.body), bodyPath, diagnostics);

  const questionIds = new Set(questions.map((question) => question.id));
  for (const id of duplicates(questions.map((question) => question.id))) {
    diagnostics.error(rel(paths.questions), `question id ${id} is duplicated`);
  }
  for (const id of parsed.questionIds) {
    if (!questionIds.has(id)) {
      diagnostics.error(bodyPath, `::question{id=${id}} has no entry in questions.yaml`);
    }
  }
  for (const id of questionIds) {
    if (!parsed.questionIds.includes(id)) {
      diagnostics.warning(
        rel(paths.questions),
        `question ${id} is never placed in lesson.md`,
      );
    }
  }
  const claimIds = new Set(claims.map((claim) => claim.id));
  for (const id of duplicates(claims.map((claim) => claim.id))) {
    diagnostics.error(rel(paths.claims), `claim id ${id} is duplicated`);
  }
  for (const id of parsed.claimIds) {
    if (!claimIds.has(id)) {
      diagnostics.error(bodyPath, `:claim[${id}] has no entry in claims.yaml`);
    }
  }
  for (const claim of claims) {
    for (const sourceId of claim.source_ids) {
      if (!context.sourceIds.has(sourceId)) {
        diagnostics.error(
          rel(paths.claims),
          `claim ${claim.id} cites unknown source ${sourceId}`,
        );
      }
    }
  }
  for (const question of questions) {
    for (const skillId of question.skill_ids) {
      if (!context.skillIds.has(skillId)) {
        diagnostics.error(
          rel(paths.questions),
          `question ${question.id} references unknown skill ${skillId}`,
        );
      }
    }
    if (
      question.options !== undefined &&
      !question.options.some((option) => option.correct)
    ) {
      diagnostics.error(
        rel(paths.questions),
        `question ${question.id} has no correct option`,
      );
    }
  }
  for (const skillId of metadata.skill_ids) {
    if (!context.skillIds.has(skillId)) {
      diagnostics.error(rel(paths.metadata), `unknown skill ${skillId}`);
    }
  }
  for (const objective of metadata.objectives) {
    if (objective.skill_id !== undefined && !context.skillIds.has(objective.skill_id)) {
      diagnostics.error(
        rel(paths.metadata),
        `objective ${objective.id} references unknown skill ${objective.skill_id}`,
      );
    }
  }

  const present = new Set(parsed.sections.map((section) => section.element));
  const missing = LESSON_ELEMENTS.filter((element) => !present.has(element));
  const gated = ["approved", "published"].includes(metadata.qa_state);
  if (missing.length > 0) {
    (gated ? diagnostics.error : diagnostics.warning).call(
      diagnostics,
      bodyPath,
      `missing RFP §110 elements: ${missing.join(", ")}${gated ? ` (required for qa_state ${metadata.qa_state})` : ""}`,
    );
  }
  const review = metadata.review ?? {};
  if (gated && (review.approved_by === undefined || review.approved_at === undefined)) {
    diagnostics.error(
      rel(paths.metadata),
      `qa_state ${metadata.qa_state} requires review.approved_by and review.approved_at (invariant 10)`,
    );
  }
  if (!metadata.id.startsWith(`HM-LESSON-${context.courseId}-`)) {
    diagnostics.error(
      rel(paths.metadata),
      `lesson id ${metadata.id} must start with HM-LESSON-${context.courseId}-`,
    );
  }

  const sourceIds = unique(claims.flatMap((claim) => claim.source_ids));
  const body_hash = await hashCanonical(parsed.sections);
  return parseWith(
    lessonSchema,
    {
      id: metadata.id,
      course_id: context.courseId,
      module_id: context.moduleId,
      version: metadata.version,
      slug: metadata.slug,
      title: metadata.title,
      summary: metadata.summary,
      order: context.order,
      qa_state: metadata.qa_state,
      review,
      objectives: metadata.objectives,
      skill_ids: metadata.skill_ids,
      prerequisite_lesson_ids: metadata.prerequisite_lesson_ids ?? [],
      difficulty: metadata.difficulty,
      estimated_minutes: metadata.estimated_minutes,
      sections: parsed.sections,
      questions,
      claims,
      labs: metadata.labs ?? [],
      source_ids: sourceIds,
      body_hash,
      source_path: rel(lessonDir),
    },
    rel(paths.metadata),
    diagnostics,
  );
}

function loadDefinitions<T>(
  fs: ContentFs,
  dir: string,
  schema: z.ZodType<T>,
  rel: (path: string) => string,
  diagnostics: Diagnostics,
): T[] {
  const items: T[] = [];
  if (!fs.isDirectory(dir)) {
    return items;
  }
  const visit = (current: string): void => {
    for (const file of fs.listFiles(current, ".yaml")) {
      const path = join(current, file);
      const parsed = parseWith(
        schema,
        readYamlSafe(fs, path, diagnostics, rel),
        rel(path),
        diagnostics,
      );
      if (parsed !== null) {
        items.push(parsed);
      }
    }
    for (const sub of fs.listDirectories(current)) {
      visit(join(current, sub));
    }
  };
  visit(dir);
  const ids = items.map((item) => (item as { id?: string }).id ?? "");
  for (const id of duplicates(ids)) {
    diagnostics.error(rel(dir), `id ${id} is defined more than once`);
  }
  return items;
}

function readYamlSafe(
  fs: ContentFs,
  path: string,
  diagnostics: Diagnostics,
  rel: (path: string) => string,
): unknown {
  try {
    return readYaml(fs, path);
  } catch (error) {
    diagnostics.error(
      rel(path),
      `invalid YAML: ${error instanceof Error ? error.message : String(error)}`,
    );
    return null;
  }
}

function parseWith<T>(
  schema: z.ZodType<T>,
  value: unknown,
  path: string,
  diagnostics: Diagnostics,
): T | null {
  if (value === null) {
    return null;
  }
  const result = schema.safeParse(value);
  if (result.success) {
    return result.data;
  }
  for (const issue of result.error.issues) {
    diagnostics.error(path, `${issue.path.join(".") || "<root>"}: ${issue.message}`);
  }
  return null;
}

function duplicates(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const found = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) {
      found.add(value);
    }
    seen.add(value);
  }
  return [...found];
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function sortBy<T>(items: readonly T[], key: (item: T) => string): T[] {
  return [...items].sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));
}
