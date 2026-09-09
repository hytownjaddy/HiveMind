import type { Learner, LearnerSettings } from "@hivemind/schema";

import { toLearner, type LearnerRepository } from "../db/learners";

export class LearnerService {
  constructor(private readonly learners: LearnerRepository) {}

  async me(learnerId: string): Promise<Learner | null> {
    const record = await this.learners.get(learnerId);
    return record === null || record.email === null ? null : toLearner(record);
  }

  async updateSettings(
    learnerId: string,
    settings: LearnerSettings,
  ): Promise<Learner | null> {
    await this.learners.updateSettings(learnerId, settings);
    return this.me(learnerId);
  }
}
