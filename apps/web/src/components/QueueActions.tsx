"use client";

import { useActionState } from "react";
import { resumeEnrollment, stopEnrollment, type ActionResult } from "../server/actions.js";

const idle: ActionResult = { ok: true, message: "" };

export function QueueActions({
  enrollmentId,
  contactId,
}: {
  enrollmentId: string;
  contactId: string;
}) {
  const [resumeState, resumeAction, resumePending] = useActionState(
    async (_prev: ActionResult, formData: FormData) => resumeEnrollment(formData),
    idle,
  );
  const [stopState, stopAction, stopPending] = useActionState(
    async (_prev: ActionResult, formData: FormData) => stopEnrollment(formData),
    idle,
  );

  return (
    <div className="actions">
      <a className="btn" href={`/prospects/${contactId}`}>
        Open
      </a>
      <form action={resumeAction}>
        <input type="hidden" name="enrollmentId" value={enrollmentId} />
        <label className="confirm">
          <input type="checkbox" name="confirm" />
          Return to automated sending
        </label>
        <button className="btn" type="submit" disabled={resumePending}>
          Resume
        </button>
      </form>
      <form action={stopAction}>
        <input type="hidden" name="enrollmentId" value={enrollmentId} />
        <input type="text" name="reason" placeholder="Stop reason" required />
        <button className="btn btn-danger" type="submit" disabled={stopPending}>
          Stop
        </button>
      </form>
      {resumeState.message ? (
        <p className={resumeState.ok ? "flash" : "flash-bad"}>{resumeState.message}</p>
      ) : null}
      {stopState.message ? (
        <p className={stopState.ok ? "flash" : "flash-bad"}>{stopState.message}</p>
      ) : null}
    </div>
  );
}
