import { topologyArchetypeSchema, type TopologyArchetype } from "@hivemind/schema";

/*
 * Archetype registry. Archetypes are authored as YAML under
 * `content/topologies/` and compiled into `archetypes.generated.json` (see
 * `labs/compile`), which the Workers and the CLI import; drift between the
 * two fails `bun run test:unit`. Lookup accepts an id or any alias.
 */

export class ArchetypeRegistry {
  private readonly byId = new Map<string, TopologyArchetype>();
  private readonly byAlias = new Map<string, string>();

  constructor(archetypes: readonly TopologyArchetype[]) {
    for (const raw of archetypes) {
      const archetype = topologyArchetypeSchema.parse(raw);
      if (this.byId.has(archetype.id) || this.byAlias.has(archetype.id)) {
        throw new Error(`duplicate archetype id ${archetype.id}`);
      }
      this.byId.set(archetype.id, archetype);
      for (const alias of archetype.aliases) {
        if (this.byId.has(alias) || this.byAlias.has(alias)) {
          throw new Error(
            `alias ${alias} of ${archetype.id} collides with another archetype`,
          );
        }
        this.byAlias.set(alias, archetype.id);
      }
    }
  }

  resolve(idOrAlias: string): TopologyArchetype | null {
    const direct = this.byId.get(idOrAlias);
    if (direct !== undefined) {
      return direct;
    }
    const aliased = this.byAlias.get(idOrAlias);
    return aliased === undefined ? null : (this.byId.get(aliased) ?? null);
  }

  list(): TopologyArchetype[] {
    return [...this.byId.values()].sort((a, b) => a.id.localeCompare(b.id));
  }

  /** Every distinct image reference declared by the registry, for the runtimes table. */
  images(): { archetype_id: string; role: string; image: string }[] {
    const rows: { archetype_id: string; role: string; image: string }[] = [];
    for (const archetype of this.list()) {
      for (const [role, image] of Object.entries(archetype.images)) {
        rows.push({ archetype_id: archetype.id, role, image });
      }
    }
    return rows;
  }
}
