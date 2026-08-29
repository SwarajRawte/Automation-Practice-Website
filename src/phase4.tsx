import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import type { Socket } from "socket.io-client";
import { Activity, Radio, ShieldCheck, ShoppingCart } from "lucide-react";
import { PageHeader } from "./components/layout/PageHeader";
import { TestInfoPanel } from "./components/testing/TestInfoPanel";
import {
  api,
  authenticatedFetch,
  createAuthenticatedSocket,
  getSessionUser,
} from "./authClient";

const CART_STORAGE_KEY = "phase4-cart";

type CartItem = {
  productId: number;
  name: string;
  price: number;
  quantity: number;
  inventory: number;
};

type Product = {
  id: number;
  name: string;
  category: string;
  price: number;
  inventory: number;
  rating: number;
};

type Order = {
  id: number;
  email?: string;
  status: string;
  total: number;
  created_at: string;
};

function cartOwner() {
  const user = getSessionUser();
  if (typeof user?.id === "string" || typeof user?.id === "number")
    return String(user.id);
  if (typeof user?.email === "string") return user.email;
  return "anonymous";
}

function normalizeCart(value: unknown): CartItem[] {
  if (!Array.isArray(value)) return [];
  const items: CartItem[] = [];
  for (const candidate of value) {
    if (!candidate || typeof candidate !== "object") continue;
    const item = candidate as Partial<CartItem>;
    if (
      !Number.isInteger(item.productId) ||
      Number(item.productId) <= 0 ||
      typeof item.name !== "string" ||
      !Number.isFinite(item.price) ||
      Number(item.price) < 0 ||
      !Number.isInteger(item.inventory) ||
      Number(item.inventory) < 1 ||
      !Number.isFinite(item.quantity)
    )
      continue;
    const inventory = Number(item.inventory);
    const quantity = Math.min(
      inventory,
      Math.max(1, Math.trunc(Number(item.quantity))),
    );
    items.push({
      productId: Number(item.productId),
      name: item.name,
      price: Number(item.price),
      quantity,
      inventory,
    });
  }
  return items;
}

function readCart(owner: string) {
  const raw = localStorage.getItem(CART_STORAGE_KEY);
  if (!raw) return [];
  try {
    const store = JSON.parse(raw);
    // Phase 4 originally stored one global array. Discard that legacy shape so
    // one demo account cannot inherit another account's cart.
    if (!store || Array.isArray(store) || typeof store !== "object") {
      localStorage.removeItem(CART_STORAGE_KEY);
      return [];
    }
    return normalizeCart(store[owner]);
  } catch {
    localStorage.removeItem(CART_STORAGE_KEY);
    return [];
  }
}

function writeCart(owner: string, items: CartItem[]) {
  let store: Record<string, unknown> = {};
  try {
    const existing = JSON.parse(localStorage.getItem(CART_STORAGE_KEY) || "{}");
    if (existing && !Array.isArray(existing) && typeof existing === "object")
      store = existing;
  } catch {
    // Replace malformed lab storage with a valid account-scoped store.
  }
  store[owner] = items;
  localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(store));
}

const isProductPath = (path: string) =>
  path === "/shop" || path === "/shop/" || path.endsWith("/products");

