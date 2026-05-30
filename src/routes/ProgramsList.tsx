import { useLiveQuery } from "dexie-react-hooks";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ChevronLeft } from "lucide-react";
import { db } from "@core/db/db";
import { IronTopBar, IronToolbarButton } from "@ui/components/IronTopBar";

export function ProgramsList() {
  const navigate = useNavigate();
  const { t } = useTranslation();

  const programs = useLiveQuery(
    async () => {
      const list = (await db.programs.toArray()).sort((a, b) => a.name.localeCompare(b.name));
      return Promise.all(
        list.map(async (p) => {
          const meso = (await db.mesocycles.where("programId").equals(p.id).toArray()).sort(
            (a, b) => a.order - b.order,
          )[0];
          let daysPerWeek = 0;
          if (meso) {
            const micro = (await db.microcycles.where("mesocycleId").equals(meso.id).toArray()).sort(
              (a, b) => a.weekIndex - b.weekIndex,
            )[0];
            if (micro) daysPerWeek = await db.programDays.where("microcycleId").equals(micro.id).count();
          }
          return { p, daysPerWeek };
        }),
      );
    },
    [],
    undefined,
  );

  const builtIn = (programs ?? []).filter((x) => x.p.isBuiltIn);
  const custom = (programs ?? []).filter((x) => !x.p.isBuiltIn);

  return (
    <div className="flex h-[100dvh] flex-col bg-bg">
      <IronTopBar
        title={t("Programs")}
        leading={
          <IronToolbarButton onClick={() => navigate("/workout")} label={t("Back")}>
            <ChevronLeft size={18} strokeWidth={2.5} />
          </IronToolbarButton>
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto pb-10">
        <Section title={t("BUILT-IN")} items={builtIn} t={t} onOpen={(id) => navigate(`/programs/${id}`)} />
        {custom.length > 0 && (
          <Section title={t("CUSTOM")} items={custom} t={t} onOpen={(id) => navigate(`/programs/${id}`)} />
        )}
      </div>
    </div>
  );
}

function Section({
  title,
  items,
  t,
  onOpen,
}: {
  title: string;
  items: { p: { id: string; name: string; author: string; weeks: number; isActive: boolean }; daysPerWeek: number }[];
  t: (k: string) => string;
  onOpen: (id: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <>
      <p className="eyebrow text-ink3 px-[22px] pb-2 pt-4">{title}</p>
      <ul className="divide-y divide-hairline border-y border-hairline">
        {items.map(({ p, daysPerWeek }, i) => (
          <li key={p.id}>
            <button
              type="button"
              onClick={() => onOpen(p.id)}
              className="flex w-full items-center gap-4 px-[22px] py-4 text-left active:bg-chip"
            >
              <span className="mono-num text-ink3">{String(i + 1).padStart(2, "0")}</span>
              <div className="flex-1">
                <p className="font-display text-[17px] font-bold text-ink">{p.name}</p>
                <p className="eyebrow text-ink3 mt-0.5">
                  {p.weeks} {t("WK")} · {daysPerWeek} {t("DAYS")} · {p.author}
                </p>
              </div>
              {p.isActive && <span className="eyebrow text-accent">{t("ACTIVE")}</span>}
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
