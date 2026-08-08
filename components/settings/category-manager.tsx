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
  DialogDescription,
} from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, ChevronDown, ChevronRight, TriangleAlert } from "lucide-react";
import {
  createCategory,
  updateCategory,
  deleteCategory,
  createSubcategory,
} from "@/app/(app)/settings/actions";
import { useT } from "@/components/i18n/i18n-provider";
import type { MessageKey } from "@/lib/i18n/dictionaries/en";

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

type EditMode =
  | { type: "add-category" }
  | { type: "edit-category"; id: string }
  | { type: "add-subcategory"; parentId: string; parentColor: string }
  | { type: "edit-subcategory"; id: string }
  | null;

type DeleteTarget = {
  id: string;
  name: string;
  isCategory: boolean;
  childCount: number;
};

interface CategoryManagerProps {
  initialCategories: CategoryWithChildren[];
}

export function CategoryManager({ initialCategories }: CategoryManagerProps) {
  const router = useRouter();
  const [expandedIds, setExpandedIds] = useState<Set<string>>(
    new Set(initialCategories.map((c) => c.id))
  );
  const [editMode, setEditMode] = useState<EditMode>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [formName, setFormName] = useState("");
  const [formColor, setFormColor] = useState(PRESET_COLORS[0]);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const t = useT();

  const isCategory =
    editMode?.type === "add-category" || editMode?.type === "edit-category";

  function openEdit(mode: EditMode, name = "", color = PRESET_COLORS[0]) {
    setFormName(name);
    setFormColor(color);
    setError(null);
    setEditMode(mode);
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
      setError(t("settings.categories.nameRequired"));
      return;
    }
    setError(null);

    startTransition(async () => {
      try {
        if (editMode?.type === "add-category") {
          await createCategory({ name, color: formColor });
        } else if (editMode?.type === "edit-category") {
          await updateCategory(editMode.id, { name, color: formColor });
        } else if (editMode?.type === "add-subcategory") {
          await createSubcategory(editMode.parentId, { name, color: editMode.parentColor });
        } else if (editMode?.type === "edit-subcategory") {
          await updateCategory(editMode.id, { name, color: formColor });
        }
        setEditMode(null);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : t("settings.saveFailed"));
      }
    });
  }

  function confirmDelete(target: DeleteTarget) {
    setDeleteTarget(target);
  }

  function handleDeleteConfirmed() {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    startTransition(async () => {
      await deleteCategory(id);
      setDeleteTarget(null);
      router.refresh();
    });
  }

  const editTitles: Record<NonNullable<EditMode>["type"], MessageKey> = {
    "add-category": "settings.categories.addCategory",
    "edit-category": "settings.categories.editCategory",
    "add-subcategory": "settings.categories.addSubcategory",
    "edit-subcategory": "settings.categories.editSubcategory",
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>{t("settings.categories.title")}</CardTitle>
          <CardDescription>{t("settings.categories.description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {initialCategories.length === 0 && (
            <p className="text-sm text-muted-foreground py-4 text-center">
              {t("settings.categories.empty")}
            </p>
          )}

          {initialCategories.map((cat) => (
            <div key={cat.id} className="rounded-md border overflow-hidden">
              {/* Category row */}
              <div className="flex items-center gap-2 px-3 py-2 bg-background">
                <button
                  onClick={() => toggleExpand(cat.id)}
                  className="text-muted-foreground hover:text-foreground flex-shrink-0"
                  aria-label={
                    expandedIds.has(cat.id)
                      ? t("settings.categories.collapse")
                      : t("settings.categories.expand")
                  }
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
                  {t.plural("settings.categories.count", cat.children.length)}
                </span>
                <button
                  onClick={() => openEdit({ type: "edit-category", id: cat.id }, cat.name, cat.color)}
                  className="text-muted-foreground hover:text-foreground p-1 rounded"
                  aria-label={t("settings.categories.editCategory")}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() =>
                    confirmDelete({
                      id: cat.id,
                      name: cat.name,
                      isCategory: true,
                      childCount: cat.children.length,
                    })
                  }
                  disabled={isPending}
                  className="text-muted-foreground hover:text-destructive p-1 rounded"
                  aria-label={t("settings.categories.deleteCategory")}
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
                        style={{ backgroundColor: cat.color }}
                      />
                      <span className="flex-1 text-sm text-muted-foreground">{sub.name}</span>
                      <button
                        onClick={() =>
                          openEdit({ type: "edit-subcategory", id: sub.id }, sub.name, cat.color)
                        }
                        className="text-muted-foreground hover:text-foreground p-1 rounded"
                        aria-label={t("settings.categories.editSubcategory")}
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                      <button
                        onClick={() =>
                          confirmDelete({
                            id: sub.id,
                            name: sub.name,
                            isCategory: false,
                            childCount: 0,
                          })
                        }
                        disabled={isPending}
                        className="text-muted-foreground hover:text-destructive p-1 rounded"
                        aria-label={t("settings.categories.deleteSubcategory")}
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ))}

                  <button
                    onClick={() =>
                      openEdit(
                        { type: "add-subcategory", parentId: cat.id, parentColor: cat.color },
                        "",
                        cat.color
                      )
                    }
                    className="flex items-center gap-1.5 px-3 py-1.5 pl-10 w-full text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                  >
                    <Plus className="h-3 w-3" />
                    {t("settings.categories.addSubcategory")}
                  </button>
                </div>
              )}
            </div>
          ))}

          <Button
            variant="outline"
            size="sm"
            onClick={() => openEdit({ type: "add-category" })}
            className="w-full mt-2"
          >
            <Plus className="h-4 w-4 mr-1.5" />
            {t("settings.categories.addCategory")}
          </Button>
        </CardContent>
      </Card>

      {/* Add / Edit dialog */}
      <Dialog open={editMode !== null} onOpenChange={(open) => !open && setEditMode(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editMode ? t(editTitles[editMode.type]) : ""}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-1">
            <div className="space-y-1.5">
              <Label htmlFor="cat-name">{t("settings.categories.name")}</Label>
              <Input
                id="cat-name"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder={t("settings.categories.namePlaceholder")}
                onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                autoFocus
              />
              {error && <p className="text-xs text-destructive">{error}</p>}
            </div>

            {isCategory && (
              <div className="space-y-1.5">
                <Label>{t("settings.categories.color")}</Label>
                <div className="flex gap-2 flex-wrap">
                  {PRESET_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      aria-label={t("settings.categories.selectColor", { color })}
                      className={`w-7 h-7 rounded-full transition-transform hover:scale-110 ${
                        formColor === color ? "ring-2 ring-offset-2 ring-ring scale-110" : ""
                      }`}
                      style={{ backgroundColor: color }}
                      onClick={() => setFormColor(color)}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditMode(null)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={handleSubmit} disabled={isPending}>
              {isPending ? t("common.saving") : t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <Dialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <TriangleAlert className="h-5 w-5 text-destructive flex-shrink-0" />
              {t("settings.categories.delete.title", { name: deleteTarget?.name ?? "" })}
            </DialogTitle>
            <DialogDescription asChild>
              {/* Whole sentences, no inline <strong> around a fragment: the
                  emphasized words do not fall in the same place in every
                  language, and a sentence spliced from JSX cannot be
                  reordered by a translator. */}
              <div className="space-y-2 pt-1">
                {deleteTarget?.isCategory && deleteTarget.childCount > 0 && (
                  <p>
                    {t.plural(
                      "settings.categories.delete.children",
                      deleteTarget.childCount,
                    )}
                  </p>
                )}
                <p>
                  {deleteTarget?.isCategory && deleteTarget.childCount > 0
                    ? t("settings.categories.delete.transactionsWithChildren", {
                        name: deleteTarget.name,
                      })
                    : t("settings.categories.delete.transactions", {
                        name: deleteTarget?.name ?? "",
                      })}
                </p>
                <p>{t("settings.categories.delete.irreversible")}</p>
              </div>
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteConfirmed}
              disabled={isPending}
            >
              {isPending ? t("common.deleting") : t("common.delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
