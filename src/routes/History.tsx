import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight, Search, Trophy } from "lucide-react";
import { historyRows, type HistoryRow } from "@core/db/analytics";
import { IronTopBar, IronToolbarButton } from "@ui/components/IronTopBar";
import { IronEmptyState } from "@ui/components/IronEmptyState";
import { weightUnit } from "@app/lib/format";
import { useGoBack } from "@app/hooks/useGoBack";

/** 12450 → "12.5k" (volume figures get long fast in lb). */
function compactVolume(n: number): string {
  if (n < 1000) return String(Math.round(n));
  const k = n / 1000;
  return `${k >= 100 ? Math.round(k) : k.toFixed(1).replace(/\.0$/, "")}k`;
}

export function History() {
  const goBack = useGoBack("/analytics");
  const { t } = useTranslation();

  return (
    <div className="flex h-[100dvh] flex-col bg-bg">
      <IronTopBar
        title={t("History")}
        leading={
          <IronToolbarButton onClick={goBack} label={t("Back")}>
            <ChevronLeft size={18} strokeWidth={2.5} />
          </IronToolbarButton>
        }
      />
      <HistoryList />
    </div>
  );
}

/** Search + month-grouped session list — used by the /history route and the Analytics History segment. */
export function HistoryList() {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const unit = weightUnit();
  const [query, setQuery] = useState("");

  const sessions = useLiveQuery(() => historyRows(), [], undefined);

  // Group by calendar month, newest first, with per-month session + volume totals.
  const months = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = (sessions ?? []).filter(
      (s) => !q || s.name.toLowerCase().includes(q) || s.notes.toLowerCase().includes(q),
    );
    const out: { key: string; label: string; sessions: HistoryRow[]; volume: number }[] = [];
    for (const s of list) {
      const d = new Date(s.date);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      let group = out[out.length - 1];
      if (!group || group.key !== key) {
        group = {
          key,
          label: d.toLocaleDateString(i18n.language, { month: "long", year: "numeric" }),
          sessions: [],
          volume: 0,
        };
        out.push(group);
      }
      group.sessions.push(s);
      group.volume += s.volume;
    }
    return out;
  }, [sessions, query, i18n.language]);

  return (
    <>
      {sessions === undefined ? null : sessions.length === 0 ? (
        <IronEmptyState
          eyebrow={t("HISTORY · 00")}
          title={t("No history\nyet")}
          body={t(
            "Finish your first workout and it'll land here — sortable by month, searchable by exercise or routine name.",
          )}
        />
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto pb-10">
          <div className="mx-[22px] mt-3 flex items-center gap-2.5 border border-rule bg-card px-3.5 py-2.5">
            <Search size={14} className="shrink-0 text-ink3" strokeWidth={2.25} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("Routine or notes…")}
              className="w-full bg-transparent text-[13px] text-ink outline-none placeholder:text-ink3"
            />
          </div>

          {months.length === 0 ? (
            <p className="px-[22px] py-10 text-center text-[13px] text-ink2">
              {t("Try a different keyword or clear the search.")}
            </p>
          ) : (
            months.map((m) => (
              <section key={m.key} className="mt-6">
                <div className="flex items-baseline justify-between px-[22px] pb-2.5">
                  <h2 className="font-display text-[18px] font-bold tracking-[-0.3px] text-ink">{m.label}</h2>
                  <p className="mono-num text-[11px] text-ink2">
                    <b className="font-display text-ink">{m.sessions.length}</b>{" "}
                    {m.sessions.length === 1 ? t("session") : t("sessions")} ·{" "}
                    <b className="font-display text-ink">{compactVolume(m.volume)}</b> {unit}
                  </p>
                </div>
                <ul className="px-[22px]">
                  {m.sessions.map((s) => {
                    const d = new Date(s.date);
                    return (
                      <li key={s.id} className="border-t border-hairline">
                        <button
                          type="button"
                          onClick={() => navigate(`/history/${s.id}`)}
                          className="flex w-full items-center py-[13px] text-left active:bg-chip/50"
                        >
                          <span className="w-9 shrink-0">
                            <span className="block font-display text-[16px] font-extrabold leading-none tabular-nums text-ink">
                              {d.getDate()}
                            </span>
                            <span className="mt-0.5 block text-[9px] font-bold uppercase tracking-[0.06em] text-ink3">
                              {d.toLocaleDateString(i18n.language, { weekday: "short" })}
                            </span>
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-1.5">
                              <span className="truncate text-[14px] font-semibold text-ink">
                                {s.name || t("Workout")}
                              </span>
                              {s.prs > 0 && (
                                <span className="flex shrink-0 items-center gap-0.5 text-accent">
                                  <Trophy size={11} strokeWidth={2.5} />
                                  <span className="mono-num text-[10px] font-bold">×{s.prs}</span>
                                </span>
                              )}
                            </span>
                            <span className="mono-num mt-px block text-[11px] text-ink2">
                              {s.sets} {t("sets")} · {compactVolume(s.volume)} {unit} ·{" "}
                              {Math.max(1, Math.round(s.durationSeconds / 60))} {t("min")}
                            </span>
                          </span>
                          <ChevronRight size={14} strokeWidth={2.25} className="shrink-0 text-ink3" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))
          )}
        </div>
      )}
    </>
  );
}
