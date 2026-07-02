// GitHub Pages is a static file host: it 404s any path Angular's router
// handles client-side (e.g. /matches, /order) since no matching file exists.
//
// Fix:
//   - Copy index.html -> 404.html so GitHub Pages serves the app shell
//     (instead of a bare error page) for any unknown path, letting Angular's
//     router take over and render the right route from location.pathname.
//   - Add .nojekyll so GitHub Pages doesn't run the output through Jekyll,
//     which ignores/mangles files and folders starting with "_" (a common
//     Angular build chunk prefix).
const fs = require('fs');
const path = require('path');

const docsDir = path.join(__dirname, '..', 'docs');
const indexPath = path.join(docsDir, 'index.html');
const notFoundPath = path.join(docsDir, '404.html');
const nojekyllPath = path.join(docsDir, '.nojekyll');

if (!fs.existsSync(indexPath)) {
  console.error(`[postbuild] ${indexPath} not found — did the build run?`);
  process.exit(1);
}

fs.copyFileSync(indexPath, notFoundPath);
fs.writeFileSync(nojekyllPath, '');

console.log('[postbuild] Copied index.html -> 404.html and created .nojekyll for GitHub Pages SPA routing.');
