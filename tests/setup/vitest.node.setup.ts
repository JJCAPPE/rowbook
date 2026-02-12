import { afterEach, vi } from "vitest";

import { setDefaultTestEnv } from "./env-defaults";

setDefaultTestEnv();

afterEach(() => {
  vi.restoreAllMocks();
});
