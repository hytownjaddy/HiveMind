import { toLearner, type LearnerRecord, type LearnerRepository } from "../db/learners";
import type { AccessPrincipal } from "./access";

/*
 * Access identity → learner_id (D-033). The seeded learner has no email until
 * the first validated identity binds it; afterwards only that email maps to
 * the record. Access policy decides who can log in at all; this rule only
 * decides which learner record an allowed identity is. Multi-user later means
 * creating learner rows, not changing this mapping.
 */

export type LearnerResolution =
  | { readonly ok: true; readonly learner: LearnerRecord; readonly bound: boolean }
  | { readonly ok: false; readonly reason: "unknown_identity" | "not_a_learner" };

export async function resolveLearner(
  repository: LearnerRepository,
  principal: AccessPrincipal,
): Promise<LearnerResolution> {
  if (principal.kind !== "learner") {
    return { ok: false, reason: "not_a_learner" };
  }
  const existing = await repository.findByEmail(principal.email);
  if (existing !== null) {
    return { ok: true, learner: existing, bound: false };
  }
  const learners = await repository.list();
  const unbound = learners.filter((learner) => learner.email === null);
  if (learners.length === 1 && unbound.length === 1 && unbound[0] !== undefined) {
    const learner = await repository.bindIdentity(
      unbound[0].id,
      principal.email,
      principal.subject,
    );
    return { ok: true, learner, bound: true };
  }
  return { ok: false, reason: "unknown_identity" };
}

export { toLearner };
