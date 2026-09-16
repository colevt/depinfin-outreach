/**
 * What DePINfin is, in one place, so drafts and research prompts stop
 * re-inventing it and stop getting it wrong.
 *
 * Two descriptions live here and they are not interchangeable.
 * `INTERNAL_DESCRIPTION` is how the company describes itself to itself.
 * `APPROVED_POSITIONING` is what may appear in prospect-facing copy, and it is
 * narrower on purpose. CLAUDE.md section 13 forbids describing DePINfin as a
 * broker-dealer, a compliance platform, or a legal structurer, so the internal
 * shorthand "compliance and capital-formation layer" is exactly the phrasing
 * that must not reach a prospect. Copy leads with software.
 *
 * Nothing in this file is legal advice, and nothing here asserts that any
 * practice is compliant.
 */

export const INTERNAL_DESCRIPTION = `DePINfin is a compliance and capital-formation layer for decentralized
physical infrastructure networks. It helps real-world infrastructure projects in telecom, compute and
energy raise capital through compliant fractionalization, SPV structuring and offering design.` as const;

/**
 * The external line. Software and administrative tooling, non-custodial, and
 * the SPV rather than DePINfin is the issuer of record.
 */
export const APPROVED_POSITIONING = `DePINfin builds software and administrative tooling for financing
physical infrastructure. We are non-custodial. We do not hold assets, we do not take custody of investor
funds, and we are not the issuer. Each offering is issued by its own SPV, which is the issuer of record.` as const;

/**
 * The thesis, and it leads. Token ownership in a DePIN network is not legal
 * ownership of the underlying hardware or its revenue. That gap between what a
 * token holder believes they own and what they can enforce is the problem the
 * SPV structure closes.
 */
export const CORE_THESIS = `Web3 token ownership is not legal asset ownership. A token can represent a
claim in a network's own accounting and still give its holder nothing enforceable against the machines,
the contracts, or the revenue. Closing that gap is what an SPV with real documentation does, and it is
what makes physical infrastructure financeable by people who are not crypto-native.` as const;

export interface PositioningPoint {
  readonly id: string;
  readonly claim: string;
  /** Why a prospect should believe it, or what makes it checkable. */
  readonly support: string;
}

/** Tier 1, corporate content only (INV-6). No terms, no assets, no numbers. */
export const POSITIONING_POINTS: readonly PositioningPoint[] = Object.freeze([
  {
    id: "ownership_gap",
    claim: "Token ownership is not legal asset ownership.",
    support:
      "A network token is an entry in that network's own ledger. Legal recourse against hardware, " +
      "offtake contracts, or cash flows comes from an entity that holds them, not from a token.",
  },
  {
    id: "spv_is_issuer",
    claim: "The SPV is the issuer of record, not the operator and not DePINfin.",
    support:
      "Each offering sits in its own entity with its own documentation, so an investor's counterparty " +
      "is a defined legal person rather than a protocol.",
  },
  {
    id: "software_not_intermediary",
    claim: "DePINfin is a non-custodial software and administrative tooling provider.",
    support:
      "We do not hold assets, take custody of funds, or act as an intermediary in a transaction. " +
      "Structuring and legal work is done by the operator's own counsel.",
  },
  {
    id: "real_assets",
    claim: "The underlying assets are physical and already deployed or contracted.",
    support:
      "Telecom radios, compute clusters, and energy hardware have maintenance records, offtake terms, " +
      "and counterparties that can be diligenced the way any infrastructure asset is.",
  },
  {
    id: "operating_history",
    claim: "DePIN networks produce operating data that predates any offering.",
    support:
      "Uptime, utilization, and settlement history exist on-chain before capital is raised, which is " +
      "unusual for early-stage infrastructure and is the reason category-literate investors engage.",
  },
]);

/**
 * Copy rules from CLAUDE.md section 13. The first is enforced by the linter in
 * packages/compliance; the rest are house rules a human has to hold, so they
 * are written down here where the drafting UI can show them.
 */
export interface CopyRule {
  readonly id: string;
  readonly rule: string;
  readonly instead: string | null;
  /** True when packages/compliance refuses the send rather than advising. */
  readonly enforcedByLinter: boolean;
}

export const COPY_RULES: readonly CopyRule[] = Object.freeze([
  {
    id: "no_return_language",
    rule: "No return-implying language, and no percentage figures.",
    instead: 'Use "cash-flow-producing", "contracted revenue", or "distributions".',
    enforcedByLinter: true,
  },
  {
    id: "prospectus",
    rule: '"Prospectus" is the wrong word and is also a blocked term.',
    instead: 'Use "offering" or "memorandum".',
    enforcedByLinter: true,
  },
  {
    id: "issuer_of_record",
    rule: "The SPV is the issuer of record, not the operator. This is a recurring error.",
    instead: 'Write "the SPV issues", not "the operator issues".',
    enforcedByLinter: false,
  },
  {
    id: "unsecured",
    rule: "The first note offerings are unsecured. No collateral or security language.",
    instead: 'Do not write "secured", "backed by", "collateralized", or "asset-backed".',
    enforcedByLinter: false,
  },
  {
    id: "lead_with_software",
    rule: "Lead with software. Do not describe DePINfin as a broker-dealer, compliance platform, or legal structurer.",
    instead: 'Use "software and administrative tooling", "non-custodial".',
    enforcedByLinter: false,
  },
  {
    id: "market_figures",
    rule: "Market figures are investor-material claims. They need a source verified before use.",
    instead: "Cite a source with a fetch date in research_notes, or leave the figure out.",
    enforcedByLinter: false,
  },
  {
    id: "no_em_dash",
    rule: "No em dashes.",
    instead: "Use a comma, a colon, or a second sentence.",
    enforcedByLinter: false,
  },
]);

/**
 * Things that are true about the company and are not marketing claims. Useful
 * grounding for a draft, and safe to state.
 */
export const COMPANY_FACTS: readonly string[] = Object.freeze([
  "Outside securities counsel is Lowenstein Sandler LLP.",
  "Offerings are structured as Reg D private placements, one SPV per offering.",
  "The first note offerings are unsecured.",
  "DePINfin does not take custody of investor funds or of network assets.",
  "Target sectors are telecom, compute, and energy infrastructure.",
]);

/**
 * Claims that are out of bounds in prospect-facing copy regardless of whether
 * the linter catches them. The drafting UI shows these next to the editor.
 */
export const DO_NOT_CLAIM: readonly string[] = Object.freeze([
  "Any projected, targeted, historical, or illustrative return.",
  "That an offering is secured, collateralized, or asset-backed.",
  "That DePINfin is a broker-dealer, an exchange, a compliance platform, or a legal structurer.",
  "That DePINfin, an offering, or a structure is compliant, approved, registered, or vetted by a regulator.",
  "That tokens in any network confer legal ownership of assets.",
  "Any market size, growth rate, or sector figure without a verified source on file.",
]);
