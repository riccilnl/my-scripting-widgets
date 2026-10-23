import { NavigationLink, List, Section, Text, Button, Image, VStack, HStack, Spacer } from "scripting"
import { Book } from "./api"
import { BookDetails } from "./detail"

function Row({ book }: { book: Book }) {
  return <NavigationLink destination={<BookDetails book={book} />}>
    <HStack spacing={12} padding={8}>
      {book.cover.startsWith("https://")
        ? <Image imageUrl={book.cover} resizable={true} aspectRatio={{ contentMode: "fit" }} frame={{ width: 58, height: 82 }} />
        : <Image systemName="book.closed" aspectRatio={{ contentMode: "fit" }} frame={{ width: 58, height: 82 }} />}
      <VStack alignment="leading" spacing={5}>
        <Text font="headline" lineLimit={2}>{book.title}</Text>
        <Text font="subheadline" lineLimit={1}>{book.author || "作者未知"}</Text>
        <Text font="caption">{[book.language, book.year, book.extension, book.size].filter(Boolean).join(" · ")}</Text>
      </VStack>
      <Spacer />
    </HStack>
  </NavigationLink>
}

export function Results({ books, busy, error, total, refresh, loadMore, canLoadMore, showRefresh = false }: {
  books: Book[]; busy: boolean; error: string; total: number
  refresh: () => void; loadMore: () => void; canLoadMore: boolean; showRefresh?: boolean
}) {
  return <List>
    {error ? <Section>
      <Text foregroundStyle="red">{error}</Text>
      <Button title="重试" action={refresh} disabled={busy} />
    </Section> : null}
    {busy && books.length === 0 ? <Section><Text>正在加载…</Text></Section> : null}
    {!busy && !error && books.length === 0 ? <Section><Text>暂无书籍</Text></Section> : null}
    {books.map(book => <Row key={book.id + ":" + book.hash} book={book} />)}
    <Section>
      {showRefresh ? <Button title="刷新" systemImage="arrow.clockwise" action={refresh} disabled={busy} /> : null}
      {busy && books.length > 0 ? <Text font="caption">正在加载下一页…</Text> : null}
      {canLoadMore && !busy && !error && books.length > 0 ?
        <Text font="caption" onScrollVisibilityChange={{ threshold: 0.2, onChanged: visible => {
          if (visible) loadMore()
        }}}>向下滚动自动加载更多</Text> : null}
      {!canLoadMore && !busy && books.length > 0 ?
        <Text font="caption">已显示全部{total > 0 ? " " + total + " " : ""}条结果</Text> : null}
    </Section>
  </List>
}
