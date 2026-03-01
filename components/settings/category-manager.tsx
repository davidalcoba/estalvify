"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, ChevronDown, ChevronRight } from "lucide-react";
import {
  createCategory,
  updateCategory,
  deleteCategory,
  createSubcategory,
} from "@/app/(app)/settings/actions";

const PRESET_COLORS = [
  "#6366f1",
  "#8b5cf6",
  "#ec4899",
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#14b8a6",
  "#3b82f6",
  "#6b7280",
];

export type CategoryWithChildren = {
  id: string;
  name: string;
  color: string;
  children: { id: string; name: string; color: string }[];
};

type DialogMode =
  | { type: "add-category" }
  | { type: "edit-category"; id: string }
  | { type: "add-subcategory"; parentId: string; parentColor: string }
  | { type: "edit-subcategory"; id: string }
  | null;

interface CategoryManagerProps {
  initialCategories: CategoryWithChildren[];
}

export function CategoryManager({ initialCategories }: CategoryManagerProps) {
  const router = useRouter();
  const [expandedIds, setExpandedIds] = useState<Set<string>>(
    new Set(initialCategories.map((c) => c.id))
  );
  const [dialog, setDialog] = useState<DialogMode>(null);
  const [formName, setFormName] = useState("");
  const [formColor, setFormColor] = useState(PRESET_COLORS[0]);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function openDialog(mode: DialogMode, name = "", color = PRESET_COLORS[0]) {
    setFormName(name);
    setFormColor(color);
    setError(null);
    setDialog(mode);
  }

  function toggleExpand(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleSubmit() {
    const name = formName.trim();
    if (!name) {
      setError("Name is required");
      return;
    }
    setError(null);

    startTransition(async () => {
      try {
        if (dialog?.type === "add-category") {
          await createCategory({ name, color: formColor });
        } else if (dialog?.type === "edit-category") {
          await updateCategory(dialog.id, { name, color: formColor });
        } else if (dialog?.type === "add-subcategory") {
          await createSubcategory(dialog.parentId, { name, color: formColor });
        } else if (dialog?.type === "edit-subcategory") {
          await updateCategory(dialog.id, { name, color: formColor });
        }
        setDialog(null);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save");
      }
    });
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      await deleteCategory(id);
      router.refresh();
    });
  }

  const dialogTitles: Record<NonNullable<DialogMode>["type"], string> = {
    "add-category": "Add category",
    "edit-category": "Edit category",
    "add-subcategory": "Add subcategory",
    "edit-subcategory": "Edit subcategory",
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Categories</CardTitle>
          <CardDescription>
            Organize your transactions with categories and subcategories. These are personal and only visible to you.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {initialCategories.length === 0 && (
            <p className="text-sm text-muted-foreground py-4 text-center">No categories yet.</p>
          )}

          {initialCategories.map((cat) => (
            <div key={cat.id} className="rounded-md border overflow-hidden">
              {/* Category row */}
              <div className="flex items-center gap-2 px-3 py-2 bg-background">
                <button
                  onClick={() => toggleExpand(cat.id)}
                  className="text-muted-foreground hover:text-foreground flex-shrink-0"
                  aria-label={expandedIds.has(cat.id) ? "Collapse" : "Expand"}
                >
                  {expandedIds.has(cat.id) ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                </button>
                <div
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: cat.color }}
                />
                <span className="flex-1 text-sm font-medium">{cat.name}</span>
                <span className="text-xs text-muted-foreground mr-1">
                  {cat.children.length}{" "}
                  {cat.children.length === 1 ? "subcategory" : "subcategories"}
                </span>
                <button
                  onClick={() => openDialog({ type: "edit-category", id: cat.id }, cat.name, cat.color)}
                  className="text-muted-foreground hover:text-foreground p-1 rounded"
                  aria-label="Edit category"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => handleDelete(cat.id)}
                  disabled={isPending}
                  className="text-muted-foreground hover:text-destructive p-1 rounded"
                  aria-label="Delete category"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Subcategories */}
              {expandedIds.has(cat.id) && (
                <div className="border-t bg-muted/30">
                  {cat.children.map((sub) => (
                    <div
                      key={sub.id}
                      className="flex items-center gap-2 px-3 py-1.5 pl-10 border-b last:border-0"
                    >
                      <div
                        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: sub.color }}
                      />
                      <span className="flex-1 text-sm text-muted-foreground">{sub.name}</span>
                      <button
                        onClick={() =>
                          openDialog({ type: "edit-subcategory", id: sub.id }, sub.name, sub.color)
                        }
                        className="text-muted-foreground hover:text-foreground p-1 rounded"
                        aria-label="Edit subcategory"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                      <button
                        onClick={() => handleDelete(sub.id)}
                        disabled={isPending}
                        className="text-muted-foreground hover:text-destructive p-1 rounded"
                        aria-label="Delete subcategory"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ))}

                  <button
                    onClick={() =>
                      openDialog({ type: "add-subcategory", parentId: cat.id, parentColor: cat.color }, "", cat.color)
                    }
                    className="flex items-center gap-1.5 px-3 py-1.5 pl-10 w-full text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                  >
                    <Plus className="h-3 w-3" />
                    Add subcategory
                  </button>
                </div>
              )}
            </div>
          ))}

          <Button
            variant="outline"
            size="sm"
            onClick={() => openDialog({ type: "add-category" })}
            className="w-full mt-2"
          >
            <Plus className="h-4 w-4 mr-1.5" />
            Add category
          </Button>
        </CardContent>
      </Card>

      {/* Add / Edit dialog */}
      <Dialog open={dialog !== null} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialog ? dialogTitles[dialog.type] : ""}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-1">
            <div className="space-y-1.5">
              <Label htmlFor="cat-name">Name</Label>
              <Input
                id="cat-name"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="Category name"
                onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                autoFocus
              />
              {error && <p className="text-xs text-destructive">{error}</p>}
            </div>

            <div className="space-y-1.5">
              <Label>Color</Label>
              <div className="flex gap-2 flex-wrap">
                {PRESET_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    aria-label={`Select color ${color}`}
                    className={`w-7 h-7 rounded-full transition-transform hover:scale-110 ${
                      formColor === color ? "ring-2 ring-offset-2 ring-ring scale-110" : ""
                    }`}
                    style={{ backgroundColor: color }}
                    onClick={() => setFormColor(color)}
                  />
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialog(null)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={isPending}>
              {isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
