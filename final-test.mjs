import fs from "fs";
import path from "path";

// Test if fs.existsSync follows symlinks
const testPath = "specs/requirements/test-vuln/secret";
const fullPath = path.join("C:\\devops", testPath);

console.log(`  Path: ${testPath}`);
console.log(`  Full path: ${fullPath}`);
console.log(`  fs.existsSync(fullPath): ${fs.existsSync(fullPath)}`);

// Check if it's a symlink
if (fs.existsSync(fullPath)) {
    const stats = fs.lstatSync(fullPath);
    console.log(`  Is symlink: ${stats.isSymbolicLink()}`);
    if (stats.isSymbolicLink()) {
        const target = fs.readlinkSync(fullPath);
        console.log(`  Symlink target: ${target}`);
    }
}
