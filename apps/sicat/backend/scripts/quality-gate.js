import { spawnSync } from "node:child_process";

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

const steps = [
  "validate:agents",
  "validate:cetesb-source",
  "validate:har-gateway",
  "validate:md-links",
  "validate:openapi",
  "check:secrets",
  "scan:secrets",
  "lint",
  "typecheck",
  "test",
  "test:contract",
  "build:ts"
];

for (const step of steps) {
  process.stdout.write(`\n[quality:gate] Running ${step}\n`);
  const result = spawnSync(npmCommand, ["run", step], {
    stdio: "inherit",
    env: process.env,
    shell: process.platform === "win32"
  });

  if (result.error) {
    process.stderr.write(
      `\n[quality:gate] Failed to execute ${step}: ${result.error.message}\n`
    );
    process.exit(1);
  }

  if (result.status !== 0) {
    process.stderr.write(`\n[quality:gate] Failed at step: ${step}\n`);
    process.exit(result.status ?? 1);
  }
}

process.stdout.write("\n[quality:gate] Approved. All mandatory checks passed.\n");
