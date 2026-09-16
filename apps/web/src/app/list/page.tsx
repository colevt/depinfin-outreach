import Link from "next/link";
import { ImportForm } from "../../components/ImportForm";
import { RescoreForm } from "../../components/RescoreForm";
import { displayName, jurisdictionLabel, tierLabel } from "../../server/now";
import { getStore } from "../../server/store";

export default async function ListPage() {
  const store = getStore();
  const directory = await store.listDirectory();
  const firms = uniqueBy(
    directory.map((row) => ({ id: row.firmId, name: row.firmName })),
    (row) => row.id,
  );

  return (
    <main>
      <h1 className="page-title">List building</h1>
      <p className="lede">
        Import, dedupe, score. Enrichment adapters are section 12 step 8 and are
        not on this desk yet. Importing a name does not enroll it in a sequence.
      </p>
      <ImportForm />
      <section style={{ marginTop: 28 }}>
        <h2>Directory</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Firm</th>
              <th>Tier</th>
              <th>Status</th>
              <th>Reason</th>
            </tr>
          </thead>
          <tbody>
            {directory.map((row) => (
              <tr key={row.contactId}>
                <td>
                  <Link href={`/prospects/${row.contactId}`}>{displayName(row.firstName, row.lastName)}</Link>
                  <div className="meta">{row.email ?? "no email"}</div>
                </td>
                <td>
                  {row.firmName}
                  <div className="meta">{jurisdictionLabel(row.jurisdiction)}</div>
                </td>
                <td>
                  {tierLabel(row.tier)}
                  {row.score !== null ? <div className="meta">{row.score}</div> : null}
                </td>
                <td>{row.enrollmentStatus?.replace("_", " ") ?? "not enrolled"}</td>
                <td>{row.personalReason ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section style={{ marginTop: 36 }}>
        <h2>Rescore a firm</h2>
        <p className="lede">
          Uses the section 4 rubric. A rescore never overwrites manual_only, and it
          never leaves Tier 1 without a confirmed operator action.
        </p>
        {firms.map((firm) => (
          <FirmRescore key={firm.id} firmId={firm.id} firmName={firm.name} />
        ))}
      </section>
    </main>
  );
}

async function FirmRescore({ firmId, firmName }: { firmId: string; firmName: string }) {
  const store = getStore();
  const firm = await store.getFirmForRescore(firmId);
  if (!firm) return null;
  return (
    <div style={{ marginBottom: 16 }}>
      <h3>{firmName}</h3>
      <RescoreForm firmId={firmId} factors={firm.scoreFactors} />
    </div>
  );
}

function uniqueBy<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const k = key(item);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(item);
  }
  return out;
}
