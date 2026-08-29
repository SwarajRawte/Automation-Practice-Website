import type { LucideIcon } from "lucide-react";
import {
  Activity,
  AlertTriangle,
  AppWindow,
  Boxes,
  Braces,
  Database,
  FileUp,
  FormInput,
  Globe2,
  Keyboard,
  LayoutDashboard,
  MonitorSmartphone,
  MousePointerClick,
  Network,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Table2,
  User,
  Wifi,
} from "lucide-react";

export const moduleGroups = [
  "Getting Started",
  "Authentication",
  "UI Automation",
  "Application Flows",
  "Advanced",
  "Quality",
  "Administration",
] as const;

export type ModuleGroup = (typeof moduleGroups)[number];
export type ModuleDifficulty = "Beginner" | "Intermediate" | "Advanced";

export type RouteComponentKey =
  | "dashboard"
  | "profile"
  | "phase2Forms"
  | "phase2Interactions"
  | "phase2Dialogs"
  | "phase2Contexts"
  | "phase3Tables"
  | "phase3Products"
  | "phase3Files"
  | "phase3Dynamic"
  | "phase3ShadowDom"
  | "phase4Shop"
  | "phase4Network"
  | "phase4Realtime"
  | "phase4Admin"
  | "phase5Storage"
  | "phase5Accessibility"
  | "phase5Visual"
  | "phase5Responsive"
  | "phase5I18n"
  | "phase5Errors"
  | "advancedBrowser"
  | "testControl";

export type ModuleNavigationItem = {
  label: string;
  path?: string;
  icon?: LucideIcon;
  group?: ModuleGroup;
};

export type LabModule = {
  id: string;
  name: string;
  path: string;
  routePaths?: readonly string[];
  component?: RouteComponentKey;
  group: ModuleGroup;
  icon: LucideIcon;
  description: string;
  difficulty: ModuleDifficulty;
  scenarios: number;
  tags: readonly string[];
  endpoints?: readonly string[];
  navigation?: readonly ModuleNavigationItem[];
  catalog?: boolean;
  testModeOnly?: boolean;
  adminOnly?: boolean;
};

