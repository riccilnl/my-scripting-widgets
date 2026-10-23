import { NavigationLink, List, Section, Text, Button, Image, VStack, HStack, Spacer } from "scripting"
import { Book } from "./api"
import { BookDetails } from "./detail"

function Row({ book }: { book: Book }) {
  return <NavigationLink destination={<BookDetails book={book} />}>
    <HStack spacing={12} padding={8}>
      {book.cover.startsWith("https://")
        ? <Image imageUrl={book.cover} frame={{ width: 54, height: 76 }} />
        : <Image systemName="book.closed" frame={{ width: 54, height: 70 }} />}
      <VStack alignment="leading" spacing={5}>
        <Text font="headline">{book.title}</Text>
        <Text font="subheadline">{book.author || "作者未知"}</Text>
        <Text font="caption">{[book.language, book.year, book.extension, book.size].filter(Boolean).join(" · ")}</Text>
      </VStack>
      <Spacer />
    </HStack>
  </NavigationLink>
}

export function Results({ books, busy, error, page, total, refresh, more, showRefresh = true }: {
  books: Book[]; busy: boolean; error: string; page: number; total: number
  refresh: () => void; more: () => void; showRefresh?: boolean
}) {
  return <List>
    {error ? <Section><Text foregroundStyle="red">{error}</Text></Section> : null}
    {busy && books.length === 0 ? <Section><Text>正在加载…</Text></Section> : null}
    {!busy && !error && books.length === 0 ? <Section><Text>暂无书籍</Text></Section> : null}
    {books.map(book => <Row key={book.id + ":" + book.hash} book={book} />)}
    <Section>
      {showRefresh ? <Button title={busy ? "加载中…" : "刷新"} systemImage="arrow.clockwise" action={refresh} disabled={busy} /> : null}
      {books.length > 0
        ? <Button title={busy ? "加载中…" : "加载更多（第 " + (page + 1) + " 页）"} systemImage="arrow.down" action={more} disabled={busy || (total > 0 && books.length >= total)} />
        : null}
    </Section>
  </List>
}
