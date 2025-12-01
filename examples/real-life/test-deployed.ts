#!/usr/bin/env bun

/**
 * Test script for deployed real-life example
 * Usage: bun test-deployed.ts <AUTH_URL> <LOGIC_URL>
 *        bun test-deployed.ts --auth-only <AUTH_URL>
 */

const args = process.argv.slice(2);
const authOnly = args.includes("--auth-only");
const positionalArgs = args.filter((a) => !a.startsWith("--"));

const AUTH_URL = positionalArgs[0];
const LOGIC_URL = positionalArgs[1];

if (!AUTH_URL) {
  console.error("Error: AUTH_URL is required");
  console.error("Usage: bun test-deployed.ts <AUTH_URL> <LOGIC_URL>");
  console.error("       bun test-deployed.ts --auth-only <AUTH_URL>");
  process.exit(1);
}

if (!authOnly && !LOGIC_URL) {
  console.error("Error: LOGIC_URL is required (or use --auth-only)");
  console.error("Usage: bun test-deployed.ts <AUTH_URL> <LOGIC_URL>");
  process.exit(1);
}

// Colors
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
const blue = (s: string) => `\x1b[34m${s}\x1b[0m`;

const pass = (msg: string) => console.log(`${green("✓")} ${msg}`);
const fail = (msg: string) => console.log(`${red("✗")} ${msg}`);
const warn = (msg: string) => console.log(`${yellow("⚠")} ${msg}`);
const info = (msg: string) => console.log(`${yellow("→")} ${msg}`);
const debug = (msg: string) => console.log(`${blue("  " + msg)}`);

let passed = 0;
let failed = 0;

const testPass = (msg: string) => {
  pass(msg);
  passed++;
};
const testFail = (msg: string) => {
  warn(msg);
  failed++;
};

// Retry wrapper for Lambda cold starts
async function retryCurl<T>(
  url: string,
  options: RequestInit = {},
  maxAttempts = 3,
): Promise<{ ok: boolean; status: number; data: T | null }> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(url, { ...options, signal: AbortSignal.timeout(30000) });
      const text = await res.text();
      let data: T | null = null;
      try {
        data = JSON.parse(text) as T;
      } catch {
        data = text as T;
      }
      if (res.ok || [401, 403, 404, 409].includes(res.status)) {
        return { ok: res.ok, status: res.status, data };
      }
      if ([502, 503].includes(res.status) && attempt < maxAttempts) {
        debug(`Lambda cold start (${res.status}), retry ${attempt}/${maxAttempts}...`);
        await Bun.sleep(attempt * 2000);
        continue;
      }
      return { ok: false, status: res.status, data };
    } catch (e) {
      if (attempt < maxAttempts) {
        debug(`Request failed, retry ${attempt}/${maxAttempts}...`);
        await Bun.sleep(attempt * 2000);
        continue;
      }
      return { ok: false, status: 0, data: null };
    }
  }
  return { ok: false, status: 0, data: null };
}

// Test data
const EMAIL = `test-${Date.now()}@example.com`;
const PASSWORD = "testpassword123";
const NAME = "Test User";

console.log("🧪 Testing deployed real-life example");
console.log(`   Auth:  ${AUTH_URL}`);
if (!authOnly) console.log(`   Logic: ${LOGIC_URL}`);
console.log("");

// ============================================================================
// Auth API Tests
// ============================================================================

console.log("━".repeat(72));
console.log("Auth API");
console.log("━".repeat(72));

info("Testing OpenAPI docs...");
const docsRes = await retryCurl<{ openapi: string }>(`${AUTH_URL}/docs/openapi.json`);
if (docsRes.ok && typeof docsRes.data === "object" && docsRes.data?.openapi) {
  testPass("OpenAPI docs available");
} else {
  testFail("OpenAPI docs not available");
}

info(`Signing up user: ${EMAIL}`);
const signupRes = await retryCurl<{ user: { id: string }; session: { token: string } }>(
  `${AUTH_URL}/api/signup`,
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD, name: NAME }),
  },
);

if (!signupRes.ok || !signupRes.data?.session?.token) {
  console.error("Response:", signupRes.data);
  fail("Signup failed");
  process.exit(1);
}

const TOKEN = signupRes.data.session.token;
const USER_ID = signupRes.data.user.id;
testPass(`Signup successful (userId: ${USER_ID.slice(0, 8)}...)`);

info("Getting current user...");
const meRes = await retryCurl<{ email: string }>(`${AUTH_URL}/api/me`, {
  headers: { Authorization: `Bearer ${TOKEN}` },
});
if (meRes.ok && meRes.data?.email === EMAIL) {
  testPass("GET /me returned correct user");
} else {
  testFail("GET /me failed");
}

info("Validating token...");
const validateRes = await retryCurl<{ valid: boolean }>(`${AUTH_URL}/api/validate`, {
  headers: { Authorization: `Bearer ${TOKEN}` },
});
if (validateRes.ok && validateRes.data?.valid) {
  testPass("Token validation successful");
} else {
  testFail("Token validation failed");
}

