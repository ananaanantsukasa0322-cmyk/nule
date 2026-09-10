// SupabaseはORDER BYなし・range指定なしのクエリを既定で1000件までに切り詰める（PostgRESTのdb-max-rows）。
// 件数が1000件を超えうる取得箇所ではこのヘルパーで全件を安全に取得する。
export async function fetchAllRows<T>(
  queryFactory: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  pageSize = 1000
): Promise<T[]> {
  const all: T[] = []
  let from = 0
  for (;;) {
    const { data, error } = await queryFactory(from, from + pageSize - 1)
    if (error) throw error
    const rows = data || []
    all.push(...rows)
    if (rows.length < pageSize) break
    from += pageSize
  }
  return all
}
