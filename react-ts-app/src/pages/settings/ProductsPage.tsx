import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Plus, Pencil, Check, X } from 'lucide-react';
import { useCapability } from '../../hooks';
import { fetchProducts, createProduct, updateProduct, deleteProduct } from './productsApi';
import type { Product } from './productsApi';
import { ConfirmDialog } from '../../components/organizations/ConfirmDialog';
import { ApiError } from '../../lib/apiClient';
import { BUTTON, Badge, EmptyState, ErrorState, FIELD_ERROR, ICON_BUTTON, INPUT, INVALID, LoadingState, NUM, OverflowMenu, PRIMARY, QUIET, ROW_ACTIONS, SettingsFrame, SettingsNote, SettingsRow, SettingsSection, TYPE } from '../../components/ui';
import { settingsTitle } from './workspaceSettingsNav';

/**
 * Settings > Products: what this organisation sells.
 *
 * The one list every product picker and the Product Usage dashboard read
 * from. It replaced a free-text field, and the shape of this page follows
 * from the two things a list can do that a text box could not:
 *
 * - **Rename fixes the name everywhere at once.** Customers point at the
 *   row, so a typo is one edit here rather than one per customer.
 * - **Retire, don't delete, once anyone is on it.** Retiring takes a product
 *   out of the pickers and leaves every figure ever reported against it
 *   intact. Delete is offered only for a product with no customers: the
 *   backend refuses otherwise, and a button that will be refused is worse
 *   than no button.
 *
 * Everyone can see the list (the pickers need it); adding, renaming and
 * retiring need `manage_org_settings`. A CSM able to add "Prodcut A" from a
 * form would be the free-text problem coming back through a different door.
 */
