import { describe, expect, it } from "vitest";
import { lint } from "@depinfin/compliance";
import { draftLinkedInMessage, LINKEDIN_DRAFT_TEMPLATE } from "../src/linkedin-draft.js";
import * as linkedIn from "../src/linkedin-draft.js";

const prospect = {
  contactId: "c1",
  email: "dana@northarc.com",
  firstName: "Dana",
  lastName: "Okafor",
  title: "CIO",
  firmName: "North Arc Family Office",
  personalReason: "your note on metered infrastructure at the Denver roundtable",
  doNotContact: false,
  tier: 2 as const,
  jurisdiction: "us" as const,
};

describe("LinkedIn draft, INV-8", () => {
  it("returns a copy-ready draft and a profile link", () => {
    const draft = draftLinkedInMessage({
      prospect,
      linkedinUrl: "https://www.linkedin.com/in/dana-okafor",
    });
    expect(draft.available).toBe(true);
    if (!draft.available) return;
    expect(draft.text).toContain("Dana, I am reaching out because your note on metered infrastructure");
    expect(draft.text).toContain("North Arc Family Office");
    expect(draft.text).not.toContain("{{");
    expect(draft.profileUrl).toBe("https://www.linkedin.com/in/dana-okafor");
  });

  it("refuses an empty personal_reason, same voice as the send pipeline", () => {
    const draft = draftLinkedInMessage({
      prospect: { ...prospect, personalReason: "   " },
      linkedinUrl: null,
    });
    expect(draft).toMatchObject({ available: false, reason: "Personal Reason empty" });
  });

  it("runs the linter on merged output, not the template", () => {
    const draft = draftLinkedInMessage({
      prospect: { ...prospect, personalReason: "you asked about APY on metered networks" },
      linkedinUrl: null,
    });
    expect(draft.available).toBe(false);
    if (draft.available) return;
    expect(draft.reason).toMatch(/blocked term "APY"/i);
  });

  it("the shipping template itself passes INV-2 and uses no em dash", () => {
    expect(lint("", LINKEDIN_DRAFT_TEMPLATE)).toEqual([]);
    expect(LINKEDIN_DRAFT_TEMPLATE).not.toMatch(/—/);
  });

  it("exports no send function", () => {
    expect(Object.keys(linkedIn)).not.toContain("send");
    expect(Object.keys(linkedIn)).not.toContain("sendLinkedIn");
    expect(typeof (linkedIn as { send?: unknown }).send).toBe("undefined");
  });
});
