import React, { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { TestInfoPanel } from "./components/testing/TestInfoPanel";
import { PageHeader } from "./components/layout/PageHeader";
import { api, authenticatedFetch, getSessionUser } from "./authClient";
import { Braces, Database, FileUp, Table2, TimerReset } from "lucide-react";
function Info({
  name,
  concepts,
  endpoints,
}: {
  name: string;
  concepts: string;
  endpoints: string;
}) {
  return (
    <TestInfoPanel name={name} concepts={concepts} endpoints={endpoints} />
  );
}
type Row = {
  id: number;
  name: string;
  email: string;
  department: string;
  role: string;
  status: string;
  score: number;
};
export function Phase3Tables() {
  const loc = useLocation(),
    virtual = loc.pathname.endsWith("/virtual"),
    isStatic = loc.pathname.endsWith("/static"),
    [rows, setRows] = useState<Row[]>([]),
    [search, setSearch] = useState(""),
    [appliedSearch, setAppliedSearch] = useState(""),
    [status, setStatus] = useState(""),
    [page, setPage] = useState(1),
    [size, setSize] = useState(10),
    [sort, setSort] = useState("id"),
    [direction, setDirection] = useState("asc"),
    [secondarySort, setSecondarySort] = useState(""),
    [total, setTotal] = useState(100),
    [selected, setSelected] = useState<number[]>([]),
    [expanded, setExpanded] = useState<number | null>(null),
    [hidden, setHidden] = useState<string[]>([]),
    [loading, setLoading] = useState(true),
    [message, setMessage] = useState(""),
    [columns, setColumns] = useState([
      "id",
      "name",
      "email",
      "department",
      "role",
      "status",
      "score",
    ]),
    [visibleCount, setVisibleCount] = useState(25),
    loadRequest = useRef(0),
    nextLocalId = useRef(1000);
  const load = async () => {
    const request = ++loadRequest.current;
    setLoading(true);
    try {
      const result = await api<{ data: unknown[]; total: number }>(
        `/api/table-users?page=${page}&size=${virtual ? 100 : size}&search=${encodeURIComponent(appliedSearch)}&status=${encodeURIComponent(status)}&sort=${sort}&direction=${direction}&sorts=${sort}:${direction}${secondarySort ? `,${secondarySort}:asc` : ""}`,
      );
      if (request !== loadRequest.current) return;
      setRows((result?.data || []) as Row[]);
      setTotal((result?.total || 0) as number);
      setSelected([]);
      setExpanded(null);
      if (virtual) setVisibleCount(Math.min(25, (result?.data?.length || 0) as number));
    } catch (error) {
      if (request !== loadRequest.current) return;
      setRows([]);
      setTotal(0);
      setMessage(
        error instanceof Error ? error.message : "Unable to load table data",
      );
    } finally {
      if (request === loadRequest.current) setLoading(false);
    }
  };
  useEffect(() => {
    if (isStatic) {
      loadRequest.current += 1;
      const staticRows = Array.from({ length: 10 }, (_, i) => ({
        id: i + 1,
        name: `Static User ${String(i + 1).padStart(2, "0")}`,
        email: `static${i + 1}@testlab.local`,
        department: "Quality",
        role: "USER",
        status: "ACTIVE",
        score: 80 + i,
      }))
        .filter(
          (row) =>
            (!appliedSearch ||
              Object.values(row).some((value) =>
                String(value)
                  .toLowerCase()
                  .includes(appliedSearch.toLowerCase()),
              )) &&
            (!status || row.status === status),
        )
        .sort((a, b) => {
          const comparison = String(a[sort as keyof Row]).localeCompare(
            String(b[sort as keyof Row]),
            undefined,
            { numeric: true },
          );
          if (comparison)
            return direction === "desc" ? -comparison : comparison;
          return secondarySort
            ? String(a[secondarySort as keyof Row]).localeCompare(
                String(b[secondarySort as keyof Row]),
                undefined,
                { numeric: true },
              )
            : 0;
        });
      setTotal(staticRows.length);
      setRows(staticRows.slice((page - 1) * size, page * size));
      setSelected([]);
      setExpanded(null);
      setLoading(false);
    } else void load();
  }, [
    page,
    size,
    sort,
    direction,
    secondarySort,
    status,
    appliedSearch,
    isStatic,
    virtual,
  ]);
  const toggleSort = (column: string, multi = false) => {
      setPage(1);
      if (multi && column !== sort) {
        setSecondarySort((current) => (current === column ? "" : column));
        return;
      }
      setSecondarySort("");
      if (sort === column)
        setDirection((current) => (current === "asc" ? "desc" : "asc"));
      else {
        setSort(column);
        setDirection("asc");
      }
    },
    update = (id: number, key: keyof Row, value: string) =>
      setRows((current) =>
        current.map((row) => (row.id === id ? { ...row, [key]: value } : row)),
      );
  const applySearch = () => {
    setPage(1);
    if (!isStatic && appliedSearch === search && page === 1) void load();
    else setAppliedSearch(search);
  };
  if (virtual)
    return (
      <>
        <PageHeader
          icon={Table2}
          title="Virtual Table"
          description="Practice virtual viewports, incremental loading and deterministic scrolling."
          onReset={() => location.reload()}
        />
        <p>
          Rendering 100 deterministic records in a fixed-height scroll viewport.
        </p>
        <div
          className="virtual-table"
          role="grid"
          onScroll={(event) => {
            const element = event.currentTarget;
            if (
              element.scrollTop + element.clientHeight >=
              element.scrollHeight - 20
            )
              setVisibleCount((value) => Math.min(rows.length, value + 20));
          }}
        >
          {rows.slice(0, visibleCount).map((row) => (
            <div
              role="row"
              className="virtual-row"
              key={row.id}
              data-testid={`virtual-row-${row.id}`}
            >
              <span role="gridcell">{row.id}</span>
              <span role="gridcell">{row.name}</span>
              <span role="gridcell">{row.email}</span>
              <span role="gridcell">{row.score}</span>
            </div>
          ))}
        </div>
        <output role="status">
          Loaded {Math.min(visibleCount, rows.length)} of {total}
        </output>
        <Info
          name="Virtual table"
          concepts="virtual viewport, scrolling, deterministic 100 rows, loading state"
          endpoints="GET /api/table-users"
        />
      </>
    );
  return (
    <>
      <PageHeader
        icon={Table2}
        title={isStatic ? "Static Table" : "Dynamic Data Grid"}
        description="Practice production-style sorting, filtering, selection and pagination."
        onReset={() => location.reload()}
      />
      <div className="panel table-controls">
        <label>
          Global search
          <input
            aria-label="Global search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && applySearch()}
          />
        </label>
        <label>
          Status filter
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All</option>
            <option>ACTIVE</option>
            <option>INACTIVE</option>
          </select>
        </label>
        <label>
          Page size
          <select
            value={size}
            onChange={(e) => {
              setSize(Number(e.target.value));
              setPage(1);
            }}
          >
            {[5, 10, 20, 50].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </label>
        <button onClick={applySearch}>Apply search</button>
        <button
          className="secondary"
          onClick={() => setColumns([...columns].reverse())}
        >
          Reverse column order
        </button>
        <button
          onClick={() => {
            setRows((current) => [
              ...current,
              {
                id: ++nextLocalId.current,
                name: "New Local User",
                email: "new@testlab.local",
                department: "Quality",
                role: "USER",
                status: "ACTIVE",
                score: 75,
              },
            ]);
            setTotal((current) => current + 1);
            setMessage("Row added locally");
          }}
        >
          Add row
        </button>
        <button
          disabled={!selected.length}
          onClick={() => {
            setRows((current) =>
              current.filter((row) => !selected.includes(row.id)),
            );
            setTotal((current) => Math.max(0, current - selected.length));
            setMessage(`${selected.length} rows removed`);
            setSelected([]);
          }}
        >
          Bulk delete
        </button>
      </div>
      <details>
        <summary>Show/hide columns</summary>
        {columns.map((column) => (
          <label className="check" key={column}>
            <input
              type="checkbox"
              checked={!hidden.includes(column)}
              onChange={() =>
                setHidden((current) =>
                  current.includes(column)
                    ? current.filter((x) => x !== column)
                    : [...current, column],
                )
              }
            />
            {column}
          </label>
        ))}
      </details>
      {loading ? (
        <div role="status" className="skeleton">
          Loading table…
        </div>
      ) : rows.length === 0 ? (
        <div role="status" className="empty-state">
          No matching users
        </div>
      ) : (
        <div className="table-wrap">
          <table data-testid="user-grid">
            <caption>Deterministic users — {total} matching records</caption>
            <thead>
              <tr>
                <th>
                  <input
                    aria-label="Select all rows"
                    type="checkbox"
                    checked={
                      rows.length > 0 &&
                      rows.every((row) => selected.includes(row.id))
                    }
                    onChange={(e) =>
                      setSelected(e.target.checked ? rows.map((x) => x.id) : [])
                    }
                  />
                </th>
                {columns
                  .filter((c) => !hidden.includes(c))
                  .map((column) => (
                    <th key={column}>
                      {isStatic || column !== "role" ? (
                        <button
                          className="table-sort"
                          onClick={(event) =>
                            toggleSort(column, event.shiftKey)
                          }
                        >
                          {column}{" "}
                          {sort === column
                            ? direction === "asc"
                              ? "▲"
                              : "▼"
                            : secondarySort === column
                              ? "△²"
                              : ""}
                        </button>
                      ) : (
                        column
                      )}
                    </th>
                  ))}
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <React.Fragment key={row.id}>
                  <tr data-testid={`user-row-${row.id}`}>
                    <td>
                      <input
                        aria-label={`Select ${row.name}`}
                        type="checkbox"
                        checked={selected.includes(row.id)}
                        onChange={() =>
                          setSelected((current) =>
                            current.includes(row.id)
                              ? current.filter((x) => x !== row.id)
                              : [...current, row.id],
                          )
                        }
                      />
                    </td>
                    {columns
                      .filter((c) => !hidden.includes(c))
                      .map((column) => (
                        <td key={column}>
                          {["name", "email", "department"].includes(column) ? (
                            <input
                              aria-label={`${column} for ${row.id}`}
                              value={String(row[column as keyof Row])}
                              onChange={(e) =>
                                update(
                                  row.id,
                                  column as keyof Row,
                                  e.target.value,
                                )
                              }
                            />
                          ) : (
                            String(row[column as keyof Row])
                          )}
                        </td>
                      ))}
                    <td>
                      <button
                        onClick={() =>
                          setExpanded(expanded === row.id ? null : row.id)
                        }
                      >
                        Details
                      </button>
                      <button
                        className="danger"
                        onClick={() => {
                          setRows((current) =>
                            current.filter((x) => x.id !== row.id),
                          );
                          setSelected((current) =>
                            current.filter((id) => id !== row.id),
                          );
                          setTotal((current) => Math.max(0, current - 1));
                          if (expanded === row.id) setExpanded(null);
                        }}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                  {expanded === row.id && (
                    <tr>
                      <td
                        colSpan={
                          columns.filter((column) => !hidden.includes(column))
                            .length + 2
                        }
                      >
                        <strong>Expanded row {row.id}</strong>
                        <pre>{JSON.stringify(row, null, 2)}</pre>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="pagination">
        <button disabled={page === 1} onClick={() => setPage(page - 1)}>
          Previous
        </button>
        <span>
          Page {page} of {Math.max(1, Math.ceil(total / size))}
        </span>
        <button
          disabled={page >= Math.ceil(total / size)}
          onClick={() => setPage(page + 1)}
        >
          Next
        </button>
      </div>
      <output role="status">{message}</output>
      <Info
        name={isStatic ? "Static table" : "Dynamic data grid"}
        concepts="sorting, filtering, column search, pagination, page size, selection, inline edit, add/delete, expand, bulk actions, column visibility, loading/empty state, server operations"
        endpoints="GET /api/table-users"
      />
    </>
  );
}

type Product = {
  id: number;
  name: string;
  category: string;
  price: number;
  inventory: number;
  status: string;
  version: number;
  updated_at: string;
};
type ProductForm = Pick<
  Product,
  "name" | "category" | "price" | "inventory" | "status"
>;
const defaultProductForm = (): ProductForm => ({
  name: "Automation Product",
  category: "Hardware",
  price: 49.99,
  inventory: 10,
  status: "ACTIVE",
});
const storedUserIsAdmin = () => getSessionUser()?.role === "ADMIN";
export function Phase3Products() {
  const admin = storedUserIsAdmin(),
    [products, setProducts] = useState<Product[]>([]),
    [query, setQuery] = useState(""),
    [appliedQuery, setAppliedQuery] = useState(""),
    [category, setCategory] = useState(""),
    [sort, setSort] = useState("id"),
    [page, setPage] = useState(1),
    [total, setTotal] = useState(0),
    [editing, setEditing] = useState<Product | null>(null),
    [history, setHistory] = useState<Array<{ snapshot: unknown; action: string }>>([]),
    [message, setMessage] = useState(""),
    [loading, setLoading] = useState(true),
    [undo, setUndo] = useState<{ id: number; token: string } | null>(null),
    [image, setImage] = useState<File | null>(null),
    [form, setForm] = useState<ProductForm>(defaultProductForm),
    loadRequest = useRef(0),
    imageInput = useRef<HTMLInputElement | null>(null);
  const load = async () => {
    const request = ++loadRequest.current;
    setLoading(true);
    try {
      const result = await api<{ data: unknown[]; total: number }>(
        `/api/products?page=${page}&size=8&q=${encodeURIComponent(appliedQuery)}&category=${encodeURIComponent(category)}&sort=${sort}`,
      );
      if (request !== loadRequest.current) return;
      setProducts((result?.data || []) as Product[]);
      setTotal((result?.total || 0) as number);
    } catch (error) {
      if (request !== loadRequest.current) return;
      setProducts([]);
      setTotal(0);
      setMessage(
        error instanceof Error ? error.message : "Unable to load products",
      );
    } finally {
      if (request === loadRequest.current) setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, [page, category, sort, appliedQuery]);
  const resetEditor = () => {
    setEditing(null);
    setForm(defaultProductForm());
    setImage(null);
    if (imageInput.current) imageInput.current.value = "";
  };
  const applySearch = () => {
    setPage(1);
    if (appliedQuery === query && page === 1) void load();
    else setAppliedQuery(query);
  };
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    let result: Product;
    try {
      result = editing
        ? await api<Product>(`/api/products/${editing.id}`, {
            method: "PUT",
            body: JSON.stringify({ ...form, version: editing.version }),
          })
        : await api<Product>("/api/products", {
            method: "POST",
            body: JSON.stringify(form),
          });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Save failed");
      return;
    }
    let imageError = "";
    if (image) {
      try {
        const data = new FormData();
        data.append("image", image);
        await api<Record<string, unknown>>(`/api/products/${result.id}/image`, {
          method: "POST",
          body: data,
        });
      } catch (error) {
        imageError =
          error instanceof Error ? error.message : "Image upload failed";
      }
    }
    resetEditor();
    setMessage(
      imageError
        ? `${result.name} saved, but its image failed: ${imageError}`
        : `${result.name} saved`,
    );
    await load();
  };
  const edit = (p: Product) => {
    setEditing(p);
    setForm({
      name: p.name,
      category: p.category,
      price: p.price,
      inventory: p.inventory,
      status: p.status,
    });
    setImage(null);
    if (imageInput.current) imageInput.current.value = "";
  };
  const remove = async (p: Product) => {
    if (!window.confirm(`Delete ${p.name}?`)) return;
    try {
      const result = await api<{ undoToken: string }>(`/api/products/${p.id}`, { method: "DELETE" });
      setUndo({ id: p.id, token: result?.undoToken || "" });
      setMessage(`${p.name} deleted — undo available`);
      if (products.length === 1 && page > 1) setPage((value) => value - 1);
      else await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Delete failed");
    }
  };
  const restore = async () => {
    if (!undo) return;
    try {
      await api<Record<string, unknown>>(`/api/products/${undo.id}/undo`, {
        method: "POST",
        body: JSON.stringify({ undoToken: undo.token }),
      });
      setUndo(null);
      setMessage("Deletion undone");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Undo failed");
    }
  };
  const duplicate = async (product: Product) => {
    try {
      await api<Record<string, unknown>>(`/api/products/${product.id}/duplicate`, {
        method: "POST",
        body: "{}",
      });
      setMessage("Product duplicated");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Duplicate failed");
    }
  };
  const showHistory = async (id: number) => {
    try {
      const result = await api<{ data: unknown[] }>(`/api/products/${id}/history`);
      setHistory((result?.data || []) as Array<{ snapshot: unknown; action: string }>);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "History failed");
    }
  };
  return (
    <>
      <PageHeader
        icon={Database}
        title="Product CRUD"
        description="Practice persistent product workflows, conflicts, history and undo."
        difficulty="Advanced"
        onReset={() => location.reload()}
      />
      <div className="panel product-toolbar">
        <label>
          Search
          <input
            aria-label="Search products"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && applySearch()}
          />
        </label>
        <button onClick={applySearch}>Search</button>
        <label>
          Category
          <select
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All</option>
            <option>Hardware</option>
            <option>Software</option>
            <option>Accessories</option>
          </select>
        </label>
        <label>
          Sort
          <select
            value={sort}
            onChange={(e) => {
              setSort(e.target.value);
              setPage(1);
            }}
          >
            <option value="id">ID</option>
            <option value="name">Name</option>
            <option value="price">Price</option>
            <option value="inventory">Inventory</option>
          </select>
        </label>
      </div>
      {admin ? (
        <form className="panel form grid" onSubmit={save}>
          <h3 className="wide">
            {editing ? `Edit product ${editing.id}` : "Create product"}
          </h3>
          <label>
            Name
            <input
              name="productName"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </label>
          <label>
            Category
            <select
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
            >
              <option>Hardware</option>
              <option>Software</option>
              <option>Accessories</option>
            </select>
          </label>
          <label>
            Price
            <input
              type="number"
              min="0"
              step="0.01"
              required
              value={form.price}
              onChange={(e) =>
                setForm({ ...form, price: Number(e.target.value) })
              }
            />
          </label>
          <label>
            Inventory
            <input
              type="number"
              min="0"
              required
              value={form.inventory}
              onChange={(e) =>
                setForm({ ...form, inventory: Number(e.target.value) })
              }
            />
          </label>
          <label>
            Status
            <select
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value })}
            >
              <option>ACTIVE</option>
              <option>DRAFT</option>
              <option>INACTIVE</option>
              <option>OUT_OF_STOCK</option>
            </select>
          </label>
          <label>
            Product image
            <input
              ref={imageInput}
              type="file"
              accept="image/png,image/jpeg"
              onChange={(event) => setImage(event.target.files?.[0] || null)}
            />
          </label>
          <div className="wide">
            <button>{editing ? "Update" : "Create"}</button>
            {editing && (
              <button type="button" className="secondary" onClick={resetEditor}>
                Cancel
              </button>
            )}
          </div>
        </form>
      ) : (
        <p className="read-only-banner">
          Read-only mode: create, update, duplicate, and delete require Admin.
        </p>
      )}
      <output role="status">{message}</output>
      {undo && <button onClick={restore}>Undo deletion</button>}
      {loading ? (
        <p role="status">Loading products…</p>
      ) : products.length === 0 ? (
        <p className="empty-state">No matching products</p>
      ) : (
        <div className="cards">
          {products.map((product) => (
            <article
              className="card"
              key={product.id}
              data-testid={`product-${product.id}`}
            >
              <b>{product.name}</b>
              <span>
                {product.category} · {product.status}
              </span>
              <strong>${product.price.toFixed(2)}</strong>
              <small>
                Stock {product.inventory} · v{product.version}
              </small>
              <div className="actions">
                {admin && (
                  <>
                    <button onClick={() => edit(product)}>Edit</button>
                    <button onClick={() => duplicate(product)}>
                      Duplicate
                    </button>
                    <button className="danger" onClick={() => remove(product)}>
                      Delete
                    </button>
                  </>
                )}
                <button
                  className="secondary"
                  onClick={() => showHistory(product.id)}
                >
                  History
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
      <div className="pagination">
        <button disabled={page === 1} onClick={() => setPage(page - 1)}>
          Previous
        </button>
        <span>
          Page {page} · {total} products
        </span>
        <button disabled={page * 8 >= total} onClick={() => setPage(page + 1)}>
          Next
        </button>
      </div>
      {history.length > 0 && (
        <section>
          <h3>Product history</h3>
          <pre data-testid="product-history">
            {JSON.stringify(history, null, 2)}
          </pre>
        </section>
      )}
      <Info
        name="Product CRUD"
        concepts="create/view/edit/delete, duplicate, search/filter/sort/page, status/category/inventory/price, history, optimistic UI, confirmation/undo, server and duplicate validation, version conflict"
        endpoints="GET/POST /api/products, PUT/DELETE /api/products/:id, duplicate, undo, history"
      />
    </>
  );
}

type Uploaded = {
  id: number;
  name: string;
  size: number;
  type: string;
  preview?: boolean;
};
const waitForUploadStart = (signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    let timer = 0;
    const abort = () => {
      clearTimeout(timer);
      reject(new DOMException("Upload cancelled", "AbortError"));
    };
    if (signal.aborted) return abort();
    signal.addEventListener("abort", abort, { once: true });
    timer = window.setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, 300);
  });
export function Phase3Files() {
  const loc = useLocation(),
    downloadPage = loc.pathname.endsWith("/download"),
    [files, setFiles] = useState<Uploaded[]>([]),
    [selected, setSelected] = useState<File[]>([]),
    [progress, setProgress] = useState(0),
    [message, setMessage] = useState(""),
    [uploading, setUploading] = useState(false),
    [cancellable, setCancellable] = useState(false),
    controller = useRef<AbortController | null>(null),
    fileInput = useRef<HTMLInputElement | null>(null);
  const refresh = async () => {
    try {
      const result = await api<{ data: unknown[] }>("/api/files");
      setFiles((result?.data || []) as Uploaded[]);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to load files",
      );
    }
  };
  useEffect(() => {
    if (!downloadPage) void refresh();
  }, [downloadPage]);
  useEffect(() => () => controller.current?.abort(), []);
  const choose = (list: FileList | null) => {
    setSelected(list ? Array.from(list) : []);
    setProgress(0);
    setMessage("");
  };
  const upload = async (fail = false) => {
    if (!selected.length) return setMessage("Choose at least one file");
    if (uploading) return;
    const activeController = new AbortController();
    controller.current = activeController;
    setUploading(true);
    setCancellable(true);
    setProgress(15);
    const timer = setInterval(
      () => setProgress((value) => Math.min(90, value + 15)),
      120,
    );
    try {
      await waitForUploadStart(activeController.signal);
      const data = new FormData();
      selected.forEach((file) => data.append("files", file));
      const result = await api<{ files: unknown[] }>(`/api/files/upload${fail ? "?fail=true" : ""}`, {
        method: "POST",
        body: data,
        signal: activeController.signal,
      });
      setProgress(100);
      setMessage(`${(result?.files?.length || 0) as number} file(s) uploaded`);
      setSelected([]);
      if (fileInput.current) fileInput.current.value = "";
      await refresh();
    } catch (error) {
      const failure = error as Error;
      setMessage(
        failure.name === "AbortError"
          ? "Upload cancelled"
          : failure.message || "Upload failed",
      );
      setProgress(0);
    } finally {
      clearInterval(timer);
      if (controller.current === activeController) controller.current = null;
      setCancellable(false);
      setUploading(false);
    }
  };
  const processCsv = async () => {
    const csv = selected.find(
      (file) => file.type === "text/csv" || file.name.endsWith(".csv"),
    );
    if (!csv) return setMessage("Choose a CSV file to process");
    if (uploading) return;
    setUploading(true);
    try {
      const data = new FormData();
      data.append("file", csv);
      const result = await api<{ rows: number; headers: string[] }>("/api/files/process-csv", {
        method: "POST",
        body: data,
      });
      setMessage(
        `CSV processed: ${result?.rows || 0} row(s), headers: ${(result?.headers || []).join(", ")}`,
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "CSV processing failed",
      );
    } finally {
      setUploading(false);
    }
  };
  const download = async (type: string) => {
    try {
      const response = await authenticatedFetch(`/api/files/download/${type}`);
      if (!response.ok) throw new Error((await response.json()).error);
      const blob = await response.blob(),
        url = URL.createObjectURL(blob),
        link = document.createElement("a");
      link.href = url;
      link.download =
        response.headers
          .get("content-disposition")
          ?.match(/filename="?([^";]+).*$/)?.[1] || `download.${type}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
      setMessage(`${type} download started`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Download failed");
    }
  };
  if (downloadPage)
    return (
      <>
        <PageHeader
          icon={FileUp}
          title="File Downloads"
          description="Validate deterministic files, invoices, delays and download failures."
          onReset={() => location.reload()}
        />
        <div className="panel actions">
          <button onClick={() => download("text")}>Download text</button>
          <button onClick={() => download("csv")}>Download CSV</button>
          <button onClick={() => download("pdf")}>Download PDF</button>
          <button onClick={() => download("invoice")}>Download invoice</button>
          <button onClick={() => download("delayed")}>Delayed download</button>
          <button className="danger" onClick={() => download("failed")}>
            Failed download
          </button>
        </div>
        <output role="status">{message}</output>
        <Info
          name="File downloads"
          concepts="text, CSV, PDF, generated invoice, delayed and failed downloads"
          endpoints="GET /api/files/download/:type"
        />
      </>
    );
  return (
    <>
      <PageHeader
        icon={FileUp}
        title="File Uploads"
        description="Practice validation, progress, cancellation, drag and drop and processing."
        onReset={() => location.reload()}
      />
      <div className="panel form">
        <label>
          Single or multiple files
          <input
            ref={fileInput}
            type="file"
            multiple
            disabled={uploading}
            onChange={(e) => choose(e.target.files)}
            accept=".txt,.csv,.pdf,.png,.jpg,.jpeg"
          />
        </label>
        <div
          className="drop-zone"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            if (uploading) return;
            if (fileInput.current) fileInput.current.value = "";
            choose(e.dataTransfer.files);
          }}
        >
          Drag and drop files here
        </div>
        <ul>
          {selected.map((file, index) => (
            <li key={`${file.name}-${file.size}-${file.lastModified}-${index}`}>
              {file.name} — {file.size} bytes
            </li>
          ))}
        </ul>
        <progress max="100" value={progress}>
          {progress}%
        </progress>
        <div className="actions">
          <button disabled={uploading} onClick={() => upload()}>
            {uploading ? "Working…" : "Upload"}
          </button>
          <button
            className="secondary"
            disabled={!cancellable}
            onClick={() => controller.current?.abort()}
          >
            Cancel upload
          </button>
          <button
            className="danger"
            disabled={uploading}
            onClick={() => upload(true)}
          >
            Simulate failure
          </button>
          <button
            className="secondary"
            disabled={uploading}
            onClick={processCsv}
          >
            Process selected CSV
          </button>
        </div>
      </div>
      <output role="status">{message}</output>
      <h3>Uploaded files</h3>
      {files.length === 0 ? (
        <p className="empty-state">No uploaded files</p>
      ) : (
        <ul>
          {files.map((file) => (
            <li key={file.id}>
              {file.name} — {file.size} bytes{" "}
              {file.type.startsWith("image/") && (
                <span>Image preview available</span>
              )}{" "}
              <button
                className="danger"
                onClick={async () => {
                  try {
                    await api<Record<string, unknown>>(`/api/files/${file.id}`, { method: "DELETE" });
                    setMessage(`${file.name} removed`);
                    await refresh();
                  } catch (error) {
                    setMessage(
                      error instanceof Error
                        ? error.message
                        : "Unable to remove file",
                    );
                  }
                }}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      <Info
        name="File uploads"
        concepts="single/multiple/drag-drop, types, size, zero-byte, duplicate, progress, cancel/failure, preview, removal, CSV/PDF"
        endpoints="POST /api/files/upload, POST /api/files/process-csv, GET/DELETE /api/files"
      />
    </>
  );
}

export function Phase3Dynamic() {
  const loc = useLocation(),
    params = new URLSearchParams(loc.search),
    requestedDelay = Number(params.get("delay") ?? 1500),
    delay = Number.isFinite(requestedDelay)
      ? Math.min(10000, Math.max(0, requestedDelay))
      : 1500,
    deterministic = params.get("deterministic") !== "false",
    [visible, setVisible] = useState(false),
    [disappearing, setDisappearing] = useState(true),
    [text, setText] = useState("Original text"),
    [enabled, setEnabled] = useState(false),
    [loading, setLoading] = useState(true),
    [progress, setProgress] = useState(0),
    [poll, setPoll] = useState("PENDING"),
    [results, setResults] = useState<string[]>([]),
    [query, setQuery] = useState(""),
    [generation, setGeneration] = useState(1);
  useEffect(() => {
    setVisible(false);
    setDisappearing(true);
    setText("Original text");
    setEnabled(false);
    setLoading(true);
    setProgress(0);
    setPoll("PENDING");
    const timers = [
      setTimeout(() => setVisible(true), delay),
      setTimeout(() => setDisappearing(false), delay),
      setTimeout(() => setText("Updated deterministic text"), delay),
      setTimeout(() => setEnabled(true), delay),
      setTimeout(() => setLoading(false), delay),
      setTimeout(() => setPoll("COMPLETE"), delay * 2),
    ];
    const interval = setInterval(
      () => {
        setProgress((value) => {
          if (value >= 90) {
            clearInterval(interval);
            return 100;
          }
          return value + 10;
        });
      },
      Math.max(50, delay / 10),
    );
    return () => {
      timers.forEach(clearTimeout);
      clearInterval(interval);
    };
  }, [delay, generation]);
  useEffect(() => {
    const timer = setTimeout(
      () =>
        setResults(
          query
            ? ["Result Alpha", "Result Bravo"].filter((x) =>
                x.toLowerCase().includes(query.toLowerCase()),
              )
            : [],
        ),
      400,
    );
    return () => clearTimeout(timer);
  }, [query]);
  return (
    <>
      <PageHeader
        icon={TimerReset}
        title="Dynamic Synchronization"
        description="Practice explicit waits, polling, loaders, debounce and component remounts."
        difficulty="Advanced"
        onReset={() => location.reload()}
      />
      <div className="dynamic-grid">
        <section className="panel">
          <h3>Appears/disappears</h3>
          {visible && <p data-testid="appeared-element">Element appeared</p>}
          {disappearing && (
            <p data-testid="disappearing-element">
              This element will disappear
            </p>
          )}
        </section>
        <section className="panel">
          <h3>Text and enablement</h3>
          <p>{text}</p>
          <button disabled={!enabled}>Delayed enabled button</button>
        </section>
        <section className="panel">
          <h3>Loading states</h3>
          {loading ? (
            <>
              <div className="spinner" role="status" aria-label="Loading" />
              <div className="skeleton">Skeleton loader</div>
            </>
          ) : (
            <p>AJAX content loaded</p>
          )}
        </section>
        <section className="panel">
          <h3>Progress and polling</h3>
          <progress max="100" value={progress} />
          <p data-testid="poll-status">Background task: {poll}</p>
        </section>
        <section className="panel">
          <h3>Debounced search</h3>
          <input
            aria-label="Debounced search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <ul>
            {results.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </section>
        <section className="panel">
          <h3>Stale replacement/remount</h3>
          <p key={generation} data-testid="generation">
            DOM generation {generation}
          </p>
          <button
            onClick={() => {
              setGeneration((value) => value + 1);
            }}
          >
            Replace and remount
          </button>
        </section>
      </div>
      <p>
        Configured delay: {delay} ms · deterministic: {String(deterministic)}
      </p>
      <Info
        name="Dynamic synchronization"
        concepts="appearance/disappearance, text/enable delays, spinner/skeleton/AJAX, polling/background completion, debounce, progress, stale replacement and remount"
        endpoints="GET /api/delay/:ms"
      />
    </>
  );
}

class Phase3Shadow extends HTMLElement {
  connectedCallback() {
    if (this.shadowRoot) return;
    const root = this.attachShadow({ mode: "open" });
    root.innerHTML =
      '<style>section{border:2px solid #6552e8;padding:16px;border-radius:8px}button{padding:8px;background:#6552e8;color:white}</style><section><label>Shadow input <input id="shadow-input" aria-label="Shadow input"></label><select id="shadow-select" aria-label="Shadow select"><option>Alpha</option><option>Bravo</option></select><button id="shadow-button">Shadow button</button><output id="shadow-output" aria-live="polite"></output><nested-shadow></nested-shadow></section>';
    root
      .querySelector("#shadow-button")!
      .addEventListener(
        "click",
        () =>
          (root.querySelector("#shadow-output")!.textContent =
            "Open shadow button clicked"),
      );
  }
}
class NestedShadow extends HTMLElement {
  connectedCallback() {
    if (this.shadowRoot) return;
    const root = this.attachShadow({ mode: "open" });
    root.innerHTML =
      '<div><strong id="nested-text">Nested open shadow root</strong><button id="nested-button">Nested action</button><output id="nested-output" aria-live="polite"></output></div>';
    root
      .querySelector("#nested-button")!
      .addEventListener(
        "click",
        () =>
          (root.querySelector("#nested-output")!.textContent =
            "Nested action completed"),
      );
  }
}
class ClosedShadow extends HTMLElement {
  connectedCallback() {
    if ((this as any)._ready) return;
    (this as any)._ready = true;
    const root = this.attachShadow({ mode: "closed" });
    root.innerHTML = "<p>Closed shadow content</p>";
  }
}
if (!customElements.get("nested-shadow"))
  customElements.define("nested-shadow", NestedShadow);
if (!customElements.get("phase3-shadow"))
  customElements.define("phase3-shadow", Phase3Shadow);
if (!customElements.get("closed-shadow"))
  customElements.define("closed-shadow", ClosedShadow);
export function Phase3ShadowDom() {
  const [dynamic, setDynamic] = useState(false);
  return (
    <>
      <PageHeader
        icon={Braces}
        title="Shadow DOM"
        description="Practice open, nested, dynamic and restricted web component roots."
        difficulty="Advanced"
        onReset={() => location.reload()}
      />
      <div className="shadow-grid">
        {React.createElement("phase3-shadow" as any, {
          "data-testid": "open-shadow-host",
        })}
        {React.createElement("phase3-shadow" as any, {
          "data-testid": "second-shadow-host",
        })}
        {dynamic &&
          React.createElement("phase3-shadow" as any, {
            "data-testid": "dynamic-shadow-host",
          })}
      </div>
      <button disabled={dynamic} onClick={() => setDynamic(true)}>
        Create dynamic shadow root
      </button>
      <section className="panel">
        <h3>Closed Shadow DOM demonstration</h3>
        {React.createElement("closed-shadow" as any, {
          "data-testid": "closed-shadow-host",
        })}
        <p>
          Direct automation access is intentionally restricted because the
          component uses a closed shadow root. Assert the host and this
          explanation instead.
        </p>
      </section>
      <Info
        name="Shadow DOM"
        concepts="open, nested open, multiple roots, input/button/dropdown, dynamic host, closed-root restriction"
        endpoints="None"
      />
    </>
  );
}

