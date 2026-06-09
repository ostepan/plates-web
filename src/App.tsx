import {
  Component, Suspense, lazy, useEffect, useState,
  type ComponentType, type ReactNode,
} from "react";
import { BrowserRouter, Navigate, Outlet, Route, Routes } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { IronTabBar } from "@ui/components/IronTabBar";
import { seedIfNeeded } from "@core/db/seed";
import { WorkoutTab } from "./routes/WorkoutTab";
import { ExercisesTab } from "./routes/ExercisesTab";
import { ExerciseDetail } from "./routes/ExerciseDetail";
import { CustomExerciseEditor } from "./routes/CustomExerciseEditor";
import { ProfileTab } from "./routes/ProfileTab";

// Analytics pulls in Recharts/d3 — load it on demand to keep the initial bundle small.
const AnalyticsTab = lazyWithRetry(() => import("./routes/AnalyticsTab").then((m) => ({ default: m.AnalyticsTab })));
import { RoutineDetail } from "./routes/RoutineDetail";
import { RoutineEditor } from "./routes/RoutineEditor";
import { ActiveWorkout } from "./routes/ActiveWorkout";
import { SessionSummary } from "./routes/SessionSummary";
import { History } from "./routes/History";
import { SessionDetail } from "./routes/SessionDetail";
import { ProgramsList } from "./routes/ProgramsList";
import { ProgramDetail } from "./routes/ProgramDetail";
import { CustomProgramEditor } from "./routes/CustomProgramEditor";
import { Recovery } from "./routes/Recovery";
import { RecoverySettings } from "./routes/RecoverySettings";
import { PlateCalculator } from "./routes/PlateCalculator";
import { BodyWeight } from "./routes/BodyWeight";
import { VolumeTargets } from "./routes/VolumeTargets";
import { BackupRestore } from "./routes/BackupRestore";
import { Onboarding, ONBOARDED_KEY } from "./routes/Onboarding";

/**
 * Lazy import that survives a stale chunk after a redeploy. A PWA can hold an
 * old index.html that points at a chunk hash which no longer exists on the
 * server; the dynamic import then rejects and React blanks the whole tree.
 * We reload once to pull fresh assets; if it still fails, the ErrorBoundary
 * shows a recoverable screen instead of a blank white page.
 */
const CHUNK_RELOAD_KEY = "plates.chunkReloaded";
function lazyWithRetry<T extends ComponentType<unknown>>(factory: () => Promise<{ default: T }>) {
  return lazy(async () => {
    try {
      const mod = await factory();
      sessionStorage.removeItem(CHUNK_RELOAD_KEY);
      return mod;
    } catch (err) {
      if (!sessionStorage.getItem(CHUNK_RELOAD_KEY)) {
        sessionStorage.setItem(CHUNK_RELOAD_KEY, "1");
        window.location.reload();
        return new Promise<{ default: T }>(() => {}); // hold render while the page reloads
      }
      throw err;
    }
  });
}

function ErrorScreen() {
  const { t } = useTranslation();
  return (
    <div className="grid h-[100dvh] place-items-center bg-bg px-8 text-center">
      <div>
        <p className="eyebrow text-ink3 mb-2">PLATES</p>
        <p className="mb-5 text-[14px] leading-relaxed text-ink2">
          {t("Couldn't load this screen. Reload to try again.")}
        </p>
        <button
          type="button"
          onClick={() => { sessionStorage.removeItem(CHUNK_RELOAD_KEY); window.location.reload(); }}
          className="bg-ink px-6 py-3 text-white"
        >
          <span className="eyebrow text-[12px]">{t("Reload")}</span>
        </button>
      </div>
    </div>
  );
}

class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error: unknown) {
    console.error("App crashed:", error);
  }
  render() {
    return this.state.hasError ? <ErrorScreen /> : this.props.children;
  }
}

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
      <ErrorBoundary>
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
        <Route path="/programs/new" element={<CustomProgramEditor />} />
        <Route path="/programs/:id" element={<ProgramDetail />} />
        <Route path="/programs/:id/edit" element={<CustomProgramEditor />} />
        <Route path="/history" element={<History />} />
        <Route path="/history/:sessionId" element={<SessionDetail />} />
        <Route path="/recovery" element={<Recovery />} />
        <Route path="/recovery/settings" element={<RecoverySettings />} />
        <Route path="/profile/plate-calculator" element={<PlateCalculator />} />
        <Route path="/profile/body-weight" element={<BodyWeight />} />
        <Route path="/profile/volume-targets" element={<VolumeTargets />} />
        <Route path="/profile/backup" element={<BackupRestore />} />

        <Route path="*" element={<Navigate to="/workout" replace />} />
      </Routes>
      </Suspense>
      </ErrorBoundary>
    </BrowserRouter>
  );
}
