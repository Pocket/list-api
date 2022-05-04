// Ensure only an indexible type on the object is used for reordering results,
// and that the key matches
type ReorderMap<T, K extends keyof T> = {
  key: K;
  values: T[K] extends string | number | symbol ? T[K][] : never;
};

export function reorderResultByKey<T, K extends keyof T>(
  reorderMap: ReorderMap<T, K>,
  results: T[]
): T[] {
  const resMap = results.reduce((acc, element) => {
    acc[element[reorderMap.key]] = element;
    return acc;
  }, {} as any); // idk... help me with this index type
  return reorderMap.values.map((input) => resMap[input]);
}
