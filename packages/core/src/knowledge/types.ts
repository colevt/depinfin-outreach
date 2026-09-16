/**
 * Vocabulary shared by the knowledge layer, the search builder, and the draft
 * composer. Mirrors the enums in migrations/0002 and 0006. The SQL is
 * authoritative; if these drift, the database refuses the write.
 */

export type MarketSide = "buy" | "sell";

export type FirmType =
  | "single_family_office"
  | "multi_family_office"
  | "ria"
  | "ocio"
  | "crypto_fund"
  | "rwa_fund"
  | "infra_fund"
  | "individual_hnw"
  | "ecosystem_principal";

export type OperatorCategory =
  | "telecom"
  | "compute"
  | "energy"
  | "sensing"
  | "mobility"
  | "storage"
  | "protocol_foundation"
  | "hardware_oem"
  | "other";

export type AumBand = "under_100m" | "100m_500m" | "500m_1b" | "over_1b";

export type DecisionRole = "principal" | "cio" | "analyst" | "gatekeeper";

export type TemplateStage = "first_touch" | "follow_up" | "reply" | "breakup";

export type DraftKind = "first_touch" | "follow_up" | "reply";

export type DraftChannel = "email" | "linkedin";

export const FIRM_TYPES: readonly FirmType[] = Object.freeze([
  "single_family_office",
  "multi_family_office",
  "ria",
  "ocio",
  "crypto_fund",
  "rwa_fund",
  "infra_fund",
  "individual_hnw",
  "ecosystem_principal",
]);

export const OPERATOR_CATEGORIES: readonly OperatorCategory[] = Object.freeze([
  "telecom",
  "compute",
  "energy",
  "sensing",
  "mobility",
  "storage",
  "protocol_foundation",
  "hardware_oem",
  "other",
]);

export const AUM_BANDS: readonly AumBand[] = Object.freeze([
  "under_100m",
  "100m_500m",
  "500m_1b",
  "over_1b",
]);

export const DECISION_ROLES: readonly DecisionRole[] = Object.freeze([
  "principal",
  "cio",
  "analyst",
  "gatekeeper",
]);

/** "Single family office" from "single_family_office". */
export function humanizeEnum(value: string): string {
  return value
    .split("_")
    .map((part) => (part.length > 0 ? part.charAt(0).toUpperCase() + part.slice(1) : part))
    .join(" ");
}
