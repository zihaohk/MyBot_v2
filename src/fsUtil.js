const fs = require("fs/promises");
const path = require("path");

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Atomic write:
 * 1) write to temp
 * 2) rename temp -> target
 */
async function writeFileAtomic(filePath, content, encoding = "utf8") {
  const dir = path.dirname(filePath);
  await ensureDir(dir);

  const tmpPath = `${filePath}.tmp-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  await fs.writeFile(tmpPath, content, { encoding });
  await fs.rename(tmpPath, filePath);
}

module.exports = {
  ensureDir,
  exists,
  writeFileAtomic
};
