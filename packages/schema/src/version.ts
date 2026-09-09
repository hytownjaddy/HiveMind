import { z } from "zod";

/**
 * Bump when a change is not backwards compatible for connected clients.
 * Servers reject messages carrying a different version; clients close the
 * socket and refuse to reconnect until they reload.
 */
export const PROTOCOL_VERSION = 1 as const;

export const protocolVersionSchema = z.literal(PROTOCOL_VERSION);
export type ProtocolVersion = typeof PROTOCOL_VERSION;
