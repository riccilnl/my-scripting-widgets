import type { KeyboardCommand } from "../contracts/action";
import {
  functionInstructionForCommand as canonicalInstructionForCommand,
  resolveFunctionInstruction as resolveCanonicalInstruction
} from "../contracts/functionCommands";

export type FunctionInstructionItem = {
  instruction: string;
  description: string;
  command: KeyboardCommand;
};

export type FunctionInstructionGroup = {
  title: string;
  items: readonly FunctionInstructionItem[];
};

function item(instruction: string, description: string): FunctionInstructionItem {
  const command = resolveCanonicalInstruction(instruction);
  if (!command) {
    throw new Error(`Unknown function instruction: ${instruction}`);
  }
  return { instruction, description, command };
}

export const FUNCTION_INSTRUCTION_GROUPS: readonly FunctionInstructionGroup[] = [
  {
    title: "编辑与光标",
    items: [
      item("{left}", "光标左移一位"),
      item("{right}", "光标右移一位"),
      item("{home}", "移动到当前行行首"),
      item("{end}", "移动到当前行行尾"),
      item("{selectAll}", "全选当前文本"),
      item("{toggleSelectAll}", "全选 / 取消全选切换"),
      item("{cut}", "剪切选中内容"),
      item("{copy}", "复制选中内容"),
      item("{paste}", "粘贴剪贴板文本")
    ]
  },
  {
    title: "文本与预编辑",
    items: [
      item("{deleteAll}", "删除当前输入框全部可删除文本"),
      item("{restoreDeleted}", "恢复最近一次真实删除内容"),
      item("{clearComposition}", "只清空当前 Rime 预编辑")
    ]
  },
  {
    title: "输入动作",
    items: [
      item("{backspace}", "执行一次删除键 Tap 事务"),
      item("{space}", "执行一次空格 Tap 事务"),
      item("{return}", "执行回车事务"),
      item("{toggleAscii}", "切换中文 / 英文模式")
    ]
  },
  {
    title: "键盘界面",
    items: [
      item("{main}", "切回主键盘"),
      item("{numeric}", "切到数字键盘"),
      item("{symbols}", "切到符号键盘"),
      item("{nextKeyboard}", "切换到系统下一个键盘"),
      item("{keyboardHome}", "返回 Scripting 键盘主界面"),
      item("{clipboardHistory}", "打开剪贴板历史"),
      item("{commonPhrases}", "打开常用语")
    ]
  }
];

export const resolveFunctionInstruction = resolveCanonicalInstruction;
export const functionInstructionForCommand = canonicalInstructionForCommand;
