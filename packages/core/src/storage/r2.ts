/*
 * R2 export store (D-020, D-030). Nightly `wrangler d1 export` dumps and
 * `hivemind export` archives live under `exports/`; Settings shows the latest.
 */

export const EXPORT_PREFIX = "exports/d1/";
export const ARCHIVE_PREFIX = "exports/archive/";

export interface StoredExport {
  readonly key: string;
  readonly size: number;
  readonly uploaded_at: string;
}

export class ExportStore {
  constructor(private readonly bucket: R2Bucket) {}

  async list(prefix: string = EXPORT_PREFIX, limit = 50): Promise<StoredExport[]> {
    const listed = await this.bucket.list({ prefix, limit });
    return listed.objects
      .map((object) => ({
        key: object.key,
        size: object.size,
        uploaded_at: object.uploaded.toISOString(),
      }))
      .sort((a, b) => (a.key < b.key ? 1 : -1));
  }

  async latest(prefix: string = EXPORT_PREFIX): Promise<StoredExport | null> {
    const [first] = await this.list(prefix, 1000);
    return first ?? null;
  }

  async put(
    key: string,
    body: string | ArrayBuffer | ReadableStream,
    contentType = "application/sql",
  ): Promise<void> {
    await this.bucket.put(key, body, { httpMetadata: { contentType } });
  }

  async getText(key: string): Promise<string | null> {
    const object = await this.bucket.get(key);
    return object === null ? null : object.text();
  }
}
