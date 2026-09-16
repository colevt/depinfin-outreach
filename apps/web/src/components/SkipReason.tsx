/**
 * Section 9. Render the pipeline reason as it arrived. Do not map it to a code.
 */
export function SkipReason({ reason }: { reason: string }) {
  return <p className="reason">{reason}</p>;
}