const registry = [
  {
    id: "dashboard",
    name: "Dashboard",
    path: "/dashboard",
    routePaths: ["/dashboard"],
    component: "dashboard",
    group: "Getting Started",
    icon: LayoutDashboard,
    description: "Browse the complete automation lab and track your progress.",
    difficulty: "Beginner",
    scenarios: 0,
    tags: ["Catalog", "Progress"],
    navigation: [
      { label: "Dashboard" },
      { label: "Module Catalog", icon: Boxes },
    ],
  },
  {
    id: "authentication",
    name: "Authentication",
    path: "/auth/login",
    group: "Authentication",
    icon: ShieldCheck,
    description: "Login, sessions, protected routes and role authorization.",
    difficulty: "Intermediate",
    scenarios: 12,
    tags: ["Auth", "Security", "Sessions", "RBAC"],
    endpoints: [
      "POST /api/auth/login",
      "POST /api/auth/refresh",
      "POST /api/auth/logout",
    ],
    catalog: true,
  },
  {
    id: "profile",
    name: "Profile & Preferences",
    path: "/profile",
    routePaths: ["/profile"],
    component: "profile",
    group: "Authentication",
    icon: User,
    description: "Profile, security, preferences and notification settings.",
    difficulty: "Beginner",
    scenarios: 4,
    tags: ["Profile", "Settings"],
    navigation: [
      { label: "Profile" },
      {
        label: "Security & Sessions",
        path: "/profile?tab=security",
        icon: ShieldCheck,
      },
      {
        label: "Preferences",
        path: "/profile?tab=preferences",
        icon: Settings,
      },
    ],
  },
  {
    id: "forms",
    name: "Forms",
    path: "/forms/basic",
    routePaths: ["/forms/*"],
    component: "phase2Forms",
    group: "UI Automation",
    icon: FormInput,
    description: "Validation, dynamic fields and complex form controls.",
    difficulty: "Intermediate",
    scenarios: 18,
    tags: ["Forms", "Validation"],
    endpoints: ["POST /api/forms"],
    navigation: [{ label: "Forms" }],
    catalog: true,
  },
  {
    id: "interactions",
    name: "Interactions",
    path: "/interactions/buttons",
    routePaths: ["/interactions/*"],
    component: "phase2Interactions",
    group: "UI Automation",
    icon: Activity,
    description: "Clicks, hover, keyboard, drag and pointer events.",
    difficulty: "Beginner",
    scenarios: 16,
    tags: ["Mouse", "Keyboard", "Drag and Drop"],
    navigation: [
      { label: "Buttons & Interactions" },
      {
        label: "Mouse & Actions",
        path: "/interactions/actions",
        icon: MousePointerClick,
      },
      {
        label: "Keyboard",
        path: "/interactions/keyboard",
        icon: Keyboard,
      },
      { label: "Drag & Drop", icon: Activity },
    ],
    catalog: true,
  },
  {
    id: "dialogs",
    name: "Alerts & Modals",
    path: "/alerts",
    routePaths: ["/alerts", "/modals"],
    component: "phase2Dialogs",
    group: "UI Automation",
    icon: AlertTriangle,
    description: "Native dialogs, nested modals and focus management.",
    difficulty: "Intermediate",
    scenarios: 9,
    tags: ["Alerts", "Dialogs", "Focus"],
    navigation: [{ label: "Alerts & Modals" }],
    catalog: true,
  },
  {
    id: "contexts",
    name: "Windows & Frames",
    path: "/windows",
    routePaths: ["/windows", "/frames"],
    component: "phase2Contexts",
    group: "UI Automation",
    icon: AppWindow,
    description: "Tabs, windows, frames and nested browsing contexts.",
    difficulty: "Intermediate",
    scenarios: 10,
    tags: ["Windows", "Frames", "Contexts"],
    navigation: [{ label: "Windows & Frames" }],
    catalog: true,
  },
  {
    id: "tables",
    name: "Tables",
    path: "/tables/dynamic",
    routePaths: ["/tables/*"],
    component: "phase3Tables",
    group: "UI Automation",
    icon: Table2,
    description: "Server grids, sorting, filtering and virtual scrolling.",
    difficulty: "Advanced",
    scenarios: 14,
    tags: ["Data Grid", "API"],
    endpoints: ["GET /api/tables"],
    navigation: [{ label: "Tables" }],
    catalog: true,
  },
  {
    id: "products",
    name: "Product CRUD",
    path: "/crud/products",
    routePaths: ["/crud/products"],
    component: "phase3Products",
    group: "Application Flows",
    icon: Database,
    description: "Persistent create, edit, conflict, history and undo flows.",
    difficulty: "Advanced",
    scenarios: 13,
    tags: ["CRUD", "Database"],
    endpoints: ["GET /api/products", "POST /api/products"],
    navigation: [{ label: "CRUD Products" }],
    catalog: true,
  },
  {
    id: "shop",
    name: "E-commerce",
    path: "/shop/products",
    routePaths: ["/shop/*"],
    component: "phase4Shop",
    group: "Application Flows",
    icon: ShoppingCart,
    description: "Product, cart, checkout, order and cancellation workflows.",
    difficulty: "Advanced",
    scenarios: 16,
    tags: ["Cart", "Checkout", "Orders"],
    endpoints: ["GET /api/shop/products", "POST /api/orders"],
    navigation: [{ label: "E-commerce" }],
    catalog: true,
  },
  {
    id: "files",
    name: "File Operations",
    path: "/files/upload",
    routePaths: ["/files/*"],
    component: "phase3Files",
    group: "Application Flows",
    icon: FileUp,
    description: "Uploads, validation, progress and deterministic downloads.",
    difficulty: "Intermediate",
    scenarios: 15,
    tags: ["Files", "Network"],
    endpoints: ["POST /api/files/upload", "GET /api/files/download"],
    navigation: [{ label: "File Operations" }],
    catalog: true,
  },
  {
    id: "dynamic",
    name: "Dynamic Elements",
    path: "/dynamic-elements",
    routePaths: ["/dynamic-elements"],
    component: "phase3Dynamic",
    group: "Advanced",
    icon: Activity,
    description: "Wait strategies, polling, remounts and synchronization.",
    difficulty: "Advanced",
    scenarios: 12,
    tags: ["Waits", "Async", "Time"],
    navigation: [
      { label: "Dynamic Elements" },
      {
        label: "Time & Date",
        path: "/dynamic-elements?delay=1000",
      },
    ],
    catalog: true,
  },
  {
    id: "shadow-dom",
    name: "Shadow DOM",
    path: "/shadow-dom",
    routePaths: ["/shadow-dom"],
    component: "phase3ShadowDom",
    group: "Advanced",
    icon: Braces,
    description: "Open, nested, dynamic and closed web components.",
    difficulty: "Advanced",
    scenarios: 8,
    tags: ["DOM", "Components"],
    navigation: [{ label: "Shadow DOM" }],
    catalog: true,
  },
  {
    id: "advanced-browser",
    name: "Advanced Browser APIs",
    path: "/advanced/editor",
    routePaths: ["/advanced/*"],
    component: "advancedBrowser",
    group: "Advanced",
    icon: Braces,
    description:
      "Rich editing, graphics, browser APIs, offline state, SSE, OTP and a genuine second origin.",
    difficulty: "Advanced",
    scenarios: 24,
    tags: [
      "Contenteditable",
      "SVG",
      "Canvas",
      "IndexedDB",
      "Clipboard",
      "Geolocation",
      "Service Worker",
      "SSE",
      "OTP",
      "Cross Origin",
      "WCAG 2.2",
    ],
    endpoints: [
      "GET /api/advanced/events",
      "POST /api/advanced/mailbox/code",
      "GET /api/advanced/mailbox",
      "DELETE /api/advanced/mailbox",
      "POST /api/advanced/mailbox/verify",
    ],
    navigation: [
      { label: "Rich Editor" },
      { label: "SVG & Canvas", path: "/advanced/graphics", icon: Activity },
      { label: "Browser APIs", path: "/advanced/browser-apis", icon: Database },
      { label: "Offline & Worker", path: "/advanced/offline", icon: Wifi },
      { label: "SSE & OTP", path: "/advanced/events", icon: Network },
      {
        label: "Separate Origin",
        path: "/advanced/cross-origin",
        icon: Globe2,
      },
    ],
    catalog: true,
  },
  {
    id: "storage",
    name: "Browser Storage",
    path: "/storage",
    routePaths: ["/storage"],
    component: "phase5Storage",
    group: "Advanced",
    icon: Database,
    description: "Local storage, session storage and cookie scenarios.",
    difficulty: "Intermediate",
    scenarios: 7,
    tags: ["Storage", "Cookies"],
    navigation: [{ label: "Browser Storage" }],
    catalog: true,
  },
  {
    id: "network",
    name: "API & Network",
    path: "/api-playground",
    routePaths: ["/api-playground"],
    component: "phase4Network",
    group: "Advanced",
    icon: Network,
    description: "Status codes, delays, failures and response assertions.",
    difficulty: "Advanced",
    scenarios: 14,
    tags: ["REST", "Network"],
    endpoints: [
      "ALL /api/network/echo",
      "ALL /api/status/:code",
      "GET /api/delay/:ms",
    ],
    navigation: [{ label: "API & Network" }],
    catalog: true,
  },
  {
    id: "realtime",
    name: "Real-time",
    path: "/realtime",
    routePaths: ["/realtime"],
    component: "phase4Realtime",
    group: "Advanced",
    icon: Wifi,
    description: "WebSocket events, reconnects and live notifications.",
    difficulty: "Advanced",
    scenarios: 8,
    tags: ["WebSockets", "Events"],
    navigation: [{ label: "WebSockets" }],
    catalog: true,
  },
  {
    id: "accessibility",
    name: "Accessibility",
    path: "/accessibility/good",
    routePaths: ["/accessibility/*"],
    component: "phase5Accessibility",
    group: "Quality",
    icon: ShieldCheck,
    description: "Semantic, keyboard and intentionally problematic examples.",
    difficulty: "Intermediate",
    scenarios: 10,
    tags: ["A11y", "WCAG"],
    navigation: [{ label: "Accessibility" }],
    catalog: true,
  },
  {
    id: "responsive",
    name: "Responsive Testing",
    path: "/responsive",
    routePaths: ["/responsive"],
    component: "phase5Responsive",
    group: "Quality",
    icon: MonitorSmartphone,
    description: "Viewport, breakpoint and adaptive layout scenarios.",
    difficulty: "Intermediate",
    scenarios: 8,
    tags: ["Viewport", "Mobile"],
    navigation: [{ label: "Responsive Testing" }],
    catalog: true,
  },
  {
    id: "visual",
    name: "Visual Testing",
    path: "/visual",
    routePaths: ["/visual"],
    component: "phase5Visual",
    group: "Quality",
    icon: AppWindow,
    description: "Stable visual states, animations and screenshot baselines.",
    difficulty: "Intermediate",
    scenarios: 7,
    tags: ["Screenshots", "Visual"],
    navigation: [{ label: "Visual Testing" }],
    catalog: true,
  },
  {
    id: "i18n",
    name: "Internationalization",
    path: "/i18n",
    routePaths: ["/i18n"],
    component: "phase5I18n",
    group: "Quality",
    icon: Globe2,
    description: "Locale, translation, date and number formatting scenarios.",
    difficulty: "Intermediate",
    scenarios: 8,
    tags: ["Locale", "Translation"],
    navigation: [{ label: "Internationalization" }],
    catalog: true,
  },
  {
    id: "errors",
    name: "Error Handling",
    path: "/errors",
    routePaths: ["/errors"],
    component: "phase5Errors",
    group: "Quality",
    icon: AlertTriangle,
    description: "Client, API and not-found error recovery scenarios.",
    difficulty: "Intermediate",
    scenarios: 9,
    tags: ["Errors", "Recovery"],
    navigation: [{ label: "Error Handling" }],
    catalog: true,
  },
  {
    id: "admin",
    name: "Admin Dashboard",
    path: "/admin",
    routePaths: ["/admin"],
    component: "phase4Admin",
    group: "Administration",
    icon: ShieldCheck,
    description: "Role-protected user, product and audit operations.",
    difficulty: "Advanced",
    scenarios: 8,
    tags: ["Admin", "RBAC"],
    endpoints: ["GET /api/admin/summary", "GET /api/admin/audit"],
    navigation: [
      { label: "Authorization", group: "Authentication", icon: Braces },
      { label: "Admin Dashboard" },
    ],
    adminOnly: true,
  },
  {
    id: "test-control",
    name: "Test Control Center",
    path: "/test-control",
    routePaths: ["/test-control"],
    component: "testControl",
    group: "Administration",
    icon: Settings,
    description: "Reset, seed and configure deterministic test state.",
    difficulty: "Advanced",
    scenarios: 6,
    tags: ["Reset", "Seed", "Clock", "Network"],
    endpoints: ["POST /api/test/*"],
    navigation: [{ label: "Test Control Center" }],
    testModeOnly: true,
    adminOnly: true,
  },
] as const satisfies readonly LabModule[];

