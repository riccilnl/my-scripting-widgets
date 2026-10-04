import { HStack, Image, ScrollView, ZStack } from "scripting";
import type { KeyboardCommand } from "../../contracts/action";
import type { KeyboardSkin, SkinColors } from "../../contracts/skin";

export type ToolbarItem = {
  id: string;
  systemImage: string;
  command: KeyboardCommand;
  opticalOffsetY?: number;
};

export function ToolbarStrip(props: {
  items: readonly ToolbarItem[];
  colors: SkinColors;
  width: number;
  height: number;
  skin: KeyboardSkin;
  onCommand: (command: KeyboardCommand) => void;
}) {
  const hitCellWidth = props.skin.visuals.toolbarItemCellWidth;
  const visualCenterCorrectionX = props.skin.visuals.toolbarItemIconOffsetX;
  const spacing = 0;
  const hitSurface = "rgba(0,0,0,0.001)";

  if (props.width <= 0) return null;

  return (
    <ScrollView
      axes="horizontal"
      scrollIndicator="hidden"
      frame={{ width: props.width, height: props.height }}
    >
      <HStack
        spacing={spacing}
        frame={{ minWidth: props.width, height: props.height, alignment: "leading" as any }}
        background={hitSurface as any}
        contentShape="rect"
      >
        {props.items.map((item) => (
          <ZStack
            key={`toolbar-${item.id}`}
            frame={{ width: hitCellWidth, height: props.height }}
            foregroundStyle={props.colors.foreground as any}
            background={hitSurface as any}
            contentShape="rect"
            onTapGesture={() => props.onCommand(item.command)}
          >
            <Image
              systemName={item.systemImage}
              font={props.skin.visuals.toolbarIconSize}
              offset={{ x: visualCenterCorrectionX, y: item.opticalOffsetY ?? 0 }}
              allowsHitTesting={false}
            />
          </ZStack>
        ))}
      </HStack>
    </ScrollView>
  );
}
