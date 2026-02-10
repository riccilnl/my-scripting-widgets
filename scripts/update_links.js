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
  links += '点击以下链接直接下载安装：\n\n';
  
  files.forEach(file => {
    // 去掉 .scripting 后缀作为显示名
    const name = file.replace('.scripting', '');
    const url = generateRawUrl(file);
    links += `- [${name}](${url})\n`;
  });
  
  links += '\n';
  links += '> 点击链接后，在 Safari 中打开并选择 "在 Scripting 中打开" 即可安装。\n';
  
  return links;
}

// 更新 README.md
function updateReadme() {
  const readmePath = 'README.md';
  let content = fs.readFileSync(readmePath, 'utf8');
  
  const installLinks = generateInstallLinks();
  
  // 查找并替换 <!-- INSTALL_LINKS --> 标记之间的内容
  const startMarker = '<!-- INSTALL_LINKS_START -->';
  const endMarker = '<!-- INSTALL_LINKS_END -->';
  
  if (content.includes(startMarker) && content.includes(endMarker)) {
    // 如果存在标记，替换其中的内容
    const regex = new RegExp(`${startMarker}[\\s\\S]*?${endMarker}`, 'g');
    content = content.replace(regex, `${startMarker}\n\n${installLinks}\n${endMarker}`);
  } else {
    // 如果不存在标记，在 ## 安装方法 后添加
    const installSectionRegex = /(## 安装方法[\\s\\S]*?)(?=## |$)/;
    if (content.match(installSectionRegex)) {
      content = content.replace(installSectionRegex, `$1\n${installLinks}\n`);
    } else {
      // 如果没有安装方法章节，添加到文件开头
      content = installLinks + '\n' + content;
    }
  }
  
  fs.writeFileSync(readmePath, content);
  console.log('✅ README.md 已更新，安装链接已生成');
}

// 主函数
function main() {
  try {
    updateReadme();
  } catch (error) {
    console.error('❌ 更新失败:', error);
    process.exit(1);
  }
}

main();
