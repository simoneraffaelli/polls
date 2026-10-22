function seedNumber(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Stable PRNG for reproducible simulation, not cryptographic randomness. */
export function seededUniform(seed: string): () => number {
  let state = seedNumber(seed);
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function seededNormal(seed: string): () => number {
  const uniform = seededUniform(seed);
  let spare: number | null = null;
  return () => {
    if (spare !== null) {
      const result = spare;
      spare = null;
      return result;
    }
    const radius = Math.sqrt(
      -2 * Math.log(Math.max(uniform(), Number.MIN_VALUE)),
    );
    const angle = 2 * Math.PI * uniform();
    spare = radius * Math.sin(angle);
    return radius * Math.cos(angle);
  };
}
