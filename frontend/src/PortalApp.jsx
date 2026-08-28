import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, Routes, Route, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { applications, categories, orders, products, sellers } from "./data";
import { client, isApiMode, mutateMarketplace, useMarketplaceList } from "./api";
import { clearAuthSession } from "./authSession";

const peso = (value) => `₱${Number(String(value ?? 0).replace(/[^0-9.-]/g, "") || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const normalizeProduct = (item) => ({
  ...item,
  id: item.id,
  name: item.name,
  sku: item.sku,
  seller: item.seller || item.seller_name,
  category: item.category,
  price: Number(String(item.price ?? 0).replace(/[^0-9.-]/g, "") || 0),
  stock: Number(item.stock || 0),
  status: item.status || "Active",
});

function PortalIcon({ name }) {
  return <i aria-hidden="true" className={`bi ${name}`} />;
}

function PortalShell({ kind, children }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const customer = kind === "customer";
  const links = customer
    ? [["Home", "/", "bi-house"], ["Shop", "/marketplace", "bi-grid"], ["My orders", "/marketplace/orders", "bi-bag-check"], ["Sell on Argo", "/signup?role=seller", "bi-shop"]]
    : [["Home", "/", "bi-house"], ["Overview", "/seller", "bi-speedometer2"], ["My products", "/seller/products", "bi-box-seam"], ["Orders", "/seller/orders", "bi-receipt"], ["Commission", "/seller/commission", "bi-percent"]];
  const signOut = () => {
    clearAuthSession();
    queryClient.clear();
    navigate("/login", { replace: true });
  };
  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link to={customer ? "/marketplace" : "/seller"} className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-white"><PortalIcon name="bi-shop" /></span>
            <span><span className="block text-sm font-bold text-slate-900">Argo Marketplace</span><span className="block text-[11px] text-slate-500">{customer ? "Shop local products" : "Seller workspace"}</span></span>
          </Link>
          <nav aria-label={`${kind} portal navigation`} className="hidden items-center gap-1 md:flex">
            {links.map(([label, to, icon]) => <Link key={to} to={to} className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-blue-700"><PortalIcon name={icon} /> <span className="ml-1.5">{label}</span></Link>)}
          </nav>
          <div className="flex items-center gap-2">
            <Link to="/dashboard" className="hidden rounded-lg px-3 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-100 sm:inline-flex">Admin portal</Link>
            {localStorage.getItem("argo_access_token") ? <button aria-label="Sign out" className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50" onClick={signOut}>Sign out</button> : <Link to="/login" className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">Sign in</Link>}
          </div>
        </div>
        <nav aria-label={`${kind} mobile navigation`} className="flex gap-1 overflow-x-auto border-t border-slate-100 px-4 py-2 md:hidden">
          {links.map(([label, to, icon]) => <Link key={to} to={to} className="shrink-0 rounded-lg px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100"><PortalIcon name={icon} /> <span className="ml-1">{label}</span></Link>)}
        </nav>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>
    </div>
  );
}

function SectionHeading({ eyebrow, title, text, action }) {
  return <div className="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div>{eyebrow && <p className="text-xs font-bold uppercase tracking-[0.12em] text-blue-600">{eyebrow}</p>}<h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{title}</h1>{text && <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">{text}</p>}</div>{action}</div>;
}

function RoleGate({ role, children }) {
  const token = localStorage.getItem("argo_access_token");
  const currentRole = localStorage.getItem("argo_portal_role");
  if (token && currentRole === role) return children;
  const roleLabel = role === "seller" ? "seller" : "customer";
  return <div className="mx-auto max-w-lg rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm"><PortalIcon name="bi-shield-lock" /><h1 className="mt-4 text-xl font-bold text-slate-900">Sign in as a {roleLabel}</h1><p className="mt-2 text-sm leading-6 text-slate-500">This workspace is restricted to the designated account role.</p><div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center"><Link to={`/login?role=${role}`} className="btn-primary">Proceed to login</Link><Link to="/" className="btn-secondary">Back to landing page</Link></div></div>;
}

function ProductTile({ product, onAdd }) {
  return <article className="group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"><div className="flex h-40 items-center justify-center bg-slate-100 text-slate-300">{product.image_url ? <img src={product.image_url} alt="" className="h-full w-full object-cover" /> : <PortalIcon name="bi-image" />}</div><div className="p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-[11px] font-medium text-blue-600">{product.category}</p><h3 className="mt-1 font-bold text-slate-900">{product.name}</h3></div><span className="text-xs text-slate-400">{product.stock} left</span></div><p className="mt-2 min-h-10 text-xs leading-5 text-slate-500">{product.description || "Quality product from an approved Argo seller."}</p><p className="mt-3 text-lg font-bold text-slate-900">{peso(product.price)}</p><p className="mt-1 text-xs text-slate-500">Sold by {product.seller}</p><button className="btn-primary mt-4 w-full" disabled={product.stock < 1} onClick={() => onAdd(product)}><PortalIcon name="bi-cart-plus" /> {product.stock < 1 ? "Out of stock" : "Add to cart"}</button></div></article>;
}

function LandingPage() {
  return <PortalShell kind="customer"><section className="overflow-hidden rounded-3xl bg-slate-950 px-6 py-12 text-white sm:px-10 lg:grid lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:px-16 lg:py-20"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-300">Argo Marketplace</p><h1 className="mt-4 max-w-xl text-4xl font-bold tracking-tight sm:text-5xl">Find useful products from sellers you can trust.</h1><p className="mt-5 max-w-lg text-base leading-7 text-slate-300">Browse local shops, compare listings, and check out with cash or your preferred e-wallet.</p><div className="mt-8 flex flex-wrap gap-3"><Link to="/marketplace" className="btn-primary bg-blue-600 hover:bg-blue-500">Browse marketplace <PortalIcon name="bi-arrow-right" /></Link><Link to="/login" className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/20 px-4 py-2.5 text-sm font-semibold text-white hover:bg-white/10">Proceed to login</Link><Link to="/signup?role=seller" className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/20 px-4 py-2.5 text-sm font-semibold text-white hover:bg-white/10">Open a seller shop</Link></div></div><div className="mt-10 grid grid-cols-2 gap-3 lg:mt-0 lg:pl-10"><div className="rounded-2xl border border-white/10 bg-white/10 p-5"><PortalIcon name="bi-shield-check" /><p className="mt-8 text-lg font-bold">Clear seller details</p><p className="mt-1 text-sm text-slate-300">Know who is fulfilling your order.</p></div><div className="mt-8 rounded-2xl border border-blue-400/30 bg-blue-600/80 p-5"><PortalIcon name="bi-wallet2" /><p className="mt-8 text-lg font-bold">Flexible payment</p><p className="mt-1 text-sm text-blue-100">Cash, GCash, PayMaya, or bank transfer.</p></div></div></section><section className="mt-10 grid gap-4 sm:grid-cols-3"><Link to="/marketplace" className="card p-5 hover:border-blue-300"><PortalIcon name="bi-search" /><h2 className="mt-4 font-bold">Shop the catalog</h2><p className="mt-1 text-sm text-slate-500">Explore products listed by approved sellers.</p></Link><Link to="/signup?role=seller" className="card p-5 hover:border-blue-300"><PortalIcon name="bi-shop-window" /><h2 className="mt-4 font-bold">Sell on Argo</h2><p className="mt-1 text-sm text-slate-500">Apply once, then manage your own listings.</p></Link><Link to="/login" className="card p-5 hover:border-blue-300"><PortalIcon name="bi-person-check" /><h2 className="mt-4 font-bold">Access your account</h2><p className="mt-1 text-sm text-slate-500">Track orders or manage your seller workspace.</p></Link></section></PortalShell>;
}

function AuthPage({ signup = false }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const requestedRole = searchParams.get("role");
  const initialRole = signup
    ? requestedRole === "seller" ? "seller" : "customer"
    : ["admin", "seller"].includes(requestedRole) ? requestedRole : "customer";
  const [role, setRole] = useState(initialRole);
  const [form, setForm] = useState({ name: "", business: "", email: "", phone: "", password: "" });
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const submit = async (event) => {
    event.preventDefault();
    if (!form.email || !form.password || (signup && !form.name)) { setError("Complete the required fields to continue."); return; }
    setError("");
    setIsSubmitting(true);
    try {
    if (signup && role === "seller") {
      if (form.business.length < 2) { setError("Enter the business name for your seller application."); return; }
      const result = await mutateMarketplace("post", "/auth/register", { full_name: form.name, email: form.email, password: form.password, role: "Seller", business_name: form.business, phone: form.phone });
      if (result.access_token) localStorage.setItem("argo_access_token", result.access_token);
      localStorage.setItem("argo_portal_role", "seller");
      navigate(result.access_token ? "/seller" : "/login?role=seller");
      return;
    }
    const result = signup
      ? await mutateMarketplace("post", "/auth/register", { full_name: form.name, email: form.email, password: form.password, role: "Customer" })
      : await mutateMarketplace("post", "/auth/login", { email: form.email, password: form.password });
    if (!result.access_token) { setError("This account is awaiting seller approval."); return; }
    const nextRole = result.user.role === "Marketplace Admin" ? "admin" : result.user.role === "Seller" ? "seller" : "customer";
    localStorage.setItem("argo_portal_role", nextRole);
    localStorage.setItem("argo_access_token", result.access_token);
    navigate(nextRole === "admin" ? "/dashboard" : nextRole === "seller" ? "/seller" : "/marketplace");
    } catch (requestError) {
      setError(requestError.response?.data?.detail || "Authentication could not be completed.");
    } finally {
      setIsSubmitting(false);
    }
  };
  const roleOptions = signup ? ["customer", "seller"] : ["customer", "seller", "admin"];
  return <div className="min-h-screen bg-slate-50 px-4 py-8 sm:py-16"><div className="mx-auto max-w-md"><Link to="/" className="flex items-center justify-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white"><PortalIcon name="bi-shop" /></span><span className="text-lg font-bold text-slate-900">Argo Marketplace</span></Link><div className="card mt-8 p-6 sm:p-8"><div className="text-center"><h1 className="text-2xl font-bold text-slate-900">{signup ? "Create your marketplace account" : "Welcome back"}</h1><p className="mt-2 text-sm text-slate-500">{signup ? "Choose how you will use Argo." : "Continue to your Argo workspace."}</p></div><div className={`mt-6 grid ${roleOptions.length === 3 ? "grid-cols-3" : "grid-cols-2"} rounded-lg bg-slate-100 p-1`}>{roleOptions.map((option) => <button key={option} className={`rounded-md px-3 py-2 text-sm font-semibold capitalize ${role === option ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`} onClick={() => setRole(option)} type="button">{option}</button>)}</div><form className="mt-6 space-y-4" onSubmit={submit}>{signup && <label className="block text-sm font-semibold text-slate-700">Full name<input className="input mt-1.5" value={form.name} onChange={(event) => update("name", event.target.value)} /></label>}{signup && role === "seller" && <><label className="block text-sm font-semibold text-slate-700">Business name<input className="input mt-1.5" value={form.business} onChange={(event) => update("business", event.target.value)} /></label><label className="block text-sm font-semibold text-slate-700">Phone<input className="input mt-1.5" value={form.phone} onChange={(event) => update("phone", event.target.value)} /></label></>}<label className="block text-sm font-semibold text-slate-700">Email<input className="input mt-1.5" type="email" value={form.email} onChange={(event) => update("email", event.target.value)} /></label><label className="block text-sm font-semibold text-slate-700" htmlFor="auth-password">Password<input id="auth-password" className="input mt-1.5" type={showPassword ? "text" : "password"} value={form.password} onChange={(event) => update("password", event.target.value)} /></label><button type="button" title={showPassword ? "Hide password" : "Show password"} className="-mt-2 flex items-center gap-2 text-xs font-semibold text-slate-500 hover:text-blue-600" onClick={() => setShowPassword((value) => !value)}><PortalIcon name={showPassword ? "bi-eye-slash" : "bi-eye"} /> {showPassword ? "Hide password" : "Show password"}</button>{error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}<button className="btn-primary w-full" disabled={isSubmitting} type="submit">{isSubmitting ? "Please wait..." : signup ? "Create account" : "Sign in"} <PortalIcon name="bi-arrow-right" /></button></form><p className="mt-6 text-center text-sm text-slate-500">{signup ? "Already registered?" : "New to Argo?"} <Link className="font-semibold text-blue-600" to={signup ? "/login" : "/signup"}>{signup ? "Sign in" : "Create an account"}</Link></p><Link to="/" className="mt-4 flex items-center justify-center gap-2 text-sm font-semibold text-slate-500 hover:text-blue-600"><PortalIcon name="bi-arrow-left" /> Back to landing page</Link><p className="mt-4 text-center text-[11px] leading-5 text-slate-400">Local demo access uses stored demo accounts in development. Production credentials remain managed by the ARGO authentication platform.</p></div></div></div>;
}

function CheckoutPanel({ cart, onClose, onComplete }) {
  const [form, setForm] = useState({ name: "", email: "", address: "", payment: "GCash" });
  const [error, setError] = useState("");
  const total = cart.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
  const submit = async (event) => {
    event.preventDefault();
    if (form.name.length < 2 || !form.email.includes("@") || form.address.length < 10) { setError("Enter your name, a valid email, and a complete delivery address."); return; }
    try {
      const result = await mutateMarketplace("post", "/store/checkout", { items: cart.map((item) => ({ product_id: item.product.id, quantity: item.quantity })), customer_name: form.name, customer_email: form.email, delivery_address: form.address, payment_method: form.payment });
      onComplete(result);
    } catch (requestError) {
      if (![404, 422, 500].includes(requestError.response?.status)) { setError(requestError.response?.data?.detail || "Checkout could not be completed."); return; }
      onComplete([{ order_number: `DEMO-${Date.now().toString().slice(-6)}`, seller_name: cart[0]?.product.seller || "Argo seller", item_count: cart.reduce((sum, item) => sum + item.quantity, 0), total, status: "Confirmed", payment_method: form.payment, payment_status: "Pending" }]);
    }
  };
  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 sm:items-center"><div className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-5 shadow-2xl sm:rounded-2xl sm:p-6"><div className="flex items-start justify-between"><div><h2 className="text-lg font-bold text-slate-900">Checkout</h2><p className="mt-1 text-xs text-slate-500">Your order is grouped by seller and payment remains pending until verified.</p></div><button aria-label="Close checkout" className="text-slate-400" onClick={onClose}><PortalIcon name="bi-x-lg" /></button></div><div className="mt-5 rounded-xl bg-slate-50 p-4 text-sm"><div className="flex justify-between"><span>Items</span><strong>{cart.reduce((sum, item) => sum + item.quantity, 0)}</strong></div><div className="mt-2 flex justify-between text-base"><span>Total</span><strong>{peso(total)}</strong></div></div><form className="mt-5 space-y-4" onSubmit={submit}><label className="block text-sm font-semibold text-slate-700">Full name<input className="input mt-1.5" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label><label className="block text-sm font-semibold text-slate-700">Email<input className="input mt-1.5" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label><label className="block text-sm font-semibold text-slate-700">Delivery address<textarea className="input mt-1.5 h-20 py-2" value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} /></label><fieldset><legend className="text-sm font-semibold text-slate-700">Payment method</legend><div className="mt-2 grid grid-cols-2 gap-2">{["Cash", "GCash", "PayMaya", "Bank Transfer"].map((method) => <label key={method} className={`cursor-pointer rounded-lg border p-3 text-xs font-semibold ${form.payment === method ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600"}`}><input className="sr-only" name="payment" type="radio" value={method} checked={form.payment === method} onChange={(event) => setForm({ ...form, payment: event.target.value })} />{method}</label>)}</div></fieldset>{error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}<button className="btn-primary w-full" type="submit">Place order <PortalIcon name="bi-lock" /></button></form></div></div>;
}

function CustomerPortal() {
  const location = useLocation();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All categories");
  const [cart, setCart] = useState([]);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [confirmation, setConfirmation] = useState(null);
  const productQuery = useMarketplaceList("store/products", products, { page_size: 50 }, normalizeProduct);
  const orderQuery = useQuery({ queryKey: ["portal", "customer-orders"], queryFn: () => client.get("/store/orders").then((response) => response.data.items || []), enabled: isApiMode, retry: false });
  const catalog = productQuery.items.length ? productQuery.items : products.map(normalizeProduct);
  const categoriesForFilter = Array.from(new Set(["All categories", ...categories.map((item) => item.name), ...catalog.map((item) => item.category)])).sort();
  const visible = catalog.filter((item) => (!query || `${item.name} ${item.seller} ${item.sku}`.toLowerCase().includes(query.toLowerCase())) && (category === "All categories" || item.category === category));
  const fallbackOrders = orders.slice(0, 3).map((item) => ({ order_number: item.id, seller_name: "Argo seller", item_count: item.items, total: Number(String(item.total).replace(/[^0-9.-]/g, "")), status: item.status, payment_method: "Cash", payment_status: item.status === "Completed" ? "Paid" : "Pending" }));
  const customerOrders = orderQuery.data?.length ? orderQuery.data : fallbackOrders;
  const addToCart = (product) => setCart((current) => { const existing = current.find((item) => item.product.id === product.id); return existing ? current.map((item) => item.product.id === product.id ? { ...item, quantity: Math.min(item.quantity + 1, product.stock) } : item) : [...current, { product, quantity: 1 }]; });
  const completeOrder = (result) => { setCart([]); setCheckoutOpen(false); setConfirmation(result); };
  return <PortalShell kind="customer">{location.pathname.endsWith("/orders") ? <><SectionHeading eyebrow="Customer account" title="My orders" text="Track the payment and fulfillment state of your Argo purchases." /><div className="space-y-3">{customerOrders.map((order) => <div key={order.order_number} className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-bold text-slate-900">{order.order_number}</p><p className="mt-1 text-xs text-slate-500">{order.seller_name} · {order.item_count} item{order.item_count === 1 ? "" : "s"} · {order.payment_method}</p></div><div className="flex items-center gap-4"><div className="text-right"><p className="font-bold text-slate-900">{peso(order.total)}</p><p className="text-xs text-slate-500">Payment: {order.payment_status}</p></div><span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">{order.status}</span></div></div>)}</div></> : <><SectionHeading eyebrow="Customer marketplace" title="Shop the catalog" text="Compare approved listings from Argo sellers and add what you need to your cart." action={<button className="btn-primary" onClick={() => setCheckoutOpen(true)} disabled={!cart.length}><PortalIcon name="bi-cart3" /> Cart {cart.length ? `(${cart.reduce((sum, item) => sum + item.quantity, 0)})` : ""}</button>} /><div className="card mb-6 grid gap-3 p-3 sm:grid-cols-[1fr_190px]"><input aria-label="Search marketplace" className="input" placeholder="Search products or sellers..." value={query} onChange={(event) => setQuery(event.target.value)} /><select aria-label="Marketplace category" className="input" value={category} onChange={(event) => setCategory(event.target.value)}>{categoriesForFilter.map((item) => <option key={item}>{item}</option>)}</select></div><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{visible.map((product) => <ProductTile key={product.id} product={product} onAdd={addToCart} />)}</div>{!visible.length && <div className="card p-10 text-center text-sm text-slate-500">No products match this search.</div>}{checkoutOpen && <CheckoutPanel cart={cart} onClose={() => setCheckoutOpen(false)} onComplete={completeOrder} />}{confirmation && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4"><div className="w-full max-w-md rounded-2xl bg-white p-6 text-center shadow-2xl"><span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600"><PortalIcon name="bi-check-lg" /></span><h2 className="mt-4 text-xl font-bold text-slate-900">Order placed</h2><p className="mt-2 text-sm text-slate-500">Your payment is recorded as pending verification. You can track the order from My orders.</p><button className="btn-primary mt-6 w-full" onClick={() => setConfirmation(null)}>Continue shopping</button></div></div>}</>}</PortalShell>;
}

function SellerProductForm({ categoryOptions, onSaved }) {
  const [form, setForm] = useState({ name: "", sku: "", category_id: categoryOptions[0]?.id || "", price: "", stock: "", description: "", image_url: "" });
  const [error, setError] = useState("");
  const submit = async (event) => {
    event.preventDefault();
    if (!form.name || !form.sku || !form.category_id || Number(form.price) <= 0 || Number(form.stock) < 0) { setError("Complete the product name, SKU, category, price, and stock."); return; }
    try { await mutateMarketplace("post", "/seller/products", { ...form, price: Number(form.price), stock: Number(form.stock), description: form.description.trim(), image_url: form.image_url.trim() || null }); onSaved(); } catch (requestError) { if (![404, 422, 500].includes(requestError.response?.status)) { setError(requestError.response?.data?.detail || "Could not submit product."); return; } onSaved({ ...form, id: `local-${Date.now()}`, status: "Pending Review", price: Number(form.price), stock: Number(form.stock) }); }
  };
  return <form className="card grid gap-4 p-5 sm:grid-cols-2" onSubmit={submit}><div className="sm:col-span-2"><h2 className="font-bold text-slate-900">Add a product</h2><p className="mt-1 text-xs text-slate-500">Every seller listing enters Pending Review before it appears in the customer marketplace.</p></div><label className="text-sm font-semibold text-slate-700 sm:col-span-2">Product name<input className="input mt-1.5" placeholder="e.g. Wireless Mechanical Keyboard" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label><label className="text-sm font-semibold text-slate-700">SKU<input className="input mt-1.5" placeholder="e.g. NSG-KEY-104" value={form.sku} onChange={(event) => setForm({ ...form, sku: event.target.value.toUpperCase() })} /></label><label className="text-sm font-semibold text-slate-700">Category<select className="input mt-1.5" value={form.category_id} onChange={(event) => setForm({ ...form, category_id: event.target.value })}>{categoryOptions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="text-sm font-semibold text-slate-700">Price (PHP)<input className="input mt-1.5" min="0.01" step="0.01" type="number" value={form.price} onChange={(event) => setForm({ ...form, price: event.target.value })} /></label><label className="text-sm font-semibold text-slate-700">Stock on hand<input className="input mt-1.5" min="0" step="1" type="number" value={form.stock} onChange={(event) => setForm({ ...form, stock: event.target.value })} /></label><label className="text-sm font-semibold text-slate-700 sm:col-span-2">Description<textarea className="input mt-1.5 h-24 py-2" maxLength="2000" placeholder="Describe the item customers receive." value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label><label className="text-sm font-semibold text-slate-700 sm:col-span-2">Image URL <span className="font-normal text-slate-400">(optional)</span><input className="input mt-1.5" type="url" placeholder="https://..." value={form.image_url} onChange={(event) => setForm({ ...form, image_url: event.target.value })} /></label>{error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 sm:col-span-2">{error}</p>}<button className="btn-primary sm:col-span-2" type="submit"><PortalIcon name="bi-send" /> Submit for review</button></form>;
}

function SellerPortal() {
  const location = useLocation();
  const [showForm, setShowForm] = useState(false);
  const [localProducts, setLocalProducts] = useState([]);
  const [localOrders, setLocalOrders] = useState([]);
  const productQuery = useMarketplaceList("seller/products", products.filter((item) => item.seller === "Northstar Gadgets"), { page_size: 50 }, normalizeProduct);
  const categoryQuery = useMarketplaceList("categories", categories, { page_size: 100 }, (item) => ({ id: item.id || item.slug, name: item.name, status: item.status }));
  const orderQuery = useQuery({ queryKey: ["portal", "seller-orders"], queryFn: () => client.get("/seller/orders").then((response) => response.data.items || []), enabled: isApiMode, retry: false });
  const commissionQuery = useQuery({ queryKey: ["portal", "seller-commission"], queryFn: () => client.get("/seller/commission").then((response) => response.data), enabled: isApiMode, retry: false });
  const catalog = [...localProducts, ...(productQuery.items.length ? productQuery.items : products.filter((item) => item.seller === "Northstar Gadgets").map(normalizeProduct))];
  const categoryOptions = categoryQuery.items.filter((item) => item.status === "Active");
  const fallbackOrders = orders.filter((item) => ["Mika Reyes", "Paula Villanueva", "Noel Garcia"].includes(item.buyer)).map((item) => ({ order_number: item.id, buyer_name: item.buyer, item_count: item.items, total: Number(String(item.total).replace(/[^0-9.-]/g, "")), status: item.status, payment_status: item.status === "Completed" ? "Paid" : "Pending" }));
  const sellerOrders = [...localOrders, ...(orderQuery.data?.length ? orderQuery.data : fallbackOrders)];
  const commission = commissionQuery.data || { seller_name: "Northstar Gadgets", commission_rate: 12, due_amount: 2802, overdue_amount: 2208, grace_period_days: 7, status: "Overdue", next_due_on: "2026-09-02" };
  const saveProduct = (item) => { setShowForm(false); if (item) setLocalProducts((current) => [normalizeProduct({ ...item, seller: "Northstar Gadgets", category: categoryOptions.find((option) => option.id === item.category_id)?.name || "Electronics" }), ...current]); };
  const markShipped = async (order) => { try { await mutateMarketplace("post", `/seller/orders/${order.id || order.resourceId}/mark-shipped`); } catch (requestError) { if (![404, 422, 500].includes(requestError.response?.status)) return; } setLocalOrders((current) => current.map((item) => item.order_number === order.order_number ? { ...item, status: "Shipped" } : item)); };
  const payCommission = async () => { try { await mutateMarketplace("post", "/seller/commission/pay", { amount: Number(commission.due_amount), method: "GCash" }); } catch (requestError) { if (![404, 500].includes(requestError.response?.status)) return; } }
  return <PortalShell kind="seller">{location.pathname === "/seller/products" ? <><SectionHeading eyebrow="Seller workspace" title="My products" text="Create and maintain your own listings. Argo reviews them before publishing." action={<button className="btn-primary" onClick={() => setShowForm((value) => !value)}><PortalIcon name="bi-plus-lg" /> New product</button>} />{showForm && <div className="mb-5"><SellerProductForm categoryOptions={categoryOptions} onSaved={saveProduct} /></div>}<div className="card overflow-hidden"><div className="hidden overflow-x-auto md:block"><div className="grid min-w-[760px] grid-cols-[1.5fr_1fr_1fr_0.8fr_0.8fr_0.8fr]">{["Product", "SKU", "Category", "Price", "Stock", "Status"].map((heading) => <div key={heading} className="table-head">{heading}</div>)}{catalog.map((item) => <div className="contents" key={item.id}><div className="px-4 py-4 text-xs font-semibold text-slate-800">{item.name}</div><div className="px-3 py-4 text-xs text-slate-500">{item.sku}</div><div className="px-3 py-4 text-xs text-slate-500">{item.category}</div><div className="px-3 py-4 text-xs text-slate-700">{peso(item.price)}</div><div className="px-3 py-4 text-xs text-slate-500">{item.stock}</div><div className="px-3 py-4"><span className="rounded-full bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-700">{item.status}</span></div></div>)}</div></div><div className="divide-y divide-slate-100 md:hidden">{catalog.map((item) => <div className="p-4" key={item.id}><div className="flex justify-between gap-3"><strong className="text-sm">{item.name}</strong><span className="text-xs text-slate-500">{item.status}</span></div><p className="mt-1 text-xs text-slate-500">{item.category} · {item.sku}</p><p className="mt-2 text-sm font-bold">{peso(item.price)} · {item.stock} in stock</p></div>)}</div></div></> : location.pathname === "/seller/orders" ? <><SectionHeading eyebrow="Seller workspace" title="Orders to fulfill" text="Confirm payment status and keep customers informed as you ship." /><div className="space-y-3">{sellerOrders.map((order) => <div className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between" key={order.order_number}><div><strong className="text-sm">{order.order_number}</strong><p className="mt-1 text-xs text-slate-500">{order.buyer_name} · {order.item_count} item{order.item_count === 1 ? "" : "s"} · Payment {order.payment_status}</p></div><div className="flex items-center gap-3"><strong>{peso(order.total)}</strong><span className="rounded-full bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700">{order.status}</span>{!["Completed", "Cancelled", "Shipped"].includes(order.status) && <button className="btn-secondary h-8 px-3 text-xs" onClick={() => markShipped(order)}>Mark shipped</button>}</div></div>)}</div></> : location.pathname === "/seller/commission" ? <><SectionHeading eyebrow="Seller finance" title="Commission balance" text="Argo deducts the configured percentage from verified sales. Settle overdue balances before the grace period closes." /><div className="grid gap-4 sm:grid-cols-3"><div className="card p-5"><p className="text-xs text-slate-500">Outstanding</p><p className="mt-2 text-2xl font-bold text-slate-900">{peso(commission.due_amount)}</p></div><div className="card p-5"><p className="text-xs text-slate-500">Overdue</p><p className="mt-2 text-2xl font-bold text-rose-600">{peso(commission.overdue_amount)}</p></div><div className="card p-5"><p className="text-xs text-slate-500">Commission rate</p><p className="mt-2 text-2xl font-bold text-slate-900">{commission.commission_rate}%</p></div></div><div className="card mt-5 p-5"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center"><div><h2 className="font-bold text-slate-900">Settlement policy</h2><p className="mt-1 text-sm text-slate-500">You have {commission.grace_period_days} days after a verified sale to settle commission.</p><p className="mt-2 text-xs font-semibold text-rose-600">Account status: {commission.status}</p></div><button className="btn-primary" disabled={!commission.due_amount} onClick={payCommission}>Pay commission via GCash</button></div></div></> : <><SectionHeading eyebrow="Seller workspace" title={`Good morning, ${commission.seller_name || "seller"}`} text="Your shop, fulfillment queue, and commission status in one place." action={<Link to="/seller/products" className="btn-primary"><PortalIcon name="bi-plus-lg" /> Add product</Link>} /><div className="grid gap-4 sm:grid-cols-3"><div className="card p-5"><p className="text-xs text-slate-500">Active listings</p><p className="mt-2 text-2xl font-bold">{catalog.filter((item) => item.status === "Active").length}</p></div><div className="card p-5"><p className="text-xs text-slate-500">Orders to fulfill</p><p className="mt-2 text-2xl font-bold">{sellerOrders.filter((item) => !["Completed", "Cancelled"].includes(item.status)).length}</p></div><div className="card p-5"><p className="text-xs text-slate-500">Commission due</p><p className="mt-2 text-2xl font-bold text-rose-600">{peso(commission.due_amount)}</p></div></div><div className="mt-6 grid gap-4 lg:grid-cols-2"><Link to="/seller/products" className="card p-5 hover:border-blue-300"><PortalIcon name="bi-box-seam" /><h2 className="mt-4 font-bold">Manage your catalog</h2><p className="mt-1 text-sm text-slate-500">Create listings with the right category, price, and stock.</p></Link><Link to="/seller/commission" className="card p-5 hover:border-blue-300"><PortalIcon name="bi-receipt" /><h2 className="mt-4 font-bold">Review commission balance</h2><p className="mt-1 text-sm text-slate-500">See what is due, what is overdue, and when suspension can apply.</p></Link></div></>}</PortalShell>;
}

function AdminCommissionPage({ onToast }) {
  const query = useQuery({ queryKey: ["admin", "commission"], queryFn: () => client.get("/admin/commission").then((response) => response.data), enabled: isApiMode, retry: false });
  const fallback = sellers.map((seller, index) => ({ seller_id: seller.id, seller_name: seller.business, commission_rate: Number(String(seller.commission).replace(/[^0-9.-]/g, "")), due_amount: index === 0 ? 2802 : index === 1 ? 131.5 : 0, overdue_amount: index === 0 ? 2208 : 0, grace_period_days: 7, status: index === 0 ? "Overdue" : "Current", next_due_on: "2026-09-02" }));
  const balances = query.data?.length ? query.data : fallback;
  const act = async (seller, action) => { try { await mutateMarketplace("post", `/admin/commission/${seller.seller_id}/${action}`); onToast(action === "remind" ? `Reminder queued for ${seller.seller_name}` : `${seller.seller_name} suspended`); } catch (error) { onToast(error.response?.data?.detail || "Commission action could not be completed"); } };
  return <><SectionHeading title="Commission control" text="Monitor what sellers owe Argo, send reminders, and suspend overdue accounts when the grace period expires." /><div className="grid gap-4 sm:grid-cols-3"><div className="card p-5"><p className="text-xs text-slate-500">Total due</p><p className="mt-2 text-2xl font-bold">{peso(balances.reduce((sum, item) => sum + Number(item.due_amount || 0), 0))}</p></div><div className="card p-5"><p className="text-xs text-slate-500">Overdue</p><p className="mt-2 text-2xl font-bold text-rose-600">{peso(balances.reduce((sum, item) => sum + Number(item.overdue_amount || 0), 0))}</p></div><div className="card p-5"><p className="text-xs text-slate-500">Sellers needing attention</p><p className="mt-2 text-2xl font-bold">{balances.filter((item) => item.status === "Overdue").length}</p></div></div><div className="card mt-5 overflow-hidden"><div className="hidden overflow-x-auto md:block"><div className="grid min-w-[800px] grid-cols-[1.3fr_0.7fr_1fr_1fr_0.9fr_1.2fr]">{["Seller", "Rate", "Due", "Overdue", "Status", "Actions"].map((heading) => <div key={heading} className="table-head">{heading}</div>)}{balances.map((seller) => <div className="contents" key={seller.seller_id}><div className="px-4 py-4 text-xs font-semibold">{seller.seller_name}</div><div className="px-3 py-4 text-xs">{seller.commission_rate}%</div><div className="px-3 py-4 text-xs">{peso(seller.due_amount)}</div><div className="px-3 py-4 text-xs text-rose-600">{peso(seller.overdue_amount)}</div><div className="px-3 py-4 text-xs font-semibold">{seller.status}</div><div className="flex gap-2 px-3 py-4"><button className="btn-secondary h-8 px-2 text-xs" disabled={!seller.due_amount} onClick={() => act(seller, "remind")}>Remind</button><button className="btn-secondary h-8 px-2 text-xs text-rose-600" disabled={seller.overdue_amount <= 0} onClick={() => act(seller, "suspend")}>Suspend</button></div></div>)}</div></div><div className="divide-y divide-slate-100 md:hidden">{balances.map((seller) => <div className="p-4" key={seller.seller_id}><div className="flex justify-between"><strong className="text-sm">{seller.seller_name}</strong><span className="text-xs font-semibold">{seller.status}</span></div><p className="mt-2 text-sm">Due {peso(seller.due_amount)} · Overdue {peso(seller.overdue_amount)}</p><div className="mt-3 flex gap-2"><button className="btn-secondary h-8 px-2 text-xs" onClick={() => act(seller, "remind")}>Remind</button><button className="btn-secondary h-8 px-2 text-xs text-rose-600" disabled={seller.overdue_amount <= 0} onClick={() => act(seller, "suspend")}>Suspend</button></div></div>)}</div></div></>;
}

export function PortalRoutes({ onToast }) {
  return <Routes><Route path="/" element={<LandingPage />} /><Route path="/marketplace/orders" element={<RoleGate role="customer"><CustomerPortal /></RoleGate>} /><Route path="/marketplace/*" element={<CustomerPortal />} /><Route path="/seller/*" element={<RoleGate role="seller"><SellerPortal /></RoleGate>} /><Route path="/login" element={<AuthPage />} /><Route path="/signup" element={<AuthPage signup />} /></Routes>;
}

export { AdminCommissionPage };
