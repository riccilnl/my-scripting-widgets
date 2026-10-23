import { NavigationLink, List, Section, Text, Button, Image, VStack, HStack, Spacer, ProgressView } from "scripting"
import { Book } from "./api"
import { BookDetails } from "./detail"
import { UI } from "./ui-tokens"

function Row({ book }: { book: Book }) {
  const metadata = [book.year, book.extension, book.size].filter(Boolean).join(" · ")
  return <NavigationLink destination={<BookDetails book={book} />}>
    <HStack spacing={UI.rowGap} padding={{ vertical: UI.rowInset, horizontal: 4 }}
      frame={{ maxWidth: "infinity", alignment: "leading" }}>
      {book.cover.startsWith("https://")
        ? <Image imageUrl={book.cover} resizable={true}
            aspectRatio={{ contentMode: "fit" }}
            background={UI.coverBackground} clipShape={{ type: "rect", cornerRadius: UI.radius }}
            frame={{ width: UI.coverWidth, height: UI.coverHeight }} />
        : <Image systemName="book.closed" foregroundStyle={UI.secondary}
            aspectRatio={{ contentMode: "fit" }}
            background={UI.coverBackground} clipShape={{ type: "rect", cornerRadius: UI.radius }}
            frame={{ width: UI.coverWidth, height: UI.coverHeight }} />}
      <VStack alignment="leading" spacing={6}
        frame={{ maxWidth: "infinity", alignment: "leading" }}>
        <Text font="headline" lineLimit={2} foregroundStyle={UI.primary}>{book.title}</Text>
        <Text font="subheadline" lineLimit={1} foregroundStyle={UI.secondary}>
          {book.author || "作者未知"}
        </Text>
        <Text font="caption" lineLimit={1} foregroundStyle={UI.muted}>
          {metadata || book.language || "暂无出版信息"}
        </Text>
      </VStack>
      <Spacer />
    </HStack>
  </NavigationLink>
}

function ListStatus({ symbol, title, description, retry }: {
  symbol: string; title: string; description: string; retry?: () => void
}) {
  return <VStack alignment="center" spacing={10} padding={{ top: 34, bottom: 30 }}
    frame={{ maxWidth: "infinity" }}>
    <Image systemName={symbol} foregroundStyle={UI.secondary}
      frame={{ width: 30, height: 30 }} />
    <Text font="headline">{title}</Text>
    <Text font="caption" lineLimit={3} foregroundStyle={UI.secondary}>{description}</Text>
    {retry ? <Button title="重新加载" systemImage="arrow.clockwise"
      buttonStyle="bordered" action={retry} /> : null}
  </VStack>
}

export function Results({ books, busy, error, total, refresh, loadMore, canLoadMore, nextPage, showRefresh = false }: {
  books: Book[]; busy: boolean; error: string; total: number
  refresh: () => void; loadMore: () => void; canLoadMore: boolean; nextPage: number; showRefresh?: boolean
}) {
  function reachEnd() {
    if (canLoadMore && !busy && !error && books.length > 0) loadMore()
  }
  return <List listStyle="plain" onScrollGeometryChange={{
    of: "geometry",
    onChanged: (_old, geometry) => {
      const bottom = geometry.contentOffset.y + geometry.containerSize.height
      if (geometry.contentSize.height > geometry.containerSize.height &&
          bottom + 160 >= geometry.contentSize.height) reachEnd()
    }
  }}>
    {error ? <Section>
      <ListStatus symbol="wifi.exclamationmark" title="加载遇到问题"
        description={error} retry={refresh} />
    </Section> : null}
    {busy && books.length === 0 ? <Section>
      <VStack alignment="center" spacing={12} padding={30}
        frame={{ maxWidth: "infinity" }}>
        <ProgressView />
        <Text font="subheadline" foregroundStyle={UI.secondary}>正在加载书籍…</Text>
      </VStack>
    </Section> : null}
    {!busy && !error && books.length === 0 ? <Section>
      <ListStatus symbol="books.vertical" title="暂无书籍"
        description="试试其他关键词或筛选条件" />
    </Section> : null}
    {books.map(book => <Row key={book.id + ":" + book.hash} book={book} />)}
    <Section>
      {showRefresh ? <Button title="刷新" systemImage="arrow.clockwise" action={refresh} disabled={busy} /> : null}
      {busy && books.length > 0 ? <HStack spacing={8} padding={12}>
        <ProgressView />
        <Text font="caption" foregroundStyle={UI.secondary}>正在加载下一页…</Text>
      </HStack> : null}
      {canLoadMore && !busy && !error && books.length > 0 ?
        <Text key={"page-sentinel-" + nextPage} font="caption"
          foregroundStyle={UI.muted}
          onAppear={reachEnd}
          onScrollVisibilityChange={{ threshold: 0.2, onChanged: visible => {
            if (visible) reachEnd()
          }}}>继续下滑加载更多</Text> : null}
      {!canLoadMore && !busy && books.length > 0 ?
        <Text font="caption" foregroundStyle={UI.muted}>
          已显示全部{total > 0 ? " " + total + " " : ""}条结果
        </Text> : null}
    </Section>
  </List>
}
