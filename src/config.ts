import type { KichiForwarderConfig } from "./types.js";

const FIXED_CONFIG: KichiForwarderConfig = {};

export function parse(_value: unknown): KichiForwarderConfig {
  return FIXED_CONFIG;
}
