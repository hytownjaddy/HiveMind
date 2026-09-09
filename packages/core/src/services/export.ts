import type { AttemptRepository } from "../db/attempts";
import type { ContentRepository } from "../db/content";
import type { LearnerRepository } from "../db/learners";
import type { WorkOrderRepository } from "../db/work-orders";

/*
 * Portable archive (D-020): learner history plus approved content, as plain
 * JSON that survives without HiveMind. `hivemind export` writes it to disk and
 * the nightly job stores the D1 SQL dump beside it in R2.
 */

export interface PortableArchive {
  readonly archive_format: 1;
  readonly exported_at: string;
  readonly learners: unknown[];
  readonly content_versions: unknown[];
  readonly courses: Record<string, unknown[]>;
  readonly lessons: Record<string, unknown[]>;
  readonly work_orders: unknown[];
  readonly attempts: unknown[];
}

export class ExportService {
  constructor(
    private readonly learners: LearnerRepository,
    private readonly content: ContentRepository,
    private readonly orders: WorkOrderRepository,
    private readonly attempts: AttemptRepository,
    private readonly now: () => string,
  ) {}

  async archive(): Promise<PortableArchive> {
    const learners = await this.learners.list();
    const versions = await this.content.listVersions();
    const courses: Record<string, unknown[]> = {};
    const lessons: Record<string, unknown[]> = {};
    for (const version of versions) {
      courses[version.id] = await this.content.listCourses(version.id);
      lessons[version.id] = [];
      for (const course of version.course_ids) {
        lessons[version.id]?.push(
          ...(await this.content.listLessons(version.id, course)),
        );
      }
    }
    const attempts: unknown[] = [];
    for (const learner of learners) {
      attempts.push(...(await this.attempts.listByLearner(learner.id, 10_000)));
    }
    return {
      archive_format: 1,
      exported_at: this.now(),
      learners,
      content_versions: versions,
      courses,
      lessons,
      work_orders: await this.orders.list({ limit: 10_000 }),
      attempts,
    };
  }
}
