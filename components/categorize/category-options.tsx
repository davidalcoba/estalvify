interface Category {
  id: string;
  name: string;
  color: string;
  parentId: string | null;
}

export function CategoryOptions({ categories }: { categories: Category[] }) {
  const parents = categories.filter((c) => !c.parentId);
  const childrenMap: Record<string, Category[]> = {};

  for (const category of categories) {
    if (category.parentId) {
      childrenMap[category.parentId] ??= [];
      childrenMap[category.parentId].push(category);
    }
  }

  return (
    <>
      {parents.map((parent) => {
        const children = childrenMap[parent.id] ?? [];
        if (children.length === 0) {
          return (
            <option key={parent.id} value={parent.id}>
              {parent.name}
            </option>
          );
        }

        return (
          <optgroup key={parent.id} label={parent.name}>
            <option value={parent.id}>{parent.name}</option>
            {children.map((child) => (
              <option key={child.id} value={child.id}>
                {child.name}
              </option>
            ))}
          </optgroup>
        );
      })}
    </>
  );
}

export type { Category };
