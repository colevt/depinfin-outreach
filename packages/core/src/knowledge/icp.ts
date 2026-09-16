/**
 * Who we are trying to reach, on both sides of the market, written down once.
 *
 * Buy side is capital. Investors and allocators who might fund an offering.
 * That is what this repo was built for and it is where the securities posture
 * lives: everything in CLAUDE.md section 2 is about not mishandling a buy-side
 * prospect.
 *
 * Sell side is supply. The infrastructure operators who would raise through
 * the platform. Reaching them is business development for a software product,
 * not solicitation of an investment, so the posture is different. The linter
 * still applies, because a message to an operator that promises a return to
 * their investors is just as wrong.
 *
 * Nothing here is legal advice. The distinction above is an operating
 * convention, not a legal opinion, and how far it holds is a question for
 * Lowenstein Sandler, not for this file.
 */

import type { FirmType, MarketSide, OperatorCategory } from "./types.js";

export interface BuySideProfile {
  readonly firmType: FirmType;
  readonly label: string;
  /** Why this kind of firm would care. One sentence, usable in a draft. */
  readonly thesis: string;
  /** What to lead with for this type. */
  readonly leadWith: string;
  /** The objection that comes back most often. */
  readonly objection: string;
  /** Typical first-cheque range, for ticket_fit scoring. Informational. */
  readonly ticketBand: string;
  /** Signals that this is a real prospect rather than a name. */
  readonly qualifiers: readonly string[];
  /** Signals to stop. */
  readonly disqualifiers: readonly string[];
}

export const BUY_SIDE_PROFILES: readonly BuySideProfile[] = Object.freeze([
  {
    firmType: "single_family_office",
    label: "Single family office",
    thesis:
      "One decision maker, a real appetite for hard assets, and no committee to convince. " +
      "Infrastructure with contracted revenue is a familiar shape to them.",
    leadWith: "The asset and the counterparty. Who signs the offtake, and what happens if they stop paying.",
    objection: "Liquidity. They are used to holding, but they want to know what an exit looks like.",
    ticketBand: "250k to 2m",
    qualifiers: [
      "Existing direct investments in real assets, energy, or real estate",
      "A principal who has publicly engaged with digital assets, even skeptically",
      "A named investment professional rather than only a family principal",
    ],
    disqualifiers: [
      "Public-markets only mandate",
      "No direct or private allocations in the last three years",
    ],
  },
  {
    firmType: "multi_family_office",
    label: "Multi family office",
    thesis:
      "They need differentiated private deal flow to justify their fee, and infrastructure with " +
      "operating history is easier to put in front of their families than venture is.",
    leadWith: "The structure. They will be asked by their families who the issuer is and what they own.",
    objection: "Suitability across many households, and who does the diligence.",
    ticketBand: "500k to 5m, often syndicated",
    qualifiers: [
      "A stated alternatives or real assets allocation",
      "Evidence of syndicating private deals to member families",
    ],
    disqualifiers: ["Purely discretionary model portfolios with no private sleeve"],
  },
  {
    firmType: "ria",
    label: "Registered investment adviser",
    thesis:
      "Advisers with an alternatives sleeve are looking for income-shaped private allocations that " +
      "are not another real estate fund.",
    leadWith: "The documentation and the administrative process. Their constraint is operational, not thematic.",
    objection: "Custody, reporting, and whether it fits on their platform.",
    ticketBand: "100k to 1m per client, aggregated",
    qualifiers: [
      "Form ADV shows private fund or alternative allocations",
      "An existing alternatives platform or a stated alts allocation",
    ],
    disqualifiers: ["No accredited client base", "Wirehouse-restricted product shelf"],
  },
  {
    firmType: "ocio",
    label: "Outsourced CIO",
    thesis:
      "They build real-asset sleeves for institutions and endowments and are structurally short " +
      "differentiated infrastructure exposure.",
    leadWith: "Portfolio role. Where this sits relative to their existing infrastructure and credit sleeves.",
    objection: "Size. Early offerings may be too small to matter to them.",
    ticketBand: "2m and up",
    qualifiers: ["A published real assets or infrastructure allocation", "Discretionary mandates"],
    disqualifiers: ["Minimum position sizes above what an early offering can absorb"],
  },
  {
    firmType: "crypto_fund",
    label: "Crypto fund",
    thesis:
      "They already understand DePIN networks and often hold the tokens. The gap between token " +
      "exposure and enforceable claims on the hardware is a gap they can feel.",
    leadWith: "The ownership gap. They are the audience that needs no explanation of what DePIN is.",
    objection: "Why wrap it at all, when they can just hold the token.",
    ticketBand: "250k to 3m",
    qualifiers: [
      "Existing positions in DePIN networks",
      "A stated interest in real-world assets or cash-flow strategies",
    ],
    disqualifiers: ["Liquid-only mandate", "Trading desks with no lockup tolerance"],
  },
  {
    firmType: "rwa_fund",
    label: "Real-world asset fund",
    thesis:
      "This is their stated mandate. The question is not whether they are interested, it is whether " +
      "the structure holds up against what they already own.",
    leadWith: "Structure and documentation quality, compared to the RWA deals they have seen.",
    objection: "Asset quality, and whether the operator can actually run the network.",
    ticketBand: "500k to 5m",
    qualifiers: ["Deployed capital in tokenized credit, treasuries, or receivables"],
    disqualifiers: ["Fund is pre-launch with no deployed capital"],
  },
  {
    firmType: "infra_fund",
    label: "Infrastructure fund",
    thesis:
      "They underwrite physical infrastructure for a living. DePIN is a new origination channel " +
      "for asset types they already know how to value.",
    leadWith: "Asset-level economics and the operator's track record. They will diligence like an infra fund.",
    objection: "Scale and ticket size, and whether the operator is institutional enough.",
    ticketBand: "5m and up",
    qualifiers: ["Deployed digital infrastructure, telecom, or energy transition capital"],
    disqualifiers: ["Minimum cheque exceeds the offering size"],
  },
  {
    firmType: "individual_hnw",
    label: "Individual, high net worth",
    thesis:
      "Often the fastest to decide and the most likely to come through a warm path. " +
      "Usually already holds digital assets.",
    leadWith: "The specific reason they were contacted. Without it this is a cold pitch to a person.",
    objection: "Trust in the operator, and what happens if the network stalls.",
    ticketBand: "50k to 500k",
    qualifiers: ["A warm path exists", "Verifiable prior private investments"],
    disqualifiers: ["No accreditation basis", "No warm path and no specific reason for contact"],
  },
  {
    firmType: "ecosystem_principal",
    label: "Ecosystem principal",
    thesis:
      "Founders, operators, and investors already inside DePIN. They invest, and more importantly " +
      "they introduce. Treat the introduction as the primary outcome.",
    leadWith: "What we are building and who it helps. Not a pitch for their capital.",
    objection: "What is in it for their network, and whether we are credible operators.",
    ticketBand: "25k to 250k, plus introductions",
    qualifiers: ["Operating role in a DePIN network", "Public writing or speaking on the category"],
    disqualifiers: ["Direct competitor to a portfolio operator"],
  },
]);

