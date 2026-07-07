import { useParams } from "react-router-dom";

export default function AgentRun() {
  const { id } = useParams();
  return (
    <div>
      <h1 className="text-2xl font-semibold">Agent Run</h1>
      <p className="mt-2 text-slate-600">
        Sequenced agent pipeline for decision{" "}
        <code className="rounded bg-slate-200 px-1">{id}</code>. (Screen 4 —
        built in a later step.)
      </p>
    </div>
  );
}
