import { access } from 'node:fs/promises';
import { dirname, extname, resolve as resolvePath } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const resolveWithExtension = async (specifier, parentURL) => {
  if (!parentURL) return null;
  const parentPath = fileURLToPath(parentURL);
  const basePath = resolvePath(dirname(parentPath), specifier);
  const candidates = [
    `${basePath}.ts`,
    `${basePath}.tsx`,
    resolvePath(basePath, 'index.ts'),
    resolvePath(basePath, 'index.tsx'),
  ];
  for (const candidate of candidates) {
    try {
      await access(candidate);
      return pathToFileURL(candidate).href;
    } catch {
      continue;
    }
  }
  return null;
};

export const resolve = async (specifier, context, defaultResolve) => {
  if (
    (specifier.startsWith('./') || specifier.startsWith('../')) &&
    !extname(specifier)
  ) {
    const resolved = await resolveWithExtension(specifier, context.parentURL);
    if (resolved) {
      return { url: resolved, shortCircuit: true };
    }
  }
  return defaultResolve(specifier, context, defaultResolve);
};

export const load = async (url, context, defaultLoad) => defaultLoad(url, context, defaultLoad);
