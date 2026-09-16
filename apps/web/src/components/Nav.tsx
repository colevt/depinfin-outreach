"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { setActor } from "../server/actions.js";

const LINKS = [
  { href: "/", label: "Queue" },
  { href: "/sends", label: "Sends" },
  { href: "/list", label: "List" },
] as const;

export function Nav({ actor }: { actor: string }) {
  const path = usePathname();

  return (
    <header className="nav">
      <div className="brand">
        DePINfin
        <span>Outreach desk</span>
      </div>
      <nav className="nav-links" aria-label="Desk">
        {LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            data-active={isActive(path, link.href) ? "true" : "false"}
          >
            {link.label}
          </Link>
        ))}
        <form className="actor" action={setActor}>
          <label className="mono" htmlFor="actor">
            Acting as
          </label>
          <input id="actor" name="actor" defaultValue={actor} />
          <button type="submit" className="btn">
            Set
          </button>
        </form>
      </nav>
    </header>
  );
}

function isActive(path: string, href: string): boolean {
  if (href === "/") return path === "/";
  return path.startsWith(href);
}
