export interface Factory<T extends object> {
  /** Builds one record. Overrides replace defaults field by field. */
  build(overrides?: Partial<T>): T;
  buildMany(count: number, overrides?: Partial<T>): T[];
}

/**
 * Defines a test factory. `defaults` gets a sequence number that is unique
 * within the factory, so records never collide on unique fields.
 */
export function defineFactory<T extends object>(defaults: (sequence: number) => T): Factory<T> {
  let sequence = 0;
  const build = (overrides: Partial<T> = {}): T => {
    sequence += 1;
    return { ...defaults(sequence), ...overrides };
  };
  return {
    build,
    buildMany: (count, overrides) => Array.from({ length: count }, () => build(overrides)),
  };
}
