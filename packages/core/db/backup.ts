import type { Table } from "dexie";
import { db } from "./db";

const TABLES = [
  "exercises", "routines", "routineExercises", "supersetGroups", "programs",
  "mesocycles", "microcycles", "programDays", "sessions", "sessionExercises",
  "workoutSets", "bodyWeightEntries", "userProfile", "recoverySettings",
  "muscleVolumeTargets", "muscleRecoveryStatus", "recoveryFactors",
  "muscleRecoveryHistoryPoints",
] as const;

type AnyTable = Table<Record<string, unknown>, unknown>;
const table = (name: string): AnyTable => (db as unknown as Record<string, AnyTable>)[name];

export interface Backup {
  version: number;
  exportedAt: number;
  tables: Record<string, unknown[]>;
}

/** Full local store → JSON string (the `.platesbackup` payload). */
export async function exportBackup(): Promise<string> {
  const tables: Record<string, unknown[]> = {};
  for (const name of TABLES) tables[name] = await table(name).toArray();
  const backup: Backup = { version: 1, exportedAt: Date.now(), tables };
  return JSON.stringify(backup, null, 2);
}

/** Replace the entire store from a backup JSON string. */
export async function importBackup(json: string): Promise<void> {
  const backup = JSON.parse(json) as Backup;
  if (!backup || typeof backup !== "object" || !backup.tables) throw new Error("Invalid backup file");
  await db.transaction("rw", db.tables, async () => {
    for (const name of TABLES) {
      const t = table(name);
      await t.clear();
      const rows = backup.tables[name];
      if (Array.isArray(rows) && rows.length) await t.bulkAdd(rows as Record<string, unknown>[]);
    }
  });
}

const csv = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

/** Finished sessions flattened to CSV (date, routine, exercise, set, weight, reps…). */
export async function exportCSV(): Promise<string> {
  const sessions = (await db.sessions.where("durationSeconds").above(0).toArray()).sort((a, b) => a.date - b.date);
  const exMap = new Map((await db.exercises.toArray()).map((e) => [e.id, e]));
  const out: string[] = ["date,routine,exercise,set,weight,reps,kind,completed"];
  for (const s of sessions) {
    const sxs = (await db.sessionExercises.where("sessionId").equals(s.id).toArray()).sort((a, b) => a.order - b.order);
    for (const sx of sxs) {
      const ex = sx.exerciseId ? exMap.get(sx.exerciseId) : undefined;
      const sets = (await db.workoutSets.where("sessionExerciseId").equals(sx.id).toArray()).sort((a, b) => a.order - b.order);
      for (const set of sets) {
        out.push([
          new Date(s.date).toISOString(),
          csv(s.routineNameSnapshot),
          csv(ex?.nameEN ?? ""),
          String(set.order + 1),
          String(set.weight),
          String(set.reps),
          set.kind,
          String(set.isCompleted),
        ].join(","));
      }
    }
  }
  return out.join("\n");
}
