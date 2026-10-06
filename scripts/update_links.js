const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const REPO_OWNER = 'riccilnl';
const REPO_NAME = 'my-scripting-widgets';
const BRANCH = 'main';
const START_MARKER = '<!-- INSTALL_LINKS_START -->';
const END_MARKER = '<!-- INSTALL_LINKS_END -->';

function getSourceProjects(repoRoot) {
  const scriptsPath = path.join(repoRoot, 'scripts');
  if (!fs.existsSync(scriptsPath)) {
    throw new Error(`源码目录不存在: ${scriptsPath}`);
  }

  return fs
    .readdirSync(scriptsPath, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => fs.existsSync(path.join(scriptsPath, name, 'script.json')))
    .sort();
}

function validateReadme(repoRoot) {
  const readmePath = path.join(repoRoot, 'README.md');
  const content = fs.readFileSync(readmePath, 'utf8');
  const start = content.indexOf(START_MARKER);
  const end = content.indexOf(END_MARKER);

  if (
    start === -1 ||
    end === -1 ||
    start >= end ||
    content.indexOf(START_MARKER, start + START_MARKER.length) !== -1 ||
    content.indexOf(END_MARKER, end + END_MARKER.length) !== -1
  ) {
    throw new Error('README.md 必须包含一组完整且有序的安装链接标记');
  }

  return { readmePath, content, start, end };
}

function validateProject(repoRoot, projectName) {
  const projectPath = path.join(repoRoot, 'scripts', projectName);
  const manifestPath = path.join(projectPath, 'script.json');
  let manifest;

  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (error) {
    throw new Error(`script.json 无效: ${projectName} (${error.message})`);
  }

  if (typeof manifest.entry !== 'string' || manifest.entry.trim() === '') {
    throw new Error(`script.json 缺少有效 entry: ${projectName}`);
  }

  const entryPath = path.resolve(projectPath, manifest.entry);
  const projectPrefix = `${path.resolve(projectPath)}${path.sep}`;
  if (!entryPath.startsWith(projectPrefix) || !fs.existsSync(entryPath) || !fs.statSync(entryPath).isFile()) {
    throw new Error(`入口文件不存在或超出项目目录: ${projectName}/${manifest.entry}`);
  }

  return { name: projectName, entry: manifest.entry };
}

function createPackage(repoRoot, project, sequence) {
  const scriptsPath = path.join(repoRoot, 'scripts');
  const outputPath = path.join(repoRoot, `${project.name}.scripting`);
  const temporaryPath = path.join(
    repoRoot,
    `.${project.name}.scripting.tmp-${process.pid}-${sequence}`,
  );
  const exclusions = [
    '*/.git*',
    '*/node_modules/*',
    '*/.DS_Store',
    '*/.idea/*',
    '*/.vscode/*',
  ];
  const args = ['-rq', temporaryPath, project.name];
  for (const pattern of exclusions) {
    args.push('-x', pattern);
  }

  const result = spawnSync('zip', args, { cwd: scriptsPath, encoding: 'utf8' });
  if (result.error) {
    throw new Error(`无法运行 zip: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`打包失败: ${project.name}\n${result.stderr || result.stdout}`);
  }

  return { temporaryPath, outputPath };
}

function getScriptingFiles(repoRoot) {
  return fs
    .readdirSync(repoRoot, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.scripting'))
    .map((entry) => entry.name)
    .sort();
}

function generateRawUrl(filename) {
  return `https://github.com/${REPO_OWNER}/${REPO_NAME}/raw/${BRANCH}/${encodeURIComponent(filename)}`;
}

function generateInstallLinks(files) {
  let links = '## 快速安装\n\n';
  links += '点击下方链接直接下载安装：\n\n';

  for (const file of files) {
    const name = file.slice(0, -'.scripting'.length);
    links += `- [${name}](${generateRawUrl(file)})\n`;
  }

  links += '\n**安装步骤：**\n';
  links += '1. 点击上方链接\n';
  links += '2. 在 Safari 中打开链接\n';
  links += '3. 点击 "在 Scripting 中打开"\n';
  links += '4. 自动导入完成\n\n';
  links += '或者复制链接地址，在 Scripting App 中点击 "+" → "从 GitHub 安装"，粘贴链接即可。\n';
  return links;
}

function updateReadme(readme, files) {
  const before = readme.content.slice(0, readme.start + START_MARKER.length);
  const after = readme.content.slice(readme.end);
  const installLinks = generateInstallLinks(files);
  fs.writeFileSync(readme.readmePath, `${before}\n\n${installLinks}\n${after}`);
}

function run(repoRoot = process.cwd()) {
  const readme = validateReadme(repoRoot);
  const projects = getSourceProjects(repoRoot).map((name) => validateProject(repoRoot, name));
  const pendingPackages = [];

  try {
    for (const [index, project] of projects.entries()) {
      pendingPackages.push(createPackage(repoRoot, project, index));
    }

    for (const packagePaths of pendingPackages) {
      fs.renameSync(packagePaths.temporaryPath, packagePaths.outputPath);
    }
  } catch (error) {
    for (const packagePaths of pendingPackages) {
      fs.rmSync(packagePaths.temporaryPath, { force: true });
    }
    throw error;
  }

  const scriptingFiles = getScriptingFiles(repoRoot);
  updateReadme(readme, scriptingFiles);
  console.log(`✅ 已打包 ${projects.length} 个源码项目并更新 README.md`);
}

if (require.main === module) {
  try {
    run();
  } catch (error) {
    console.error(`❌ 更新失败: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = {
  generateInstallLinks,
  generateRawUrl,
  getScriptingFiles,
  getSourceProjects,
  run,
  updateReadme,
  validateProject,
  validateReadme,
};
