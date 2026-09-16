/**
 * packages/compliance is the single source of truth for INV-1 through INV-4
 * and INV-7. Every send path calls into it. If eligibility or linting logic
 * appears in another package, that is a defect.
 */

export * from "./types.js";
export * from "./linter.js";
export * from "./merge.js";
export * from "./suppression.js";
export * from "./optout.js";
export * from "./eligibility.js";
export * from "./pipeline.js";
