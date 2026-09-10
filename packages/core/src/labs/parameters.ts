import type { TopologyArchetype } from "@hivemind/schema";

import type { SeededRandom } from "./seed";

/*
 * Variation parameters: each dimension declared on the archetype is either
 * overridden by the caller (validated against the declaration) or drawn from
 * the seeded stream in declaration order, so adding an override never changes
 * how the remaining dimensions are drawn.
 */

export type ParameterValue = string | number | boolean;
export type ResolvedParameters = Record<string, ParameterValue>;

export class ParameterError extends Error {
  constructor(
    readonly parameter: string,
    message: string,
  ) {
    super(`parameter ${parameter}: ${message}`);
  }
}

export function resolveParameters(
  archetype: TopologyArchetype,
  random: SeededRandom,
  overrides: Readonly<Record<string, unknown>> = {},
): ResolvedParameters {
  const declared = new Set(archetype.parameters.map((parameter) => parameter.name));
  for (const key of Object.keys(overrides)) {
    if (!declared.has(key)) {
      throw new ParameterError(key, "not declared by the archetype");
    }
  }
  const resolved: ResolvedParameters = {};
  for (const parameter of archetype.parameters) {
    const override = overrides[parameter.name];
    const values = parameter.values ?? [];
    switch (parameter.kind) {
      case "int_range": {
        const [min, max] = values;
        if (typeof min !== "number" || typeof max !== "number") {
          throw new ParameterError(parameter.name, "int_range needs [min, max]");
        }
        if (override === undefined) {
          resolved[parameter.name] = random.int(min, max);
        } else if (
          typeof override === "number" &&
          Number.isInteger(override) &&
          override >= min &&
          override <= max
        ) {
          resolved[parameter.name] = override;
        } else {
          throw new ParameterError(
            parameter.name,
            `expected an integer in ${min}..${max}`,
          );
        }
        break;
      }
      case "choice": {
        if (values.length === 0) {
          throw new ParameterError(parameter.name, "choice needs values");
        }
        if (override === undefined) {
          resolved[parameter.name] = random.pick(values);
        } else if (values.some((value) => value === override)) {
          resolved[parameter.name] = override as ParameterValue;
        } else {
          throw new ParameterError(
            parameter.name,
            `expected one of ${values.join(", ")}`,
          );
        }
        break;
      }
      case "boolean": {
        if (override === undefined) {
          resolved[parameter.name] = random.boolean();
        } else if (typeof override === "boolean") {
          resolved[parameter.name] = override;
        } else {
          throw new ParameterError(parameter.name, "expected a boolean");
        }
        break;
      }
      case "string": {
        if (typeof override === "string" && override.length > 0) {
          resolved[parameter.name] = override;
        } else if (override === undefined && typeof values[0] === "string") {
          resolved[parameter.name] = values[0];
        } else {
          throw new ParameterError(parameter.name, "string parameters need a value");
        }
        break;
      }
    }
  }
  return resolved;
}

export function intParameter(parameters: ResolvedParameters, name: string): number {
  const value = parameters[name];
  if (typeof value !== "number") {
    throw new ParameterError(name, "missing integer value");
  }
  return value;
}

export function stringParameter(parameters: ResolvedParameters, name: string): string {
  const value = parameters[name];
  if (typeof value !== "string") {
    throw new ParameterError(name, "missing string value");
  }
  return value;
}