export function Phase4Shop() {
  const path = useLocation().pathname;
  const owner = useMemo(() => cartOwner(), []);
  const [cart, setCart] = useState<CartItem[]>(() => readCart(owner));
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [sort, setSort] = useState("name");
  const [message, setMessage] = useState("");
  const [discount, setDiscount] = useState("");
  const [card, setCard] = useState("4111111111111111");
  const [address, setAddress] = useState({
    line1: "100 Automation Way",
    city: "Toronto",
  });
  const [shipping, setShipping] = useState("standard");
  const [productsLoading, setProductsLoading] = useState(false);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [cancelling, setCancelling] = useState<number | null>(null);
  const productRequest = useRef(0);

  const saveCart = (next: CartItem[]) => {
    const normalized = normalizeCart(next);
    setCart(normalized);
    try {
      writeCart(owner, normalized);
    } catch {
      setMessage("The cart could not be saved in browser storage.");
    }
  };

  const loadProducts = useCallback(
    async (filters?: { query: string; category: string; sort: string }) => {
      const requestId = ++productRequest.current;
      setProductsLoading(true);
      setMessage("");
      const currentFilters = filters || { query, category, sort };
      try {
        const result = await api<{ data: unknown[] }>(
          `/api/shop/products?q=${encodeURIComponent(currentFilters.query)}&category=${encodeURIComponent(currentFilters.category)}&sort=${encodeURIComponent(currentFilters.sort)}`,
        );
        if (requestId === productRequest.current)
          setProducts(Array.isArray(result?.data) ? (result.data as Product[]) : []);
      } catch (error) {
        if (requestId === productRequest.current)
          setMessage(
            error instanceof Error ? error.message : "Products failed to load",
          );
      } finally {
        if (requestId === productRequest.current) setProductsLoading(false);
      }
    },
    [],
  );

  const loadOrders = useCallback(async () => {
    setOrdersLoading(true);
    setMessage("");
    try {
      const result = await api<{ data: unknown[] }>("/api/shop/orders");
      setOrders(Array.isArray(result?.data) ? (result.data as Order[]) : []);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Orders failed to load",
      );
    } finally {
      setOrdersLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isProductPath(path)) void loadProducts({ query, category, sort });
  }, [path, query, category, sort, loadProducts]);

  useEffect(() => {
    if (path.endsWith("/orders")) void loadOrders();
  }, [path, loadOrders]);

  const subtotal = useMemo(
    () => cart.reduce((sum, item) => sum + item.price * item.quantity, 0),
    [cart],
  );

  const add = (product: Product) => {
    if (product.inventory < 1) {
      setMessage(`${product.name} is out of stock`);
      return;
    }
    const found = cart.find((item) => item.productId === product.id);
    if (found && found.quantity >= product.inventory) {
      setMessage(
        `The cart already contains all available ${product.name} stock`,
      );
      return;
    }
    saveCart(
      found
        ? cart.map((item) =>
            item.productId === product.id
              ? {
                  ...item,
                  name: product.name,
                  price: product.price,
                  inventory: product.inventory,
                  quantity: item.quantity + 1,
                }
              : item,
          )
        : [
            ...cart,
            {
              productId: product.id,
              name: product.name,
              price: product.price,
              quantity: 1,
              inventory: product.inventory,
            },
          ],
    );
    setMessage(`${product.name} added to cart`);
  };

  const updateQuantity = (item: CartItem, raw: string) => {
    const parsed = Number(raw);
    const quantity = Math.min(
      item.inventory,
      Math.max(1, Number.isFinite(parsed) ? Math.trunc(parsed) : 1),
    );
    saveCart(
      cart.map((candidate) =>
        candidate.productId === item.productId
          ? { ...candidate, quantity }
          : candidate,
      ),
    );
  };

  const checkout = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!cart.length || submitting) return;
    setMessage("");
    setSubmitting(true);
    try {
      const result = await api<{ orderId: number; message: string; total: number }>("/api/shop/checkout", {
        method: "POST",
        body: JSON.stringify({
          items: cart,
          cardNumber: card,
          shippingAddress: address,
          billingAddress: address,
          shippingMethod: shipping,
          discountCode: discount || undefined,
        }),
      });
      saveCart([]);
      setMessage(
        `Order ${result?.orderId ?? 0}: ${result?.message ?? "Checkout complete"}. Total $${Number(result?.total ?? 0).toFixed(2)}`,
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Checkout failed");
    } finally {
      setSubmitting(false);
    }
  };

  const cancelOrder = async (orderId: number) => {
    if (cancelling !== null) return;
    setCancelling(orderId);
    setMessage("");
    try {
      await api(`/api/shop/orders/${orderId}/cancel`, { method: "POST" });
      setOrders((current) =>
        current.map((order) =>
          order.id === orderId ? { ...order, status: "CANCELLED" } : order,
        ),
      );
      setMessage(`Order ${orderId} cancelled`);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Cancellation failed",
      );
    } finally {
      setCancelling(null);
    }
  };

  const resetProducts = () => {
    const defaults = { query: "", category: "", sort: "name" };
    setQuery(defaults.query);
    setCategory(defaults.category);
    setSort(defaults.sort);
    void loadProducts(defaults);
  };

  const nav = (
    <nav className="module-tabs" aria-label="Shop sections">
      <NavLink to="/shop/products">Products</NavLink>
      <NavLink to="/shop/cart">
        Cart ({cart.reduce((total, item) => total + item.quantity, 0)})
      </NavLink>
      <NavLink to="/shop/checkout">Checkout</NavLink>
      <NavLink to="/shop/orders">Orders</NavLink>
    </nav>
  );

  if (path.endsWith("/cart"))
    return (
      <>
        <PageHeader
          icon={ShoppingCart}
          title="Shopping Cart"
          description="Practice persisted cart changes, quantity limits, removal, discounts, and exact totals."
          onReset={() => saveCart([])}
        />
        {nav}
        <div className="panel cart-list">
          {cart.length ? (
            cart.map((item) => (
              <div
                key={item.productId}
                data-testid={`cart-item-${item.productId}`}
              >
                <span>
                  <strong>{item.name}</strong>
                  <small>${item.price.toFixed(2)} each</small>
                </span>
                <input
                  aria-label={`Quantity for ${item.name}`}
                  type="number"
                  min="1"
                  max={item.inventory}
                  step="1"
                  value={item.quantity}
                  onChange={(event) => updateQuantity(item, event.target.value)}
                />
                <button
                  className="danger"
                  onClick={() =>
                    saveCart(
                      cart.filter(
                        (candidate) => candidate.productId !== item.productId,
                      ),
                    )
                  }
                >
                  Remove
                </button>
              </div>
            ))
          ) : (
            <p data-testid="empty-cart">Your cart is empty.</p>
          )}
          <strong data-testid="cart-total">
            Subtotal: ${subtotal.toFixed(2)}
          </strong>
        </div>
        <output role="status">{message}</output>
        <TestInfoPanel
          name="Shopping cart"
          concepts="persistence, quantity, removal, stock limits, totals"
          endpoints="GET /api/shop/products"
        />
      </>
    );

  if (path.endsWith("/checkout"))
    return (
      <>
        <PageHeader
          icon={ShoppingCart}
          title="Mock Checkout"
          description="Exercise addresses, shipping, discount, payment success, decline, timeout, and order confirmation."
          onReset={() => {
            setMessage("");
            setDiscount("");
            setCard("4111111111111111");
            setAddress({ line1: "100 Automation Way", city: "Toronto" });
            setShipping("standard");
          }}
        />
        {nav}
        <form className="panel form checkout-grid" onSubmit={checkout}>
          <label>
            Shipping address
            <input
              data-testid="shipping-address"
              value={address.line1}
              onChange={(event) =>
                setAddress({ ...address, line1: event.target.value })
              }
              required
            />
          </label>
          <label>
            City
            <input
              value={address.city}
              onChange={(event) =>
                setAddress({ ...address, city: event.target.value })
              }
              required
            />
          </label>
          <label>
            Shipping method
            <select
              value={shipping}
              onChange={(event) => setShipping(event.target.value)}
            >
              <option value="standard">Standard — $5</option>
              <option value="express">Express — $15</option>
            </select>
          </label>
          <label>
            Discount code
            <input
              data-testid="discount-code"
              value={discount}
              onChange={(event) => setDiscount(event.target.value)}
              placeholder="SAVE10"
            />
          </label>
          <label>
            Mock card number
            <input
              data-testid="card-number"
              value={card}
              onChange={(event) => setCard(event.target.value)}
              required
            />
          </label>
          <div className="payment-scenarios">
            <small>Success: 4111111111111111</small>
            <small>Declined: 4000000000000002</small>
            <small>Timeout: 4000000000009995</small>
          </div>
          <button disabled={!cart.length || submitting}>
            {submitting ? "Processing…" : `Pay $${subtotal.toFixed(2)}`}
          </button>
          <output role="alert">{message}</output>
        </form>
        <TestInfoPanel
          name="Checkout"
          concepts="shipping, billing, tax, discounts, mock payments, confirmation"
          endpoints="POST /api/shop/checkout"
        />
      </>
    );

  if (path.endsWith("/orders"))
    return (
      <>
        <PageHeader
          icon={ShoppingCart}
          title="Order History"
          description="Verify persisted orders, status, cancellation and realtime status changes."
          onReset={() => {
            setQuery("");
            void loadOrders();
          }}
        />
        {nav}
        <div className="panel table-wrap">
          <table>
            <thead>
              <tr>
                <th>Order</th>
                <th>Status</th>
                <th>Total</th>
                <th>Date</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {ordersLoading ? (
                <tr>
                  <td colSpan={5}>Loading orders…</td>
                </tr>
              ) : orders.length ? (
                orders.map((order) => (
                  <tr key={order.id}>
                    <td>#{order.id}</td>
                    <td>{order.status}</td>
                    <td>${Number(order.total).toFixed(2)}</td>
                    <td>{order.created_at}</td>
                    <td>
                      <button
                        disabled={
                          order.status === "DELIVERED" ||
                          order.status === "CANCELLED" ||
                          cancelling !== null
                        }
                        onClick={() => void cancelOrder(order.id)}
                      >
                        {cancelling === order.id ? "Cancelling…" : "Cancel"}
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5}>No orders found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <output role="alert">{message}</output>
        <TestInfoPanel
          name="Order history"
          concepts="history, details, cancellation, status"
          endpoints="GET /api/shop/orders, POST /api/shop/orders/:id/cancel"
        />
      </>
    );

  return (
    <>
      <PageHeader
        icon={ShoppingCart}
        title="E-commerce Workflow"
        description="Practice search, filtering, sorting, stock, wishlist, product details, and cart behavior."
        onReset={resetProducts}
      />
      {nav}
      <div className="panel shop-filters">
        <input
          aria-label="Search products"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search products"
        />
        <select
          aria-label="Category"
          value={category}
          onChange={(event) => setCategory(event.target.value)}
        >
          <option value="">All categories</option>
          <option>Hardware</option>
          <option>Software</option>
          <option>Accessories</option>
        </select>
        <select
          aria-label="Sort products"
          value={sort}
          onChange={(event) => setSort(event.target.value)}
        >
          <option value="name">Name</option>
          <option value="price_asc">Price low-high</option>
          <option value="price_desc">Price high-low</option>
          <option value="rating">Rating</option>
        </select>
        <button disabled={productsLoading} onClick={() => void loadProducts()}>
          {productsLoading ? "Loading…" : "Apply"}
        </button>
      </div>
      <div className="cards">
        {products.map((product) => (
          <article
            className="card product-card"
            key={product.id}
            data-testid={`shop-product-${product.id}`}
          >
            <span className="eyebrow">{product.category}</span>
            <h3>{product.name}</h3>
            <span aria-label={`${product.rating} star rating`}>
              {"★".repeat(product.rating)}
              {"☆".repeat(5 - product.rating)}
            </span>
            <strong>${Number(product.price).toFixed(2)}</strong>
            <small className={product.inventory < 5 ? "warning-text" : ""}>
              {product.inventory === 0
                ? "Out of stock"
                : product.inventory < 5
                  ? `Only ${product.inventory} left`
                  : `${product.inventory} in stock`}
            </small>
            <div className="actions">
              <button
                disabled={!product.inventory}
                onClick={() => add(product)}
              >
                Add to cart
              </button>
              <button
                className="secondary"
                aria-label={`Wishlist ${product.name}`}
                onClick={async () => {
                  setMessage("");
                  try {
                    await api(`/api/shop/wishlist/${product.id}`, {
                      method: "POST",
                    });
                    setMessage(`${product.name} added to wishlist`);
                  } catch (error) {
                    setMessage(
                      error instanceof Error
                        ? error.message
                        : "Wishlist update failed",
                    );
                  }
                }}
              >
                ♡
              </button>
            </div>
          </article>
        ))}
      </div>
      {!productsLoading && !products.length && !message && (
        <p className="panel">No products match the selected filters.</p>
      )}
      <output role="status">{message}</output>
      <TestInfoPanel
        name="Product catalog"
        concepts="search, category, price, rating, sorting, stock, wishlist, cart"
        endpoints="GET /api/shop/products, POST /api/shop/wishlist/:id"
      />
    </>
  );
}

type NetworkConfig = {
  delay: number;
  failureRate: number;
  offline: boolean;
  statusCode: string;
  rateLimit: number;
};

const DEFAULT_NETWORK_CONFIG: NetworkConfig = {
  delay: 0,
  failureRate: 0,
  offline: false,
  statusCode: "",
  rateLimit: 10,
};

function normalizeNetworkConfig(value: Record<string, unknown>): NetworkConfig {
  const statusCode = Number(value?.statusCode);
  return {
    delay: Math.min(5000, Math.max(0, Number(value?.delay) || 0)),
    failureRate: Math.min(1, Math.max(0, Number(value?.failureRate) || 0)),
    offline: Boolean(value?.offline),
    statusCode:
      Number.isInteger(statusCode) && statusCode >= 200 && statusCode <= 599
        ? String(statusCode)
        : "",
    rateLimit: Math.max(1, Number(value?.rateLimit) || 10),
  };
}

export function Phase4Network() {
  const admin = getSessionUser()?.role === "ADMIN";
  const [method, setMethod] = useState("GET");
  const [status, setStatus] = useState("");
  const [config, setConfig] = useState<NetworkConfig>(DEFAULT_NETWORK_CONFIG);
  const [sending, setSending] = useState(false);
  const [applying, setApplying] = useState(false);

  const loadConfig = useCallback(async () => {
    try {
      const current = await api<Record<string, unknown>>("/api/network/config");
      setConfig(normalizeNetworkConfig(current ?? {}));
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : "Network settings failed to load",
      );
    }
  }, []);

  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  const send = async () => {
    if (sending) return;
    setSending(true);
    setStatus("");
    try {
      const response = await authenticatedFetch(
        "/api/network/echo?source=playground",
        {
          method,
          headers: { "content-type": "application/json" },
          body: ["POST", "PUT", "PATCH"].includes(method)
            ? JSON.stringify({ message: "Phase 4 request" })
            : undefined,
        },
        {
          retryOnUnauthorized: false,
          redirectOnUnauthorized: false,
        },
      );
      const body = await response.text();
      setStatus(`${response.status}${body ? `\n${body}` : ""}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Request failed");
    } finally {
      setSending(false);
    }
  };

  const applyConfig = async (next = config) => {
    if (!admin) {
      setStatus("Administrator role required to change network simulation.");
      return;
    }
    const normalized = normalizeNetworkConfig(next);
    if (
      next.statusCode.trim() &&
      (!normalized.statusCode ||
        Number(next.statusCode) !== Number(normalized.statusCode))
    ) {
      setStatus("Forced status must be a whole number from 200 to 599.");
      return;
    }
    setApplying(true);
    setStatus("");
    try {
      const result = await api<Record<string, unknown>>("/api/network/config", {
        method: "PUT",
        body: JSON.stringify({
          ...normalized,
          statusCode: normalized.statusCode
            ? Number(normalized.statusCode)
            : null,
        }),
      });
      setConfig(normalized);
      setStatus(JSON.stringify(result ?? {}, null, 2));
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "Simulation update failed",
      );
    } finally {
      setApplying(false);
    }
  };

  const resetSimulation = () => {
    const defaults = { ...DEFAULT_NETWORK_CONFIG };
    setConfig(defaults);
    void applyConfig(defaults);
  };

  return (
    <>
      <PageHeader
        icon={Activity}
        title="API & Network Playground"
        description="Send REST requests and deterministically simulate latency, status failures, and offline behavior."
        onReset={admin ? resetSimulation : undefined}
      />
      <div className="phase4-grid">
        <section className="panel">
          <h3>Request builder</h3>
          <select
            aria-label="HTTP method"
            value={method}
            onChange={(event) => setMethod(event.target.value)}
          >
            {["GET", "POST", "PUT", "PATCH", "DELETE"].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
          <button disabled={sending} onClick={() => void send()}>
            {sending ? "Sending…" : "Send request"}
          </button>
          <pre role="status" data-testid="network-response">
            {status || "No request sent"}
          </pre>
          <a href="/api/docs" target="_blank" rel="noreferrer">
            Swagger API documentation
          </a>
        </section>
        <section className="panel form">
          <h3>Network simulation</h3>
          {!admin && (
            <p className="read-only-banner" role="status">
              Administrator role required to change network simulation. The
              request builder remains available.
            </p>
          )}
          <label>
            Delay (ms)
            <input
              type="number"
              min="0"
              max="5000"
              disabled={!admin}
              value={config.delay}
              onChange={(event) =>
                setConfig({ ...config, delay: Number(event.target.value) })
              }
            />
          </label>
          <label>
            Forced status
            <input
              inputMode="numeric"
              placeholder="none"
              disabled={!admin}
              value={config.statusCode}
              onChange={(event) =>
                setConfig({ ...config, statusCode: event.target.value })
              }
            />
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={config.offline}
              disabled={!admin}
              onChange={(event) =>
                setConfig({ ...config, offline: event.target.checked })
              }
            />
            Offline mode
          </label>
          <button
            disabled={!admin || applying}
            onClick={() => void applyConfig()}
          >
            {applying ? "Applying…" : "Apply simulation"}
          </button>
        </section>
      </div>
      <TestInfoPanel
        name="API and network"
        concepts="REST methods, status codes, latency, offline, custom headers, request IDs"
        endpoints="ALL /api/network/echo, PUT /api/network/config, GET /api/docs"
      />
    </>
  );
}

export function Phase4Realtime() {
  const socket = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [message, setMessage] = useState("Hello automation");
  const [events, setEvents] = useState<string[]>([]);

  useEffect(() => {
    const current = createAuthenticatedSocket();
    socket.current = current;
    current.on("connect", () => setConnected(true));
    current.on("disconnect", () => setConnected(false));
    for (const name of [
      "status",
      "presence",
      "chat",
      "test-event",
      "order-status",
      "counter",
    ])
      current.on(name, (data) =>
        setEvents((items) => [
          `${name}: ${JSON.stringify(data)}`,
          ...items.slice(0, 99),
        ]),
      );
    return () => {
      socket.current = null;
      current.close();
    };
  }, []);

  return (
    <>
      <PageHeader
        icon={Radio}
        title="Real-time Automation"
        description="Practice connection state, chat, live orders, counters, server events, and reconnection."
        onReset={() => setEvents([])}
      />
      <div className="phase4-grid">
        <section className="panel">
          <h3>
            <span className={connected ? "status-dot" : "status-dot offline"} />{" "}
            {connected ? "Online" : "Offline"}
          </h3>
          <input
            aria-label="Realtime message"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
          />
          <div className="actions">
            <button
              disabled={!connected || !message.trim()}
              onClick={() => socket.current?.emit("chat", { text: message })}
            >
              Send chat
            </button>
            <button
              disabled={!connected}
              onClick={() => socket.current?.emit("counter")}
            >
              Update counter
            </button>
          </div>
        </section>
        <section className="panel">
          <h3>Live event stream</h3>
          <ol data-testid="realtime-events">
            {events.length ? (
              events.map((event, index) => (
                <li key={`${event}-${index}`}>{event}</li>
              ))
            ) : (
              <li>Waiting for events</li>
            )}
          </ol>
        </section>
      </div>
      <TestInfoPanel
        name="WebSockets"
        concepts="connect, disconnect, chat, live order status, counters, server events, reconnection"
        endpoints="WS /socket.io, POST /api/test/events"
      />
    </>
  );
}

export function Phase4Admin() {
  interface AdminSummary {
    users: number;
    orders: number;
    revenue: number;
    products: number;
  }
  interface AuditLog {
    id?: number;
    [key: string]: unknown;
  }
  const [summary, setSummary] = useState<AdminSummary | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [audit, setAudit] = useState<AuditLog[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  const loadAdmin = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [nextSummary, nextOrders, nextAudit] = await Promise.all([
        api<{ users: number; orders: number; revenue: number; products: number }>("/api/admin/summary"),
        api<{ data: Order[] }>("/api/admin/orders"),
        api<{ data: AuditLog[] }>("/api/admin/audit"),
      ]);
      setSummary(nextSummary ?? null);
      setOrders(Array.isArray(nextOrders?.data) ? nextOrders.data : []);
      setAudit(Array.isArray(nextAudit?.data) ? nextAudit.data : []);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Admin data failed to load",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAdmin();
  }, [loadAdmin]);

  const downloadReport = async () => {
    if (exporting) return;
    setExporting(true);
    setError("");
    try {
      const response = await authenticatedFetch("/api/admin/export");
      if (!response.ok) {
        let message = `HTTP ${response.status}`;
        try {
          const body = await response.json();
          message = body.error || message;
        } catch {
          // Keep the status fallback for a non-JSON infrastructure response.
        }
        throw new Error(message);
      }
      const blobUrl = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = "orders-report.csv";
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 0);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Export failed");
    } finally {
      setExporting(false);
    }
  };

  const shown = orders.filter((order) =>
    `${order.id} ${order.email || ""} ${order.status}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );

  return (
    <>
      <PageHeader
        icon={ShieldCheck}
        title="Admin Operations Dashboard"
        description="Admin-only metrics, order oversight, activity audit, filtering, and report export."
        onReset={() => {
          setQuery("");
          void loadAdmin();
        }}
      />
      <div className="visual">
        {[
          ["Users", summary?.users],
          ["Orders", summary?.orders],
          ["Revenue", summary ? `$${Number(summary.revenue).toFixed(2)}` : "—"],
          ["Products", summary?.products],
        ].map(([label, value]) => (
          <div className="metric" key={label}>
            <b>{label}</b>
            <strong>{value ?? "—"}</strong>
          </div>
        ))}
      </div>
      <div className="phase4-grid">
        <section className="panel table-wrap">
          <div className="section-heading">
            <h3>Orders</h3>
            <button
              className="button secondary"
              disabled={exporting}
              onClick={() => void downloadReport()}
            >
              {exporting ? "Exporting…" : "Export CSV"}
            </button>
          </div>
          <input
            aria-label="Filter admin orders"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter orders"
          />
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>User</th>
                <th>Status</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={4}>Loading admin data…</td>
                </tr>
              ) : shown.length ? (
                shown.map((order) => (
                  <tr key={order.id}>
                    <td>{order.id}</td>
                    <td>{order.email}</td>
                    <td>{order.status}</td>
                    <td>${Number(order.total).toFixed(2)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4}>No orders found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
        <section className="panel">
          <h3>Recent audit activity</h3>
          <ol className="audit-list">
            {audit.slice(0, 10).map((entry, index) => (
              <li key={String(entry.id ?? index)}>
                <strong>{String(entry.action ?? "Audit entry")}</strong>
                <small>{String(entry.created_at ?? "")}</small>
              </li>
            ))}
          </ol>
        </section>
      </div>
      <output role="alert">{error}</output>
      <TestInfoPanel
        name="Admin dashboard"
        concepts="RBAC, metrics, order management, audit logs, filtering, export"
        endpoints="GET /api/admin/summary, /orders, /audit, /export"
      />
    </>
  );
}


