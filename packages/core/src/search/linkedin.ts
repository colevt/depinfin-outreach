/**
 * INV-8. This module builds search queries. It does not run them.
 *
 * Read this before adding anything here: no function in this file, and no
 * function that may ever be added to it, performs a network request. There is
 * no fetch, no browser driver, no headless client, no unofficial API wrapper,
 * and no scraping of any kind. The output is a string and a URL. A human
 * opens the URL in their own browser, signed into their own account, and reads
 * the results at human speed.
 *
 * The reason is not squeamishness about terms of service. Automated search and
 * messaging gets accounts restricted, and the accounts at risk belong to the
 * founders. Their personal credibility is the scarce asset in this raise, and
 * a restricted profile costs more than any list ever returns.
 *
 * If someone asks for "just a quick scrape", the answer is this file plus the
 * paste-back importer. That is the supported path.
 */

import type {
  AumBand,
  DecisionRole,
  FirmType,
  MarketSide,
  OperatorCategory,
} from "../knowledge/types.js";

export interface SearchCriteria {
  readonly side: MarketSide;
  /** Buy side. Empty means every type. */
  readonly firmTypes?: readonly FirmType[];
  /** Sell side. Empty means every category. */
  readonly operatorCategories?: readonly OperatorCategory[];
  readonly decisionRoles?: readonly DecisionRole[];
  readonly aumBands?: readonly AumBand[];
  /** Free-text geography, as LinkedIn spells it. "United States", "New York". */
  readonly locations?: readonly string[];
  /** Terms that must appear. Added verbatim, quoted if multi-word. */
  readonly mustInclude?: readonly string[];
  /** Terms that must not. */
  readonly exclude?: readonly string[];
  /** Require DePIN or digital-asset literacy signals in the profile text. */
  readonly requireCategoryLiteracy?: boolean;
}

/**
 * Title phrases per decision role. LinkedIn matches on profile text, so these
 * are the words that actually appear in a headline, not our internal labels.
 */
const ROLE_TITLES: Record<DecisionRole, readonly string[]> = Object.freeze({
  principal: ["Founder", "Managing Partner", "Managing Director", "Principal", "General Partner"],
  cio: ["Chief Investment Officer", "CIO", "Head of Investments", "Investment Director"],
  analyst: ["Investment Analyst", "Investment Associate", "Research Analyst"],
  gatekeeper: ["Chief of Staff", "Executive Assistant", "Head of Operations"],
});

/** How each firm type describes itself in a LinkedIn headline or company page. */
const FIRM_TYPE_TERMS: Record<FirmType, readonly string[]> = Object.freeze({
  single_family_office: ["Family Office", "Single Family Office"],
  multi_family_office: ["Multi Family Office", "Multi-Family Office", "Family Office"],
  ria: ["Registered Investment Advisor", "Registered Investment Adviser", "Wealth Management", "RIA"],
  ocio: ["Outsourced CIO", "OCIO", "Endowment", "Foundation Investment"],
  crypto_fund: ["Crypto Fund", "Digital Asset Fund", "Digital Assets", "Web3 Fund"],
  rwa_fund: ["Real World Assets", "RWA", "Tokenization", "Tokenized Assets"],
  infra_fund: ["Infrastructure Fund", "Infrastructure Investments", "Digital Infrastructure", "Energy Transition"],
  individual_hnw: ["Angel Investor", "Private Investor", "Investor"],
  ecosystem_principal: ["DePIN", "Web3 Infrastructure", "Protocol", "Node Operator"],
});

const OPERATOR_CATEGORY_TERMS: Record<OperatorCategory, readonly string[]> = Object.freeze({
  telecom: ["Wireless Network", "Telecom Infrastructure", "CBRS", "Private 5G", "DePIN"],
  compute: ["GPU Cloud", "Compute Network", "AI Infrastructure", "Decentralized Compute"],
  energy: ["Distributed Energy", "Virtual Power Plant", "Battery Storage", "Energy Infrastructure"],
  sensing: ["Sensor Network", "Mapping Network", "Environmental Sensing", "IoT Network"],
  mobility: ["Fleet Electrification", "EV Charging", "Mobility Infrastructure"],
  storage: ["Decentralized Storage", "Distributed Storage"],
  protocol_foundation: ["Protocol Foundation", "Network Foundation", "DePIN Protocol"],
  hardware_oem: ["Hardware Manufacturer", "OEM", "Device Manufacturer"],
  other: ["DePIN", "Decentralized Physical Infrastructure"],
});

/** Words that indicate someone has actually engaged with the category. */
const CATEGORY_LITERACY_TERMS: readonly string[] = Object.freeze([
  "DePIN",
  "Decentralized Physical Infrastructure",
  "Digital Infrastructure",
  "Real World Assets",
  "Tokenization",
]);

/** AUM bands as they tend to be written in a profile. Weak signal, used as an OR group. */
const AUM_TERMS: Record<AumBand, readonly string[]> = Object.freeze({
  under_100m: ["Emerging Manager", "Boutique"],
  "100m_500m": ["$100M", "$250M", "$500M"],
  "500m_1b": ["$500M", "$750M", "$1B"],
  over_1b: ["$1B", "$2B", "$5B", "Multi-Billion"],
});

