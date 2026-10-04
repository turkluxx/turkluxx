import { copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { transform } from 'esbuild';
import postcss from 'postcss';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const limit = 25 * 1024 * 1024;
const forbidden = /^(?:\..*|node_modules|dist|README(?:\..*)?|AGENTS\.md|package(?:-lock)?\.json|wrangler\..*)$/i;

const read = file => readFileSync(join(root, file), 'utf8');
const localStyles = html => [...html.matchAll(/<link\b[^>]*href="(css\/[^"]+)"[^>]*>/g)].map(match => match[1]);
const localScripts = html => [...html.matchAll(/<script\b[^>]*src="(js\/[^"]+)"[^>]*><\/script>/g)].map(match => match[1]);

function footerPolicies(html, file) {
  return html.replace(/(<div\b[^>]*class="turkluxx-footer-legal"[^>]*>)([\s\S]*?)(<\/div>)/g, (_, open, body, close) => {
    for (const [slug, label, className] of [['privacy-policy', 'Privacy Policy', 'turkluxx-privacy-link'], ['cookie-policy', 'Cookie Policy', 'turkluxx-policy-link']]) {
      const entry = new RegExp(`<(?:a|span)\\b[^>]*>${label}<\\/(?:a|span)>`, 'g');
      body = body.replace(entry, file === `${slug}.html` ? '' : `<a class="${className}" href="/${slug}">${label}</a>`);
    }
    return open + body + close;
  });
}
function syncPage(file, html) {
  if (read(file) !== html) writeFileSync(join(root, file), html, 'utf8');
  return html;
}
function pageHtml(file) {
  const legalPages = { 'privacy-policy.html': 'Privacy Policy', 'cookie-policy.html': 'Cookie Policy' };
  if (!Object.hasOwn(legalPages, file)) return syncPage(file, footerPolicies(read(file), file));
  // The Team page remains the single source for this page's complete shell.
  const template = read('meet-our-team.html');
  const content = read(file).match(/<main\b[\s\S]*?<\/main>/)?.[0];
  if (!content || !/<main\b[\s\S]*?<\/main>/.test(template)) throw new Error('Missing Privacy Policy or Team page content');
  const html = template
    .replace(/<main\b[\s\S]*?<\/main>/, () => content)
    .replace('https://turkluxx.com/meet-our-team.html', `https://turkluxx.com/${file.replace('.html', '')}`)
    .replace(/<title\b[^>]*>[\s\S]*?<\/title>/, `<title data-i18n-ignore>${legalPages[file]} — TurkLuxx</title>`)
    .replace('team-page"', 'team-page privacy-page"')
    .replace('<link rel="stylesheet" href="css/i18n.css">', '<link rel="stylesheet" href="css/privacy-policy.css">\n    <link rel="stylesheet" href="css/i18n.css">');
  // Source previews must load the same shell/styles as production. Keep these
  // standalone documents synchronized rather than leaving bare <main> files.
  return syncPage(file, footerPolicies(html, file));
}

async function bundle(files) {
  const pages = files.filter(file => file.endsWith('.html')).map(file => {
    const html = pageHtml(file);
    return { file, id: file === 'index.html' ? 'home' : file.replace('rengi-', '').replace('.html', ''),
      html, styles: localStyles(html), scripts: localScripts(html) };
  });
  const shared = ['js/i18n.js', 'js/mobile-header.js', 'js/referral.js', 'js/callback.js', 'js/homepage-navigation.js', 'js/homepage-galleries.js'];
  const groups = new Map([['js/turkluxx.min.js', shared.filter(file => pages.some(page => page.scripts.includes(file)))]]);
  const cssOrder = [];
  // Stable topological order preserves every page's stylesheet sequence.
  const remaining = new Set(pages.flatMap(page => page.styles));
  while (remaining.size) {
    const next = [...remaining].find(file => pages.every(page => {
      const index = page.styles.indexOf(file);
      return index < 0 || page.styles.slice(0, index).every(previous => !remaining.has(previous));
    }));
    if (!next) throw new Error('Incompatible page CSS order; refusing to alter the cascade');
    cssOrder.push(next); remaining.delete(next);
  }
  for (const page of pages) {
    for (const file of [...page.styles, ...page.scripts]) if (!files.includes(file)) throw new Error(`Unlisted page dependency: ${file}`);
    const specific = page.scripts.filter(file => !shared.includes(file));
    if (specific.length) groups.set(`js/rengi-${page.id}.min.js`, specific);
    const original = page.scripts.filter(file => file !== 'js/homepage-galleries.js');
    const reconstructed = [...groups.get('js/turkluxx.min.js').filter(file => file !== 'js/homepage-galleries.js'), ...specific];
    if (original.join() !== reconstructed.join()) throw new Error(`Incompatible script order: ${page.file}`);
  }
  let css = '';
  for (const file of cssOrder) {
    const tree = postcss.parse(read(file), { from: file });
    const owners = pages.filter(page => page.styles.includes(file));
    if (owners.length !== pages.length) {
      const attributes = owners.map(page => `[data-build-page="${page.id}"]`).join(',');
      const guard = `:where(html:is(${attributes}))`;
      tree.walkRules(rule => {
        for (let parent = rule.parent; parent; parent = parent.parent) {
          if (parent.type === 'atrule' && /keyframes$/i.test(parent.name)) return;
        }
        rule.selectors = rule.selectors.map(selector => /^(?:html|:root)(?=[\s.#:[>+~]|$)/.test(selector)
          ? selector.replace(/^(html|:root)/, `$1:where(:is(${attributes}))`)
          : `${guard} ${selector}`);
      });
    }
    css += tree.toString() + '\n';
  }
  const reports = [];
  function emit(file, content, inputs) {
    if (Buffer.byteLength(content) > limit) throw new Error(`Generated asset exceeds 25 MiB: ${file}`);
    mkdirSync(dirname(join(dist, file)), { recursive: true });
    writeFileSync(join(dist, file), content, 'utf8');
    reports.push({ file, inputs, originalBytes: inputs.reduce((sum, input) => sum + readFileSync(join(root, input)).length, 0), minifiedBytes: Buffer.byteLength(content) });
  }
  // Whitespace-only CSS minification leaves declarations, selector specificity,
  // rounding expressions and media-query semantics intact.
  emit('css/turkluxx.min.css', (await transform(css, { loader: 'css', minifyWhitespace: true, charset: 'utf8', legalComments: 'none' })).code, cssOrder);
  for (const [output, inputs] of groups) {
    let code = '';
    for (const file of inputs) {
      code += (await transform(read(file), { loader: 'js', minify: true, target: 'es2022', charset: 'utf8', legalComments: 'none', sourcefile: file })).code + ';\n';
    }
    emit(output, code, inputs);
  }
  for (const page of pages) {
    let firstStyle = true, firstScript = true;
    let html = page.html.replace(/<link\b[^>]*href="css\/[^\"]+"[^>]*>/g, () => {
      if (!firstStyle) return ''; firstStyle = false;
      return '<link rel="stylesheet" href="css/turkluxx.min.css">';
    }).replace(/<script\b[^>]*src="js\/[^\"]+"[^>]*><\/script>/g, () => {
      if (!firstScript) return ''; firstScript = false;
      const specific = `js/rengi-${page.id}.min.js`;
      return '<script src="js/turkluxx.min.js" defer></script>' + (groups.has(specific) ? `\n<script src="${specific}" defer></script>` : '');
    }).replace(/<html\b/, `<html data-build-page="${page.id}"`);
    writeFileSync(join(dist, page.file), html, 'utf8');
  }
  console.log(JSON.stringify(reports, null, 2));
}

// Only this fixed output path may be deleted. Never follow an output symlink/junction.
function clean() {
  if (dirname(dist) !== root || dist !== resolve(root, 'dist')) throw new Error('Unsafe output path');
  if (existsSync(dist) && lstatSync(dist).isSymbolicLink()) throw new Error('dist must not be a symlink or junction');
  rmSync(dist, { recursive: true, force: true });
}

try {
  clean();
  const config = JSON.parse(readFileSync(join(root, 'wrangler.json'), 'utf8'));
  if (config.assets?.directory !== './dist') throw new Error('Wrangler assets.directory must be ./dist');
  const files = JSON.parse(readFileSync(join(root, 'scripts/public-files.json'), 'utf8'));
  if (existsSync(join(root, 'rengi-antalya.html'))) files.push('rengi-antalya.html');
  for (const required of ['index.html', 'rengi-istanbul.html']) {
    if (!files.includes(required)) throw new Error(`Missing required page in public manifest: ${required}`);
  }
  const missing = [];
  let largest = { file: '', size: 0 };
  for (const file of files) {
    const parts = file.split('/');
    const allowed = /^(?:index\.html|rengi-istanbul\.html|rengi-antalya\.html|meet-our-team\.html|privacy-policy\.html|cookie-policy\.html)$/.test(file)
      || (/^locales\/(?:en|ru|es|ar|tr|nl)\.json$/.test(file))
      || (/^(?:css|js|img|assets)\//.test(file) && /^(?:\.css|\.js|\.png|\.jpg|\.jpeg|\.svg|\.webp|\.avif|\.gif|\.ico|\.woff2?)$/i.test(extname(file)));
    if (!allowed || file.includes('\\') || parts.some(part => !part || forbidden.test(part))) {
      throw new Error(`Non-public or unsafe manifest entry: ${file}`);
    }
    const source = resolve(root, ...parts);
    if (!source.startsWith(root + sep)) throw new Error(`Source escapes repository: ${file}`);
    let current = root;
    for (const part of parts) {
      current = join(current, part);
      if (existsSync(current) && lstatSync(current).isSymbolicLink()) throw new Error(`Symlink/junction forbidden: ${file}`);
    }
    if (!existsSync(source)) { missing.push(file); continue; }
    const stat = lstatSync(source);
    if (!stat.isFile()) throw new Error(`Required source is not a regular file: ${file}`);
    if (stat.size > limit) throw new Error(`Asset exceeds Cloudflare's 25 MiB limit: ${file} (${stat.size} bytes)`);
    if (stat.size > largest.size) largest = { file, size: stat.size };
  }
  if (missing.length) throw new Error(`Required public source files are missing:\n${missing.map(file => `  ${file}`).join('\n')}`);
  mkdirSync(dist);
  for (const file of files) {
    const destination = join(dist, file);
    mkdirSync(dirname(destination), { recursive: true });
    if (/^(?:css|js)\//.test(file) || file.endsWith('.html')) continue;
    try { copyFileSync(join(root, file), destination); }
    catch (error) { throw new Error(`Cannot copy required public file ${file}: ${error.message}`); }
  }
  await bundle(files);
  console.log('Built production HTML, minified bundles, and unchanged static assets/locales in dist/.');
  console.log(`Largest asset: ${largest.file} (${(largest.size / 1024 / 1024).toFixed(2)} MiB; limit 25 MiB).`);
} catch (error) {
  try { clean(); } catch { /* Preserve the original error; never traverse unsafe output. */ }
  console.error(`Static build failed: ${error.message}`);
  process.exitCode = 1;
}
