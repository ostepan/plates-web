import { useLiveQuery } from "dexie-react-hooks";
import { useTranslation } from "react-i18next";
import { db } from "@core/db/db";
import { LANGS, setLanguage, type Lang } from "@core/i18n/i18n";
import { IronTopBar } from "@ui/components/IronTopBar";

export function ProfileTab() {
  const { t, i18n } = useTranslation();
  const exerciseCount = useLiveQuery(() => db.exercises.count(), [], 0);
  const programCount = useLiveQuery(() => db.programs.count(), [], 0);

  return (
    <div className="flex h-full flex-col">
      <IronTopBar title={t("Profile")} />

      <div className="space-y-6 px-[22px] py-5">
        <section>
          <p className="eyebrow text-ink3 mb-2">{t("LANGUAGE")}</p>
          <div className="flex border border-rule">
            {LANGS.map((lang) => {
              const active = i18n.language.startsWith(lang);
              return (
                <button
                  key={lang}
                  type="button"
                  onClick={() => setLanguage(lang as Lang)}
                  className={`flex-1 py-3 ${active ? "bg-ink text-white" : "text-ink2"}`}
                >
                  <span className="eyebrow text-[13px]">{lang.toUpperCase()}</span>
                </button>
              );
            })}
          </div>
        </section>

        <section>
          <p className="eyebrow text-ink3 mb-2">{t("BUILT-IN")}</p>
          <dl className="divide-y divide-hairline border-y border-hairline">
            <div className="flex items-baseline justify-between py-3">
              <dt className="text-[14px] text-ink2">{t("Exercises")}</dt>
              <dd className="mono-num text-[15px] font-semibold text-ink">{exerciseCount}</dd>
            </div>
            <div className="flex items-baseline justify-between py-3">
              <dt className="text-[14px] text-ink2">{t("Programs")}</dt>
              <dd className="mono-num text-[15px] font-semibold text-ink">{programCount}</dd>
            </div>
          </dl>
        </section>
      </div>
    </div>
  );
}
