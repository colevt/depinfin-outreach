import { FIXTURE_NOW } from "./fixtures";
import type { OperatorStore } from "./types";

export function deskNow(store: OperatorStore): Date {
  return store.usingFixtures ? FIXTURE_NOW : new Date();
}

export function displayName(first: string, last: string | null): string {
  return last ? `${first} ${last}` : first;
}

export function tierLabel(tier: 1 | 2 | 3 | null): string {
  if (tier === 1) return "Tier 1";
  if (tier === 2) return "Tier 2";
  if (tier === 3) return "Tier 3";
  return "Unscored";
}

export function jurisdictionLabel(value: string): string {
  if (value === "us") return "US";
  if (value === "non_us") return "Non-US";
  if (value === "eu") return "EU";
  if (value === "uk") return "UK";
  if (value === "eea") return "EEA";
  return value;
}
