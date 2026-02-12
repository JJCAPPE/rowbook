import { spawnSync } from "node:child_process";

const inputArgs = process.argv.slice(2);
const mappedArgs = [];

for (let index = 0; index < inputArgs.length; index += 1) {
  const arg = inputArgs[index];
  if (arg === "--grep" || arg === "-g") {
    const pattern = inputArgs[index + 1];
    if (pattern) {
      mappedArgs.push("--testNamePattern", pattern);
      index += 1;
    }
    continue;
  }

  mappedArgs.push(arg);
}

const result = spawnSync(
  "npx",
  ["vitest", "run", "--project", "integration-db", ...mappedArgs],
  {
    stdio: "inherit",
    shell: process.platform === "win32",
  },
);

process.exit(result.status ?? 1);
