const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const { getScriptingFiles } = require('./update_links');

const SCRIPT_PATH = path.join(__dirname, 'update_links.js');

function createRepository() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'scripting-packager-'));
  fs.mkdirSync(path.join(root, 'scripts'));
  fs.writeFileSync(
    path.join(root, 'README.md'),
    [
      '# Test repository',
      '',
      '<!-- INSTALL_LINKS_START -->',
      '',
      'old links',
      '',
      '<!-- INSTALL_LINKS_END -->',
      '',
      'Keep this section.',
      '',
    ].join('\n'),
  );
  return root;
}

function createProject(root, name, manifest = { name, entry: 'index.tsx' }) {
  const projectPath = path.join(root, 'scripts', name);
  fs.mkdirSync(path.join(projectPath, 'src'), { recursive: true });
  fs.mkdirSync(path.join(projectPath, 'node_modules', 'ignored'), { recursive: true });
  fs.writeFileSync(path.join(projectPath, 'script.json'), JSON.stringify(manifest));
  fs.writeFileSync(path.join(projectPath, 'index.tsx'), 'console.log("entry");\n');
  fs.writeFileSync(path.join(projectPath, 'src', 'feature.ts'), 'export const feature = true;\n');
  fs.writeFileSync(path.join(projectPath, 'node_modules', 'ignored', 'index.js'), 'ignored\n');
  fs.writeFileSync(path.join(projectPath, '.DS_Store'), 'ignored\n');
  return projectPath;
}

function runPackager(root) {
  return spawnSync(process.execPath, [SCRIPT_PATH], {
    cwd: root,
    encoding: 'utf8',
  });
}

function listArchive(archivePath) {
  const result = spawnSync('unzip', ['-Z1', archivePath], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim().split('\n');
}

test('packages every source project and keeps manually submitted packages', (t) => {
  const root = createRepository();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  createProject(root, '演示项目');

  const manualPackage = path.join(root, '手动组件.scripting');
  const manualContents = Buffer.from('manually submitted package');
  fs.writeFileSync(manualPackage, manualContents);

  const result = runPackager(root);

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(fs.readFileSync(manualPackage), manualContents);

  const archive = path.join(root, '演示项目.scripting');
  assert.equal(fs.existsSync(archive), true);
  const entries = listArchive(archive);
  assert.equal(entries.some((entry) => entry.endsWith('/script.json')), true);
  assert.equal(entries.some((entry) => entry.endsWith('/index.tsx')), true);
  assert.equal(entries.some((entry) => entry.endsWith('/src/feature.ts')), true);
  assert.equal(entries.some((entry) => entry.includes('node_modules')), false);
  assert.equal(entries.some((entry) => entry.endsWith('.DS_Store')), false);

  const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
  assert.match(readme, /- \[手动组件\]\(https:\/\/github\.com\/riccilnl\/my-scripting-widgets\/raw\/main\/%E6%89%8B%E5%8A%A8%E7%BB%84%E4%BB%B6\.scripting\)/);
  assert.match(readme, /- \[演示项目\]\(https:\/\/github\.com\/riccilnl\/my-scripting-widgets\/raw\/main\/%E6%BC%94%E7%A4%BA%E9%A1%B9%E7%9B%AE\.scripting\)/);
  assert.match(readme, /Keep this section\./);
});

test('rejects a missing entry before replacing packages or README', (t) => {
  const root = createRepository();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  createProject(root, '有效项目');
  createProject(root, '损坏项目', { name: '损坏项目', entry: 'missing.tsx' });

  const existingPackage = path.join(root, '有效项目.scripting');
  const existingContents = Buffer.from('existing package');
  fs.writeFileSync(existingPackage, existingContents);
  const originalReadme = fs.readFileSync(path.join(root, 'README.md'));

  const result = runPackager(root);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /入口文件不存在.*损坏项目.*missing\.tsx/s);
  assert.deepEqual(fs.readFileSync(existingPackage), existingContents);
  assert.equal(fs.existsSync(path.join(root, '损坏项目.scripting')), false);
  assert.deepEqual(fs.readFileSync(path.join(root, 'README.md')), originalReadme);
});

test('requires one complete README install marker pair before packaging', (t) => {
  const root = createRepository();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  createProject(root, '演示项目');
  fs.writeFileSync(path.join(root, 'README.md'), '# Missing markers\n');

  const result = runPackager(root);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /README.*安装链接标记/);
  assert.equal(fs.existsSync(path.join(root, '演示项目.scripting')), false);
  assert.equal(fs.readFileSync(path.join(root, 'README.md'), 'utf8'), '# Missing markers\n');
});

test('keeps the existing filename sort order for install links', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'scripting-links-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const filename of ['财联社.scripting', 'IP检测.scripting', '新浪美股.scripting']) {
    fs.writeFileSync(path.join(root, filename), 'package');
  }

  assert.deepEqual(getScriptingFiles(root), [
    'IP检测.scripting',
    '新浪美股.scripting',
    '财联社.scripting',
  ]);
});
