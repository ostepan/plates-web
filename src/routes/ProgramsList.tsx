import { useLiveQuery } from "dexie-react-hooks";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ChevronLeft, Copy, Pause, Pencil, Play, Plus, Trash2 } from "lucide-react";
import { db } from "@core/db/db";
import {
  activateProgram, deactivateProgram, deleteProgram, duplicateProgram,
} from "@core/db/mutations";
import type { Program } from "@core/models/types";
import { IronTopBar, IronToolbarButton } from "@ui/components/IronTopBar";
import { IronMenu, type IronMenuItem } from "@ui/components/IronMenu";
import { useGoBack } from "@app/hooks/useGoBack";

interface ProgramRow {
  p: Program;
  daysPerWeek: number;
}

export function ProgramsList() {
  const navigate = useNavigate();
  const goBack = useGoBack("/workout");
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
          return { p, daysPerWeek } as ProgramRow;
        }),
      );
    },
    [],
    undefined,
  );

  async function duplicate(id: string) {
    const newId = await duplicateProgram(id);
    if (newId) navigate(`/programs/${newId}`);
  }
  async function remove(p: Program) {
    if (!window.confirm(`${t("Delete program")} "${p.name}"? ${t("Past sessions are kept.")}`)) return;
    await deleteProgram(p.id);
  }

  function menuItems(p: Program): IronMenuItem[] {
    const items: IronMenuItem[] = [
      {
        label: p.isActive ? t("Deactivate") : t("Activate"),
        icon: p.isActive ? <Pause size={15} strokeWidth={2.25} /> : <Play size={15} strokeWidth={2.25} />,
        onClick: () => void (p.isActive ? deactivateProgram(p.id) : activateProgram(p.id)),
      },
      {
        label: t("Duplicate"),
        icon: <Copy size={15} strokeWidth={2.25} />,
        onClick: () => void duplicate(p.id),
      },
    ];
    if (!p.isBuiltIn) {
      items.push(
        {
          label: t("Edit"),
          icon: <Pencil size={15} strokeWidth={2.25} />,
          onClick: () => navigate(`/programs/${p.id}/edit`),
        },
        {
          label: t("Delete"),
          icon: <Trash2 size={15} strokeWidth={2.25} />,
          danger: true,
          onClick: () => void remove(p),
        },
      );
    }
    return items;
  }

  const builtIn = (programs ?? []).filter((x) => x.p.isBuiltIn);
  const custom = (programs ?? []).filter((x) => !x.p.isBuiltIn);

  return (
    <div className="flex h-[100dvh] flex-col bg-bg">
      <IronTopBar
        title={t("Programs")}
        leading={
          <IronToolbarButton onClick={goBack} label={t("Back")}>
            <ChevronLeft size={18} strokeWidth={2.5} />
          </IronToolbarButton>
        }
        trailing={
          <IronToolbarButton tint="bg-accent" onClick={() => navigate("/programs/new")} label={t("New program")}>
            <Plus size={18} strokeWidth={2.5} />
          </IronToolbarButton>
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto pb-10">
        <Section title={t("BUILT-IN")} items={builtIn} t={t} onOpen={(id) => navigate(`/programs/${id}`)} menuItems={menuItems} />
        {custom.length > 0 && (
          <Section title={t("CUSTOM")} items={custom} t={t} onOpen={(id) => navigate(`/programs/${id}`)} menuItems={menuItems} />
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
  menuItems,
}: {
  title: string;
  items: ProgramRow[];
  t: (k: string) => string;
  onOpen: (id: string) => void;
  menuItems: (p: Program) => IronMenuItem[];
}) {
  if (items.length === 0) return null;
  return (
    <>
      <p className="eyebrow text-ink3 px-[22px] pb-2 pt-4">{title}</p>
      <ul className="divide-y divide-hairline border-y border-hairline">
        {items.map(({ p, daysPerWeek }, i) => (
          <li key={p.id} className="flex items-center active:bg-chip">
            <button
              type="button"
              onClick={() => onOpen(p.id)}
              className="flex flex-1 items-center gap-4 py-4 pl-[22px] text-left"
            >
              <span className="mono-num text-ink3">{String(i + 1).padStart(2, "0")}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-display text-[17px] font-bold text-ink">{p.name}</p>
                <p className="eyebrow text-ink3 mt-0.5">
                  {p.weeks} {t("WK")} · {daysPerWeek} {t("DAYS")} · {p.author}
                </p>
              </div>
              {p.isActive && <span className="eyebrow text-accent">{t("ACTIVE")}</span>}
            </button>
            <div className="pr-[14px]">
              <IronMenu label={t("Program options")} items={menuItems(p)} />
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