export function ProductsPage() {
  const canManage = useCapability('manage_org_settings');

  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [rowError, setRowError] = useState<{ id: number; message: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);

  // Focus that has to wait for the next render, because the control that held
  // it unmounts (the Add product opener, an edit row, a deleted row).
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const catalogueRef = useRef<HTMLHeadingElement>(null);
  const pendingFocus = useRef<(() => void) | null>(null);
  const deleted = useRef(false);
  useEffect(() => {
    const run = pendingFocus.current;
    pendingFocus.current = null;
    run?.();
  });
  function focusInList(label: string) {
    pendingFocus.current = () => listRef.current?.querySelector<HTMLElement>(`button[aria-label="${CSS.escape(label)}"]`)?.focus();
  }
  function focusAddProduct() {
    pendingFocus.current = () => addButtonRef.current?.focus();
  }

  useEffect(() => {
    async function load() {
      try {
        setProducts(await fetchProducts());
      } catch (err) {
        setLoadError(err instanceof ApiError ? err.message : 'Could not load products.');
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, []);

  // Active first, retired after, each alphabetical: the API is alphabetical
  // only, and a retired product between two live ones reads as a mistake.
  const ordered = [...products].sort(
    (a, b) => Number(b.is_active) - Number(a.is_active) || a.name.localeCompare(b.name)
  );
  const retiredCount = products.filter((p) => !p.is_active).length;

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    if (!newName.trim() || isAdding) return;
    setAddError(null);
    setIsAdding(true);
    try {
      const created = await createProduct({ name: newName.trim() });
      setProducts((current) => [...current, created]);
      setNewName('');
      setShowAdd(false);
      focusAddProduct();
    } catch (err) {
      setAddError(err instanceof ApiError ? err.message : 'Could not add that product.');
    } finally {
      setIsAdding(false);
    }
  }

  function startEditing(product: Product) {
    setEditingId(product.id);
    setEditName(product.name);
    setRowError(null);
  }

  async function saveEdit(id: number) {
    if (!editName.trim()) return;
    setRowError(null);
    try {
      const updated = await updateProduct(id, { name: editName.trim() });
      setProducts((current) => current.map((p) => (p.id === id ? updated : p)));
      setEditingId(null);
      focusInList(`Rename ${updated.name}`);
    } catch (err) {
      setRowError({
        id,
        message: err instanceof ApiError ? err.message : 'Could not rename that product.',
      });
    }
  }

  function cancelEdit(product: Product) {
    setEditingId(null);
    focusInList(`Rename ${product.name}`);
  }

  async function setActive(product: Product, isActive: boolean) {
    setRowError(null);
    try {
      const updated = await updateProduct(product.id, { is_active: isActive });
      setProducts((current) => current.map((p) => (p.id === product.id ? updated : p)));
      // The row moves between the live and retired groups: keep focus on its menu.
      focusInList(`More actions for ${updated.name}`);
    } catch (err) {
      setRowError({
        id: product.id,
        message:
          err instanceof ApiError
            ? err.message
            : `Could not ${isActive ? 'bring back' : 'retire'} that product.`,
      });
      // The row stays where it was: its menu again, with the alert under it.
      focusInList(`More actions for ${product.name}`);
    }
  }

  function cancelAdd() {
    setShowAdd(false);
    setAddError(null);
    setNewName('');
    focusAddProduct();
  }

  const customersText = (n: number) =>
    n === 0 ? (
      'Nobody on it'
    ) : (
      <>
        <span className={NUM}>{n}</span> {n === 1 ? 'customer' : 'customers'}
      </>
    );

  return (
    <SettingsFrame
      title={settingsTitle('/settings/products')}
      intro="What this organisation sells: the list every product picker and the Product Usage dashboard read from."
      note={
        canManage ? undefined : (
          <SettingsNote icon="lock">You can see the list but not change it: adding, renaming and retiring products needs organisation settings access.</SettingsNote>
        )
      }
    >
      {showAdd && canManage ? (
        <form onSubmit={handleAdd} aria-label="New product">
          <SettingsSection
            title="New product"
            footer={
              <>
                <button type="button" onClick={cancelAdd} className={QUIET}>
                  Cancel
                </button>
                <button type="submit" aria-disabled={!newName.trim() || isAdding || undefined} className={PRIMARY}>
                  {isAdding ? 'Adding…' : 'Add'}
                </button>
              </>
            }
          >
            <SettingsRow label="Name" htmlFor="new-product-name" error={addError ?? undefined} errorId="new-product-error">
              <input
                id="new-product-name"
                type="text"
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                placeholder="Integrations Module"
                autoFocus
                aria-invalid={Boolean(addError)}
                aria-describedby={addError ? 'new-product-error' : undefined}
                className={`${INPUT} ${INVALID}`}
              />
            </SettingsRow>
          </SettingsSection>
        </form>
      ) : null}

      <SettingsSection
        title="Catalogue"
        headingRef={catalogueRef}
        description={
          <>
            Names are unique, ignoring case. Renaming a product renames it on every customer at once.
            {retiredCount > 0 ? ' Retired products stay on the customers already recorded against them and on the Product Usage dashboard; they are only hidden from the pickers.' : ''}
          </>
        }
        action={
          canManage && !showAdd ? (
            <button ref={addButtonRef} type="button" onClick={() => setShowAdd(true)} className={BUTTON}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              Add product
            </button>
          ) : undefined
        }
        list="Products"
        listRef={listRef}
        state={
          isLoading ? (
            <LoadingState label="Loading products" />
          ) : loadError ? (
            <ErrorState message={loadError} />
          ) : products.length === 0 ? (
            <EmptyState title="No products yet" detail="Until one is added, no customer can be recorded on a product and the Product Usage dashboard has nothing to compare." />
          ) : undefined
        }
      >
        {ordered.map((product) => (
          <li key={product.id} className="group relative flex min-h-14 flex-col justify-center gap-1 px-4 py-3">
            {editingId === product.id ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={editName}
                  onChange={(event) => setEditName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') void saveEdit(product.id);
                    if (event.key === 'Escape') cancelEdit(product);
                  }}
                  aria-label={`New name for ${product.name}`}
                  aria-invalid={rowError?.id === product.id || undefined}
                  aria-describedby={rowError?.id === product.id ? `product-${product.id}-error` : undefined}
                  autoFocus
                  className={`${INPUT} ${INVALID} flex-1`}
                />
                <button type="button" onClick={() => void saveEdit(product.id)} aria-label={`Save name for ${product.name}`} className={ICON_BUTTON}>
                  <Check className="h-4 w-4" aria-hidden="true" />
                </button>
                <button type="button" onClick={() => cancelEdit(product)} aria-label="Cancel renaming" className={ICON_BUTTON}>
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <div className="flex min-w-0 flex-1 flex-col">
                  <p title={product.name} className={`${TYPE.body} truncate font-semibold`}>
                    {product.name}
                  </p>
                  <p className={TYPE.meta}>{customersText(product.customers)}</p>
                </div>
                {product.is_active ? null : <Badge>Retired</Badge>}
                {canManage ? (
                  <div className={ROW_ACTIONS}>
                    <button type="button" onClick={() => startEditing(product)} aria-label={`Rename ${product.name}`} className={ICON_BUTTON}>
                      <Pencil className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <OverflowMenu
                      label={`More actions for ${product.name}`}
                      items={[
                        product.is_active
                          ? { key: 'retire', label: 'Retire', onSelect: () => void setActive(product, false) }
                          : { key: 'restore', label: 'Bring back', onSelect: () => void setActive(product, true) },
                        // Delete only when nobody is on it: the backend refuses otherwise, and retire is what people want then.
                        ...(product.customers === 0 ? [{ key: 'delete', label: 'Delete', onSelect: () => setDeleteTarget(product), danger: true }] : []),
                      ]}
                    />
                  </div>
                ) : null}
              </div>
            )}
            {rowError?.id === product.id ? (
              <p id={`product-${product.id}-error`} role="alert" className={FIELD_ERROR}>
                {rowError.message}
              </p>
            ) : null}
          </li>
        ))}
      </SettingsSection>

      {deleteTarget && (
        <ConfirmDialog
          title={`Delete ${deleteTarget.name}?`}
          message="Nobody is recorded on it, so nothing else changes. If it was ever sold, retire it instead: deleting is for a product added by mistake."
          confirmLabel="Delete"
          danger
          onConfirm={async () => {
            try {
              await deleteProduct(deleteTarget.id);
            } catch (err) {
              // ConfirmDialog prints a thrown string; an ApiError's message is the backend saying who is still on it.
              throw err instanceof ApiError ? err.message : 'Could not delete that product.';
            }
            setProducts((current) => current.filter((p) => p.id !== deleteTarget.id));
            deleted.current = true;
          }}
          onClose={() => {
            if (deleted.current) {
              deleted.current = false;
              // The row's menu is gone: the list takes focus, or Add product when none are
              // left; with the add form open (no opener) the Catalogue heading.
              pendingFocus.current = () => (listRef.current ?? addButtonRef.current ?? catalogueRef.current)?.focus();
            }
            setDeleteTarget(null);
          }}
        />
      )}
    </SettingsFrame>
  );
}
