import { readFile } from 'node:fs/promises';

export async function readPackageInfo() {
  const packageUrl = new URL('../package.json', import.meta.url);
  const packageJson = await readFile(packageUrl, 'utf8');
  const packageInfo = JSON.parse(packageJson);

  return {
    name: packageInfo.name,
    version: packageInfo.version
  };
}
