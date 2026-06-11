import { NavLink } from "react-router-dom";
import { motion } from "framer-motion";
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

/**
 * Bottom 4-tab bar — active tab is ink-filled. Port of iOS `IronTabBar`.
 * The ink fill glides between tabs via a shared layout animation.
 */
export function IronTabBar() {
  const { t } = useTranslation();
  return (
    <nav className="grid grid-cols-4 border-t border-rule bg-bg pb-[env(safe-area-inset-bottom)]">
      {TABS.map(({ to, labelKey, Icon }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            `relative flex flex-col items-center gap-1 py-2.5 ${isActive ? "text-white" : "text-ink3"}`
          }
        >
          {({ isActive }) => (
            <>
              {isActive && (
                <motion.span
                  layoutId="iron-tab-fill"
                  className="absolute inset-0 bg-ink"
                  transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                />
              )}
              <Icon size={20} strokeWidth={2.25} className="relative" />
              <span className="eyebrow relative text-[10px]">{t(labelKey)}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
