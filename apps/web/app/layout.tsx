import type { Metadata } from "next";
import Link from "next/link";
import { OPERATORS, currentOperator } from "../lib/operator";
import { OperatorPicker } from "./operator-picker";
import "./globals.css";

export const metadata: Metadata = {
  title: "DePINfin desk",
  description: "Internal outreach and pipeline desk. Three operators, one tenant.",
};

/**
 * The shell. Tabs in the order section 9 asks for, with the two things that
 * start work rather than continue it, research and search, pulled out as
 * buttons on the right.
 */
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const operator = await currentOperator();

  return (
    <html lang="en">
      <body>
        <header className="top">
          <div className="inner">
            <span className="brand">DePINfin desk</span>
            <nav className="tabs">
              <Link href="/">Queue</Link>
              <Link href="/prospects">Prospects</Link>
              <Link href="/automation">Automation</Link>
              <Link href="/templates">Templates</Link>
            </nav>
            <div className="top-actions">
              <Link className="btn" href="/research">
                Research
              </Link>
              <Link className="btn" href="/search">
                LinkedIn search
              </Link>
              <OperatorPicker operator={operator} operators={OPERATORS} />
            </div>
          </div>
        </header>
        <main className="shell">{children}</main>
      </body>
    </html>
  );
}
