import {
  Button,
  HStack,
  List,
  Section,
  Spacer,
  Text,
  useState,
  VStack
} from "scripting";
import { FUNCTION_INSTRUCTION_GROUPS } from "../../settings/functionInstructions";

export function FunctionInstructionsPage() {
  const [showCopiedToast, setShowCopiedToast] = useState(false);

  function copyInstruction(instruction: string) {
    void Pasteboard.setString(instruction);
    setShowCopiedToast(false);
    setTimeout(() => setShowCopiedToast(true), 20);
  }

  return (
    <List
      navigationTitle="功能指令"
      navigationBarTitleDisplayMode="inline"
      toast={{
        isPresented: showCopiedToast,
        onChanged: setShowCopiedToast,
        message: "已复制指令",
        duration: 1.2,
        position: "bottom"
      }}
    >
      {FUNCTION_INSTRUCTION_GROUPS.map((group) => (
        <Section key={group.title} header={<Text>{group.title}</Text>}>
          {group.items.map((item) => (
            <Button
              key={item.instruction}
              action={() => copyInstruction(item.instruction)}
            >
              <HStack
                spacing={8}
                frame={{ maxWidth: "infinity" as any, alignment: "leading" as any }}
              >
                <VStack
                  alignment="leading"
                  spacing={4}
                  frame={{ alignment: "leading" as any }}
                >
                  <Text font="body" fontDesign="monospaced">{item.instruction}</Text>
                  <Text font="caption" foregroundStyle="secondaryLabel">
                    {item.description}
                  </Text>
                </VStack>
                <Spacer />
              </HStack>
            </Button>
          ))}
        </Section>
      ))}
      <Section
        footer={(
          <Text foregroundStyle="secondaryLabel">
            点击任意指令即可复制。可粘贴到九键右侧自定义按键，或任意按键的上、下、左、右滑与长按“功能指令”动作中。
          </Text>
        )}
      />
    </List>
  );
}
