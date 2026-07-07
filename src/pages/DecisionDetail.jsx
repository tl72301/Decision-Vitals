import { useParams } from "react-router-dom";

export default function DecisionDetail() {
  const { id } = useParams();
  return (
    <div>
      <h1 className="text-2xl font-semibold">Decision Detail</h1>
      <p className="mt-2 text-slate-600">
        Assumptions + evidence for decision{" "}
        <code className="rounded bg-slate-200 px-1">{id}</code>. (Screen 3 —
        built in a later step.)
      </p>
    </div>
  );
}
