/*
 * Deterministic pseudo-random numbers for instantiation (invariant 5). The
 * stream depends only on (archetype id, archetype version, seed), so the same
 * archetype version and seed produce the same topology on any runtime. The
 * generator is SplitMix32; quality is irrelevant here, reproducibility is not.
 */

function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (const char of new TextEncoder().encode(text)) {
    hash ^= char;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

export class SeededRandom {
  private state: number;

  constructor(seed: number, salt: string) {
    if (!Number.isInteger(seed) || seed < 0) {
      throw new RangeError("seed must be a non-negative integer");
    }
    this.state = (fnv1a(`${salt}#${seed}`) ^ Math.imul(seed >>> 0, 0x9e3779b1)) >>> 0;
  }

  /** Next value in [0, 2^32). */
  nextUint32(): number {
    this.state = (this.state + 0x9e3779b9) >>> 0;
    let z = this.state;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
    return (z ^ (z >>> 16)) >>> 0;
  }

  /** Integer in [min, max], inclusive. */
  int(min: number, max: number): number {
    if (max < min) {
      throw new RangeError(`empty range ${min}..${max}`);
    }
    return min + (this.nextUint32() % (max - min + 1));
  }

  pick<T>(values: readonly T[]): T {
    if (values.length === 0) {
      throw new RangeError("cannot pick from an empty list");
    }
    return values[this.nextUint32() % values.length] as T;
  }

  boolean(): boolean {
    return (this.nextUint32() & 1) === 1;
  }
}
