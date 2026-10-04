/* eslint-disable */
// Fail closed if a release build inherited NODE_ENV=test/development.
const fs = require('node:fs');
const path = require('node:path');
const assets = path.resolve(__dirname, '../apps/game-web/dist/assets');
const entries = fs.readdirSync(assets).filter((name) => /^index-.*\.js$/.test(name));
if (!entries.length) throw new Error('Missing game release entrypoint');
for (const name of entries) {
  const code = fs.readFileSync(path.join(assets, name), 'utf8');
  if (code.includes('__mmo') || code.includes('react.development'))
    throw new Error('Development/debug code in release bundle. Build with NODE_ENV=production.');
}
console.log('Production bundle: development debug hook absent');
