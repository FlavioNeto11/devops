import fs from "node:fs";
import path from "node:path";

const testDir = "test-symlink-check";
const symlink = path.join(testDir, "link-to-passwd");
const target = "C:\\Windows\\System32\\config\\SAM";

// Clean up
if (fs.existsSync(testDir)) {
  fs.rmSync(testDir, { recursive: true });
}
fs.mkdirSync(testDir, { recursive: true });

// Try to create symlink
try {
  // On Windows, this requires admin or developer mode
  fs.symlinkSync(target, symlink, "file");
  console.log("Symlink created successfully");
  
  // Test if existsSync follows the symlink
  console.log(`existsSync("${symlink}"): ${fs.existsSync(symlink)}`);
  console.log(`existsSync("${target}"): ${fs.existsSync(target)}`);
  
  // Also test with stat (which should fail on broken symlinks if not following)
  const stats = fs.lstatSync(symlink); // lstat doesn't follow
  console.log(`lstatSync isSymbolicLink: ${stats.isSymbolicLink()}`);
  
} catch (e) {
  console.log(`Error: ${e.message}`);
}

// Test the regex validation
const regex = /^([a-zA-Z]:[\\/]|[\\/]|\.\.)/;
console.log("\nRegex validation:");
["packages/ai-core", "link-to-passwd", "/etc/passwd", "C:\\Windows", "..\\parent"].forEach(p => {
  console.log(`"${p}": blocked=${regex.test(p)}`);
});
