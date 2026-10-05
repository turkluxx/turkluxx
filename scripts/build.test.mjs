import { test } from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, truncateSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('./build.mjs', import.meta.url));
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'turkluxx-build-'));
  t.after(() => {
    if (dirname(root) !== resolve(tmpdir()) || !root.startsWith(join(tmpdir(), 'turkluxx-build-'))) throw new Error('Unsafe test cleanup');
    rmSync(root, { recursive: true, force: true });
  });
  function put(file, content) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), content);
  }
  const files = ['index.html', 'rengi-istanbul.html', 'css/site.css', 'js/i18n.js', 'img/villa/floor.jpg'];
  for (const file of files) put(file, `original ${file}`);
  const html = '<html lang="en"><head><link rel="stylesheet" href="css/site.css"><script src="js/i18n.js" defer></script></head><body>Original</body></html>';
  put('index.html', html); put('rengi-istanbul.html', html);
  put('css/site.css', '/* comment */ body { color: red; font-weight: 600; }');
  put('js/i18n.js', '(() => { window.testBuild = "Русский العربية Türkçe"; })();');
  put('scripts/public-files.json', JSON.stringify(files));
  put('wrangler.json', JSON.stringify({ assets: { directory: './dist' } }));
  put('scripts/build.mjs', readFileSync(script, 'utf8').replace("from 'esbuild'", `from '${import.meta.resolve('esbuild')}'`).replace("from 'postcss'", `from '${import.meta.resolve('postcss')}'`));
  return { root, files, put, run: () => spawnSync(process.execPath, [join(root, 'scripts/build.mjs')], { encoding: 'utf8' }) };
}

test('bundles production pages, copies only allowlisted assets, and cleans stale output', t => {
  const f = fixture(t);
  f.put('rengi-antalya.html', readFileSync(join(f.root, 'index.html'), 'utf8'));
  f.put('meet-our-team.html', readFileSync(join(f.root, 'index.html'), 'utf8'));
  f.put('scripts/public-files.json', JSON.stringify([...f.files, 'meet-our-team.html']));
  for (const file of ['.git/objects/pack/secret.pack', 'node_modules/private.js', 'assets/README.md', 'assets/unlisted.png', 'dist/.git/old', 'dist/stale.html']) f.put(file, 'private');
  const result = f.run();
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(readFileSync(join(f.root, 'dist/img/villa/floor.jpg')), readFileSync(join(f.root, 'img/villa/floor.jpg')));
  for (const file of ['index.html', 'rengi-istanbul.html', 'rengi-antalya.html', 'meet-our-team.html']) {
    const html = readFileSync(join(f.root, 'dist', file), 'utf8');
    assert.match(html, /css\/turkluxx.min.css/); assert.match(html, /js\/turkluxx.min.js/);
    assert.doesNotMatch(html, /css\/site.css|js\/i18n.js/);
    for (const url of ['/favicon.ico', '/img/favicon/favicon-16x16.png', '/img/favicon/favicon-32x32.png', '/img/favicon/apple-touch-icon.png', '/site.webmanifest']) {
      assert.equal(html.split(`href="${url}"`).length - 1, 1, `${file}: one reference to ${url}`);
    }
  }
  assert.match(readFileSync(join(f.root, 'dist/css/turkluxx.min.css'), 'utf8'), /font-weight:600/);
  assert.match(readFileSync(join(f.root, 'dist/js/turkluxx.min.js'), 'utf8'), /Русский العربية Türkçe/);
  assert.equal(existsSync(join(f.root, 'dist/css/site.css')), false);
  assert.deepEqual(readdirSync(join(f.root, 'dist')).sort(), ['css', 'img', 'index.html', 'js', 'meet-our-team.html', 'rengi-antalya.html', 'rengi-istanbul.html']);
  assert.equal(f.run().status, 0);
  assert.equal(readFileSync(join(f.root, 'dist/index.html'), 'utf8').split('rel="manifest"').length - 1, 1, 'Repeated builds do not duplicate favicon links');
});

