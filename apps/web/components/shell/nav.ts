/*
 * Sidebar groups and items (UI-SYSTEM §1, final). Items without a screen
 * yet render disabled with their stage; no placeholder routes exist (D-024).
 */

export interface NavItem {
  readonly label: string;
  readonly href: string;
  /** Stage that implements the screen; undefined means live now. */
  readonly stage?: string;
  /** Global `g <key>` shortcut (§8). */
  readonly key?: string;
}

export interface NavGroup {
  readonly label: string;
  readonly items: readonly NavItem[];
}

export const NAV_GROUPS: readonly NavGroup[] = [
  {
    label: "CORE",
    items: [
      { label: "Control Center", href: "/" },
      { label: "Courses", href: "/courses", key: "c" },
      { label: "Labs", href: "/labs", stage: "04", key: "l" },
      { label: "Practice", href: "/practice", stage: "06", key: "p" },
      { label: "Skills Graph", href: "/skills", stage: "06", key: "s" },
      { label: "Career Target", href: "/career/target", stage: "06", key: "t" },
      { label: "Career Matrix", href: "/career/matrix", stage: "06" },
      { label: "Job Inspector", href: "/career/jobs", stage: "08" },
      { label: "Training Queue", href: "/training", stage: "06" },
      { label: "Projects", href: "/projects", stage: "09" },
      { label: "Interview", href: "/interview", stage: "08" },
      { label: "Work Orders", href: "/work-orders", key: "w" },
      { label: "Review Queue", href: "/review", stage: "05", key: "r" },
    ],
  },
  {
    label: "INTELLIGENCE",
    items: [
      { label: "Companies", href: "/intel/companies", stage: "08" },
      { label: "Jobs", href: "/intel/jobs", stage: "08" },
      { label: "Sources", href: "/intel/sources", stage: "05" },
      { label: "Certifications", href: "/intel/certifications", stage: "08" },
      { label: "Maintenance", href: "/intel/maintenance", stage: "10" },
    ],
  },
  {
    label: "SYSTEM",
    items: [
      { label: "Infrastructure", href: "/system/infrastructure" },
      { label: "Runtimes", href: "/system/runtimes" },
      { label: "Settings", href: "/settings" },
    ],
  },
];

export const LIVE_ITEMS: readonly NavItem[] = NAV_GROUPS.flatMap(
  (group) => group.items,
).filter((item) => item.stage === undefined);
