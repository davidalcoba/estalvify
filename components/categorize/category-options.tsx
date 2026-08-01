// Shared category shape used by CategorySelect and callers.
// (The former CategoryOptions <option> renderer was replaced by CategorySelect.)
export interface Category {
  id: string;
  name: string;
  color: string;
  parentId: string | null;
}
