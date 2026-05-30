import { NavLink } from "react-router-dom";
import { Dumbbell, ListChecks, LineChart, User, type LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

interface Tab {
  to: string;
  labelKey: string;
  Icon: LucideIcon;
}

const TABS: Tab[] = [
  { to: "/workout", labelKey: "Workout", Icon: Dumbbell },
  { to: "/exercises", labelKey: "Exercises", Icon: ListChecks },
  { to: "/analytics", labelKey: "Analytics", Icon: LineChart },
  { to: "/profile", labelKey: "Profile", Icon: User },
];

/** Bottom 4-tab bar — active tab is ink-filled. Port of iOS `IronTabBar`. */
export function IronTabBar() {
  const { t } = useTranslation();
  return (
    <nav className="grid grid-cols-4 border-t border-rule bg-bg pb-[env(safe-area-inset-bottom)]">
      {TABS.map(({ to, labelKey, Icon }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            `flex flex-col items-center gap-1 py-2.5 ${
              isActive ? "bg-ink text-white" : "text-ink3"
            }`
          }
        >
          <Icon size={20} strokeWidth={2.25} />
          <span className="eyebrow text-[10px]">{t(labelKey)}</span>
        </NavLink>
      ))}
    </nav>
  );
}
