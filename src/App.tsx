import { Suspense, lazy, useEffect, useState } from "react";
import { BrowserRouter, Navigate, Outlet, Route, Routes } from "react-router-dom";
import { IronTabBar } from "@ui/components/IronTabBar";
import { seedIfNeeded } from "@core/db/seed";
import { WorkoutTab } from "./routes/WorkoutTab";
import { ExercisesTab } from "./routes/ExercisesTab";
import { ExerciseDetail } from "./routes/ExerciseDetail";
import { CustomExerciseEditor } from "./routes/CustomExerciseEditor";
import { ProfileTab } from "./routes/ProfileTab";

// Analytics pulls in Recharts/d3 — load it on demand to keep the initial bundle small.
const AnalyticsTab = lazy(() => import("./routes/AnalyticsTab").then((m) => ({ default: m.AnalyticsTab })));
import { RoutineDetail } from "./routes/RoutineDetail";
import { RoutineEditor } from "./routes/RoutineEditor";
import { ActiveWorkout } from "./routes/ActiveWorkout";
import { SessionSummary } from "./routes/SessionSummary";
import { History } from "./routes/History";
import { SessionDetail } from "./routes/SessionDetail";
import { ProgramsList } from "./routes/ProgramsList";
import { ProgramDetail } from "./routes/ProgramDetail";
import { Recovery } from "./routes/Recovery";
import { PlateCalculator } from "./routes/PlateCalculator";
import { BodyWeight } from "./routes/BodyWeight";
import { VolumeTargets } from "./routes/VolumeTargets";
import { BackupRestore } from "./routes/BackupRestore";
import { Onboarding, ONBOARDED_KEY } from "./routes/Onboarding";

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
  const [onboarded, setOnboarded] = useState(() => localStorage.getItem(ONBOARDED_KEY) === "true");

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

  if (!onboarded) {
    return <Onboarding onDone={() => setOnboarded(true)} />;
  }

  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <Suspense
        fallback={
          <div className="grid h-[100dvh] place-items-center bg-bg">
            <span className="eyebrow text-ink3">···</span>
          </div>
        }
      >
      <Routes>
        {/* Tabbed surfaces */}
        <Route element={<TabLayout />}>
          <Route path="/workout" element={<WorkoutTab />} />
          <Route path="/exercises" element={<ExercisesTab />} />
          <Route path="/analytics" element={<AnalyticsTab />} />
          <Route path="/profile" element={<ProfileTab />} />
        </Route>

        {/* Full-screen flows */}
        <Route path="/exercises/new" element={<CustomExerciseEditor />} />
        <Route path="/exercises/:id" element={<ExerciseDetail />} />
        <Route path="/exercises/:id/edit" element={<CustomExerciseEditor />} />
        <Route path="/workout/routine/:id" element={<RoutineDetail />} />
        <Route path="/workout/routine/:id/edit" element={<RoutineEditor />} />
        <Route path="/active/:sessionId" element={<ActiveWorkout />} />
        <Route path="/summary/:sessionId" element={<SessionSummary />} />
        <Route path="/programs" element={<ProgramsList />} />
        <Route path="/programs/:id" element={<ProgramDetail />} />
        <Route path="/history" element={<History />} />
        <Route path="/history/:sessionId" element={<SessionDetail />} />
        <Route path="/recovery" element={<Recovery />} />
        <Route path="/profile/plate-calculator" element={<PlateCalculator />} />
        <Route path="/profile/body-weight" element={<BodyWeight />} />
        <Route path="/profile/volume-targets" element={<VolumeTargets />} />
        <Route path="/profile/backup" element={<BackupRestore />} />

        <Route path="*" element={<Navigate to="/workout" replace />} />
      </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
