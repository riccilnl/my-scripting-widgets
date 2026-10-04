import { Button, HStack, Image, List, Section, Text, TextField, useState } from "scripting";
import {
  createCommonPhraseId,
  DEFAULT_COMMON_PHRASE_SYMBOL,
  loadCommonPhraseCategories,
  saveCommonPhraseCategories,
  type CommonPhraseCategory
} from "../../settings/commonPhrases";

export function CommonPhrasesSettingsPage() {
  const [categories, setCategories] = useState<CommonPhraseCategory[]>(() => loadCommonPhraseCategories());

  function persist(next: CommonPhraseCategory[]) {
    const saved = saveCommonPhraseCategories(next);
    if (saved) setCategories(saved);
  }

  function updateCategory(
    categoryId: string,
    patch: Partial<Pick<CommonPhraseCategory, "symbol" | "title">>
  ) {
    persist(categories.map((category) => (
      category.id === categoryId ? { ...category, ...patch } : category
    )));
  }

  function addCategory() {
    persist([
      ...categories,
      {
        id: createCommonPhraseId("category"),
        symbol: DEFAULT_COMMON_PHRASE_SYMBOL,
        title: "新分类",
        phrases: []
      }
    ]);
  }

  function removeCategory(categoryId: string) {
    persist(categories.filter((category) => category.id !== categoryId));
  }

  function addPhrase(categoryId: string) {
    persist(categories.map((category) => (
      category.id === categoryId
        ? {
          ...category,
          phrases: [
            ...category.phrases,
            { id: createCommonPhraseId("phrase"), text: "" }
          ]
        }
        : category
    )));
  }

  function updatePhrase(categoryId: string, phraseId: string, text: string) {
    persist(categories.map((category) => (
      category.id === categoryId
        ? {
          ...category,
          phrases: category.phrases.map((phrase) => (
            phrase.id === phraseId ? { ...phrase, text } : phrase
          ))
        }
        : category
    )));
  }

  function removePhrase(categoryId: string, phraseId: string) {
    persist(categories.map((category) => (
      category.id === categoryId
        ? { ...category, phrases: category.phrases.filter((phrase) => phrase.id !== phraseId) }
        : category
    )));
  }

  return (
    <List navigationTitle="常用语" navigationBarTitleDisplayMode="inline">
      {categories.map((category, categoryIndex) => (
        <Section
          key={category.id}
          header={(
            <HStack spacing={8}>
              <Image systemName={category.symbol.trim() || DEFAULT_COMMON_PHRASE_SYMBOL} />
              <Text>{category.title.trim() || `分类 ${categoryIndex + 1}`}</Text>
            </HStack>
          )}
        >
          <HStack spacing={8}>
            <Image
              systemName={category.symbol.trim() || DEFAULT_COMMON_PHRASE_SYMBOL}
              frame={{ width: 24 }}
            />
            <TextField
              title="SF图标"
              value={category.symbol}
              prompt="例如 star.fill"
              onChanged={(value) => updateCategory(category.id, { symbol: value })}
            />
          </HStack>
          <TextField
            title="分类标题"
            value={category.title}
            prompt="例如 日常"
            onChanged={(value) => updateCategory(category.id, { title: value })}
          />

          {category.phrases.map((phrase, phraseIndex) => (
            <HStack key={phrase.id} spacing={8}>
              <Text
                font={14}
                lineLimit={1}
                foregroundStyle="secondaryLabel"
                frame={{ width: 34, height: 32, alignment: "trailing" as any }}
              >
                {`${phraseIndex + 1}.`}
              </Text>
              <TextField
                title=""
                value={phrase.text}
                prompt="输入常用语内容"
                onChanged={(value) => updatePhrase(category.id, phrase.id, value)}
                frame={{ maxWidth: "infinity" as any }}
              />
              <Button
                title=""
                systemImage="trash"
                role="destructive"
                buttonStyle="plain"
                action={() => removePhrase(category.id, phrase.id)}
              />
            </HStack>
          ))}

          <Button title="添加常用语" systemImage="plus.circle" action={() => addPhrase(category.id)} />
          <Button
            title="删除分类"
            systemImage="trash"
            role="destructive"
            action={() => removeCategory(category.id)}
          />
        </Section>
      ))}

      <Section
        footer={<Text>分类图标使用 SF Symbols 名称。键盘左侧显示分类图标，点击后会定位到右侧对应分类。</Text>}
      >
        <Button title="新建分类" systemImage="folder.badge.plus" action={addCategory} />
        {categories.length === 0
          ? <Text foregroundStyle="secondaryLabel">尚未创建常用语分类</Text>
          : null}
      </Section>
    </List>
  );
}
