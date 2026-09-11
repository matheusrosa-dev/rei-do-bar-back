export function isExactPermutation(
  submittedIds: string[],
  existingIds: Set<string>,
): boolean {
  return (
    submittedIds.length === existingIds.size &&
    new Set(submittedIds).size === submittedIds.length &&
    submittedIds.every((id) => existingIds.has(id))
  );
}
