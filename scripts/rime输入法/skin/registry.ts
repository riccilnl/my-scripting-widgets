import { normalizeSkinId, type KeyboardSkin, type SkinId } from "../contracts/skin";
import { APPLE_CLASSIC_SKIN } from "./appleClassicSkin";
import { DEFAULT_SKIN } from "./defaultSkin";
import { IOS26_SKIN } from "./ios26Skin";
import { WECHAT_SKIN } from "./wechatSkin";

export type SkinOption = {
  id: SkinId;
  title: string;
  description: string;
};

export const SKIN_OPTIONS: readonly SkinOption[] = [
  {
    id: "wechat",
    title: "微信",
    description: "面向中文九键的窄左侧筛选栏、三列主键区和独立右侧功能栏。"
  },
  {
    id: "ios26",
    title: "iOS 26",
    description: "系统材质、更圆键帽和接近五列节奏的九键视觉实验皮肤。"
  },
  {
    id: "apple-classic",
    title: "Apple Classic",
    description: "偏 iOS 17/18 的经典白色主键、灰色功能键视觉。"
  },
  {
    id: "classic",
    title: "经典",
    description: "项目原始默认皮肤，保留当前重构前的基础视觉参数。"
  }
];

export function resolveSkin(value: unknown): KeyboardSkin {
  switch (normalizeSkinId(value)) {
    case "ios26": return IOS26_SKIN;
    case "apple-classic": return APPLE_CLASSIC_SKIN;
    case "classic": return DEFAULT_SKIN;
    case "wechat":
    default:
      return WECHAT_SKIN;
  }
}

export function skinTitle(value: unknown): string {
  const id = normalizeSkinId(value);
  return SKIN_OPTIONS.find((item) => item.id === id)?.title ?? "微信";
}
