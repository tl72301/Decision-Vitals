import { Routes, Route } from "react-router-dom";
import AppShell from "./components/AppShell.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import NewDecision from "./pages/NewDecision.jsx";
import DecisionDetail from "./pages/DecisionDetail.jsx";
import AgentRun from "./pages/AgentRun.jsx";
import Report from "./pages/Report.jsx";

export default function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/new" element={<NewDecision />} />
        <Route path="/decision/:id" element={<DecisionDetail />} />
        <Route path="/decision/:id/run" element={<AgentRun />} />
        <Route
          path="/decision/:id/report/:runId"
          element={<Report />}
        />
      </Routes>
    </AppShell>
  );
}
