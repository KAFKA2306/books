function assertResponseOk(response, url) {
  if (!response.ok) throw new Error(`${url} の読み込みに失敗しました (${response.status})`);
  return response;
}

export function absolutizeAppImports(source, appModuleUrl) {
  const sourceBaseUrl = new URL('./src/', appModuleUrl).href;
  return source
    .replaceAll("from './src/", `from '${sourceBaseUrl}`)
    .replaceAll('from "./src/', `from "${sourceBaseUrl}`)
    .replaceAll("import('./src/", `import('${sourceBaseUrl}`)
    .replaceAll('import("./src/', `import("${sourceBaseUrl}`);
}

export async function loadJoinedModule({ manifestUrl, appModuleUrl }) {
  const manifestResponse = assertResponseOk(await fetch(manifestUrl), manifestUrl);
  const manifest = await manifestResponse.json();
  if (!Array.isArray(manifest.parts) || manifest.parts.some((part) => typeof part !== 'string' || !part)) {
    throw new TypeError('アプリケーション分割ファイルの一覧が不正です。');
  }

  const partsBaseUrl = new URL('./', manifestUrl);
  const parts = await Promise.all(manifest.parts.map(async (part) => {
    const partUrl = new URL(part, partsBaseUrl);
    const response = assertResponseOk(await fetch(partUrl), partUrl);
    return response.text();
  }));
  const source = absolutizeAppImports(parts.join(''), appModuleUrl);
  const objectUrl = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
  try {
    return await import(objectUrl);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