export interface SellSideProfile {
  readonly category: OperatorCategory;
  readonly label: string;
  /** What makes an operator in this category financeable. */
  readonly fitCriteria: readonly string[];
  /** What kills it. */
  readonly redFlags: readonly string[];
  /** The opening question that qualifies fastest. */
  readonly qualifyingQuestion: string;
}

/**
 * Sell side is tracked but not a focus yet. These profiles exist so the
 * pipeline has somewhere correct to put an operator when one turns up, not
 * because we are running outreach against them.
 */
export const SELL_SIDE_PROFILES: readonly SellSideProfile[] = Object.freeze([
  {
    category: "telecom",
    label: "Telecom and wireless",
    fitCriteria: [
      "Radios or nodes already deployed, with uptime history",
      "An identified offtaker or carrier relationship",
      "Hardware costs that a financing round would actually move",
    ],
    redFlags: ["Pre-hardware", "Revenue that is entirely token emissions"],
    qualifyingQuestion: "How much of your revenue comes from someone paying you in something other than your own token?",
  },
  {
    category: "compute",
    label: "Compute and GPU",
    fitCriteria: [
      "Utilization data from real customers",
      "Hardware under the operator's control rather than resold capacity",
      "Contracted demand rather than spot only",
    ],
    redFlags: ["Speculative capacity with no committed demand", "Leased capacity resold at a spread"],
    qualifyingQuestion: "What share of your fleet is under contract versus sold spot?",
  },
  {
    category: "energy",
    label: "Energy and storage",
    fitCriteria: [
      "Interconnection or site control secured",
      "An offtake agreement or a regulated tariff",
      "A credible O and M plan",
    ],
    redFlags: ["No site control", "Permitting not started"],
    qualifyingQuestion: "Do you have site control and an interconnection position today?",
  },
  {
    category: "sensing",
    label: "Sensing and mapping networks",
    fitCriteria: ["Paying data customers", "Coverage density that makes the data saleable"],
    redFlags: ["Data with no buyer", "Coverage driven entirely by token incentives"],
    qualifyingQuestion: "Who pays for the data today, and what do they pay for it?",
  },
  {
    category: "mobility",
    label: "Mobility and logistics",
    fitCriteria: ["Deployed fleet or charging assets", "Utilization and maintenance records"],
    redFlags: ["Asset-light aggregation with no owned hardware"],
    qualifyingQuestion: "What hardware do you own outright?",
  },
  {
    category: "storage",
    label: "Decentralized storage",
    fitCriteria: ["Paid storage commitments", "Retrieval performance under contract"],
    redFlags: ["Capacity committed with no paying tenants"],
    qualifyingQuestion: "How much stored data is paid for in fiat or stablecoin?",
  },
  {
    category: "protocol_foundation",
    label: "Protocol or foundation",
    fitCriteria: ["A deployed operator base that needs hardware financing", "Willingness to sit beside an SPV rather than inside it"],
    redFlags: ["Wants the foundation to be the issuer", "Treasury-funded operations with no external revenue"],
    qualifyingQuestion: "Are your operators capital constrained, and who finances them today?",
  },
  {
    category: "hardware_oem",
    label: "Hardware manufacturer",
    fitCriteria: ["Order book with deployment partners", "Unit economics that survive without subsidy"],
    redFlags: ["Single-network dependency"],
    qualifyingQuestion: "Who deploys your hardware, and how do they pay for it?",
  },
  {
    category: "other",
    label: "Other",
    fitCriteria: ["Physical assets, identifiable revenue, an operator who can run them"],
    redFlags: ["No hardware", "No revenue that is not the network's own token"],
    qualifyingQuestion: "What do you own, and who pays you for using it?",
  },
]);

