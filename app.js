const manifest = await fetch('./src/app.parts.json').then((response) => response.json());
const source = (await Promise.all(manifest.parts.map((part) => fetch(`./src/${part}`).then((response) => response.text())))).join('');
const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
try { await import(url); } finally { URL.revokeObjectURL(url); }