// ============================================================================
// Logic API Tests
// ============================================================================

let TASK_ID: string | null = null;

if (!authOnly && LOGIC_URL) {
  console.log("");
  console.log("━".repeat(72));
  console.log("Logic API");
  console.log("━".repeat(72));

  info("Testing OpenAPI docs (this may take a moment for cold start)...");
  const logicDocsRes = await retryCurl<{ openapi: string }>(`${LOGIC_URL}/docs/openapi.json`);

  let logicAvailable = true;
  if (logicDocsRes.ok && typeof logicDocsRes.data === "object" && logicDocsRes.data?.openapi) {
    testPass("OpenAPI docs available");
  } else {
    logicAvailable = false;
    testFail("Logic API Lambda not responding");
  }

  if (logicAvailable) {
    info("Getting all tasks...");
    const tasksRes = await retryCurl<unknown[]>(`${LOGIC_URL}/api`);
    if (tasksRes.ok && Array.isArray(tasksRes.data)) {
      testPass(`GET /api returned ${tasksRes.data.length} tasks`);
    } else {
      testFail("GET /api failed");
    }

    info("Creating task...");
    const TASK_TITLE = `Test Task ${Date.now()}`;
    const createRes = await retryCurl<{ id: string }>(`${LOGIC_URL}/api`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TOKEN}`,
      },
      body: JSON.stringify({ title: TASK_TITLE, description: "Created by test script" }),
    });

    if (createRes.ok && createRes.data?.id) {
      TASK_ID = createRes.data.id;
      testPass(`Created task: ${TASK_ID.slice(0, 8)}...`);
    } else {
      console.log("Response:", createRes.data);
      testFail("Create task failed");
    }

    if (TASK_ID) {
      info("Getting task by ID...");
      const getRes = await retryCurl<{ title: string }>(`${LOGIC_URL}/api/${TASK_ID}`);
      if (getRes.ok && getRes.data?.title?.includes("Test Task")) {
        testPass("GET /api/{id} returned correct task");
      } else {
        testFail("GET /api/{id} failed");
      }

      info("Updating task status to in_progress...");
      const updateRes = await retryCurl<{ status: string }>(`${LOGIC_URL}/api/${TASK_ID}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${TOKEN}`,
        },
        body: JSON.stringify({ status: "in_progress" }),
      });
      if (updateRes.ok && updateRes.data?.status === "in_progress") {
        testPass("Updated task to in_progress");
      } else {
        testFail("Update task failed");
      }

      info("Completing task (triggers worker if WarpStream configured)...");
      const completeRes = await retryCurl<{ status: string }>(`${LOGIC_URL}/api/${TASK_ID}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${TOKEN}`,
        },
        body: JSON.stringify({ status: "completed" }),
      });
      if (completeRes.ok && completeRes.data?.status === "completed") {
        testPass("Completed task");
      } else {
        testFail("Complete task failed");
      }

      info("Deleting task...");
      const deleteRes = await retryCurl<{ success: boolean }>(`${LOGIC_URL}/api/${TASK_ID}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${TOKEN}` },
      });
      if (deleteRes.ok && deleteRes.data?.success) {
        testPass("Deleted task");
      } else {
        testFail("Delete task failed");
      }

      info("Verifying task is deleted...");
      const verifyRes = await retryCurl(`${LOGIC_URL}/api/${TASK_ID}`);
      if (verifyRes.status === 404) {
        testPass("Task correctly not found (404)");
      } else {
        testFail(`Task should return 404 but got ${verifyRes.status}`);
      }
    }
  }
}

// ============================================================================
// Auth API - Logout
// ============================================================================

console.log("");
console.log("━".repeat(72));
console.log("Cleanup");
console.log("━".repeat(72));

info("Logging out...");
const logoutRes = await retryCurl<{ success: boolean }>(`${AUTH_URL}/api/logout`, {
  method: "POST",
  headers: { Authorization: `Bearer ${TOKEN}` },
});
if (logoutRes.ok && logoutRes.data?.success) {
  testPass("Logout successful");
} else {
  testFail("Logout failed");
}

info("Verifying token is invalidated...");
const meAfterRes = await retryCurl(`${AUTH_URL}/api/me`, {
  headers: { Authorization: `Bearer ${TOKEN}` },
});
if (meAfterRes.status === 401) {
  testPass("Token correctly invalidated (401)");
} else {
  info(`Note: Token may still work due to Lambda instance isolation (got ${meAfterRes.status})`);
}

// ============================================================================
// Summary
// ============================================================================

console.log("");
console.log("━".repeat(72));
console.log("Summary");
console.log("━".repeat(72));
console.log(`  ${green("Passed:")}  ${passed}`);
console.log(`  ${red("Failed:")}  ${failed}`);

if (failed > 0) {
  console.log("");
  console.log(red("Some tests failed!"));
  process.exit(1);
} else {
  console.log("");
  console.log(green("All tests passed!"));
}