/**
 * The scoring rubric in CLAUDE.md section 4 takes five factors from 1 to 5.
 * These are what each number means, so two operators scoring the same firm
 * land in the same place and a score stays recomputable.
 */
export interface FactorGuide {
  readonly factor: "mandateFit" | "ticketFit" | "categoryLiteracy" | "warmPath" | "decisionSpeed";
  readonly label: string;
  readonly weight: number;
  /** Index 0 is a score of 1, index 4 is a score of 5. */
  readonly anchors: readonly [string, string, string, string, string];
}

export const FACTOR_GUIDE: readonly FactorGuide[] = Object.freeze([
  {
    factor: "mandateFit",
    label: "Mandate fit",
    weight: 3,
    anchors: [
      "No private or real-asset allocation",
      "Private allocations, nothing adjacent to infrastructure",
      "Real assets or credit, no digital infrastructure",
      "Digital infrastructure or RWA exposure",
      "Stated DePIN or digital infrastructure mandate",
    ],
  },
  {
    factor: "ticketFit",
    label: "Ticket fit",
    weight: 2,
    anchors: [
      "Minimum cheque far above or below what an offering can take",
      "Workable only as a syndicate",
      "Plausible with effort",
      "Comfortably inside the range",
      "Typical cheque matches the offering size",
    ],
  },
  {
    factor: "categoryLiteracy",
    label: "Category literacy",
    weight: 2,
    anchors: [
      "Would need digital assets explained from the start",
      "Aware, skeptical, no positions",
      "Holds digital assets, has not looked at DePIN",
      "Understands DePIN, no positions",
      "Holds DePIN positions or has written about the category",
    ],
  },
  {
    factor: "warmPath",
    label: "Warm path",
    weight: 3,
    anchors: [
      "Cold, no connection",
      "Shared network, no one who would make the introduction",
      "A second-degree connection who might",
      "A named person who will introduce",
      "Direct prior relationship with a founder",
    ],
  },
  {
    factor: "decisionSpeed",
    label: "Decision speed",
    weight: 1,
    anchors: [
      "Committee, annual cycle",
      "Committee, quarterly",
      "Committee, ad hoc",
      "One decision maker plus diligence support",
      "One decision maker, no committee",
    ],
  },
]);

export function buySideProfile(firmType: FirmType): BuySideProfile | null {
  return BUY_SIDE_PROFILES.find((p) => p.firmType === firmType) ?? null;
}

export function sellSideProfile(category: OperatorCategory): SellSideProfile | null {
  return SELL_SIDE_PROFILES.find((p) => p.category === category) ?? null;
}

/** What the desk calls each side, for headings and filters. */
export const SIDE_LABEL: Record<MarketSide, string> = Object.freeze({
  buy: "Buy side, capital",
  sell: "Sell side, operators",
});