test('Privacy Policy inherits the current Team shell without translating its legal content', t => {
  const f = fixture(t);
  const shell = '<html lang="en"><head><title data-i18n="team.pageTitle">Team</title><link rel="canonical" href="https://turkluxx.com/meet-our-team.html"><link rel="stylesheet" href="css/i18n.css"><script src="js/i18n.js" defer></script></head><body class="team-page"><header>Shared header</header><main>Team biographies</main><footer>Shared footer</footer></body></html>';
  f.put('meet-our-team.html', shell);
  f.put('privacy-policy.html', '<main lang="en" dir="ltr" data-i18n-ignore><h1>Privacy Policy</h1><p>Exact legal wording.</p></main>');
  f.put('cookie-policy.html', '<main lang="en" dir="ltr" data-i18n-ignore><h1>Cookie Policy</h1><p>Exact cookie wording.</p></main>');
  f.put('css/i18n.css', 'body { color: navy; }');
  f.put('css/privacy-policy.css', '.privacy-section { color: navy; }');
  f.put('scripts/public-files.json', JSON.stringify([...f.files, 'meet-our-team.html', 'privacy-policy.html', 'cookie-policy.html', 'css/i18n.css', 'css/privacy-policy.css']));
  let result = f.run(); assert.equal(result.status, 0, result.stderr);
  let html = readFileSync(join(f.root, 'dist/privacy-policy.html'), 'utf8');
  assert.match(html, /<header>Shared header<\/header>/);
  assert.match(html, /<footer>Shared footer<\/footer>/);
  assert.match(html, /<main lang="en" dir="ltr" data-i18n-ignore>/);
  assert.match(html, /Exact legal wording\./);
  assert.match(html, /https:\/\/turkluxx.com\/privacy-policy\.html"/);
  assert.doesNotMatch(html, /Team biographies|data-i18n="team.pageTitle"/);
  assert.match(readFileSync(join(f.root, 'dist/meet-our-team.html'), 'utf8'), /Team biographies/);
  f.put('meet-our-team.html', shell.replace('Shared header', 'Updated header').replace('Shared footer', 'Updated footer'));
  result = f.run(); assert.equal(result.status, 0, result.stderr);
  html = readFileSync(join(f.root, 'dist/privacy-policy.html'), 'utf8');
  assert.match(html, /Updated header/); assert.match(html, /Updated footer/);
  const source = readFileSync(join(f.root, 'privacy-policy.html'), 'utf8');
  assert.match(source, /<html lang="en">/);
  assert.match(source, /href="css\/privacy-policy.css"/);
  assert.match(source, /Updated header/); assert.match(source, /Updated footer/);
  const cookie = readFileSync(join(f.root, 'dist/cookie-policy.html'), 'utf8');
  assert.match(cookie, /Updated header/); assert.match(cookie, /Updated footer/);
  assert.match(cookie, /https:\/\/turkluxx.com\/cookie-policy\.html"/);
  assert.match(cookie, /Exact cookie wording\./);
  assert.doesNotMatch(cookie, /Team biographies|data-i18n="team.pageTitle"/);
  assert.match(readFileSync(join(f.root, 'cookie-policy.html'), 'utf8'), /href="css\/privacy-policy.css"/);
});

test('shared footer opens all four policies and omits the current legal page without placeholders', t => {
  const f = fixture(t);
  const shell = '<html lang="en"><head><script src="js/i18n.js" defer></script></head><body><main>Content</main><footer><div class="turkluxx-footer-legal"><a href="#">Privacy Policy</a><span>Cookie Policy</span><span>Terms &amp; Conditions</span></div></footer></body></html>';
  f.put('index.html', shell); f.put('rengi-istanbul.html', shell); f.put('meet-our-team.html', shell);
  f.put('privacy-policy.html', '<main>Privacy content</main>');
  f.put('cookie-policy.html', '<main>Cookie content</main>');
  f.put('terms-and-conditions.html', '<main>Terms content</main>');
  f.put('disclaimer.html', '<main>Exact disclaimer content</main>');
  f.put('scripts/public-files.json', JSON.stringify([...f.files, 'meet-our-team.html', 'privacy-policy.html', 'cookie-policy.html', 'terms-and-conditions.html', 'disclaimer.html']));
  const result = f.run(); assert.equal(result.status, 0, result.stderr);
  for (const directory of ['', 'dist/']) {
    for (const file of ['index.html', 'rengi-istanbul.html', 'meet-our-team.html', 'privacy-policy.html', 'cookie-policy.html', 'terms-and-conditions.html', 'disclaimer.html']) {
      const html = readFileSync(join(f.root, directory, file), 'utf8');
      const footer = html.match(/<footer>[\s\S]*?<\/footer>/)[0];
      assert.equal(footer.includes('href="privacy-policy.html"'), file !== 'privacy-policy.html');
      assert.equal(footer.includes('href="cookie-policy.html"'), file !== 'cookie-policy.html');
      assert.equal(footer.includes('href="terms-and-conditions.html"'), file !== 'terms-and-conditions.html');
      assert.equal(footer.includes('href="disclaimer.html"'), file !== 'disclaimer.html');
      assert.doesNotMatch(footer, /href="#"|<span>Cookie Policy<\/span>|<a[^>]*>\s*<\/a>/);
    }
  }
});

test('preserves CSS order and prevents page-specific CSS leaking into other pages', t => {
  const f = fixture(t);
  f.put('css/istanbul.css', '.control { color: blue; } @keyframes glow { from { opacity: 0; } to { opacity: 1; } }');
  f.put('rengi-istanbul.html', readFileSync(join(f.root, 'rengi-istanbul.html'), 'utf8').replace('<script', '<link rel="stylesheet" href="css/istanbul.css"><script'));
  f.put('scripts/public-files.json', JSON.stringify([...f.files, 'css/istanbul.css']));
  const result = f.run(); assert.equal(result.status, 0, result.stderr);
  const css = readFileSync(join(f.root, 'dist/css/turkluxx.min.css'), 'utf8');
  assert.ok(css.indexOf('color:red') < css.indexOf('color:blue'));
  assert.match(css, /:where\(html:is\(\[data-build-page[\s\S]*\.control/);
  assert.match(css, /@keyframes glow\{from\{opacity:0\}to\{opacity:1\}\}/);
});

test('missing required file stops the build and removes stale output', t => {
  const f = fixture(t);
  f.put('scripts/public-files.json', JSON.stringify([...f.files, 'assets/missing.png']));
  f.put('dist/old.html', 'stale');
  const result = f.run();
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Required public source files are missing:[\s\S]*assets\/missing.png/);
  assert.equal(existsSync(join(f.root, 'dist')), false);
});

test('oversized asset stops the build', t => {
  const f = fixture(t);
  truncateSync(join(f.root, 'img/villa/floor.jpg'), 25 * 1024 * 1024 + 1);
  const result = f.run();
  assert.equal(result.status, 1);
  assert.match(result.stderr, /exceeds Cloudflare's 25 MiB/);
  assert.equal(existsSync(join(f.root, 'dist')), false);
});

test('rejects metadata, traversal and dependency directories even if added to manifest', t => {
  const f = fixture(t);
  for (const file of ['.git/config', 'img/.git/photo.jpg', 'js/node_modules/private.js', 'css/../secret.css', 'assets/README.md', 'wrangler.json']) {
    f.put('scripts/public-files.json', JSON.stringify([...f.files, file]));
    const result = f.run();
    assert.equal(result.status, 1, file);
    assert.match(result.stderr, /Non-public or unsafe manifest entry/);
  }
});

test('refuses a Wrangler assets directory other than dist', t => {
  const f = fixture(t);
  f.put('wrangler.json', JSON.stringify({ assets: { directory: '.' } }));
  const result = f.run();
  assert.equal(result.status, 1);
  assert.match(result.stderr, /assets.directory must be .\/dist/);
});
test('Copies the six allowed locale catalogs and rejects other JSON paths', t => {
  const f = fixture(t);
  const locales = ['en', 'ru', 'es', 'ar', 'tr', 'nl'].map(code => `locales/${code}.json`);
  for (const file of locales) f.put(file, '{"common.name":"Name"}');
  f.put('scripts/public-files.json', JSON.stringify([...f.files, ...locales]));
  assert.equal(f.run().status, 0);
  for (const file of locales) assert.deepEqual(readFileSync(join(f.root, 'dist', file)), readFileSync(join(f.root, file)));
  for (const file of ['locales/secrets.json', 'locales/.git/config.json', 'locales/../private.json']) {
    f.put('scripts/public-files.json', JSON.stringify([...f.files, file]));
    assert.equal(f.run().status, 1, file);
  }
});
