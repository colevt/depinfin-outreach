import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  RUN_INSTRUCTIONS,
  buildLinkedInSearch,
  dedupeKey,
  dedupeLeads,
  normalizeLinkedInUrl,
  parsePastedLeads,
  peopleSearchUrl,
} from "../src/index.js";

describe("INV-8 the search module does not touch the network", () => {
  /**
   * This is the test that matters in this file. Everything else here checks
   * that a string was built correctly. This checks that the module cannot
   * become the thing INV-8 forbids without someone deleting a test that says
   * so out loud.
   *
   * Comments are stripped first. The doc comments in these files name the
   * things that must not appear, which is the point of them, and a scan that
   * could not tell prose from code would force the prohibition to go unwritten.
   */
  const stripComments = (source: string): string =>
    source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");

  const sources = ["../src/search/linkedin.ts", "../src/search/import.ts"].map((path) =>
    stripComments(readFileSync(new URL(path, import.meta.url), "utf8")),
  );

  it.each([
    ["fetch(", /\bfetch\s*\(/],
    ["XMLHttpRequest", /XMLHttpRequest/],
    ["node:http", /['"]node:https?['"]/],
    ["axios", /\baxios\b/],
    ["puppeteer", /\bpuppeteer\b/],
    ["playwright", /\bplaywright\b/],
    ["selenium", /\bselenium\b/],
    ["a headless browser", /\bheadless\b/],
  ])("contains no %s", (_label, pattern) => {
    for (const source of sources) {
      expect(pattern.test(source)).toBe(false);
    }
  });

  it("imports nothing outside the knowledge layer", () => {
    for (const source of sources) {
      const imports = [...source.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]!);
      for (const specifier of imports) {
        expect(specifier.startsWith("."), specifier).toBe(true);
      }
    }
  });

  it("tells the operator the run is theirs to do", () => {
    expect(RUN_INSTRUCTIONS.length).toBeGreaterThan(0);
    expect(RUN_INSTRUCTIONS.join(" ").toLowerCase()).toContain("your browser");
  });
});

describe("the query builder", () => {
  it("builds an AND of OR groups for a buy-side search", () => {
    const built = buildLinkedInSearch({
      side: "buy",
      firmTypes: ["single_family_office"],
      decisionRoles: ["cio"],
    });
    expect(built.query).toContain('"Chief Investment Officer"');
    expect(built.query).toContain('"Family Office"');
    expect(built.query).toContain(" AND ");
    expect(built.query).toContain(" OR ");
  });

  it("quotes multi-word terms and leaves single words bare", () => {
    const built = buildLinkedInSearch({ side: "buy", mustInclude: ["DePIN", "real assets"] });
    expect(built.query).toContain("DePIN");
    expect(built.query).toContain('"real assets"');
    expect(built.query).not.toContain('"DePIN"');
  });

  it("negates exclusions", () => {
    const built = buildLinkedInSearch({
      side: "buy",
      mustInclude: ["Family Office"],
      exclude: ["recruiter"],
    });
    expect(built.query).toContain("NOT recruiter");
  });

  it("switches vocabulary for a sell-side search", () => {
    const built = buildLinkedInSearch({ side: "sell", operatorCategories: ["telecom"] });
    expect(built.query).toContain("CBRS");
    expect(built.query).not.toContain("Family Office");
  });

  it("adds category literacy terms only when asked", () => {
    const without = buildLinkedInSearch({ side: "buy", firmTypes: ["ria"] });
    const wit = buildLinkedInSearch({
      side: "buy",
      firmTypes: ["ria"],
      requireCategoryLiteracy: true,
    });
    expect(without.query).not.toContain("DePIN");
    expect(wit.query).toContain("DePIN");
  });

  it("does not put locations in the query, and says why", () => {
    const built = buildLinkedInSearch({
      side: "buy",
      firmTypes: ["ria"],
      locations: ["New York"],
    });
    expect(built.query).not.toContain("New York");
    expect(built.explanation.join(" ")).toContain("location filter");
  });

  it("produces an empty query rather than throwing on empty criteria", () => {
    const built = buildLinkedInSearch({ side: "buy" });
    expect(built.query).toBe("");
    expect(built.url).toContain("linkedin.com/search/results/people");
  });

  it("percent-encodes the query into both URLs", () => {
    const built = buildLinkedInSearch({ side: "buy", mustInclude: ["real assets"] });
    expect(built.url).toContain(encodeURIComponent('"real assets"'));
    expect(built.salesNavigatorUrl).toContain("linkedin.com/sales/search/people");
  });

  it("builds a people search URL that is the ordinary signed-in interface", () => {
    expect(peopleSearchUrl("DePIN")).toBe(
      "https://www.linkedin.com/search/results/people/?keywords=DePIN",
    );
  });
});

describe("profile URL normalization", () => {
  it.each([
    ["https://www.linkedin.com/in/dana-reyes", "https://www.linkedin.com/in/dana-reyes"],
    ["https://www.linkedin.com/in/dana-reyes/", "https://www.linkedin.com/in/dana-reyes"],
    [
      "https://www.linkedin.com/in/dana-reyes?utm_source=share&trk=x",
      "https://www.linkedin.com/in/dana-reyes",
    ],
    ["http://linkedin.com/in/dana-reyes", "https://www.linkedin.com/in/dana-reyes"],
    ["https://uk.linkedin.com/in/dana-reyes", "https://www.linkedin.com/in/dana-reyes"],
  ])("%s normalizes to %s", (input, expected) => {
    expect(normalizeLinkedInUrl(input)).toBe(expected);
  });

  it("returns null for anything that is not a profile URL", () => {
    expect(normalizeLinkedInUrl("https://example.com/in/dana")).toBeNull();
    expect(normalizeLinkedInUrl("Dana Reyes")).toBeNull();
  });
});

describe("paste-back import", () => {
  it("reads tab separated rows", () => {
    const { leads, warnings } = parsePastedLeads(
      "Dana Reyes\tChief Investment Officer\tNorth Arc Capital\thttps://www.linkedin.com/in/dana-reyes",
    );
    expect(warnings).toEqual([]);
    expect(leads).toHaveLength(1);
    expect(leads[0]).toMatchObject({
      firstName: "Dana",
      lastName: "Reyes",
      title: "Chief Investment Officer",
      firmName: "North Arc Capital",
      linkedinUrl: "https://www.linkedin.com/in/dana-reyes",
    });
  });

  it("reads comma and pipe separated rows", () => {
    const comma = parsePastedLeads("Dana Reyes, CIO, North Arc");
    const pipe = parsePastedLeads("Dana Reyes | CIO | North Arc");
    expect(comma.leads[0]?.firmName).toBe("North Arc");
    expect(pipe.leads[0]?.firmName).toBe("North Arc");
  });

  it("strips credential suffixes from the name", () => {
    const { leads } = parsePastedLeads("Dana Reyes, CFA\tCIO\tNorth Arc");
    expect(leads[0]?.firstName).toBe("Dana");
    expect(leads[0]?.lastName).toBe("Reyes");
  });

  it("keeps a bare profile URL and warns rather than dropping it", () => {
    const { leads, warnings } = parsePastedLeads("https://www.linkedin.com/in/dana-reyes");
    expect(leads).toHaveLength(1);
    expect(leads[0]?.linkedinUrl).toBe("https://www.linkedin.com/in/dana-reyes");
    expect(warnings[0]?.reason).toContain("name is missing");
  });

  it("warns on a line it cannot read and reports the line number", () => {
    const { leads, warnings } = parsePastedLeads("Dana Reyes\tCIO\n   \n,,,\n");
    expect(leads).toHaveLength(1);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.line).toBe(3);
  });

  it("ignores blank lines", () => {
    const { leads } = parsePastedLeads("\n\nDana Reyes\tCIO\n\n");
    expect(leads).toHaveLength(1);
  });

  it("handles a single-word name", () => {
    const { leads } = parsePastedLeads("Dana\tCIO\tNorth Arc");
    expect(leads[0]).toMatchObject({ firstName: "Dana", lastName: null });
  });
});

describe("dedupe", () => {
  it("prefers the profile URL as the identity", () => {
    const a = dedupeKey({
      firstName: "Dana",
      lastName: "Reyes",
      firmName: "North Arc",
      linkedinUrl: "https://www.linkedin.com/in/dana-reyes/",
    });
    const b = dedupeKey({
      firstName: "D.",
      lastName: "Reyes",
      firmName: "North Arc Capital",
      linkedinUrl: "https://www.linkedin.com/in/dana-reyes?utm_source=share",
    });
    expect(a).toBe(b);
  });

  it("falls back to name and firm when there is no URL", () => {
    expect(dedupeKey({ firstName: "Dana", lastName: "Reyes", firmName: "North Arc" })).toBe(
      dedupeKey({ firstName: "dana", lastName: "REYES", firmName: " north arc " }),
    );
  });

  it("does not collapse two people with the same name at different firms", () => {
    expect(dedupeKey({ firstName: "Dana", lastName: "Reyes", firmName: "North Arc" })).not.toBe(
      dedupeKey({ firstName: "Dana", lastName: "Reyes", firmName: "Southwind" }),
    );
  });

  it("splits a paste into fresh, existing, and repeated", () => {
    const { leads } = parsePastedLeads(
      [
        "Dana Reyes\tCIO\tNorth Arc\thttps://www.linkedin.com/in/dana-reyes",
        "Dana Reyes\tCIO\tNorth Arc\thttps://www.linkedin.com/in/dana-reyes/",
        "Sam Okafor\tPrincipal\tSouthwind",
        "Existing Person\tCIO\tKnown Firm",
      ].join("\n"),
    );
    const existingKeys = new Set([
      dedupeKey({ firstName: "Existing", lastName: "Person", firmName: "Known Firm" }),
    ]);

    const result = dedupeLeads(leads, existingKeys);
    expect(result.fresh.map((l) => l.firstName)).toEqual(["Dana", "Sam"]);
    expect(result.duplicatedInPaste).toHaveLength(1);
    expect(result.existing.map((l) => l.firstName)).toEqual(["Existing"]);
  });
});
