import { useEffect, useState } from "scripting";
import { T9PinyinColumn } from "./T9PinyinColumn";
import type { T9PinyinViewStore } from "../runtime/T9PinyinViewStore";

type Props = Omit<Parameters<typeof T9PinyinColumn>[0], "options"> & {
  store: T9PinyinViewStore;
  asciiMode: boolean;
};

/**
 * Only this column subscribes to changing T9 pinyin choices.
 * Keep the pre-existing touch and scroll geometry in T9PinyinColumn.
 */
export function T9PinyinColumnSubscriber({ store, asciiMode, ...props }: Props) {
  const [options, setOptions] = useState(() => store.getSnapshot());

  useEffect(() => {
    const unsubscribe = store.subscribe(setOptions);
    // The Rime init effect may publish before this effect subscribes.
    setOptions(store.getSnapshot());
    return unsubscribe;
  }, [store]);

  return (
    <T9PinyinColumn
      {...props}
      options={asciiMode ? [] : options}
    />
  );
}