function quote(term: string): string {
  return /\s/.test(term) ? `"${term}"` : term;
}

/** `(A OR B OR C)`, or a bare term when there is only one, or "" when empty. */
function orGroup(terms: readonly string[]): string {
  const unique = [...new Set(terms.map((t) => t.trim()).filter((t) => t.length > 0))];
  if (unique.length === 0) return "";
  if (unique.length === 1) return quote(unique[0]!);
  return `(${unique.map(quote).join(" OR ")})`;
}

export interface BuiltSearch {
  /** The boolean string. Paste into the keywords field, or read it to sanity check. */
  readonly query: string;
  /** Opens LinkedIn search in a browser. The operator runs it, this system never does. */
  readonly url: string;
  /** Sales Navigator, when the operator has a seat. Same query, better filters. */
  readonly salesNavigatorUrl: string;
  /** Human-readable account of what the query asks for. Shown next to the button. */
  readonly explanation: readonly string[];
}

/**
 * Turns criteria into a boolean query and the URLs that open it.
 *
 * The URLs are `linkedin.com/search/results/people` and the Sales Navigator
 * equivalent, both of which are the ordinary signed-in web interface. Opening
 * one is a person doing a search. Nothing here fetches either.
 */
export function buildLinkedInSearch(criteria: SearchCriteria): BuiltSearch {
  const groups: string[] = [];
  const explanation: string[] = [];

  const roleTerms = (criteria.decisionRoles ?? []).flatMap((role) => ROLE_TITLES[role]);
  const roleGroup = orGroup(roleTerms);
  if (roleGroup !== "") {
    groups.push(roleGroup);
    explanation.push(`Titles matching ${(criteria.decisionRoles ?? []).join(", ")}`);
  }

  if (criteria.side === "buy") {
    const typeTerms = (criteria.firmTypes ?? []).flatMap((t) => FIRM_TYPE_TERMS[t]);
    const typeGroup = orGroup(typeTerms);
    if (typeGroup !== "") {
      groups.push(typeGroup);
      explanation.push(`Firm types: ${(criteria.firmTypes ?? []).join(", ")}`);
    }
  } else {
    const categoryTerms = (criteria.operatorCategories ?? []).flatMap(
      (c) => OPERATOR_CATEGORY_TERMS[c],
    );
    const categoryGroup = orGroup(categoryTerms);
    if (categoryGroup !== "") {
      groups.push(categoryGroup);
      explanation.push(`Operator categories: ${(criteria.operatorCategories ?? []).join(", ")}`);
    }
  }

  if (criteria.requireCategoryLiteracy === true) {
    groups.push(orGroup(CATEGORY_LITERACY_TERMS));
    explanation.push("Profile mentions DePIN, digital infrastructure, or real-world assets");
  }

  const aumTerms = (criteria.aumBands ?? []).flatMap((band) => AUM_TERMS[band]);
  const aumGroup = orGroup(aumTerms);
  if (aumGroup !== "") {
    groups.push(aumGroup);
    explanation.push(
      `AUM signals for ${(criteria.aumBands ?? []).join(", ")}. Weak signal, verify on the firm's site.`,
    );
  }

  for (const term of criteria.mustInclude ?? []) {
    if (term.trim().length === 0) continue;
    groups.push(quote(term.trim()));
    explanation.push(`Must include ${term.trim()}`);
  }

  const excluded = (criteria.exclude ?? []).map((t) => t.trim()).filter((t) => t.length > 0);
  const query = [...groups, ...excluded.map((t) => `NOT ${quote(t)}`)].join(" AND ");

  if (excluded.length > 0) explanation.push(`Excludes ${excluded.join(", ")}`);

  const locations = (criteria.locations ?? []).map((l) => l.trim()).filter((l) => l.length > 0);
  if (locations.length > 0) {
    explanation.push(
      `Set the location filter to ${locations.join(" or ")} in the browser. ` +
        "LinkedIn matches locations by internal id, not by keyword, so it is not in the query string.",
    );
  }

  return {
    query,
    url: peopleSearchUrl(query),
    salesNavigatorUrl: salesNavigatorSearchUrl(query),
    explanation,
  };
}

/** The ordinary signed-in people search. A person opens this. */
export function peopleSearchUrl(query: string): string {
  return `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(query)}`;
}

/** Sales Navigator lead search. Same story, better filters once opened. */
export function salesNavigatorSearchUrl(query: string): string {
  return `https://www.linkedin.com/sales/search/people?query=${encodeURIComponent(
    `(spellCorrectionEnabled:true,keywords:${query})`,
  )}`;
}

/**
 * What the operator should do once the results are open. Shown under the
 * button, because the workflow being manual is the point rather than a gap.
 */
export const RUN_INSTRUCTIONS: readonly string[] = Object.freeze([
  "Open the search. It runs in your browser, under your account.",
  "Set the location and company-size filters in the sidebar. Those are not expressible as keywords.",
  "Work the results at a normal pace. Nothing here automates the browsing, and nothing should.",
  "Copy the ones worth keeping into the import box. Name, title, firm, and profile URL.",
  "Anything already in the pipeline is matched and skipped on import.",
]);
