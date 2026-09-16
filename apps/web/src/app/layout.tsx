import type { Metadata } from "next";
import { currentActor } from "../server/actor.js";
import { fixturesEnabled } from "../server/store.js";
import { Nav } from "../components/Nav.js";
import "./globals.css";

export const metadata: Metadata = {
  title: "DePINfin desk",
  description: "Internal outreach desk. Three operators.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const actor = await currentActor();
  const fixtures = fixturesEnabled();

  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500&family=Newsreader:opsz,wght@6..72,500;6..72,600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        {fixtures ? (
          <div className="banner">Fixture data. Not live prospects. WEB_FIXTURES=1 is on.</div>
        ) : null}
        <div className="shell">
          <Nav actor={actor} />
          {children}
        </div>
      </body>
    </html>
  );
}
