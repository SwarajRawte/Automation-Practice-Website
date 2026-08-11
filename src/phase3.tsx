import React, { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
const api = async (url: string, init?: RequestInit) => {
  const token = localStorage.getItem("token"),
    response = await fetch(url, {
      ...init,
      headers: {
        ...(init?.body instanceof FormData
          ? {}
          : { "content-type": "application/json" }),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...init?.headers,
      },
    }),
    body = response.status === 204 ? null : await response.json();
  if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
  return body;
};
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
    <details className="info" open>
      <summary>Test Information</summary>
      <dl>
        <dt>Page</dt>
        <dd>{name}</dd>
        <dt>URL</dt>
        <dd>{location.pathname}</dd>
        <dt>Concepts</dt>
        <dd>{concepts}</dd>
        <dt>Recommended locators</dt>
        <dd>table roles, column names, row IDs, labels, data-testid</dd>
        <dt>Expected behavior</dt>
        <dd>State changes are deterministic and visibly reported.</dd>
        <dt>Suggested assertions</dt>
        <dd>Exact rows, counts, status, history, progress, and reset state</dd>
        <dt>Relevant APIs</dt>
        <dd>{endpoints}</dd>
      </dl>
      <button onClick={() => location.reload()}>Reset module</button>
    </details>
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
    [visibleCount, setVisibleCount] = useState(25);
  const load = async () => {
    setLoading(true);
    const result = await api(
      `/api/table-users?page=${page}&size=${virtual ? 100 : size}&search=${encodeURIComponent(search)}&status=${status}&sort=${sort}&direction=${direction}&sorts=${sort}:${direction}${secondarySort ? `,${secondarySort}:asc` : ""}`,
    );
    setRows(result.data);
    setTotal(result.total);
    setLoading(false);
  };
  useEffect(() => {
    if (isStatic) {
      setRows(
        Array.from({ length: 10 }, (_, i) => ({
          id: i + 1,
          name: `Static User ${String(i + 1).padStart(2, "0")}`,
          email: `static${i + 1}@testlab.local`,
          department: "Quality",
          role: "USER",
          status: "ACTIVE",
          score: 80 + i,
        })),
      );
      setLoading(false);
    } else void load();
  }, [page, size, sort, direction, secondarySort, status, isStatic, virtual]);
  const toggleSort = (column: string, multi = false) => {
      if (multi && column !== sort) {
        setSecondarySort(secondarySort === column ? "" : column);
        return;
      }
      setSecondarySort("");
      if (sort === column) setDirection(direction === "asc" ? "desc" : "asc");
      else {
        setSort(column);
        setDirection("asc");
      }
    },
    update = (id: number, key: keyof Row, value: string) =>
      setRows(
        rows.map((row) => (row.id === id ? { ...row, [key]: value } : row)),
      );
  if (virtual)
    return (
      <>
        <h2>Virtual and infinite table</h2>
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
      <h2>{isStatic ? "Static table" : "Dynamic server-side data grid"}</h2>
      <div className="panel table-controls">
        <label>
          Global search
          <input
            aria-label="Global search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && load()}
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
            onChange={(e) => setSize(Number(e.target.value))}
          >
            {[5, 10, 20, 50].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </label>
        <button onClick={load}>Apply search</button>
        <button
          className="secondary"
          onClick={() => setColumns([...columns].reverse())}
        >
          Reverse column order
        </button>
        <button
          onClick={() => {
            setRows([
              ...rows,
              {
                id: 1000 + rows.length,
                name: "New Local User",
                email: "new@testlab.local",
                department: "Quality",
                role: "USER",
                status: "ACTIVE",
                score: 75,
              },
            ]);
            setMessage("Row added locally");
          }}
        >
          Add row
        </button>
        <button
          disabled={!selected.length}
          onClick={() => {
            setRows(rows.filter((row) => !selected.includes(row.id)));
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
                setHidden(
                  hidden.includes(column)
                    ? hidden.filter((x) => x !== column)
                    : [...hidden, column],
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
                    checked={selected.length === rows.length && rows.length > 0}
                    onChange={(e) =>
                      setSelected(e.target.checked ? rows.map((x) => x.id) : [])
                    }
                  />
                </th>
                {columns
                  .filter((c) => !hidden.includes(c))
                  .map((column) => (
                    <th key={column}>
                      <button
                        className="table-sort"
                        onClick={(event) => toggleSort(column, event.shiftKey)}
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
                          setSelected(
                            selected.includes(row.id)
                              ? selected.filter((x) => x !== row.id)
                              : [...selected, row.id],
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
                        onClick={() =>
                          setRows(rows.filter((x) => x.id !== row.id))
                        }
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                  {expanded === row.id && (
                    <tr>
                      <td colSpan={columns.length + 2}>
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
export function Phase3Products() {
  const user = JSON.parse(localStorage.getItem("user") || "null"),
    admin = user?.role === "ADMIN",
    [products, setProducts] = useState<Product[]>([]),
    [query, setQuery] = useState(""),
    [category, setCategory] = useState(""),
    [sort, setSort] = useState("id"),
    [page, setPage] = useState(1),
    [total, setTotal] = useState(0),
    [editing, setEditing] = useState<Product | null>(null),
    [history, setHistory] = useState<any[]>([]),
    [message, setMessage] = useState(""),
    [undo, setUndo] = useState<{ id: number; token: string } | null>(null),
    [image, setImage] = useState<File | null>(null),
    [form, setForm] = useState({
      name: "Automation Product",
      category: "Hardware",
      price: 49.99,
      inventory: 10,
      status: "ACTIVE",
    });
  const load = async () => {
    const result = await api(
      `/api/products?page=${page}&size=8&q=${encodeURIComponent(query)}&category=${category}&sort=${sort}`,
    );
    setProducts(result.data);
    setTotal(result.total);
  };
  useEffect(() => {
    void load();
  }, [page, category, sort]);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const result = editing
        ? await api(`/api/products/${editing.id}`, {
            method: "PUT",
            body: JSON.stringify({ ...form, version: editing.version }),
          })
        : await api("/api/products", {
            method: "POST",
            body: JSON.stringify(form),
          });
      if (image) {
        const data = new FormData();
        data.append("image", image);
        await api(`/api/products/${result.id}/image`, {
          method: "POST",
          body: data,
        });
        setImage(null);
      }
      setMessage(`${result.name} saved`);
      setEditing(null);
      setForm({
        name: "Automation Product",
        category: "Hardware",
        price: 49.99,
        inventory: 10,
        status: "ACTIVE",
      });
      await load();
    } catch (error: any) {
      setMessage(error.message);
    }
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
  };
  const remove = async (p: Product) => {
    if (!window.confirm(`Delete ${p.name}?`)) return;
    const result = await api(`/api/products/${p.id}`, { method: "DELETE" });
    setUndo({ id: p.id, token: result.undoToken });
    setMessage(`${p.name} deleted — undo available`);
    await load();
  };
  const restore = async () => {
    if (!undo) return;
    await api(`/api/products/${undo.id}/undo`, {
      method: "POST",
      body: JSON.stringify({ undoToken: undo.token }),
    });
    setUndo(null);
    setMessage("Deletion undone");
    await load();
  };
  const showHistory = async (id: number) =>
    setHistory((await api(`/api/products/${id}/history`)).data);
  return (
    <>
      <h2>Persistent product CRUD</h2>
      <div className="panel product-toolbar">
        <label>
          Search
          <input
            aria-label="Search products"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <button
          onClick={() => {
            setPage(1);
            void load();
          }}
        >
          Search
        </button>
        <label>
          Category
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="">All</option>
            <option>Hardware</option>
            <option>Software</option>
            <option>Accessories</option>
          </select>
        </label>
        <label>
          Sort
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
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
            </select>
          </label>
          <label>
            Product image
            <input
              type="file"
              accept="image/png,image/jpeg"
              onChange={(event) => setImage(event.target.files?.[0] || null)}
            />
          </label>
          <div className="wide">
            <button>{editing ? "Update" : "Create"}</button>
            {editing && (
              <button
                type="button"
                className="secondary"
                onClick={() => setEditing(null)}
              >
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
                  <button
                    onClick={async () => {
                      await api(`/api/products/${product.id}/duplicate`, {
                        method: "POST",
                        body: "{}",
                      });
                      setMessage("Product duplicated");
                      await load();
                    }}
                  >
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
export function Phase3Files() {
  const loc = useLocation(),
    downloadPage = loc.pathname.endsWith("/download"),
    [files, setFiles] = useState<Uploaded[]>([]),
    [selected, setSelected] = useState<File[]>([]),
    [progress, setProgress] = useState(0),
    [message, setMessage] = useState(""),
    controller = useRef<AbortController | null>(null);
  const refresh = () => api("/api/files").then((x) => setFiles(x.data));
  useEffect(() => {
    void refresh();
  }, []);
  const choose = (list: FileList | null) =>
    setSelected(list ? Array.from(list) : []);
  const upload = async (fail = false) => {
    if (!selected.length) return setMessage("Choose at least one file");
    controller.current = new AbortController();
    setProgress(15);
    const timer = setInterval(
      () => setProgress((value) => Math.min(90, value + 15)),
      120,
    );
    try {
      const data = new FormData();
      selected.forEach((file) => data.append("files", file));
      const result = await api(`/api/files/upload${fail ? "?fail=true" : ""}`, {
        method: "POST",
        body: data,
        signal: controller.current.signal,
      });
      setProgress(100);
      setMessage(`${result.files.length} file(s) uploaded`);
      setSelected([]);
      await refresh();
    } catch (error: any) {
      setMessage(
        error.name === "AbortError" ? "Upload cancelled" : error.message,
      );
      setProgress(0);
    } finally {
      clearInterval(timer);
    }
  };
  const download = async (type: string) => {
    try {
      const response = await fetch(`/api/files/download/${type}`, {
        headers: { authorization: `Bearer ${localStorage.getItem("token")}` },
      });
      if (!response.ok) throw new Error((await response.json()).error);
      const blob = await response.blob(),
        url = URL.createObjectURL(blob),
        link = document.createElement("a");
      link.href = url;
      link.download =
        response.headers
          .get("content-disposition")
          ?.match(/filename="?([^";]+).*$/)?.[1] || `download.${type}`;
      link.click();
      URL.revokeObjectURL(url);
      setMessage(`${type} download started`);
    } catch (error: any) {
      setMessage(error.message);
    }
  };
  if (downloadPage)
    return (
      <>
        <h2>Deterministic downloads</h2>
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
      <h2>File upload laboratory</h2>
      <div className="panel form">
        <label>
          Single or multiple files
          <input
            type="file"
            multiple
            onChange={(e) => choose(e.target.files)}
            accept=".txt,.csv,.pdf,.png,.jpg,.jpeg"
          />
        </label>
        <div
          className="drop-zone"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            choose(e.dataTransfer.files);
          }}
        >
          Drag and drop files here
        </div>
        <ul>
          {selected.map((file) => (
            <li key={`${file.name}-${file.size}`}>
              {file.name} — {file.size} bytes
            </li>
          ))}
        </ul>
        <progress max="100" value={progress}>
          {progress}%
        </progress>
        <div className="actions">
          <button onClick={() => upload()}>Upload</button>
          <button
            className="secondary"
            onClick={() => controller.current?.abort()}
          >
            Cancel upload
          </button>
          <button className="danger" onClick={() => upload(true)}>
            Simulate failure
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
                  await api(`/api/files/${file.id}`, { method: "DELETE" });
                  setMessage(`${file.name} removed`);
                  await refresh();
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
  const params = new URLSearchParams(location.search),
    delay = Math.min(10000, Math.max(0, Number(params.get("delay") || 1500))),
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
    const timers = [
      setTimeout(() => setVisible(true), delay),
      setTimeout(() => setDisappearing(false), delay),
      setTimeout(() => setText("Updated deterministic text"), delay),
      setTimeout(() => setEnabled(true), delay),
      setTimeout(() => setLoading(false), delay),
      setTimeout(() => setPoll("COMPLETE"), delay * 2),
    ];
    const interval = setInterval(
      () => setProgress((value) => (value >= 100 ? 100 : value + 10)),
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
      <h2>Dynamic content & synchronization</h2>
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
              <div className="spinner" />
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
              setGeneration(generation + 1);
              setVisible(false);
              setLoading(true);
              setProgress(0);
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
      '<style>section{border:2px solid #6552e8;padding:16px;border-radius:8px}button{padding:8px;background:#6552e8;color:white}</style><section><label>Shadow input <input id="shadow-input" aria-label="Shadow input"></label><select id="shadow-select"><option>Alpha</option><option>Bravo</option></select><button id="shadow-button">Shadow button</button><output id="shadow-output"></output><nested-shadow></nested-shadow></section>';
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
      '<div><strong id="nested-text">Nested open shadow root</strong><button id="nested-button">Nested action</button></div>';
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
      <h2>Shadow DOM & web components</h2>
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
      <button onClick={() => setDynamic(true)}>
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
