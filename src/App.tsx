import { useEffect, useState } from "react";
import { BrowserRouter, Navigate, Outlet, Route, Routes } from "react-router-dom";
import { IronTabBar } from "@ui/components/IronTabBar";
import { seedIfNeeded } from "@core/db/seed";
import { WorkoutTab } from "./routes/WorkoutTab";
import { ExercisesTab } from "./routes/ExercisesTab";
import { AnalyticsTab } from "./routes/AnalyticsTab";
import { ProfileTab } from "./routes/ProfileTab";

function Layout() {
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
        <Route element={<Layout />}>
          <Route path="/workout" element={<WorkoutTab />} />
          <Route path="/exercises" element={<ExercisesTab />} />
          <Route path="/analytics" element={<AnalyticsTab />} />
          <Route path="/profile" element={<ProfileTab />} />
          <Route path="*" element={<Navigate to="/workout" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
