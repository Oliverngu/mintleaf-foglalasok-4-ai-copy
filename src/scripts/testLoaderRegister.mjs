import { resolve as resolvePath } from 'node:path';
import { pathToFileURL } from 'node:url';

export const buildLoaderRegister = repoRoot => {
  const loaderPath = resolvePath(repoRoot, 'src', 'scripts', 'tsModuleLoader.mjs');
  const loaderUrl = pathToFileURL(loaderPath).href;
  const baseUrl = pathToFileURL(repoRoot).href;
  const loaderBaseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  const loaderRegister = `data:text/javascript,import { register } from "node:module"; register(${JSON.stringify(
    loaderUrl
  )}, ${JSON.stringify(loaderBaseUrl)});`;

  return {
    loaderPath,
    loaderUrl,
    loaderBaseUrl,
    loaderRegister,
  };
};
