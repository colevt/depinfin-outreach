import { cookies } from "next/headers";

export const ACTOR_COOKIE = "operator_actor";

export async function currentActor(): Promise<string> {
  const jar = await cookies();
  const fromCookie = jar.get(ACTOR_COOKIE)?.value?.trim();
  if (fromCookie) return fromCookie;
  const fromEnv = process.env["OPERATOR_ACTOR"]?.trim();
  if (fromEnv) return fromEnv;
  return "cole";
}

export async function persistActor(actor: string): Promise<void> {
  const value = actor.trim();
  if (value.length === 0) return;
  const jar = await cookies();
  jar.set(ACTOR_COOKIE, value, { httpOnly: false, sameSite: "lax", path: "/" });
}
