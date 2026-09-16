import { describe, expect, it } from "vitest";
import {
  PrimaryDomainError,
  TransportMismatchError,
  assertNotPrimaryDomain,
  dispatch,
  type Campaign,
  type OutboundMessage,
  type Transport,
} from "@depinfin/transport-contract";
import { ColdTransport, type EspClient } from "../src/index.js";

const esp: EspClient = {
  name: "test",
  sendRaw: async () => ({ providerMessageId: "cold-1" }),
};

const fakeWarm: Transport<"warm"> = {
  kind: "warm",
  sendingDomain: "depinfin.com",
  send: async () => ({ providerMessageId: "warm-1", threadId: "t-1", sentAt: new Date() }),
};

function coldTransport(sendingDomain: string) {
  return new ColdTransport({
    sendingDomain,
    primaryDomain: "depinfin.com",
    fromAddress: `cole@${sendingDomain}`,
    client: esp,
  });
}

describe("INV-9 sending paths are separate", () => {
  describe("cold transport rejects the primary domain", () => {
    it("refuses the primary domain outright", () => {
      expect(() => coldTransport("depinfin.com")).toThrow(PrimaryDomainError);
    });

    it("refuses a subdomain of the primary domain", () => {
      expect(() => coldTransport("mail.depinfin.com")).toThrow(PrimaryDomainError);
      expect(() => coldTransport("send.mail.depinfin.com")).toThrow(PrimaryDomainError);
    });

    it("refuses case and trailing-dot variants", () => {
      expect(() => coldTransport("DePINfin.com")).toThrow(PrimaryDomainError);
      expect(() => coldTransport("depinfin.com.")).toThrow(PrimaryDomainError);
    });

    it("accepts a genuinely separate domain", () => {
      const transport = coldTransport("depinfin-outreach.com");
      expect(transport.kind).toBe("cold");
      expect(transport.sendingDomain).toBe("depinfin-outreach.com");
    });

    it("allows a lookalike that merely contains the primary domain as a substring", () => {
      // notdepinfin.com is a separate domain and must be allowed. The suffix
      // check has to be on a label boundary, not a substring.
      expect(() => coldTransport("notdepinfin.com")).not.toThrow();
    });

    it("refuses a from-address that is not on the cold domain", () => {
      expect(
        () =>
          new ColdTransport({
            sendingDomain: "depinfin-outreach.com",
            primaryDomain: "depinfin.com",
            fromAddress: "cole@depinfin.com",
            client: esp,
          }),
      ).toThrow(/not on the cold sending domain/);
    });

    it("exposes assertNotPrimaryDomain for startup checks", () => {
      expect(() => assertNotPrimaryDomain("outreach.example", "depinfin.com")).not.toThrow();
      expect(() => assertNotPrimaryDomain("", "depinfin.com")).toThrow(PrimaryDomainError);
    });
  });

  describe("misrouting is a type error", () => {
    const coldCampaign: Campaign<"cold"> = { id: "c1", name: "Cold list A", transport: "cold" };
    const warmCampaign: Campaign<"warm"> = { id: "w1", name: "Warm intros", transport: "warm" };
    const coldMessage: OutboundMessage<"cold"> = {
      transport: "cold",
      to: "dana@northarc.com",
      subject: "s",
      body: "b",
    };
    const warmMessage: OutboundMessage<"warm"> = {
      transport: "warm",
      to: "dana@northarc.com",
      subject: "s",
      body: "b",
    };

    it("does not compile when a cold campaign is dispatched through the warm transport", () => {
      // @ts-expect-error INV-9: a cold campaign cannot use the warm transport
      expect(() => dispatch(fakeWarm, coldCampaign, coldMessage)).toBeDefined();
    });

    it("does not compile when a cold message is dispatched on a warm campaign", () => {
      // @ts-expect-error INV-9: a cold message cannot go out on a warm campaign
      expect(() => dispatch(fakeWarm, warmCampaign, coldMessage)).toBeDefined();
    });

    it("refuses at runtime too, for a caller that reached here through any", async () => {
      const smuggled = dispatch(
        fakeWarm as unknown as Transport<"cold">,
        coldCampaign,
        coldMessage,
      );
      await expect(smuggled).rejects.toThrow(TransportMismatchError);
    });

    it("dispatches a matched warm campaign", async () => {
      const result = await dispatch(fakeWarm, warmCampaign, warmMessage);
      expect(result.providerMessageId).toBe("warm-1");
    });

    it("dispatches a matched cold campaign", async () => {
      const result = await dispatch(coldTransport("depinfin-outreach.com"), coldCampaign, coldMessage);
      expect(result.providerMessageId).toBe("cold-1");
      expect(result.threadId).toBeNull();
    });
  });

  it("cold sends carry no tracking surface, section 10", () => {
    const transport = coldTransport("depinfin-outreach.com");
    expect(Object.keys(transport)).not.toContain("tracking");
    expect(JSON.stringify(Object.keys(transport))).not.toMatch(/pixel|track|wrap/i);
  });
});
