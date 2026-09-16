import { assertNotPrimaryDomain } from "@depinfin/transport-contract";

function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") {
    throw new Error(`${name} is required`);
  }
  return value;
}

export function databaseUrl(): string {
  return required("DATABASE_URL");
}

export function dailyCap(): number {
  const raw = process.env["DAILY_SEND_CAP"] ?? "40";
  const value = Number.parseInt(raw, 10);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`DAILY_SEND_CAP must be a positive integer, got ${raw}`);
  }
  return value;
}

export function gmailConfig() {
  return {
    clientId: required("GMAIL_CLIENT_ID"),
    clientSecret: required("GMAIL_CLIENT_SECRET"),
    refreshToken: required("GMAIL_REFRESH_TOKEN"),
    operatorAddress: required("GMAIL_OPERATOR_ADDRESS"),
  };
}

/**
 * INV-9. Checked at startup, so a deploy that points cold traffic at the
 * primary domain fails before it can send anything.
 */
export function coldDomains(): { sendingDomain: string; primaryDomain: string } {
  const primaryDomain = required("PRIMARY_DOMAIN");
  const sendingDomain = required("COLD_SENDING_DOMAIN");
  assertNotPrimaryDomain(sendingDomain, primaryDomain);
  return { sendingDomain, primaryDomain };
}
