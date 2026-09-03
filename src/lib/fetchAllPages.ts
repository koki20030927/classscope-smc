const DEFAULT_PAGE_SIZE = 1000;

type PageResult<T, E> = {
  data: T[] | null;
  error: E | null;
};

export async function fetchAllPages<T, E>(
  fetchPage: (from: number, to: number) => Promise<PageResult<T, E>>,
  pageSize = DEFAULT_PAGE_SIZE,
): Promise<PageResult<T, E>> {
  const rows: T[] = [];

  for (let from = 0; ; from += pageSize) {
    const result = await fetchPage(from, from + pageSize - 1);
    if (result.error) return { data: null, error: result.error };

    const page = result.data ?? [];
    rows.push(...page);
    if (page.length < pageSize) return { data: rows, error: null };
  }
}
