import {
  learnerSchema,
  learnerSettingsSchema,
  type Learner,
  type LearnerSettings,
} from "@hivemind/schema";

import { allRows, parseJsonColumn, type Clock, type Database } from "./index";

interface LearnerRow {
  id: string;
  display_name: string;
  email: string | null;
  access_subject: string | null;
  settings_json: string;
  created_at: string;
  updated_at: string;
}

/** A learner row; `email` is null until the first validated Access identity binds it. */
export interface LearnerRecord {
  readonly id: string;
  readonly display_name: string;
  readonly email: string | null;
  readonly access_subject: string | null;
  readonly settings: LearnerSettings;
  readonly created_at: string;
  readonly updated_at: string;
}

function toRecord(row: LearnerRow): LearnerRecord {
  return {
    id: row.id,
    display_name: row.display_name,
    email: row.email,
    access_subject: row.access_subject,
    settings: parseJsonColumn(row.settings_json, (value) =>
      learnerSettingsSchema.parse(value),
    ),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/** Contract view of a bound learner. */
export function toLearner(record: LearnerRecord): Learner {
  if (record.email === null) {
    throw new Error(`learner ${record.id} has no bound identity`);
  }
  return learnerSchema.parse({
    id: record.id,
    display_name: record.display_name,
    identity: {
      provider: "cloudflare_access",
      email: record.email,
      ...(record.access_subject === null ? {} : { subject: record.access_subject }),
    },
    settings: record.settings,
    created_at: record.created_at,
    updated_at: record.updated_at,
  });
}

const COLUMNS =
  "id, display_name, email, access_subject, settings_json, created_at, updated_at";

export class LearnerRepository {
  constructor(
    private readonly db: Database,
    private readonly clock: Clock,
  ) {}

  async get(id: string): Promise<LearnerRecord | null> {
    const row = await this.db
      .prepare(`SELECT ${COLUMNS} FROM learners WHERE id = ?`)
      .bind(id)
      .first<LearnerRow>();
    return row === null ? null : toRecord(row);
  }

  async findByEmail(email: string): Promise<LearnerRecord | null> {
    const row = await this.db
      .prepare(`SELECT ${COLUMNS} FROM learners WHERE email = ? COLLATE NOCASE`)
      .bind(email)
      .first<LearnerRow>();
    return row === null ? null : toRecord(row);
  }

  async list(): Promise<LearnerRecord[]> {
    const rows = await allRows<LearnerRow>(
      this.db.prepare(`SELECT ${COLUMNS} FROM learners ORDER BY id`),
    );
    return rows.map(toRecord);
  }

  async bindIdentity(
    id: string,
    email: string,
    subject: string | null,
  ): Promise<LearnerRecord> {
    const now = this.clock.now();
    await this.db
      .prepare(
        "UPDATE learners SET email = ?, access_subject = ?, updated_at = ? WHERE id = ? AND email IS NULL",
      )
      .bind(email, subject, now, id)
      .run();
    const bound = await this.get(id);
    if (bound === null || bound.email === null) {
      throw new Error(`failed to bind identity to learner ${id}`);
    }
    return bound;
  }

  async updateSettings(id: string, settings: LearnerSettings): Promise<void> {
    await this.db
      .prepare("UPDATE learners SET settings_json = ?, updated_at = ? WHERE id = ?")
      .bind(JSON.stringify(learnerSettingsSchema.parse(settings)), this.clock.now(), id)
      .run();
  }
}
