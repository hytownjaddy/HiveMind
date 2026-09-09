export function Placeholder({
  title,
  rfp,
  summary,
  items,
}: {
  readonly title: string;
  readonly rfp: string;
  readonly summary: string;
  readonly items: readonly string[];
}) {
  return (
    <section className="max-w-3xl">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-1 text-xs uppercase tracking-wide text-zinc-500">RFP {rfp}</p>
      <p className="mt-4 text-zinc-300">{summary}</p>
      <ul className="mt-6 grid gap-2 sm:grid-cols-2">
        {items.map((item) => (
          <li
            key={item}
            className="rounded-md border border-dashed border-zinc-800 px-3 py-2 text-sm text-zinc-400"
          >
            {item}
          </li>
        ))}
      </ul>
      <p className="mt-6 text-sm text-zinc-500">
        Scaffold placeholder. The Cloudflare foundation (OpenNext web Worker, D1, session
        Worker with Durable Objects) is wired; this area is next to build.
      </p>
    </section>
  );
}