export type ModuleId = (typeof registry)[number]["id"];
export const moduleRegistry: readonly LabModule[] = registry;

const routeRoot = (routePath: string) => routePath.replace(/\/\*$/, "");

export function findModuleByPath(pathname: string) {
  const matches = moduleRegistry.filter((module) => {
    if (pathname === module.path) return true;
    return module.routePaths?.some((routePath) => {
      const root = routeRoot(routePath);
      return routePath.endsWith("/*")
        ? pathname === root || pathname.startsWith(`${root}/`)
        : pathname === root;
    });
  });
  return matches.sort((left, right) => right.path.length - left.path.length)[0];
}

export function searchableModules(testMode: boolean) {
  return moduleRegistry.filter((module) => !module.testModeOnly || testMode);
}

export function moduleSearchText(module: LabModule) {
  return [
    module.name,
    module.path,
    module.description,
    ...module.tags,
    ...(module.endpoints ?? []),
    ...(module.navigation?.map((item) => item.label) ?? []),
  ]
    .join(" ")
    .toLowerCase();
}

export function navigationGroups(testMode: boolean) {
  return moduleGroups
    .map((label) => ({
      label,
      items: moduleRegistry.flatMap((module) => {
        if (!testMode && module.testModeOnly) return [];
        return (module.navigation ?? [])
          .map((item) => ({
            moduleId: module.id,
            label: item.label,
            path: item.path ?? module.path,
            icon: item.icon ?? module.icon,
            group: item.group ?? module.group,
          }))
          .filter((item) => item.group === label);
      }),
    }))
    .filter((group) => group.items.length > 0);
}

export const catalogModules = moduleRegistry.filter((module) => module.catalog);

export const authenticatedRoutes = moduleRegistry.flatMap((module) =>
  (module.routePaths ?? []).map((path) => ({
    path,
    module,
    component: module.component,
  })),
);
