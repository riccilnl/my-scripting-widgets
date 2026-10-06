import { ScrollView, Text, VStack, ZStack } from "scripting";
import type { KeyboardSkin, SkinColors } from "../../contracts/skin";

type Props = {
  options: string[];
  skin: KeyboardSkin;
  colors: SkinColors;
  width: number;
  height: number;
  onSelect: (option: string) => void;
  onPunctuation?: (symbol: string) => void;
};

// Frozen 4.6.24 behavior: one continuous left column, vertically scrollable,
// with each visible item occupying one quarter of the column height.
export function T9PinyinColumn(props: Props) {
  const items = props.options.length > 0 ? props.options : "，。？！、；：（）“”…—@#=".split("");
  return (
    <ZStack
      frame={{ width: props.width, height: props.height }}
      background={props.colors.t9PinyinBackground as any}
      foregroundStyle={props.colors.foreground as any}
      clipShape={{ type: "rect", cornerRadius: props.skin.visuals.keyCornerRadius } as any}
    >
      <ScrollView axes="vertical" scrollIndicator="hidden" frame={{ width: props.width, height: props.height }}>
        <VStack spacing={0} frame={{ width: props.width, alignment: "top" as any }}>
          {items.map((option, index) => (
            <Text
              key={`t9-left-${index}-${option}`}
              font={props.options.length > 0 ? 17 : 18}
              lineLimit={1}
              minimumScaleFactor={0.7}
              frame={{ width: props.width, height: props.height / 4, alignment: "center" as any }}
              contentShape="rect"
              onTapGesture={() => {
                if (props.options.length > 0) props.onSelect(option);
                else props.onPunctuation?.(option);
              }}
            >
              {option}
            </Text>
          ))}
        </VStack>
      </ScrollView>
    </ZStack>
  );
}
