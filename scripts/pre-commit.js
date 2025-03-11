const { execSync } = require("child_process");

try {
  // Get staged files
  const stagedFiles = execSync(
    "git diff --cached --name-only --diff-filter=ACMR",
  )
    .toString()
    .trim()
    .split("\n")
    .filter((file) => file.match(/\.(ts|tsx)$/));

  if (stagedFiles.length) {
    // Run eslint
    execSync(`bunx eslint --fix ${stagedFiles.join(" ")}`, {
      stdio: "inherit",
    });

    // Run prettier
    execSync(`bunx prettier --write ${stagedFiles.join(" ")}`, {
      stdio: "inherit",
    });

    // Add back the formatted files
    execSync(`git add ${stagedFiles.join(" ")}`);
  }
} catch (error) {
  console.error("Pre-commit hook failed:", error);
  process.exit(1);
}
