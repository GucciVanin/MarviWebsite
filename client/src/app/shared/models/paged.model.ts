/** One page of a larger list, as the history, directory and audit endpoints return it. */
export interface PagedResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalCount: number;
}
