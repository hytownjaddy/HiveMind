/** `?view=author` shows every QA state (author view, UI-SYSTEM §10); the default is learner view. */
export function viewFrom(request: Request): { authorView: boolean } {
  return { authorView: new URL(request.url).searchParams.get("view") === "author" };
}

export function versionFrom(request: Request): string | undefined {
  const value = new URL(request.url).searchParams.get("version");
  return value === null || value === "latest" ? undefined : value;
}
