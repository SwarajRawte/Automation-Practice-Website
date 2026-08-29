import {
  expect,
  test as base,
  type APIRequestContext,
  type APIResponse,
  type Page,
} from "@playwright/test";

export type ActorRole = "admin" | "user" | "viewer" | "locked";

export type Actor = {
  email: string;
  password: string;
  role: "ADMIN" | "USER" | "VIEWER";
};

type RunResponse = {
  run?: { id?: string; createdAt?: string; expiresAt?: string };
  actors?: Partial<Record<ActorRole, Actor>>;
};

type TestRun = {
  actors: Record<ActorRole, Actor>;
  headers: Record<string, string>;
  id?: string;
  isolated: boolean;
};

export type ApiSession = {
  refreshToken: string;
  token: string;
  user: { email: string; id: number; name: string; role: Actor["role"] };
};

export type Lab = {
  actor(role: ActorRole): Actor;
  apiLogin(role?: ActorRole): Promise<ApiSession>;
  control(path: string, data?: unknown): Promise<APIResponse>;
  run: Readonly<TestRun>;
};

type Fixtures = {
  api: APIRequestContext;
  lab: Lab;
  runHeaders: void;
};

type WorkerFixtures = {
  testRun: TestRun;
};

const apiUrl = process.env.API_URL || "http://127.0.0.1:3100";
const appUrl = process.env.BASE_URL || "http://localhost:5173";
const controlKey = process.env.TEST_CONTROL_KEY || "testlab-control";
const isolationMode = process.env.TEST_RUN_ISOLATION || "auto";

const fallbackActors: Record<ActorRole, Actor> = {
  admin: {
    email: "admin@testlab.local",
    password: "Admin123!",
    role: "ADMIN",
  },
  user: {
    email: "user@testlab.local",
    password: "User123!",
    role: "USER",
  },
  viewer: {
    email: "viewer@testlab.local",
    password: "Viewer123!",
    role: "VIEWER",
  },
  locked: {
    email: "locked@testlab.local",
    password: "Locked123!",
    role: "USER",
  },
};

function actorsFrom(payload: RunResponse): Record<ActorRole, Actor> {
  const roles: ActorRole[] = ["admin", "user", "viewer", "locked"];
  const actors = Object.fromEntries(
    roles.map((role) => {
      const actor = payload.actors?.[role];
      if (!actor?.email || !actor.password || !actor.role)
        throw new Error(`Run creation omitted the ${role} actor`);
      return [role, actor];
    }),
  );
  return actors as Record<ActorRole, Actor>;
}

async function resetFallbackDatabase(setup: APIRequestContext) {
  const actor = fallbackActors.admin;
  const login = await setup.post("/api/auth/login", {
    data: { email: actor.email, password: actor.password },
  });
  if (!login.ok())
    throw new Error(
      `Unable to prepare the shared fallback database: login returned HTTP ${login.status()} ${await login.text()}`,
    );
  const session = (await login.json()) as ApiSession;
  const reset = await setup.post("/api/test/reset", {
    data: {},
    headers: {
      authorization: `Bearer ${session.token}`,
      "x-test-key": controlKey,
    },
  });
  if (!reset.ok())
    throw new Error(
      `Unable to prepare the shared fallback database: reset returned HTTP ${reset.status()} ${await reset.text()}`,
    );
}

export const test = base.extend<Fixtures, WorkerFixtures>({
  testRun: [
    async ({ playwright }, use, workerInfo) => {
      const setup = await playwright.request.newContext({ baseURL: apiUrl });
      let run: TestRun = {
        actors: fallbackActors,
        headers: {},
        isolated: false,
      };
      try {
        if (isolationMode !== "off") {
          const response = await setup.post("/api/test/runs", {
            data: {
              label: `playwright-${workerInfo.project.name}-${workerInfo.workerIndex}`,
            },
            headers: { "x-test-key": controlKey },
          });
          if (response.ok()) {
            const payload = (await response.json()) as RunResponse;
            const id = payload.run?.id;
            if (!id) throw new Error("Run creation response omitted run.id");
            run = {
              actors: actorsFrom(payload),
              headers: { "x-test-run-id": id },
              id,
              isolated: true,
            };
          } else if (
            isolationMode === "required" ||
            ![401, 404, 405].includes(response.status())
          ) {
            throw new Error(
              `Unable to create an isolated test run: HTTP ${response.status()} ${await response.text()}`,
            );
          } else await resetFallbackDatabase(setup);
        } else {
          await resetFallbackDatabase(setup);
        }

        await use(run);
      } finally {
        if (run.id) {
          const response = await setup.delete(`/api/test/runs/${run.id}`, {
            headers: { "x-test-key": controlKey },
          });
          if (!response.ok())
            console.warn(
              `Unable to delete test run ${run.id}: HTTP ${response.status()}`,
            );
        }
        await setup.dispose();
      }
    },
    { scope: "worker" },
  ],

  runHeaders: [
    async ({ context, testRun }, use) => {
      await context.setExtraHTTPHeaders(testRun.headers);
      if (testRun.id) {
        const origin = new URL(appUrl);
        await context.addCookies([
          {
            name: "test_run",
            value: testRun.id,
            domain: origin.hostname,
            path: "/",
            httpOnly: true,
            sameSite: "Lax",
            secure: origin.protocol === "https:",
          },
        ]);
      }
      await use();
    },
    { auto: true },
  ],

  api: async ({ playwright, testRun }, use) => {
    const api = await playwright.request.newContext({
      baseURL: apiUrl,
      extraHTTPHeaders: testRun.headers,
    });
    await use(api);
    await api.dispose();
  },

  lab: async ({ api, testRun }, use) => {
    const apiLogin = async (role: ActorRole = "user") => {
      const actor = testRun.actors[role];
      const response = await api.post("/api/auth/login", {
        data: { email: actor.email, password: actor.password },
      });
      await expect(response, `API login as ${role}`).toBeOK();
      return (await response.json()) as ApiSession;
    };
    await use({
      actor: (role) => testRun.actors[role],
      apiLogin,
      control: async (path, data = {}) => {
        const session = await apiLogin("admin");
        return api.post(path, {
          data,
          headers: {
            authorization: `Bearer ${session.token}`,
            "x-test-key": controlKey,
          },
        });
      },
      run: testRun,
    });
  },
});

export { expect };

export async function loginAs(
  page: Page,
  lab: Lab,
  role: ActorRole,
  protectedPath = "/dashboard",
) {
  const actor = lab.actor(role);
  await page.goto(protectedPath);
  await expect(page.getByTestId("login-page")).toBeVisible();
  await page.getByTestId("login-email").fill(actor.email);
  await page.getByTestId("login-password").fill(actor.password);
  await page.getByTestId("login-submit").click();
  await page.waitForURL((url) => url.pathname === protectedPath);
  await expect(page.getByTestId("user-menu")).toBeVisible();
}
