// Small, dependency-free deterministic string hash (djb2 variant). Not cryptographic — only
// used for cheap, stable cache keys (see lib/evieAiPathPipeline.ts), never for security.

export function stableHash(input: string): string {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 33) ^ input.charCodeAt(i);
  }
  // >>> 0 forces an unsigned 32-bit integer before converting to a fixed-width hex string.
  return (hash >>> 0).toString(16).padStart(8, "0");
}
