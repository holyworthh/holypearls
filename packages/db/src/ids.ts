import { v7 as uuidv7 } from "uuid";

/** Creates record IDs. Tests can swap in a predictable version (TECH-00 §5 rule 6). */
export interface IdGenerator {
  newId(): string;
}

/** UUIDv7: random, time-ordered and never sequential (TECH-01 §1). */
export const uuidV7Generator: IdGenerator = {
  newId: () => uuidv7(),
};

export const newId = (): string => uuidV7Generator.newId();
