type KichiForwarderConfig = Record<string, never>;

const FIXED_CONFIG: KichiForwarderConfig = {};

export function parse(_value: unknown): KichiForwarderConfig {
  return FIXED_CONFIG;
}
