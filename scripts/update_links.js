const fs = require('fs');
const path = require('path');

// 配置
const REPO_OWNER = 'riccilnl';
const REPO_NAME = 'my-scripting-widgets';
const BRANCH = 'main';

// 获取所有 .scripting 文件
function getScriptingFiles() {
  const files = fs.readdirSync('.');
  return files.filter(file => file.endsWith('.scripting'));
}

// 生成 raw GitHub URL
function generateRawUrl(filename) {
  return `https://github.com/${REPO_OWNER}/${REPO_NAME}/raw/${BRANCH}/${encodeURIComponent(filename)}`;
}

// 生成安装链接
function generateInstallLinks() {
  const files = getScriptingFiles();
  
  let links = '## 快速安装\n\n';
  links += '点击下方链接直接下载安装：\n\n';
  
  // 按字母排序，让财联社在前面
  const sortedFiles = files.sort();
  
  sortedFiles.forEach(file => {
    const name = file.replace('.scripting', '');
    const url = generateRawUrl(file);
    links += `- [${name}](${url})\n`;
  });
  
  links += '\n**安装步骤：**\n';
  links += '1. 点击上方链接\n';
  links += '2. 在 Safari 中打开链接\n';
  links += '3. 点击 "在 Scripting 中打开"\n';
  links += '4. 自动导入完成\n\n';
  links += '或者复制链接地址，在 Scripting App 中点击 "+" → "从 GitHub 安装"，粘贴链接即可。\n';
  
  return links;
}

// 更新 README.md
function updateReadme() {
  const readmePath = 'README.md';
  let content = fs.readFileSync(readmePath, 'utf8');
  
  const installLinks = generateInstallLinks();
  
  const startMarker = '<!-- INSTALL_LINKS_START -->';
  const endMarker = '<!-- INSTALL_LINKS_END -->';
  
  if (content.includes(startMarker) && content.includes(endMarker)) {
    const regex = new RegExp(`${startMarker}[\\s\\S]*?${endMarker}`, 'g');
    content = content.replace(regex, `${startMarker}\n\n${installLinks}\n${endMarker}`);
  }
  
  fs.writeFileSync(readmePath, content);
  console.log('✅ README.md 已更新，安装链接已生成');
}

function main() {
  try {
    updateReadme();
  } catch (error) {
    console.error('❌ 更新失败:', error);
    process.exit(1);
  }
}

main();
