import { useEffect, useState } from "react";
import { BrowserRouter, Navigate, Outlet, Route, Routes } from "react-router-dom";
import { IronTabBar } from "@ui/components/IronTabBar";
import { seedIfNeeded } from "@core/db/seed";
import { WorkoutTab } from "./routes/WorkoutTab";
import { ExercisesTab } from "./routes/ExercisesTab";
import { AnalyticsTab } from "./routes/AnalyticsTab";
import { ProfileTab } from "./routes/ProfileTab";
import { RoutineDetail } from "./routes/RoutineDetail";
import { RoutineEditor } from "./routes/RoutineEditor";
import { ActiveWorkout } from "./routes/ActiveWorkout";
import { SessionSummary } from "./routes/SessionSummary";
import { History } from "./routes/History";
import { SessionDetail } from "./routes/SessionDetail";

function TabLayout() {
  return (
    <div className="flex h-[100dvh] flex-col bg-bg">
      <main className="min-h-0 flex-1 overflow-y-auto">
        <Outlet />
      </main>
      <IronTabBar />
    </div>
  );
}

export function App() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void seedIfNeeded().then(() => setReady(true));
  }, []);

  if (!ready) {
    return (
      <div className="grid h-[100dvh] place-items-center bg-bg">
        <span className="eyebrow text-ink3">PLATES</span>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        {/* Tabbed surfaces */}
        <Route element={<TabLayout />}>
          <Route path="/workout" element={<WorkoutTab />} />
          <Route path="/exercises" element={<ExercisesTab />} />
          <Route path="/analytics" element={<AnalyticsTab />} />
          <Route path="/profile" element={<ProfileTab />} />
        </Route>

        {/* Full-screen flows */}
        <Route path="/workout/routine/:id" element={<RoutineDetail />} />
        <Route path="/workout/routine/:id/edit" element={<RoutineEditor />} />
        <Route path="/active/:sessionId" element={<ActiveWorkout />} />
        <Route path="/summary/:sessionId" element={<SessionSummary />} />
        <Route path="/history" element={<History />} />
        <Route path="/history/:sessionId" element={<SessionDetail />} />

        <Route path="*" element={<Navigate to="/workout" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
