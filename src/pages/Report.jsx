import { useParams } from "react-router-dom";

export default function Report() {
  const { id, runId } = useParams();
  return (
    <div>
      <h1 className="text-2xl font-semibold">Decision Health Report</h1>
      <p className="mt-2 text-slate-600">
        Report <code className="rounded bg-slate-200 px-1">{runId}</code> for
        decision <code className="rounded bg-slate-200 px-1">{id}</code>.
        (Screen 5 — built in a later step.)
      </p>
    </div>
  );
}
