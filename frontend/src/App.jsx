import { Fragment, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Navigate,
  NavLink,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { twMerge } from "tailwind-merge";
import { clsx } from "clsx";
import {
  Area,
  AreaChart,
  Bar,
  BarChart as ReBarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  categories,
  dashboardData,
  demoIdentity,
  disputes,
  applications,
  flaggedReviews,
  orders,
  payouts,
  products,
  resolvedDisputes,
  reviews,
  sellers,
} from "./data";
import { mutateMarketplace, useMarketplaceDashboard, useMarketplaceList } from "./api";
import { clearAuthSession, getAuthSession } from "./authSession";
import { exportProductsWorkbook } from "./lib/productExport";
import { AdminCommissionPage, PortalRoutes } from "./PortalApp";

const cn = (...inputs) => twMerge(clsx(inputs));
const icon = (name) => `bi ${name}`;
const formatCurrency = (value) => typeof value === "string" && value.startsWith("₱") ? value : `₱${Number(value || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const formatDate = (value) => {
  if (!value || value === "Today") return value || "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
};

function Icon({ name, className = "" }) {
  return <i aria-hidden="true" className={cn(icon(name), className)} />;
}

const navItems = [
  { label: "Dashboard", to: "/dashboard", icon: "bi-speedometer2" },
  { label: "Products", to: "/products", icon: "bi-box-seam", badge: "326" },
  { label: "Orders", to: "/orders", icon: "bi-receipt", badge: "96" },
  { label: "Sellers", to: "/sellers", icon: "bi-shop" },
  { label: "Reviews", to: "/reviews", icon: "bi-star" },
  {
    label: "Disputes",
    to: "/disputes",
    icon: "bi-exclamation-triangle",
    badge: "3",
  },
  { label: "Commission", to: "/commission", icon: "bi-percent" },
];

const adminRouteRoots = [
  "/dashboard",
  "/products",
  "/orders",
  "/sellers",
  "/reviews",
  "/disputes",
  "/commission",
  "/settings",
];

function Sidebar({ compact, onCompactToggle, open, onClose }) {
  return (
    <>
      {open && (
        <button
          aria-label="Close navigation"
          className="fixed inset-0 z-30 bg-slate-950/50 lg:hidden"
          onClick={onClose}
        />
      )}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-52 -translate-x-full flex-col bg-navy text-slate-300 transition-[transform,width] duration-200 lg:translate-x-0",
          open && "translate-x-0",
          compact && "lg:w-[4.5rem]",
        )}
      >
        <div
          className={cn(
            "relative flex h-[101px] items-center border-b border-white/5 px-4",
            compact && "lg:justify-center lg:px-0",
          )}
        >
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-sm text-white">
              <Icon name="bi-shop" />
            </div>
            <div className={cn("min-w-0", compact && "lg:hidden")}>
              <div className="text-sm font-semibold text-white">Marketplace</div>
              <div className="text-[10px] font-medium text-slate-400">
                Management System
              </div>
            </div>
          </div>
          <button
            type="button"
            aria-label={compact ? "Expand sidebar" : "Compact sidebar"}
            aria-pressed={compact}
            title={compact ? "Expand sidebar" : "Compact sidebar"}
            onClick={onCompactToggle}
            className="absolute -right-3 z-50 hidden h-7 w-7 items-center justify-center rounded-md border border-slate-700 bg-navy text-slate-400 shadow-sm transition hover:bg-slate-800 hover:text-white focus:outline-none focus:ring-2 focus:ring-blue-400 lg:inline-flex"
          >
            <Icon name={compact ? "bi-chevron-right" : "bi-chevron-left"} />
          </button>
        </div>
        <nav
          className="flex-1 space-y-1 px-2 py-4"
          aria-label="Marketplace modules"
        >
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={onClose}
              aria-label={item.label}
              title={compact ? item.label : undefined}
              className={({ isActive }) =>
                cn(
                  "group flex h-9 items-center gap-3 rounded-lg px-3 text-[13px] transition lg:justify-start",
                  compact && "lg:justify-center lg:px-0",
                  isActive
                    ? "bg-slate-700/60 text-white"
                    : "text-slate-400 hover:bg-white/5 hover:text-slate-100",
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Icon
                    name={item.icon}
                    className={cn(
                      "text-[14px]",
                      isActive ? "text-blue-300" : "text-slate-500",
                    )}
                  />
                  <span className={cn("flex-1", compact && "lg:sr-only")}>
                    {item.label}
                  </span>
                  {item.badge && (
                    <span
                      className={cn(
                        "rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                        compact && "lg:hidden",
                        isActive ? "bg-blue-600 text-white" : "text-slate-300",
                      )}
                    >
                      {item.badge}
                    </span>
                  )}
                </>
              )}
            </NavLink>
          ))}
          <div
            className={cn(
              "px-3 pb-1 pt-5 text-[10px] font-semibold uppercase tracking-widest text-slate-600",
              compact && "lg:sr-only",
            )}
          >
            Administration
          </div>
          <NavLink
            to="/settings"
            onClick={onClose}
            aria-label="Settings"
            title={compact ? "Settings" : undefined}
            className={({ isActive }) =>
              cn(
                "group flex h-9 items-center gap-3 rounded-lg px-3 text-[13px] transition lg:justify-start",
                compact && "lg:justify-center lg:px-0",
                isActive
                  ? "bg-slate-700/60 text-white"
                  : "text-slate-400 hover:bg-white/5 hover:text-slate-100",
              )
            }
          >
            {({ isActive }) => (
              <>
                <Icon
                  name="bi-gear"
                  className={cn(
                    "text-[14px]",
                    isActive ? "text-blue-300" : "text-slate-500",
                  )}
                />
                <span className={cn(compact && "lg:sr-only")}>Settings</span>
              </>
            )}
          </NavLink>
        </nav>
        <div
          className={cn(
            "border-t border-white/5 px-4 py-3 text-[10px] text-slate-600",
            compact && "lg:hidden",
          )}
        >
          Argo · Marketplace v1.0
        </div>
      </aside>
    </>
  );
}

function Topbar({ compact, onMenu, onToast, onSignOut }) {
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-20 h-[72px] bg-navy text-white transition-[left] duration-200 lg:h-[101px] lg:left-52",
        compact && "lg:left-[4.5rem]",
      )}
    >
      <div className="flex h-full items-center justify-between gap-3 px-4 sm:px-6 lg:justify-end lg:gap-4 lg:px-7">
        <button
          aria-label="Open navigation"
          className="rounded-lg p-2 text-slate-300 hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-blue-400 lg:hidden"
          onClick={onMenu}
        >
          <Icon name="bi-list" />
        </button>
        <div className="mr-auto flex min-w-0 items-center gap-2 lg:hidden">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-sm text-white">
            <Icon name="bi-shop" />
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-white">ARGO</div>
            <div className="truncate text-[10px] font-medium text-slate-400">Marketplace MMS</div>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:gap-4">
          <div className="relative">
            <button
              aria-label="Notifications"
              aria-expanded={notificationsOpen}
              className="relative rounded-lg p-2 text-slate-300 hover:bg-white/10"
              onClick={() => {
                setNotificationsOpen((value) => !value);
                setProfileOpen(false);
              }}
            >
              <Icon name="bi-bell" />
              <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-rose-500" />
            </button>
            {notificationsOpen && (
              <div className="absolute right-0 top-11 z-50 w-72 rounded-xl border border-slate-200 bg-white p-3 text-slate-800 shadow-2xl">
                <div className="flex items-center justify-between">
                  <strong className="text-sm">Notifications</strong>
                  <button
                    className="text-xs text-blue-600"
                    onClick={() => {
                      setNotificationsOpen(false);
                      onToast("Notifications marked as read");
                    }}
                  >
                    Mark all read
                  </button>
                </div>
                <div className="mt-3 space-y-2">
                  <div className="rounded-lg bg-blue-50 p-3 text-xs">
                    <strong>2 new disputes</strong>
                    <div className="mt-1 text-slate-500">
                      Review the latest escalation queue.
                    </div>
                  </div>
                  <div className="rounded-lg bg-amber-50 p-3 text-xs">
                    <strong>2 seller applications</strong>
                    <div className="mt-1 text-slate-500">
                      Pending approval in Sellers.
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
          <div className="relative">
            <button
              aria-label="Open profile menu"
              aria-expanded={profileOpen}
              className="flex items-center gap-2 rounded-lg p-1.5 text-left hover:bg-white/10"
              onClick={() => {
                setProfileOpen((value) => !value);
                setNotificationsOpen(false);
              }}
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-xs font-semibold">
                {demoIdentity.initials}
              </div>
              <div className="hidden leading-tight sm:block">
                <div className="text-xs font-semibold">
                  {demoIdentity.userName}
                </div>
                <div className="text-[10px] text-slate-500">
                  {demoIdentity.role}
                </div>
              </div>
              <Icon
                name="bi-chevron-down"
                className="hidden text-[10px] text-slate-500 sm:block"
              />
            </button>
            {profileOpen && (
              <div className="absolute right-0 top-12 z-50 w-48 rounded-xl border border-slate-200 bg-white p-2 text-sm text-slate-700 shadow-2xl">
                <div className="border-b border-slate-100 px-3 py-2">
                  <div className="font-semibold">{demoIdentity.userName}</div>
                  <div className="text-xs text-slate-500">
                    {demoIdentity.role}
                  </div>
                </div>
                <button
                  className="mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs hover:bg-slate-50"
                  onClick={() => {
                    setProfileOpen(false);
                    onToast("Profile settings are managed by ARGO");
                  }}
                >
                  <Icon name="bi-person" />
                  Profile
                </button>
                <button
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs hover:bg-slate-50"
                  onClick={() => {
                    setProfileOpen(false);
                    onSignOut();
                  }}
                >
                  <Icon name="bi-box-arrow-right" />
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

function Layout({ children, toast, onToast }) {
  const [sidebarCompact, setSidebarCompact] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const signOut = () => {
    clearAuthSession();
    queryClient.clear();
    navigate("/login?role=admin", { replace: true });
  };
  return (
    <div className="min-h-screen bg-canvas">
      <Sidebar
        compact={sidebarCompact}
        onCompactToggle={() => setSidebarCompact((value) => !value)}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />
      <Topbar
        compact={sidebarCompact}
        onMenu={() => setSidebarOpen(true)}
        onToast={onToast}
        onSignOut={signOut}
      />
      <main
        className={cn(
          "min-h-screen pt-[72px] transition-[margin] duration-200 lg:ml-52 lg:pt-[101px]",
          sidebarCompact && "lg:ml-[4.5rem]",
        )}
      >
        <div className="mx-auto max-w-[1440px] p-4 sm:p-6 lg:p-7">
          {children}
        </div>
      </main>
      {toast && (
        <div
          role="status"
          className="fixed bottom-5 right-5 z-50 flex items-center gap-3 rounded-lg bg-slate-900 px-4 py-3 text-sm text-white shadow-xl"
        >
          <Icon name="bi-check-circle-fill" className="text-emerald-400" />
          {toast}
          <button
            aria-label="Dismiss notification"
            onClick={() => onToast("")}
            className="ml-2 text-slate-400"
          >
            <Icon name="bi-x" />
          </button>
        </div>
      )}
    </div>
  );
}

function PageHeader({ title, subtitle, action, children }) {
  return (
    <div className="mb-4 flex flex-col justify-between gap-3 sm:mb-5 sm:flex-row sm:items-start sm:gap-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-ink sm:text-[22px]">
          {title}
        </h1>
        <p className="mt-1 text-xs text-slate-500">{subtitle}</p>
      </div>
      <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
        {children}
        {action && <div className="w-full sm:w-auto">{action}</div>}
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  change,
  direction,
  changeTone,
  icon: iconName,
  tone = "blue",
}) {
  const tones = {
    blue: "bg-blue-50 text-blue-600",
    green: "bg-emerald-50 text-emerald-600",
    rose: "bg-rose-50 text-rose-600",
    amber: "bg-amber-50 text-amber-600",
  };
  return (
    <div className="card flex min-h-[68px] items-center gap-3 p-4">
      <div
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm",
          tones[tone],
        )}
      >
        <Icon name={iconName} />
      </div>
      <div className="min-w-0">
        <div className="text-xl font-bold leading-none text-ink">{value}</div>
        <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-500">
          <span>{label}</span>
          {change && (
            <span
              className={cn(
                "font-semibold",
                (changeTone ||
                  (direction === "down" ? "negative" : "positive")) ===
                  "negative"
                  ? "text-rose-500"
                  : "text-emerald-600",
              )}
            >
              <Icon
                name={
                  direction === "down"
                    ? "bi-caret-down-fill"
                    : "bi-caret-up-fill"
                }
              />{" "}
              {change}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function Tabs({ items, active, onChange }) {
  return (
    <div className="flex max-w-full overflow-x-auto rounded-lg border border-slate-200 bg-white p-0.5 sm:inline-flex">
      {items.map((item) => {
        const value = typeof item === "string" ? item : item.value;
        const label = typeof item === "string" ? item : item.label;
        const badge = typeof item === "string" ? null : item.badge;
        return (
          <button
            key={value}
            type="button"
            aria-pressed={active === value}
            onClick={() => onChange(value)}
            className={cn(
              "shrink-0 whitespace-nowrap rounded-md px-3.5 py-2 text-xs font-medium text-slate-500",
              active === value
                ? "bg-slate-50 text-slate-800 shadow-sm"
                : "hover:text-slate-800",
            )}
          >
            {label}
            {badge && <span className="ml-1.5 text-amber-600">{badge}</span>}
          </button>
        );
      })}
    </div>
  );
}

function StatusBadge({ status }) {
  const styles = {
    Active: "bg-emerald-50 text-emerald-700 border-emerald-100",
    Completed: "bg-emerald-50 text-emerald-700 border-emerald-100",
    Refunded: "bg-emerald-50 text-emerald-700 border-emerald-100",
    Confirmed: "bg-blue-50 text-blue-700 border-blue-100",
    Processing: "bg-blue-50 text-blue-700 border-blue-100",
    Open: "bg-rose-50 text-rose-700 border-rose-100",
    Cancelled: "bg-rose-50 text-rose-700 border-rose-100",
    Investigating: "bg-amber-50 text-amber-700 border-amber-100",
    Pending: "bg-amber-50 text-amber-700 border-amber-100",
    "Pending Review": "bg-amber-50 text-amber-700 border-amber-100",
    Rejected: "bg-slate-100 text-slate-600 border-slate-200",
    Archived: "bg-slate-100 text-slate-600 border-slate-200",
    Suspended: "bg-rose-50 text-rose-700 border-rose-100",
    Paid: "bg-emerald-50 text-emerald-700 border-emerald-100",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold",
        styles[status] || styles.Active,
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {status}
    </span>
  );
}

function Toolbar({ placeholder, query, setQuery, children }) {
  return (
    <div className="flex flex-col gap-2 border-b border-slate-100 p-3 sm:flex-row sm:flex-wrap sm:items-center sm:p-4">
      <div className="relative min-w-0 flex-1 sm:min-w-[220px]">
        <Icon
          name="bi-search"
          className="absolute left-3 top-3 text-slate-400"
        />
        <input
          className="input pl-9"
          placeholder={placeholder}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      {children}
    </div>
  );
}

function EmptyState({
  title = "No results found",
  text = "Try adjusting your filters or search terms.",
}) {
  return (
    <div className="flex min-h-40 flex-col items-center justify-center p-6 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-400">
        <Icon name="bi-inbox" />
      </div>
      <div className="mt-3 text-sm font-semibold text-slate-700">{title}</div>
      <div className="mt-1 text-xs text-slate-500">{text}</div>
    </div>
  );
}

function ModalShell({ title, onClose, children, footer, sizeClass = "max-w-md" }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4"
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          "max-h-[calc(100dvh-2rem)] w-full overflow-y-auto rounded-xl bg-white p-5 shadow-2xl sm:p-6",
          sizeClass,
        )}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-ink">{title}</h2>
          <button
            aria-label={`Close ${title}`}
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700"
          >
            <Icon name="bi-x-lg" />
          </button>
        </div>
        {children}
        {footer}
      </div>
    </div>
  );
}

function ActionModal({
  title,
  label = "Name",
  placeholder,
  initialValue = "",
  onClose,
  onSave,
}) {
  const [value, setValue] = useState(initialValue);
  return (
    <ModalShell title={title} onClose={onClose}>
      <label className="mt-5 block text-xs font-semibold text-slate-600">
        {label}
        <input
          autoFocus
          className="input mt-2"
          placeholder={placeholder}
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
      </label>
      <div className="mt-6 flex justify-end gap-2">
        <button className="btn-secondary" onClick={onClose}>
          Cancel
        </button>
        <button
          className="btn-primary"
          disabled={!value.trim()}
          onClick={() => onSave(value.trim())}
        >
          Save
        </button>
      </div>
    </ModalShell>
  );
}

function ProductCreateModal({
  sellers: sellerOptions,
  categories: categoryOptions,
  isCatalogLoading,
  onClose,
  onSave,
}) {
  const [form, setForm] = useState({
    name: "",
    sku: "",
    sellerId: "",
    categoryId: "",
    price: "",
    stock: "",
    description: "",
    imageUrl: "",
  });
  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const hasCatalogOptions = sellerOptions.length > 0 && categoryOptions.length > 0;

  const updateField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
    setSubmitError("");
  };

  const validate = () => {
    const nextErrors = {};
    if (form.name.trim().length < 2) nextErrors.name = "Enter a product name with at least 2 characters.";
    if (form.sku.trim().length < 2) nextErrors.sku = "Enter a SKU with at least 2 characters.";
    if (!form.sellerId) nextErrors.sellerId = "Select the seller that owns this listing.";
    if (!form.categoryId) nextErrors.categoryId = "Select a product category.";
    const price = Number(form.price);
    if (!Number.isFinite(price) || price <= 0) nextErrors.price = "Enter a unit price greater than zero.";
    if (!/^\d+$/.test(form.stock)) nextErrors.stock = "Enter a whole-number stock quantity of zero or more.";
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (isCatalogLoading || !hasCatalogOptions || !validate()) return;
    setIsSaving(true);
    try {
      await onSave({
        name: form.name.trim(),
        sku: form.sku.trim().toUpperCase(),
        seller_id: form.sellerId,
        category_id: form.categoryId,
        price: Number(form.price),
        stock: Number(form.stock),
        description: form.description.trim(),
        image_url: form.imageUrl.trim() || null,
      });
      onClose();
    } catch (error) {
      setSubmitError(error.response?.data?.detail || "Could not save this product. Try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const fieldClass = (field) =>
    cn("input mt-1.5", errors[field] && "border-rose-400 focus:border-rose-500 focus:ring-rose-200");

  return (
    <ModalShell title="New product" onClose={onClose} sizeClass="max-w-2xl">
      <p className="mt-1 text-xs leading-5 text-slate-500">
        Add the listing details required for the marketplace catalog. New listings are submitted for review.
      </p>
      <form className="mt-5" onSubmit={handleSubmit} noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-xs font-semibold text-slate-700 sm:col-span-2" htmlFor="product-name">
            Product name <span className="text-rose-600">*</span>
            <input
              id="product-name"
              autoFocus
              className={fieldClass("name")}
              placeholder="e.g. Bluetooth Mechanical Keyboard"
              value={form.name}
              onChange={(event) => updateField("name", event.target.value)}
            />
            <span className="mt-1 block text-[11px] font-normal text-slate-500">Use the customer-facing listing title.</span>
            {errors.name && <span className="mt-1 block text-[11px] font-medium text-rose-600">{errors.name}</span>}
          </label>
          <label className="block text-xs font-semibold text-slate-700" htmlFor="product-sku">
            SKU <span className="text-rose-600">*</span>
            <input
              id="product-sku"
              className={fieldClass("sku")}
              placeholder="e.g. NSG-KEY-104"
              value={form.sku}
              onChange={(event) => updateField("sku", event.target.value.toUpperCase())}
            />
            <span className="mt-1 block text-[11px] font-normal text-slate-500">Must be unique within this marketplace.</span>
            {errors.sku && <span className="mt-1 block text-[11px] font-medium text-rose-600">{errors.sku}</span>}
          </label>
          <label className="block text-xs font-semibold text-slate-700" htmlFor="product-price">
            Unit price (PHP) <span className="text-rose-600">*</span>
            <input
              id="product-price"
              className={fieldClass("price")}
              inputMode="decimal"
              min="0.01"
              step="0.01"
              type="number"
              placeholder="0.00"
              value={form.price}
              onChange={(event) => updateField("price", event.target.value)}
            />
            <span className="mt-1 block text-[11px] font-normal text-slate-500">Enter the full customer price before fees.</span>
            {errors.price && <span className="mt-1 block text-[11px] font-medium text-rose-600">{errors.price}</span>}
          </label>
          <label className="block text-xs font-semibold text-slate-700" htmlFor="product-seller">
            Seller <span className="text-rose-600">*</span>
            <select
              id="product-seller"
              className={fieldClass("sellerId")}
              disabled={isCatalogLoading || sellerOptions.length === 0}
              value={form.sellerId}
              onChange={(event) => updateField("sellerId", event.target.value)}
            >
              <option value="">{isCatalogLoading ? "Loading sellers..." : "Select seller"}</option>
              {sellerOptions.map((seller) => <option key={seller.id} value={seller.id}>{seller.name}</option>)}
            </select>
            <span className="mt-1 block text-[11px] font-normal text-slate-500">Only active seller accounts can receive listings.</span>
            {errors.sellerId && <span className="mt-1 block text-[11px] font-medium text-rose-600">{errors.sellerId}</span>}
          </label>
          <label className="block text-xs font-semibold text-slate-700" htmlFor="product-category">
            Category <span className="text-rose-600">*</span>
            <select
              id="product-category"
              className={fieldClass("categoryId")}
              disabled={isCatalogLoading || categoryOptions.length === 0}
              value={form.categoryId}
              onChange={(event) => updateField("categoryId", event.target.value)}
            >
              <option value="">{isCatalogLoading ? "Loading categories..." : "Select category"}</option>
              {categoryOptions.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select>
            <span className="mt-1 block text-[11px] font-normal text-slate-500">Use an active marketplace category.</span>
            {errors.categoryId && <span className="mt-1 block text-[11px] font-medium text-rose-600">{errors.categoryId}</span>}
          </label>
          <label className="block text-xs font-semibold text-slate-700" htmlFor="product-stock">
            Stock on hand <span className="text-rose-600">*</span>
            <input
              id="product-stock"
              className={fieldClass("stock")}
              inputMode="numeric"
              min="0"
              step="1"
              type="number"
              placeholder="0"
              value={form.stock}
              onChange={(event) => updateField("stock", event.target.value)}
            />
            <span className="mt-1 block text-[11px] font-normal text-slate-500">Use zero when the listing is temporarily out of stock.</span>
            {errors.stock && <span className="mt-1 block text-[11px] font-medium text-rose-600">{errors.stock}</span>}
          </label>
          <label className="block text-xs font-semibold text-slate-700 sm:col-span-2" htmlFor="product-description">
            Description
            <textarea
              id="product-description"
              className="input mt-1.5 h-24 py-2"
              maxLength="2000"
              placeholder="Describe what customers receive, key features, and important care notes."
              value={form.description}
              onChange={(event) => updateField("description", event.target.value)}
            />
            <span className="mt-1 block text-[11px] font-normal text-slate-500">{form.description.length}/2000 characters</span>
          </label>
          <label className="block text-xs font-semibold text-slate-700 sm:col-span-2" htmlFor="product-image-url">
            Image URL <span className="font-normal text-slate-400">(optional)</span>
            <input
              id="product-image-url"
              className="input mt-1.5"
              type="url"
              placeholder="https://..."
              value={form.imageUrl}
              onChange={(event) => updateField("imageUrl", event.target.value)}
            />
          </label>
        </div>
        <div className="mt-5 grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs sm:grid-cols-2">
          <div>
            <span className="font-semibold text-slate-700">Initial status</span>
            <p className="mt-1 text-slate-500">Pending Review</p>
          </div>
          <div>
            <span className="font-semibold text-slate-700">Updated</span>
            <p className="mt-1 text-slate-500">Set automatically when saved</p>
          </div>
        </div>
        {!isCatalogLoading && !hasCatalogOptions && (
          <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
            Add at least one active seller and category before creating a product.
          </p>
        )}
        {submitError && <p className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{submitError}</p>}
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={isSaving}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={isSaving || isCatalogLoading || !hasCatalogOptions}>
            {isSaving ? "Saving..." : "Create product"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

function ProductEditModal({
  product,
  sellers: sellerOptions,
  categories: categoryOptions,
  isCatalogLoading,
  onClose,
  onSave,
}) {
  const [form, setForm] = useState(() => ({
    name: product.name || "",
    sku: product.sku || "",
    sellerId: product.seller_id || sellerOptions.find((seller) => seller.name === product.seller)?.id || "",
    categoryId: product.category_id || categoryOptions.find((category) => category.name === product.category)?.id || "",
    price: String(product.price || "").replace(/[^0-9.]/g, ""),
    stock: String(product.stock ?? ""),
    description: product.description || "",
    imageUrl: product.image_url || "",
  }));
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const updateField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
    setError("");
  };

  useEffect(() => {
    setForm((current) => ({
      ...current,
      sellerId: current.sellerId || sellerOptions.find((seller) => seller.name === product.seller)?.id || "",
      categoryId: current.categoryId || categoryOptions.find((category) => category.name === product.category)?.id || "",
    }));
  }, [categoryOptions, product.category, product.seller, sellerOptions]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (form.name.trim().length < 2) {
      setError("Enter a product name with at least 2 characters.");
      return;
    }
    if (form.sku.trim().length < 2) {
      setError("Enter a SKU with at least 2 characters.");
      return;
    }
    if (!form.sellerId) {
      setError("Select the seller that owns this listing.");
      return;
    }
    if (!form.categoryId) {
      setError("Select a product category.");
      return;
    }
    if (!Number.isFinite(Number(form.price)) || Number(form.price) <= 0) {
      setError("Enter a unit price greater than zero.");
      return;
    }
    if (!/^\d+$/.test(form.stock)) {
      setError("Enter a whole-number stock quantity of zero or more.");
      return;
    }
    setError("");
    setIsSaving(true);
    try {
      await onSave({
        name: form.name.trim(),
        sku: form.sku.trim().toUpperCase(),
        seller_id: form.sellerId,
        category_id: form.categoryId,
        price: Number(form.price),
        stock: Number(form.stock),
        description: form.description.trim(),
        image_url: form.imageUrl.trim() || null,
      });
      onClose();
    } catch (saveError) {
      setError(saveError.response?.data?.detail || "Could not update this product. Try again.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <ModalShell title="Edit product" onClose={onClose} sizeClass="max-w-2xl">
      <p className="mt-1 text-xs leading-5 text-slate-500">
        Update the complete listing record. Status and review state are controlled by catalog actions.
      </p>
      <form className="mt-5" onSubmit={handleSubmit} noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-xs font-semibold text-slate-700 sm:col-span-2" htmlFor="edit-product-name">
          Product name <span className="text-rose-600">*</span>
          <input
            id="edit-product-name"
            autoFocus
            className="input mt-1.5"
            value={form.name}
            onChange={(event) => updateField("name", event.target.value)}
          />
        </label>
        <label className="block text-xs font-semibold text-slate-700" htmlFor="edit-product-sku">
          SKU <span className="text-rose-600">*</span>
          <input id="edit-product-sku" className="input mt-1.5" value={form.sku} onChange={(event) => updateField("sku", event.target.value.toUpperCase())} />
        </label>
        <label className="block text-xs font-semibold text-slate-700" htmlFor="edit-product-seller">
          Seller <span className="text-rose-600">*</span>
          <select id="edit-product-seller" className="input mt-1.5" disabled={isCatalogLoading || sellerOptions.length === 0} value={form.sellerId} onChange={(event) => updateField("sellerId", event.target.value)}>
            <option value="">{isCatalogLoading ? "Loading sellers..." : "Select seller"}</option>
            {sellerOptions.map((seller) => <option key={seller.id} value={seller.id}>{seller.name}</option>)}
          </select>
        </label>
        <label className="block text-xs font-semibold text-slate-700" htmlFor="edit-product-category">
          Category <span className="text-rose-600">*</span>
          <select
            id="edit-product-category"
            className="input mt-1.5"
            disabled={isCatalogLoading || categoryOptions.length === 0}
            value={form.categoryId}
            onChange={(event) => updateField("categoryId", event.target.value)}
          >
            <option value="">{isCatalogLoading ? "Loading categories..." : "Select category"}</option>
            {categoryOptions.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
          </select>
        </label>
        <label className="block text-xs font-semibold text-slate-700" htmlFor="edit-product-price">
          Price (PHP) <span className="text-rose-600">*</span>
          <input id="edit-product-price" className="input mt-1.5" min="0.01" step="0.01" type="number" value={form.price} onChange={(event) => updateField("price", event.target.value)} />
        </label>
        <label className="block text-xs font-semibold text-slate-700" htmlFor="edit-product-stock">
          Stock on hand <span className="text-rose-600">*</span>
          <input id="edit-product-stock" className="input mt-1.5" min="0" step="1" type="number" value={form.stock} onChange={(event) => updateField("stock", event.target.value)} />
        </label>
        <label className="block text-xs font-semibold text-slate-700 sm:col-span-2" htmlFor="edit-product-description">
          Description
          <textarea id="edit-product-description" className="input mt-1.5 h-24 py-2" maxLength="2000" placeholder="Describe what customers receive, key features, and important care notes." value={form.description} onChange={(event) => updateField("description", event.target.value)} />
          <span className="mt-1 block text-[11px] font-normal text-slate-500">{form.description.length}/2000 characters</span>
        </label>
        <label className="block text-xs font-semibold text-slate-700 sm:col-span-2" htmlFor="edit-product-image-url">
          Image URL <span className="font-normal text-slate-400">(optional)</span>
          <input id="edit-product-image-url" className="input mt-1.5" type="url" placeholder="https://..." value={form.imageUrl} onChange={(event) => updateField("imageUrl", event.target.value)} />
        </label>
        </div>
        {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={isSaving}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={isSaving || isCatalogLoading || categoryOptions.length === 0 || sellerOptions.length === 0}>
            {isSaving ? "Saving..." : "Save changes"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

function DetailModal({ title, rows, onClose, actions }) {
  return (
    <ModalShell
      title={title}
      onClose={onClose}
      footer={
        actions && (
          <div className="mt-6 flex justify-end gap-2">
            {actions}
            <button className="btn-secondary" onClick={onClose}>
              Close
            </button>
          </div>
        )
      }
    >
      <div className="mt-5 divide-y divide-slate-100 rounded-lg border border-slate-100">
        {rows.map(([label, value]) => (
          <div
            key={label}
            className="flex items-start justify-between gap-4 px-3 py-2.5 text-xs"
          >
            <span className="text-slate-500">{label}</span>
            <strong className="text-right text-slate-700">{value}</strong>
          </div>
        ))}
      </div>
    </ModalShell>
  );
}

function ConfirmModal({ title, message, onClose, onConfirm }) {
  return (
    <ModalShell title={title} onClose={onClose}>
      <p className="mt-5 text-sm text-slate-600">{message}</p>
      <div className="mt-6 flex justify-end gap-2">
        <button className="btn-secondary" onClick={onClose}>
          Cancel
        </button>
        <button
          className="inline-flex items-center rounded-lg bg-rose-600 px-3 py-2 text-xs font-semibold text-white"
          onClick={onConfirm}
        >
          Confirm
        </button>
      </div>
    </ModalShell>
  );
}

function Dashboard({ onToast }) {
  const { data: liveDashboard } = useMarketplaceDashboard();
  const dashboard = liveDashboard || { metrics: [], orderStatus: [], topSellers: [], sellerHighlights: [], sellerMetrics: [], trends: { "Last 7 days": [], "Last 30 days": [], "Last 90 days": [] } };
  const [period, setPeriod] = useState("Last 30 days");
  const [tab, setTab] = useState("Overview");
  const trend = dashboard.trends[period] || [];
  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle="Marketplace-wide performance overview"
      >
        <select
          aria-label="Dashboard period"
          className="input h-9 w-auto"
          value={period}
          onChange={(event) => setPeriod(event.target.value)}
        >
          <option>Last 30 days</option>
          <option>Last 7 days</option>
          <option>Last 90 days</option>
        </select>
      </PageHeader>
      <Tabs
        items={["Overview", "Seller Performance"]}
        active={tab}
        onChange={setTab}
      />
      {tab === "Overview" ? (
        <>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {dashboard.metrics.map((metric) => (
              <MetricCard key={metric.label} {...metric} />
            ))}
          </div>
          <div className="mt-4 grid gap-4 xl:grid-cols-[1.6fr_1fr]">
            <div className="card p-4">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-sm font-bold text-ink">GMV Trend</h2>
                  <p className="text-[11px] text-slate-500">
                    Daily gross merchandise value
                  </p>
                </div>
                <span className="rounded-full bg-slate-50 px-2.5 py-1 text-[10px] text-slate-500">
                  {period}
                </span>
              </div>
              <div className="mt-4 h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={trend}
                    margin={{ top: 8, right: 4, left: -25, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id="gmvFill" x1="0" y1="0" x2="0" y2="1">
                        <stop
                          offset="0%"
                          stopColor="#2563eb"
                          stopOpacity={0.25}
                        />
                        <stop
                          offset="100%"
                          stopColor="#2563eb"
                          stopOpacity={0}
                        />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="#eef2f7" vertical={false} />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 9, fill: "#94a3b8" }}
                      tickLine={false}
                      axisLine={false}
                      interval={3}
                    />
                    <YAxis
                      tick={{ fontSize: 9, fill: "#94a3b8" }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(value) => `₱${value / 1000}k`}
                    />
                    <Tooltip
                      formatter={(value) => [
                        `₱${Number(value).toLocaleString()}`,
                        "GMV",
                      ]}
                    />
                    <Area
                      type="monotone"
                      dataKey="value"
                      stroke="#2563eb"
                      strokeWidth={2.5}
                      fill="url(#gmvFill)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="card p-4">
              <h2 className="text-sm font-bold text-ink">
                Order Status Breakdown
              </h2>
              <div className="mt-3 flex flex-col items-center gap-4 sm:flex-row">
                <div className="h-40 w-40 shrink-0 sm:h-44 sm:w-44">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={dashboard.orderStatus}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={0}
                        outerRadius={58}
                      >
                        {dashboard.orderStatus.map((entry) => (
                          <Cell key={entry.name} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value) => [`${value}%`, "Orders"]} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-3 text-xs">
                  {dashboard.orderStatus.map((item) => (
                    <div key={item.name} className="flex items-center gap-2">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: item.color }}
                      />
                      <span className="w-16 text-slate-600">{item.name}</span>
                      <strong className="text-slate-700">{item.value}%</strong>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <div className="card mt-4 p-4">
            <h2 className="text-sm font-bold text-ink">
              Top Sellers by Revenue
            </h2>
            <p className="text-[11px] text-slate-500">
              Completed order items, {period.toLowerCase()}
            </p>
            <div className="mt-4 space-y-3">
              {dashboard.topSellers.map(([name, amount, width]) => (
                <div key={name} className="flex items-center gap-3 text-xs">
                  <span className="w-28 truncate text-slate-600 sm:w-36">
                    {name}
                  </span>
                  <div className="h-2 flex-1 rounded-full bg-slate-100">
                    <div
                      className="h-2 rounded-full bg-blue-600"
                      style={{ width: `${width}%` }}
                    />
                  </div>
                  <strong className="w-14 text-right text-slate-700">
                    {amount}
                  </strong>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {dashboard.sellerHighlights.map(({ value, label, icon, tone }) => (
              <MetricCard
                key={label}
                value={value}
                label={label}
                icon={icon}
                tone={tone}
              />
            ))}
          </div>
        </>
      ) : (
        <SellerPerformance onToast={onToast} dashboard={dashboard} />
      )}
    </>
  );
}

function SellerPerformance({ onToast, dashboard }) {
  return (
    <div className="card mt-4 overflow-hidden">
      <div className="border-b border-slate-100 px-4 py-4">
        <h2 className="text-sm font-bold text-ink">Seller Performance</h2>
        <p className="mt-1 text-[11px] text-slate-500">
          Revenue, ratings, and listing health across the marketplace.
        </p>
      </div>
      <div className="grid gap-3 p-4 sm:grid-cols-3">
        {dashboard.sellerMetrics.map((metric) => <MetricCard key={metric.label} {...metric} />)}
      </div>
      <div className="overflow-x-auto">
        <div className="grid min-w-[650px] grid-cols-[1.5fr_1fr_0.8fr_0.8fr_0.7fr]">
          {["Seller", "Revenue", "Listings", "Rating", "Action"].map(
            (heading) => (
              <div key={heading} className="table-head">
                {heading}
              </div>
            ),
          )}
          {dashboard.topSellers.map(([name, amount, width]) => (
            <Fragment key={name}>
              <div className="px-4 py-3 text-xs font-semibold text-slate-700">
                {name}
              </div>
              <div className="px-3 py-3 text-xs text-slate-600">{amount}</div>
              <div className="px-3 py-3 text-xs text-slate-600">
                {Math.round(width / 2)} active
              </div>
              <div className="px-3 py-3 text-xs text-amber-600">
                4.8 <Icon name="bi-star-fill" />
              </div>
              <div className="px-3 py-3">
                <button
                  className="btn-secondary h-8 px-3 text-xs"
                  onClick={() => onToast(`Opened ${name}`)}
                >
                  Open seller
                </button>
              </div>
            </Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}

function ProductsPage({ onToast }) {
  const { items: sourceItems } = useMarketplaceList("products", products, {}, (item) => ({
    ...item,
    resourceId: item.id,
    price: formatCurrency(item.price),
    updatedAt: item.updated,
    updated: formatDate(item.updated),
  }));
  const { items: sourceSellerOptions, isLoading: sellersLoading } = useMarketplaceList(
    "sellers",
    sellers,
    { status: "Active", page_size: 100 },
    (item) => ({
      id: item.id,
      name: item.business_name || item.business,
      status: item.status,
    }),
  );
  const { items: sourceCategoryOptions, isLoading: categoriesLoading } = useMarketplaceList(
    "categories",
    categories,
    { page_size: 100 },
    (item) => ({ id: item.id || item.slug, name: item.name, status: item.status }),
  );
  const [items, setItems] = useState(sourceItems);
  useEffect(() => setItems(sourceItems), [sourceItems]);
  const [tab, setTab] = useState("All Products");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("All Statuses");
  const [categoryFilter, setCategoryFilter] = useState("All Categories");
  const [isExporting, setIsExporting] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [modal, setModal] = useState(null);
  const [details, setDetails] = useState(null);
  const [menuId, setMenuId] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [selectedProductIds, setSelectedProductIds] = useState(() => new Set());
  const queryClient = useQueryClient();
  const sellerOptions = useMemo(
    () => sourceSellerOptions.filter((item) => item.status === "Active"),
    [sourceSellerOptions],
  );
  const categoryOptions = useMemo(
    () => sourceCategoryOptions.filter((item) => item.status === "Active"),
    [sourceCategoryOptions],
  );
  const productCategories = useMemo(
    () => Array.from(new Set([
      ...categoryOptions.map((item) => item.name),
      ...items.map((item) => item.category),
    ])).sort(),
    [categoryOptions, items],
  );
  const filtered = useMemo(
    () =>
      items.filter(
        (item) =>
          (!query ||
            `${item.name} ${item.sku}`
              .toLowerCase()
              .includes(query.toLowerCase())) &&
          (tab === "All Products" ||
            (tab === "Pending Review"
              ? item.status === tab
              : item.status === "Archived")) &&
          (statusFilter === "All Statuses" || item.status === statusFilter) &&
          (categoryFilter === "All Categories" ||
            item.category === categoryFilter),
      ),
    [items, query, tab, statusFilter, categoryFilter],
  );
  const visibleProductIds = useMemo(
    () => filtered.map((item) => item.resourceId || item.id),
    [filtered],
  );
  const allVisibleProductsSelected = visibleProductIds.length > 0 && visibleProductIds.every(
    (productId) => selectedProductIds.has(productId),
  );
  const selectedVisibleCount = visibleProductIds.filter(
    (productId) => selectedProductIds.has(productId),
  ).length;
  useEffect(() => {
    const visibleIds = new Set(visibleProductIds);
    setSelectedProductIds((current) => {
      const next = new Set([...current].filter((productId) => visibleIds.has(productId)));
      return next.size === current.size ? current : next;
    });
  }, [visibleProductIds]);
  const productCategoryMix = useMemo(() => {
    const colors = ["bg-blue-600", "bg-emerald-600", "bg-amber-600", "bg-violet-500", "bg-rose-600", "bg-slate-500"];
    return Object.entries(items.reduce((counts, item) => ({ ...counts, [item.category]: (counts[item.category] || 0) + 1 }), {}))
      .map(([label, value], index) => ({ label, value, color: colors[index % colors.length] }))
      .sort((left, right) => right.value - left.value);
  }, [items]);
  const categoryMax = Math.max(...productCategoryMix.map((item) => item.value), 1);
  const createProduct = (name) => {
    const newItem = {
      id: `prd-${Date.now()}`,
      name,
      sku: `NEW-${String(Date.now()).slice(-4)}`,
      seller: "Northstar Gadgets",
      category: "Electronics",
      price: "₱0.00",
      stock: 0,
      status: "Pending Review",
      updated: "Today",
    };
    setItems((current) => [newItem, ...current]);
    setModal(null);
    onToast(`Product “${name}” created for review`);
  };
  const persistCreateProduct = async (payload) => {
    await mutateMarketplace("post", "/products", payload);
    await queryClient.invalidateQueries({ queryKey: ["marketplace", "products"] });
    await queryClient.invalidateQueries({ queryKey: ["marketplace", "dashboard"] });
    onToast(`Product ${payload.name} created for review`);
  };
  const editProduct = (name) => {
    setItems((current) =>
      current.map((item) =>
        item.id === modal.item.id ? { ...item, name, updated: "Today" } : item,
      ),
    );
    setModal(null);
    onToast(`Product “${name}” updated`);
  };
  const updateStatus = (item, status) => {
    setItems((current) =>
      current.map((row) => (row.id === item.id ? { ...row, status } : row)),
    );
    setMenuId(null);
    onToast(`${item.name} ${status === "Archived" ? "archived" : "restored"}`);
  };
  const persistEditProduct = async (payload) => {
    await mutateMarketplace("patch", `/products/${modal.item.resourceId || modal.item.id}`, payload);
    await queryClient.invalidateQueries({ queryKey: ["marketplace", "products"] });
    onToast(`Product ${payload.name} updated`);
  };
  const persistProductStatus = async (item, target) => {
    try {
      const action = target === "Active" && item.status === "Pending Review" ? "approve" : target === "Archived" ? "archive" : "restore";
      await mutateMarketplace("post", `/products/${item.resourceId || item.id}/${action}`);
      await queryClient.invalidateQueries({ queryKey: ["marketplace", "products"] });
      setMenuId(null);
      onToast(`Product status updated`);
    } catch (error) { onToast(error.response?.data?.detail || "Could not update product"); }
  };
  const toggleProductSelection = (item) => {
    const productId = item.resourceId || item.id;
    setSelectedProductIds((current) => {
      const next = new Set(current);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  };
  const toggleAllVisibleProducts = () => {
    setSelectedProductIds((current) => {
      const next = new Set(current);
      if (allVisibleProductsSelected) visibleProductIds.forEach((productId) => next.delete(productId));
      else visibleProductIds.forEach((productId) => next.add(productId));
      return next;
    });
  };
  const persistDeleteProducts = async () => {
    const productIds = deleteTarget.items.map((item) => item.resourceId || item.id);
    try {
      if (productIds.length === 1) {
        await mutateMarketplace("delete", `/products/${productIds[0]}`);
      } else {
        await mutateMarketplace("post", "/products/bulk-delete", { product_ids: productIds });
      }
      await queryClient.invalidateQueries({ queryKey: ["marketplace", "products"] });
      await queryClient.invalidateQueries({ queryKey: ["marketplace", "dashboard"] });
      setSelectedProductIds(new Set());
      setMenuId(null);
      setDeleteTarget(null);
      onToast(`${productIds.length} product${productIds.length === 1 ? "" : "s"} removed`);
    } catch (error) {
      onToast(error.response?.data?.detail || "Could not remove the selected products");
    }
  };
  const exportProducts = async () => {
    setIsExporting(true);
    try {
      await exportProductsWorkbook({
        products: filtered,
        filters: {
          query,
          status: statusFilter,
          category: categoryFilter,
        },
      });
      onToast(`${filtered.length} products exported to Excel`);
    } catch (error) {
      onToast("Could not create the Excel export");
    } finally {
      setIsExporting(false);
    }
  };
  return (
    <>
      <PageHeader
        title="Products"
        subtitle="Catalog oversight across seller-owned listings"
      />
      <Tabs
        items={[
          { label: "All Products", value: "All Products" },
          { label: "Pending Review", value: "Pending Review", badge: String(items.filter((item) => item.status === "Pending Review").length) },
          "Archived",
        ]}
        active={tab}
        onChange={setTab}
      />
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <MetricCard
          value={String(items.filter((item) => item.status === "Active").length)}
          label="Active Listings"
          icon="bi-box-seam"
          tone="green"
        />
        <MetricCard
          value="1.4 days"
          label="Avg. Time to Publish"
          icon="bi-hourglass-split"
          tone="blue"
        />
      </div>
      <div className="card mt-4 overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-bold text-ink">Products by Category</h2>
        </div>
        <div className="flex h-48 items-end justify-between gap-3 px-6 pb-5 pt-5">
          {productCategoryMix.map(({ label, value, color }) => (
            <div
              key={label}
              className="flex h-full flex-1 flex-col items-center justify-end"
            >
              <span className="mb-1 text-[10px] font-semibold text-slate-500">
                {value}
              </span>
              <div
                className={cn("w-7 rounded-t-md sm:w-8", color)}
                style={{ height: `${Math.max(18, Math.round((value / categoryMax) * 126))}px` }}
              />
              <span className="mt-2 max-w-20 text-center text-[9px] leading-tight text-slate-500">
                {label}
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className="card mt-4 overflow-hidden">
        <Toolbar
          placeholder="Search by title or SKU..."
          query={query}
          setQuery={setQuery}
        >
          <select
            aria-label="Product status filter"
            className="input h-10 w-full sm:w-32"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option>All Statuses</option>
            <option>Active</option>
            <option>Pending Review</option>
            <option>Archived</option>
          </select>
          <select
            aria-label="Product category filter"
            className="input h-10 w-full sm:w-36"
            value={categoryFilter}
            onChange={(event) => setCategoryFilter(event.target.value)}
          >
            <option>All Categories</option>
            {productCategories.map((category) => <option key={category}>{category}</option>)}
          </select>
          <button
            className={cn(
              "btn-secondary",
              filtersOpen && "bg-blue-50 text-blue-700",
            )}
            onClick={() => setFiltersOpen((value) => !value)}
          >
            <Icon name="bi-funnel" />
            Filters
          </button>
          <button
            className="btn-secondary"
            disabled={isExporting}
            onClick={exportProducts}
          >
            <Icon name="bi-download" />
            {isExporting ? "Preparing Excel..." : "Export Excel"}
          </button>
          {selectedVisibleCount > 0 && (
            <button
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-rose-600 px-3 text-xs font-semibold text-white transition hover:bg-rose-700 focus:outline-none focus:ring-2 focus:ring-rose-300"
              onClick={() => setDeleteTarget({ items: filtered.filter((item) => selectedProductIds.has(item.resourceId || item.id)) })}
            >
              <Icon name="bi-trash3" />
              Delete {selectedVisibleCount} selected
            </button>
          )}
        </Toolbar>
        {filtersOpen && (
          <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 bg-slate-50 px-4 py-3 text-xs text-slate-600">
            <span>Showing {filtered.length} matching products.</span>
            <button
              className="text-blue-600"
              onClick={() => {
                setStatusFilter("All Statuses");
                setCategoryFilter("All Categories");
                setFiltersOpen(false);
              }}
            >
              Reset filters
            </button>
          </div>
        )}
        <div className="hidden overflow-x-auto lg:block">
          <div className="grid min-w-[980px] grid-cols-[0.38fr_1.5fr_0.7fr_1.15fr_1fr_0.8fr_0.55fr_0.9fr_0.8fr_0.9fr]">
            <div className="table-head flex items-center justify-center">
              <input
                aria-label="Select all visible products"
                checked={allVisibleProductsSelected}
                className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                onChange={toggleAllVisibleProducts}
                type="checkbox"
              />
            </div>
            {[
              "Product",
              "SKU",
              "Seller",
              "Category",
              "Price",
              "Stock",
              "Status",
              "Updated",
              "Actions",
            ].map((heading) => (
              <div key={heading} className="table-head">
                {heading}
              </div>
            ))}
            {filtered.map((item) => (
              <ProductRow
                key={item.id}
                item={item}
                menuOpen={menuId === item.id}
                selected={selectedProductIds.has(item.resourceId || item.id)}
                onView={() => setDetails(item)}
                onEdit={() => setModal({ type: "edit", item })}
                onMore={() => setMenuId(menuId === item.id ? null : item.id)}
                onSelect={() => toggleProductSelection(item)}
                onDelete={() => setDeleteTarget({ items: [item] })}
                onApprove={() => persistProductStatus(item, "Active")}
                onArchive={() =>
                  persistProductStatus(
                    item,
                    item.status === "Archived" ? "Active" : "Archived",
                  )
                }
              />
            ))}
          </div>
          {filtered.length === 0 && <EmptyState />}
        </div>
        <div className="divide-y divide-slate-100 lg:hidden">
          <label className="flex items-center gap-2 border-b border-slate-100 px-4 py-3 text-xs font-medium text-slate-600">
            <input
              aria-label="Select all visible products"
              checked={allVisibleProductsSelected}
              className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              onChange={toggleAllVisibleProducts}
              type="checkbox"
            />
            Select all visible
          </label>
          {filtered.map((item) => (
            <div key={item.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <input
                    aria-label={`Select product ${item.name}`}
                    checked={selectedProductIds.has(item.resourceId || item.id)}
                    className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    onChange={() => toggleProductSelection(item)}
                    type="checkbox"
                  />
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-800">{item.name}</div>
                    <div className="mt-1 text-xs text-slate-500">
                      {item.seller} · {item.category}
                    </div>
                  </div>
                </div>
                <StatusBadge status={item.status} />
              </div>
              <div className="mt-3 flex items-center justify-between gap-3 text-xs text-slate-500">
                <span>{item.price} · Stock {item.stock}</span>
                <div className="flex shrink-0 items-center gap-3">
                  <button className="text-blue-600" onClick={() => setDetails(item)}>View</button>
                  <button className="text-rose-600" onClick={() => setDeleteTarget({ items: [item] })}>Remove</button>
                </div>
              </div>
            </div>
          ))}
          {filtered.length === 0 && <EmptyState />}
        </div>
      </div>
      {modal?.type === "create" && (
        <ProductCreateModal
          sellers={sellerOptions}
          categories={categoryOptions}
          isCatalogLoading={sellersLoading || categoriesLoading}
          onClose={() => setModal(null)}
          onSave={persistCreateProduct}
        />
      )}
      {modal?.type === "edit" && (
        <ProductEditModal
          product={modal.item}
          sellers={sellerOptions}
          categories={categoryOptions}
          isCatalogLoading={sellersLoading || categoriesLoading}
          onClose={() => setModal(null)}
          onSave={persistEditProduct}
        />
      )}
      {details && (
        <DetailModal
          title={details.name}
          onClose={() => setDetails(null)}
          rows={[
            ["SKU", details.sku],
            ["Seller", details.seller],
            ["Category", details.category],
            ["Price", details.price],
            ["Stock", details.stock],
            ["Description", details.description || "No description provided"],
            ["Status", <StatusBadge key="status" status={details.status} />],
          ]}
        />
      )}
      {deleteTarget && (
        <ConfirmModal
          title={`Remove ${deleteTarget.items.length} product${deleteTarget.items.length === 1 ? "" : "s"}?`}
          message={`This permanently removes ${deleteTarget.items.length === 1 ? deleteTarget.items[0].name : `${deleteTarget.items.length} selected products`} from the marketplace catalog. This action cannot be undone.`}
          onClose={() => setDeleteTarget(null)}
          onConfirm={persistDeleteProducts}
        />
      )}
    </>
  );
}

function ProductRow({
  item,
  menuOpen,
  selected,
  onView,
  onEdit,
  onMore,
  onSelect,
  onDelete,
  onApprove,
  onArchive,
}) {
  return (
    <>
      <div className="flex items-center justify-center px-3 py-3">
        <input
          aria-label={`Select product ${item.name}`}
          checked={selected}
          className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
          onChange={onSelect}
          type="checkbox"
        />
      </div>
      <div className="flex items-center gap-2 px-4 py-3 text-xs font-semibold text-slate-700">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-400">
          <Icon name="bi-image" />
        </div>
        <div>
          <div>{item.name}</div>
          <div className="mt-0.5 text-[10px] font-normal text-slate-400">
            {item.category}
          </div>
        </div>
      </div>
      <div className="px-3 py-3 text-xs text-slate-600">{item.sku}</div>
      <div className="px-3 py-3 text-xs text-slate-600">{item.seller}</div>
      <div className="px-3 py-3 text-xs text-slate-600">{item.category}</div>
      <div className="px-3 py-3 text-xs text-slate-700">{item.price}</div>
      <div className="px-3 py-3 text-xs text-slate-600">{item.stock}</div>
      <div className="px-3 py-3">
        <StatusBadge status={item.status} />
      </div>
      <div className="px-3 py-3 text-xs text-slate-600">{item.updated}</div>
      <div className="relative flex items-center gap-3 px-3 py-3 text-slate-400">
        <button aria-label={`View product ${item.name}`} onClick={onView}>
          <Icon name="bi-eye" />
        </button>
        <button aria-label={`Edit product ${item.name}`} onClick={onEdit}>
          <Icon name="bi-pencil" />
        </button>
        <button
          aria-label={`Remove product ${item.name}`}
          className="text-rose-500 hover:text-rose-700"
          onClick={onDelete}
        >
          <Icon name="bi-trash3" />
        </button>
        <button
          aria-label={`More product actions for ${item.name}`}
          onClick={onMore}
        >
          <Icon name="bi-three-dots-vertical" />
        </button>
        {menuOpen && (
          <div className="absolute right-2 top-10 z-10 w-36 rounded-lg border border-slate-200 bg-white p-1 text-xs text-slate-700 shadow-xl">
            <button
              className="block w-full rounded px-2 py-1.5 text-left hover:bg-slate-50"
              onClick={onView}
            >
              View details
            </button>
            {item.status === "Pending Review" && (
              <button
                className="block w-full rounded px-2 py-1.5 text-left hover:bg-slate-50"
                onClick={onApprove}
              >
                Approve
              </button>
            )}
            <button
              className="block w-full rounded px-2 py-1.5 text-left hover:bg-slate-50"
              onClick={onArchive}
            >
              {item.status === "Archived" ? "Restore" : "Archive"}
            </button>
          </div>
        )}
      </div>
    </>
  );
}

function OrdersPage({ onToast }) {
  const { items: sourceItems } = useMarketplaceList(
    "orders",
    orders,
    {},
    (item) => ({
      resourceId: item.id,
      id: item.order_number || item.id,
      buyer: item.buyer || item.buyer_name,
      items: item.items || item.item_count,
      total: formatCurrency(item.total),
      status: item.status,
      placed: formatDate(item.placed || item.placed_at),
    }),
  );
  const [items, setItems] = useState(sourceItems);
  useEffect(() => setItems(sourceItems), [sourceItems]);
  const [tab, setTab] = useState("All Orders");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("All Statuses");
  const [dateFilter, setDateFilter] = useState("Last 30 days");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [details, setDetails] = useState(null);
  const [cancelItem, setCancelItem] = useState(null);
  const queryClient = useQueryClient();
  const ordersTrend = useMemo(
    () => Object.entries(items.reduce((counts, item) => ({ ...counts, [item.placed]: (counts[item.placed] || 0) + 1 }), {}))
      .map(([date, value]) => ({ date, value }))
      .reverse(),
    [items],
  );
  const filtered = items.filter(
    (item) =>
      (!query ||
        `${item.id} ${item.buyer}`
          .toLowerCase()
          .includes(query.toLowerCase())) &&
      (tab === "All Orders" || ["Confirmed", "Active"].includes(item.status)) &&
      (statusFilter === "All Statuses" || item.status === statusFilter) &&
      (dateFilter === "Last 30 days" ||
        ["Aug 4", "Aug 3", "Aug 2", "Aug 1", "Jul 31", "Jul 30", "Jul 29"].some((date) => item.placed.includes(date))),
  );
  const persistCancelOrder = async () => {
    try {
      await mutateMarketplace("post", `/orders/${cancelItem.resourceId || cancelItem.id}/cancel`);
      await queryClient.invalidateQueries({ queryKey: ["marketplace", "orders"] });
      await queryClient.invalidateQueries({ queryKey: ["marketplace", "dashboard"] });
      onToast(`${cancelItem.id} cancelled`);
      setCancelItem(null);
    } catch (error) { onToast(error.response?.data?.detail || "Could not cancel order"); }
  };
  const cancelOrder = () => {
    setItems((current) =>
      current.map((item) =>
        item.id === cancelItem.id ? { ...item, status: "Cancelled" } : item,
      ),
    );
    onToast(`${cancelItem.id} cancelled`);
    setCancelItem(null);
  };
  return (
    <>
      <PageHeader
        title="Orders"
        subtitle="Order tracking across buyers, sellers and fulfillment"
      />
      <Tabs
        items={[
          { label: "All Orders", value: "All Orders" },
          {
            label: "My Fulfillment Queue",
            value: "My Fulfillment Queue",
            badge: String(items.filter((item) => ["Confirmed", "Active"].includes(item.status)).length),
          },
        ]}
        active={tab}
        onChange={setTab}
      />
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <MetricCard
          value={String(items.filter((item) => item.placed === items[0]?.placed).length)}
          label="Orders Today"
          icon="bi-cart3"
          tone="blue"
        />
        <MetricCard
          value={`${items.length ? ((items.filter((item) => item.status === "Cancelled").length / items.length) * 100).toFixed(1) : "0.0"}%`}
          label="Cancellation Rate"
          icon="bi-x-circle"
          tone="rose"
        />
      </div>
      <div className="card mt-4 p-4">
        <div className="flex justify-between">
          <div>
            <h2 className="text-sm font-bold text-ink">Orders Over Time</h2>
            <p className="text-[11px] text-slate-500">Daily order count</p>
          </div>
          <span className="rounded-full bg-slate-50 px-2.5 py-1 text-[10px] text-slate-500">
            By status
          </span>
        </div>
        <div className="mt-4 h-52">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={ordersTrend}
              margin={{ top: 8, right: 4, left: -25, bottom: 0 }}
            >
              <CartesianGrid stroke="#eef2f7" vertical={false} />
              <XAxis dataKey="date" hide />
              <YAxis hide />
              <Tooltip />
              <Area
                type="monotone"
                dataKey="value"
                stroke="#2563eb"
                strokeWidth={2.5}
                fill="none"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="card mt-4 overflow-hidden">
        <Toolbar
          placeholder="Search by order ID or buyer..."
          query={query}
          setQuery={setQuery}
        >
          <select
            aria-label="Order status filter"
            className="input h-10 w-full sm:w-32"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option>All Statuses</option>
            <option>Confirmed</option>
            <option>Active</option>
            <option>Completed</option>
            <option>Cancelled</option>
          </select>
          <select
            aria-label="Order date filter"
            className="input h-10 w-full sm:w-32"
            value={dateFilter}
            onChange={(event) => setDateFilter(event.target.value)}
          >
            <option>Last 30 days</option>
            <option>Last 7 days</option>
          </select>
          <button
            className={cn(
              "btn-secondary",
              filtersOpen && "bg-blue-50 text-blue-700",
            )}
            onClick={() => setFiltersOpen((value) => !value)}
          >
            <Icon name="bi-funnel" />
            Filters
          </button>
        </Toolbar>
        {filtersOpen && (
          <div className="border-b border-slate-100 bg-slate-50 px-4 py-3 text-xs text-slate-600">
            {filtered.length} orders match the current view.{" "}
            <button
              className="ml-2 text-blue-600"
              onClick={() => {
                setStatusFilter("All Statuses");
                setDateFilter("Last 30 days");
                setFiltersOpen(false);
              }}
            >
              Reset filters
            </button>
          </div>
        )}
        <div className="hidden overflow-x-auto lg:block">
          <div className="grid min-w-[800px] grid-cols-[1fr_1.2fr_0.55fr_1fr_0.9fr_0.9fr_0.6fr]">
            {[
              "Order ID",
              "Buyer",
              "Items",
              "Total",
              "Status",
              "Placed At",
              "Actions",
            ].map((heading) => (
              <div key={heading} className="table-head">
                {heading}
              </div>
            ))}
            {filtered.map((item) => (
              <Fragment key={item.id}>
                <div className="px-4 py-4 text-xs font-semibold text-slate-700">
                  {item.id}
                </div>
                <div className="px-3 py-4 text-xs text-slate-600">
                  {item.buyer}
                </div>
                <div className="px-3 py-4 text-xs text-slate-600">
                  {item.items}
                </div>
                <div className="px-3 py-4 text-xs text-slate-700">
                  {item.total}
                </div>
                <div className="px-3 py-4">
                  <StatusBadge status={item.status} />
                </div>
                <div className="px-3 py-4 text-xs text-slate-600">
                  {item.placed}
                </div>
                <div className="flex items-center gap-3 px-3 py-4 text-slate-400">
                  <button
                    aria-label={`View order ${item.id}`}
                    onClick={() => setDetails(item)}
                  >
                    <Icon name="bi-eye" />
                  </button>
                  {!["Completed", "Cancelled"].includes(item.status) && (
                    <button
                      aria-label={`Cancel order ${item.id}`}
                      onClick={() => setCancelItem(item)}
                    >
                      <Icon name="bi-x-circle" />
                    </button>
                  )}
                </div>
              </Fragment>
            ))}
          </div>
          {filtered.length === 0 && <EmptyState />}
        </div>
        <div className="divide-y divide-slate-100 lg:hidden">
          {filtered.map((item) => (
            <div className="p-4" key={item.id}>
              <div className="flex justify-between">
                <span className="font-semibold text-slate-800">{item.id}</span>
                <StatusBadge status={item.status} />
              </div>
              <div className="mt-2 text-xs text-slate-500">
                {item.buyer} · {item.items} items · {item.total}
              </div>
              <button
                onClick={() => setDetails(item)}
                className="mt-3 text-xs font-semibold text-blue-600"
              >
                View order
              </button>
            </div>
          ))}
        </div>
      </div>
      {details && (
        <DetailModal
          title={details.id}
          onClose={() => setDetails(null)}
          rows={[
            ["Buyer", details.buyer],
            ["Items", details.items],
            ["Total", details.total],
            ["Status", <StatusBadge key="status" status={details.status} />],
            ["Placed", details.placed],
          ]}
        />
      )}
      {cancelItem && (
        <ConfirmModal
          title={`Cancel ${cancelItem.id}?`}
          message="This will mark the order as cancelled and remove it from the fulfillment queue."
          onClose={() => setCancelItem(null)}
          onConfirm={persistCancelOrder}
        />
      )}
    </>
  );
}

function SellersPage({ onToast }) {
  const { items: sourceItems } = useMarketplaceList(
    "sellers",
    sellers,
    {},
    (item) => ({
      id: item.id,
      business: item.business || item.business_name,
      owner: item.owner || item.owner_name,
      commission: item.commission || `${Number(item.commission_rate).toFixed(0)}%`,
      rating: item.rating,
      status: item.status,
      joined: formatDate(item.joined || item.joined_on),
    }),
  );
  const [sellerItems, setSellerItems] = useState(sourceItems);
  useEffect(() => setSellerItems(sourceItems), [sourceItems]);
  const { items: sourceApplications } = useMarketplaceList(
    "applications",
    applications,
    { status: "Pending Approval", page_size: 50 },
    (item) => ({
      id: item.id || item.business,
      business: item.business || item.business_name,
      owner: item.owner || item.owner_name,
      email: item.email,
      applied: formatDate(item.applied || item.created_at),
    }),
  );
  const [applicationItems, setApplicationItems] = useState(sourceApplications);
  useEffect(() => setApplicationItems(sourceApplications), [sourceApplications]);
  const [tab, setTab] = useState("Active Sellers");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("All Statuses");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [details, setDetails] = useState(null);
  const [reviewItem, setReviewItem] = useState(null);
  const queryClient = useQueryClient();
  const filtered = sellerItems.filter(
    (item) =>
      (!query ||
        `${item.business} ${item.owner}`
          .toLowerCase()
          .includes(query.toLowerCase())) &&
      (statusFilter === "All Statuses" || item.status === statusFilter),
  );
  const pageItems = page === 1 ? filtered : [];
  const approveApplication = async () => {
    const item = reviewItem;
    try {
      await mutateMarketplace("post", `/applications/${item.id}/decision`, { decision: "Approved" });
      await queryClient.invalidateQueries({ queryKey: ["marketplace", "applications"] });
      await queryClient.invalidateQueries({ queryKey: ["marketplace", "sellers"] });
    } catch (error) {
      if (![404, 422, 500].includes(error.response?.status)) {
        onToast(error.response?.data?.detail || "Could not approve application");
        return;
      }
    }
    setSellerItems((current) => [
      ...current,
      {
        id: `sel-${Date.now()}`,
        business: item.business,
        owner: item.owner,
        commission: "12%",
        rating: "New",
        status: "Active",
        joined: "Today",
      },
    ]);
    setApplicationItems((current) =>
      current.filter((row) => row.business !== item.business),
    );
    setReviewItem(null);
    onToast(`${item.business} approved`);
  };
  const rejectApplication = async () => {
    const item = reviewItem;
    try {
      await mutateMarketplace("post", `/applications/${item.id}/decision`, { decision: "Rejected" });
      await queryClient.invalidateQueries({ queryKey: ["marketplace", "applications"] });
    } catch (error) {
      if (![404, 422, 500].includes(error.response?.status)) {
        onToast(error.response?.data?.detail || "Could not reject application");
        return;
      }
    }
    setApplicationItems((current) =>
      current.filter((row) => row.business !== item.business),
    );
    setReviewItem(null);
    onToast(`${item.business} application rejected`);
  };
  return (
    <>
      <PageHeader
        title="Sellers"
        subtitle="Seller onboarding, approval, and account status"
      />
      <Tabs
        items={[
          { label: "Active Sellers", value: "Active Sellers" },
          {
            label: "Pending Approval",
            value: "Pending Approval",
            badge: String(applicationItems.length),
          },
          "Suspended",
        ]}
        active={tab}
        onChange={(value) => {
          setTab(value);
          setPage(1);
        }}
      />
      <div className="mt-4 sm:w-56">
        <MetricCard
          value={String(applicationItems.length)}
          label="Pending Applications"
          icon="bi-person-plus"
          tone="amber"
        />
      </div>
      {tab === "Active Sellers" && (
        <div className="card mt-4 overflow-hidden">
          <Toolbar
            placeholder="Search by business name..."
            query={query}
            setQuery={setQuery}
          >
            <select
              aria-label="Seller status filter"
              className="input h-10 w-full sm:w-32"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option>All Statuses</option>
              <option>Active</option>
              <option>Suspended</option>
            </select>
            <button
              className={cn(
                "btn-secondary",
                filtersOpen && "bg-blue-50 text-blue-700",
              )}
              onClick={() => setFiltersOpen((value) => !value)}
            >
              <Icon name="bi-funnel" />
              Filters
            </button>
          </Toolbar>
          {filtersOpen && (
            <div className="border-b border-slate-100 bg-slate-50 px-4 py-3 text-xs text-slate-600">
              {filtered.length} sellers match.{" "}
              <button
                className="ml-2 text-blue-600"
                onClick={() => {
                  setStatusFilter("All Statuses");
                  setFiltersOpen(false);
                }}
              >
                Reset filters
              </button>
            </div>
          )}
          <div className="hidden overflow-x-auto lg:block">
            <div className="grid min-w-[800px] grid-cols-[1.5fr_1fr_0.7fr_0.8fr_0.8fr_0.9fr_0.6fr]">
              {[
                "Business",
                "Owner",
                "Commission",
                "Rating",
                "Status",
                "Joined",
                "Actions",
              ].map((heading) => (
                <div key={heading} className="table-head">
                  {heading}
                </div>
              ))}
              {pageItems.map((item) => (
                <Fragment key={item.id}>
                  <div className="flex items-center gap-2 px-4 py-4 text-xs font-semibold text-slate-700">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                      <Icon name="bi-image" />
                    </span>
                    {item.business}
                  </div>
                  <div className="px-3 py-4 text-xs text-slate-600">
                    {item.owner}
                  </div>
                  <div className="px-3 py-4 text-xs text-slate-600">
                    {item.commission}
                  </div>
                  <div className="px-3 py-4 text-xs text-amber-600">
                    {item.rating} <Icon name="bi-star-fill" />
                  </div>
                  <div className="px-3 py-4">
                    <StatusBadge status={item.status} />
                  </div>
                  <div className="px-3 py-4 text-xs text-slate-600">
                    {item.joined}
                  </div>
                  <div className="flex items-center gap-3 px-3 py-4 text-slate-400">
                    <button
                      onClick={() => setDetails(item)}
                      className="btn-secondary h-8 px-3 text-xs"
                    >
                      View
                    </button>
                    <button
                      aria-label={`More actions for ${item.business}`}
                      onClick={() =>
                        onToast(`More actions for ${item.business}`)
                      }
                    >
                      <Icon name="bi-three-dots-vertical" />
                    </button>
                  </div>
                </Fragment>
              ))}
            </div>
            {pageItems.length === 0 && (
              <EmptyState
                title="No sellers on this page"
                text="Use page 1 while the mock dataset is loaded, or connect the API for the full seller directory."
              />
            )}
          </div>
          <div className="divide-y divide-slate-100 lg:hidden">
            {pageItems.map((item) => (
              <div key={item.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-slate-800">{item.business}</div>
                    <div className="mt-1 text-xs text-slate-500">{item.owner}</div>
                  </div>
                  <StatusBadge status={item.status} />
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <div className="text-slate-400">Commission</div>
                    <div className="mt-1 font-medium text-slate-700">{item.commission}</div>
                  </div>
                  <div>
                    <div className="text-slate-400">Rating</div>
                    <div className="mt-1 font-medium text-amber-600">{item.rating} <Icon name="bi-star-fill" /></div>
                  </div>
                  <div>
                    <div className="text-slate-400">Joined</div>
                    <div className="mt-1 font-medium text-slate-700">{item.joined}</div>
                  </div>
                  <div className="flex items-end justify-end">
                    <button onClick={() => setDetails(item)} className="btn-secondary h-9 px-3 text-xs">View seller</button>
                  </div>
                </div>
              </div>
            ))}
            {pageItems.length === 0 && (
              <EmptyState
                title="No sellers on this page"
                text="Use page 1 while the mock dataset is loaded, or connect the API for the full seller directory."
              />
            )}
          </div>
          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-xs text-slate-500">
            <span>
              Showing {pageItems.length ? "1–3" : "0"} of {filtered.length}
            </span>
            <div className="flex gap-1">
              <button
                aria-label="Seller page 1"
                className={cn(
                  "h-7 w-7 rounded-md",
                  page === 1
                    ? "bg-blue-600 text-white"
                    : "border border-slate-200",
                )}
                onClick={() => setPage(1)}
              >
                1
              </button>
              <button
                aria-label="Seller page 2"
                className={cn(
                  "h-7 w-7 rounded-md",
                  page === 2
                    ? "bg-blue-600 text-white"
                    : "border border-slate-200",
                )}
                onClick={() => setPage(2)}
              >
                2
              </button>
              <button
                aria-label="Next seller page"
                className="h-7 w-7 rounded-md border border-slate-200"
                onClick={() => setPage((current) => (current === 1 ? 2 : 1))}
              >
                <Icon name="bi-chevron-right" />
              </button>
            </div>
          </div>
        </div>
      )}
      {tab === "Pending Approval" && (
        <Applications
          items={applicationItems}
          onSearch={setQuery}
          onReview={setReviewItem}
        />
      )}
      {tab === "Suspended" && (
        <div className="card mt-4">
          <Toolbar
            placeholder="Search suspended sellers..."
            query={query}
            setQuery={setQuery}
          />
          <EmptyState
            title="No suspended sellers"
            text="Suspended accounts will appear here."
          />
        </div>
      )}
      {details && (
        <DetailModal
          title={details.business}
          onClose={() => setDetails(null)}
          rows={[
            ["Owner", details.owner],
            ["Commission", details.commission],
            ["Rating", details.rating],
            ["Status", <StatusBadge key="status" status={details.status} />],
            ["Joined", details.joined],
          ]}
        />
      )}
      {reviewItem && (
        <DetailModal
          title={`Review ${reviewItem.business}`}
          onClose={() => setReviewItem(null)}
          rows={[
            ["Owner", reviewItem.owner],
            ["Applied", reviewItem.applied],
            ["Decision", "Pending approval"],
          ]}
          actions={
            <>
              <button className="btn-secondary" onClick={rejectApplication}>
                Reject
              </button>
              <button className="btn-primary" onClick={approveApplication}>
                Approve
              </button>
            </>
          }
        />
      )}
    </>
  );
}

function Applications({ items, onSearch, onReview }) {
  const [query, setQuery] = useState("");
  const filtered = items.filter(
    (item) =>
      !query ||
      `${item.business} ${item.owner}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  return (
    <div className="card mt-4 overflow-hidden">
      <Toolbar
        placeholder="Search applications..."
        query={query}
        setQuery={(value) => {
          setQuery(value);
          onSearch(value);
        }}
      />
      <div className="hidden grid-cols-[1.5fr_1fr_0.8fr_0.6fr] lg:grid">
        {["Business", "Owner", "Applied", "Actions"].map((heading) => (
          <div key={heading} className="table-head">
            {heading}
          </div>
        ))}
        {filtered.map((item) => (
          <Fragment key={item.business}>
            <div className="px-4 py-4 text-xs font-semibold text-slate-700">
              {item.business}
            </div>
            <div className="px-3 py-4 text-xs text-slate-600">{item.owner}</div>
            <div className="px-3 py-4 text-xs text-slate-600">
              {item.applied}
            </div>
            <div className="px-3 py-4">
              <button
                onClick={() => onReview(item)}
                className="btn-secondary h-8 px-3 text-xs"
              >
                Review
              </button>
            </div>
          </Fragment>
        ))}
      </div>
      <div className="divide-y divide-slate-100 lg:hidden">
        {filtered.map((item) => (
          <div key={item.business} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-slate-800">{item.business}</div>
                <div className="mt-1 text-xs text-slate-500">{item.owner}</div>
              </div>
              <span className="shrink-0 text-xs text-slate-500">{item.applied}</span>
            </div>
            <button onClick={() => onReview(item)} className="btn-secondary mt-3 h-9 w-full text-xs">Review application</button>
          </div>
        ))}
      </div>
      {filtered.length === 0 && <EmptyState title="No applications found" />}
    </div>
  );
}

function ReviewsPage({ onToast }) {
  const { items: publishedSource } = useMarketplaceList(
    "reviews",
    reviews,
    { status: "Published" },
    (item) => ({ ...item, resourceId: item.id, id: item.id || item.product, product: item.product || item.product_name, buyer: item.buyer || item.buyer_name, submitted: formatDate(item.submitted || item.created_at), reason: item.reason || item.flag_reason }),
  );
  const { items: flaggedSource } = useMarketplaceList(
    "reviews",
    flaggedReviews,
    { status: "Flagged" },
    (item) => ({ ...item, resourceId: item.id, id: item.id || item.product, product: item.product || item.product_name, buyer: item.buyer || item.buyer_name, submitted: formatDate(item.submitted || item.created_at), reason: item.reason || item.flag_reason }),
  );
  const [publishedItems, setPublishedItems] = useState(publishedSource);
  const [flaggedItems, setFlaggedItems] = useState(flaggedSource);
  useEffect(() => setPublishedItems(publishedSource), [publishedSource]);
  useEffect(() => setFlaggedItems(flaggedSource), [flaggedSource]);
  const [tab, setTab] = useState("Published");
  const [query, setQuery] = useState("");
  const [ratingFilter, setRatingFilter] = useState("All Ratings");
  const [details, setDetails] = useState(null);
  const queryClient = useQueryClient();
  const published = publishedItems.filter(
    (item) =>
      (!query || item.product.toLowerCase().includes(query.toLowerCase())) &&
      (ratingFilter === "All Ratings" ||
        item.rating === Number(ratingFilter[0])),
  );
  const flagged = flaggedItems.filter(
    (item) =>
      !query ||
      `${item.product} ${item.reason}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const persistReviewAction = async (item, action) => {
    try {
      await mutateMarketplace("post", `/reviews/${item.resourceId || item.id}/${action}`);
      await queryClient.invalidateQueries({ queryKey: ["marketplace", "reviews"] });
      onToast(`${item.product} ${action === "flag" ? "flagged" : action}`);
    } catch (error) { onToast(error.response?.data?.detail || "Could not moderate review"); }
  };
  const flagReview = (item) => {
    setPublishedItems((current) => current.filter((row) => row.id !== item.id));
    setFlaggedItems((current) => [
      ...current,
      { ...item, reason: "Flagged for moderation" },
    ]);
    onToast(`${item.product} flagged for moderation`);
  };
  const restoreReview = (item) => {
    setFlaggedItems((current) => current.filter((row) => row.id !== item.id));
    setPublishedItems((current) => [
      ...current,
      { ...item, reason: undefined },
    ]);
    onToast(`${item.product} restored`);
  };
  const removeReview = (item) => {
    setFlaggedItems((current) => current.filter((row) => row.id !== item.id));
    onToast(`${item.product} removed`);
  };
  return (
    <>
      <PageHeader
        title="Reviews"
        subtitle="Moderation queue for buyer-submitted product reviews"
      />
      <Tabs
        items={[
          "Published",
          {
            label: "Flagged",
            value: "Flagged",
            badge: String(flaggedItems.length),
          },
        ]}
        active={tab}
        onChange={setTab}
      />
      <div className="mt-4 sm:w-56">
        <MetricCard
          value="4.8"
          label="Avg. Marketplace Rating"
          icon="bi-star-fill"
          tone="amber"
        />
      </div>
      <div className="card mt-4 overflow-hidden">
        <Toolbar
          placeholder={
            tab === "Published"
              ? "Search by product title..."
              : "Search flagged reviews..."
          }
          query={query}
          setQuery={setQuery}
        >
          {tab === "Published" && (
            <select
              aria-label="Review rating filter"
              className="input h-10 w-full sm:w-28"
              value={ratingFilter}
              onChange={(event) => setRatingFilter(event.target.value)}
            >
              <option>All Ratings</option>
              <option>5 stars</option>
              <option>4 stars</option>
              <option>3 stars</option>
              <option>2 stars</option>
              <option>1 star</option>
            </select>
          )}
        </Toolbar>
        {tab === "Published" ? (
          <PublishedReviews
            items={published}
            onView={setDetails}
            onFlag={(item) => persistReviewAction(item, "flag")}
          />
        ) : (
          <FlaggedReviews
            items={flagged}
            onView={setDetails}
            onRestore={(item) => persistReviewAction(item, "restore")}
            onRemove={(item) => persistReviewAction(item, "remove")}
          />
        )}
      </div>
      {details && (
        <DetailModal
          title={`Review · ${details.product}`}
          onClose={() => setDetails(null)}
          rows={[
            ["Buyer", details.buyer],
            ["Rating", <Stars key="rating" value={details.rating} />],
            ["Comment", details.comment],
            ["Submitted", details.submitted],
            ["Reason", details.reason || "Published"],
          ]}
        />
      )}
    </>
  );
}

function Stars({ value }) {
  return (
    <span className="whitespace-nowrap text-amber-500">
      {[1, 2, 3, 4, 5].map((star) => (
        <Icon
          key={star}
          name={star <= value ? "bi-star-fill" : "bi-star"}
          className="mr-0.5"
        />
      ))}
    </span>
  );
}
function PublishedReviews({ items, onView, onFlag }) {
  return (
    <div>
      <div className="hidden overflow-x-auto lg:block">
      <div className="grid min-w-[800px] grid-cols-[1.1fr_0.8fr_0.7fr_1.5fr_0.8fr_0.5fr]">
        {["Product", "Buyer", "Rating", "Comment", "Submitted", "Actions"].map(
          (heading) => (
            <div key={heading} className="table-head">
              {heading}
            </div>
          ),
        )}
        {items.map((item) => (
          <Fragment key={item.id}>
            <div className="px-4 py-4 text-xs font-semibold text-slate-700">
              {item.product}
            </div>
            <div className="px-3 py-4 text-xs text-slate-600">{item.buyer}</div>
            <div className="px-3 py-4">
              <Stars value={item.rating} />
            </div>
            <div className="px-3 py-4 text-xs text-slate-600">
              “{item.comment}”
            </div>
            <div className="px-3 py-4 text-xs text-slate-600">
              {item.submitted}
            </div>
            <div className="flex items-center gap-3 px-3 py-4 text-slate-400">
              <button
                aria-label={`View review for ${item.product}`}
                onClick={() => onView(item)}
              >
                <Icon name="bi-eye" />
              </button>
              <button
                aria-label={`Flag review for ${item.product}`}
                onClick={() => onFlag(item)}
              >
                <Icon name="bi-flag" />
              </button>
            </div>
          </Fragment>
        ))}
      </div>
      </div>
      <div className="divide-y divide-slate-100 lg:hidden">
        {items.map((item) => (
          <div key={item.id} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-slate-800">{item.product}</div>
                <div className="mt-1 text-xs text-slate-500">{item.buyer} · {item.submitted}</div>
              </div>
              <Stars value={item.rating} />
            </div>
            <p className="mt-3 text-xs leading-5 text-slate-600">“{item.comment}”</p>
            <div className="mt-3 flex gap-2">
              <button aria-label={`View review for ${item.product}`} onClick={() => onView(item)} className="btn-secondary h-9 flex-1 text-xs">View</button>
              <button aria-label={`Flag review for ${item.product}`} onClick={() => onFlag(item)} className="inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-lg bg-amber-50 px-3 text-xs font-semibold text-amber-700">Flag</button>
            </div>
          </div>
        ))}
      </div>
      {items.length === 0 && <EmptyState />}
    </div>
  );
}
function FlaggedReviews({ items, onView, onRestore, onRemove }) {
  return (
    <div>
      <div className="hidden overflow-x-auto lg:block">
      <div className="grid min-w-[760px] grid-cols-[1.2fr_0.8fr_0.6fr_1.5fr_0.8fr_0.9fr]">
        {[
          "Product",
          "Buyer",
          "Rating",
          "Reason Flagged",
          "Submitted",
          "Actions",
        ].map((heading) => (
          <div key={heading} className="table-head">
            {heading}
          </div>
        ))}
        {items.map((item) => (
          <Fragment key={item.id}>
            <div className="px-4 py-4 text-xs font-semibold text-slate-700">
              {item.product}
            </div>
            <div className="px-3 py-4 text-xs text-slate-600">{item.buyer}</div>
            <div className="px-3 py-4">
              <Stars value={item.rating} />
            </div>
            <div className="px-3 py-4 text-xs text-slate-600">
              {item.reason}
            </div>
            <div className="px-3 py-4 text-xs text-slate-600">
              {item.submitted}
            </div>
            <div className="flex items-center gap-2 px-3 py-4">
              <button
                aria-label={`View flagged review for ${item.product}`}
                onClick={() => onView(item)}
                className="btn-secondary h-8 px-3 text-xs"
              >
                View
              </button>
              <button
                onClick={() => onRestore(item)}
                className="btn-secondary h-8 px-3 text-xs"
              >
                Restore
              </button>
              <button
                onClick={() => onRemove(item)}
                className="inline-flex h-8 items-center rounded-lg bg-rose-600 px-3 text-xs font-semibold text-white"
              >
                Remove
              </button>
            </div>
          </Fragment>
        ))}
      </div>
      </div>
      <div className="divide-y divide-slate-100 lg:hidden">
        {items.map((item) => (
          <div key={item.id} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-slate-800">{item.product}</div>
                <div className="mt-1 text-xs text-slate-500">{item.buyer} · {item.submitted}</div>
              </div>
              <Stars value={item.rating} />
            </div>
            <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">{item.reason}</div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <button aria-label={`View flagged review for ${item.product}`} onClick={() => onView(item)} className="btn-secondary h-9 px-2 text-xs">View</button>
              <button onClick={() => onRestore(item)} className="btn-secondary h-9 px-2 text-xs">Restore</button>
              <button onClick={() => onRemove(item)} className="inline-flex h-9 items-center justify-center rounded-lg bg-rose-600 px-2 text-xs font-semibold text-white">Remove</button>
            </div>
          </div>
        ))}
      </div>
      {items.length === 0 && (
        <EmptyState
          title="No flagged reviews"
          text="Flagged reviews will appear here for moderation."
        />
      )}
    </div>
  );
}

function DisputesPage({ onToast }) {
  const { items: openSource } = useMarketplaceList(
    "disputes",
    disputes,
    { status: "Open" },
    (item) => ({ ...item, resourceId: item.id, id: item.dispute_number || item.id, order: item.order || item.order_number, raisedBy: item.raisedBy || item.raised_by, seller: item.seller || item.seller_name }),
  );
  const { items: resolvedSource } = useMarketplaceList(
    "disputes",
    resolvedDisputes,
    { status: "Resolved" },
    (item) => ({ ...item, resourceId: item.id, id: item.dispute_number || item.id, order: item.order || item.order_number, raisedBy: item.raisedBy || item.raised_by, seller: item.seller || item.seller_name, resolved: formatDate(item.resolved || item.resolved_at) }),
  );
  const [openItems, setOpenItems] = useState(openSource);
  const [resolvedItems, setResolvedItems] = useState(resolvedSource);
  useEffect(() => setOpenItems(openSource), [openSource]);
  useEffect(() => setResolvedItems(resolvedSource), [resolvedSource]);
  const [tab, setTab] = useState("Open");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("All Statuses");
  const [details, setDetails] = useState(null);
  const [resolveItem, setResolveItem] = useState(null);
  const queryClient = useQueryClient();
  const disputeReasons = useMemo(
    () => Object.entries(openItems.reduce((counts, item) => ({ ...counts, [item.reason]: (counts[item.reason] || 0) + 1 }), {}))
      .map(([reason, value]) => ({ reason, value }))
      .sort((left, right) => right.value - left.value),
    [openItems],
  );
  const visibleOpen = openItems.filter(
    (item) =>
      (!query ||
        `${item.id} ${item.order} ${item.seller}`
          .toLowerCase()
          .includes(query.toLowerCase())) &&
      (statusFilter === "All Statuses" || item.status === statusFilter),
  );
  const visibleResolved = resolvedItems.filter(
    (item) =>
      !query ||
      `${item.id} ${item.order} ${item.seller}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const persistResolveDispute = async (outcome) => {
    try {
      await mutateMarketplace("post", `/disputes/${resolveItem.resourceId || resolveItem.id}/resolve`, { outcome });
      await queryClient.invalidateQueries({ queryKey: ["marketplace", "disputes"] });
      await queryClient.invalidateQueries({ queryKey: ["marketplace", "dashboard"] });
      setResolveItem(null);
      onToast("Dispute resolved");
    } catch (error) { onToast(error.response?.data?.detail || "Could not resolve dispute"); }
  };
  const resolveDispute = (outcome) => {
    const item = resolveItem;
    setOpenItems((current) => current.filter((row) => row.id !== item.id));
    setResolvedItems((current) => [
      { ...item, outcome, resolved: "Today" },
      ...current,
    ]);
    setResolveItem(null);
    onToast(`${item.id} resolved as ${outcome.toLowerCase()}`);
  };
  return (
    <>
      <PageHeader
        title="Disputes"
        subtitle="Escalation queue for order disagreements"
      />
      <Tabs items={["Open", "Resolved"]} active={tab} onChange={setTab} />
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <MetricCard
          value={String(openItems.length)}
          label="Open Disputes"
          icon="bi-exclamation-triangle"
          tone="rose"
        />
        <MetricCard
          value="1.3 days"
          label="Avg. Resolution Time"
          icon="bi-clock-history"
          tone="blue"
        />
      </div>
      <div className="card mt-4 p-4">
        <h2 className="text-sm font-bold text-ink">Disputes by Reason</h2>
        <div className="mt-4 space-y-3">
          {disputeReasons.map(({ reason, value }) => (
            <div key={reason} className="flex items-center gap-3 text-xs">
              <span className="w-24 truncate text-slate-600 sm:w-32">
                {reason}
              </span>
              <div className="h-2 flex-1 rounded-full bg-slate-100">
                <div
                  className="h-2 rounded-full bg-rose-600"
                  style={{ width: `${(value / Math.max(...disputeReasons.map((item) => item.value), 1)) * 100}%` }}
                />
              </div>
              <strong className="w-4 text-right text-slate-600">{value}</strong>
            </div>
          ))}
        </div>
      </div>
      <div className="card mt-4 overflow-hidden">
        <Toolbar
          placeholder={
            tab === "Open"
              ? "Search by order ID..."
              : "Search resolved disputes..."
          }
          query={query}
          setQuery={setQuery}
        >
          {tab === "Open" && (
            <select
              aria-label="Dispute status filter"
              className="input h-10 w-full sm:w-32"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option>All Statuses</option>
              <option>Open</option>
              <option>Investigating</option>
            </select>
          )}
        </Toolbar>
        {tab === "Open" ? (
          <div>
            <div className="hidden overflow-x-auto lg:block">
            <div className="grid min-w-[900px] grid-cols-[0.7fr_0.7fr_1fr_1.2fr_1.2fr_0.8fr_1fr]">
              {[
                "Dispute",
                "Order",
                "Raised By",
                "Against Seller",
                "Reason",
                "Status",
                "Actions",
              ].map((heading) => (
                <div key={heading} className="table-head">
                  {heading}
                </div>
              ))}
              {visibleOpen.map((item) => (
                <Fragment key={item.id}>
                  <div className="px-4 py-4 text-xs font-semibold text-slate-700">
                    {item.id}
                  </div>
                  <div className="px-3 py-4 text-xs text-slate-600">
                    {item.order}
                  </div>
                  <div className="px-3 py-4 text-xs text-slate-600">
                    {item.raisedBy}
                  </div>
                  <div className="px-3 py-4 text-xs text-slate-600">
                    {item.seller}
                  </div>
                  <div className="px-3 py-4 text-xs text-slate-600">
                    {item.reason}
                  </div>
                  <div className="px-3 py-4">
                    <StatusBadge status={item.status} />
                  </div>
                  <div className="flex items-center gap-2 px-3 py-4">
                    <button
                      onClick={() => setDetails(item)}
                      className="btn-secondary h-8 px-3 text-xs"
                    >
                      View
                    </button>
                    <button
                      onClick={() => setResolveItem(item)}
                      className="btn-primary h-8 px-3 text-xs"
                    >
                      Resolve
                    </button>
                  </div>
                </Fragment>
              ))}
            </div>
            {visibleOpen.length === 0 && <EmptyState />}
            </div>
            <div className="divide-y divide-slate-100 lg:hidden">
              {visibleOpen.map((item) => (
                <div key={item.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-800">{item.id}</div>
                      <div className="mt-1 text-xs text-slate-500">{item.order} · {item.seller}</div>
                    </div>
                    <StatusBadge status={item.status} />
                  </div>
                  <div className="mt-3 grid gap-2 text-xs">
                    <div><span className="text-slate-400">Raised by</span><div className="mt-1 font-medium text-slate-700">{item.raisedBy}</div></div>
                    <div><span className="text-slate-400">Reason</span><div className="mt-1 text-slate-600">{item.reason}</div></div>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button onClick={() => setDetails(item)} className="btn-secondary h-9 text-xs">View details</button>
                    <button onClick={() => setResolveItem(item)} className="btn-primary h-9 text-xs">Resolve</button>
                  </div>
                </div>
              ))}
              {visibleOpen.length === 0 && <EmptyState />}
            </div>
          </div>
        ) : (
          <div>
            <div className="hidden overflow-x-auto lg:block">
            <div className="grid min-w-[800px] grid-cols-[0.8fr_0.8fr_1fr_1.2fr_1fr_0.9fr]">
              {[
                "Dispute",
                "Order",
                "Raised By",
                "Against Seller",
                "Outcome",
                "Resolved",
              ].map((heading) => (
                <div key={heading} className="table-head">
                  {heading}
                </div>
              ))}
              {visibleResolved.map((item) => (
                <Fragment key={item.id}>
                  <div className="px-4 py-4 text-xs font-semibold text-slate-700">
                    {item.id}
                  </div>
                  <div className="px-3 py-4 text-xs text-slate-600">
                    {item.order}
                  </div>
                  <div className="px-3 py-4 text-xs text-slate-600">
                    {item.raisedBy}
                  </div>
                  <div className="px-3 py-4 text-xs text-slate-600">
                    {item.seller}
                  </div>
                  <div className="px-3 py-4">
                    <StatusBadge status={item.outcome} />
                  </div>
                  <div className="px-3 py-4 text-xs text-slate-600">
                    {item.resolved}
                  </div>
                </Fragment>
              ))}
            </div>
            {visibleResolved.length === 0 && <EmptyState />}
            </div>
            <div className="divide-y divide-slate-100 lg:hidden">
              {visibleResolved.map((item) => (
                <div key={item.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-800">{item.id}</div>
                      <div className="mt-1 text-xs text-slate-500">{item.order} · {item.seller}</div>
                    </div>
                    <StatusBadge status={item.outcome} />
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
                    <div><div className="text-slate-400">Raised by</div><div className="mt-1 font-medium text-slate-700">{item.raisedBy}</div></div>
                    <div><div className="text-slate-400">Resolved</div><div className="mt-1 font-medium text-slate-700">{item.resolved}</div></div>
                  </div>
                </div>
              ))}
              {visibleResolved.length === 0 && <EmptyState />}
            </div>
          </div>
        )}
      </div>
      {details && (
        <DetailModal
          title={details.id}
          onClose={() => setDetails(null)}
          rows={[
            ["Order", details.order],
            ["Raised by", details.raisedBy],
            ["Seller", details.seller],
            ["Reason", details.reason],
            [
              "Status",
              <StatusBadge
                key="status"
                status={details.status || details.outcome}
              />,
            ],
          ]}
        />
      )}
      {resolveItem && (
        <DetailModal
          title={`Resolve ${resolveItem.id}`}
          onClose={() => setResolveItem(null)}
          rows={[
            ["Order", resolveItem.order],
            ["Seller", resolveItem.seller],
            ["Reason", resolveItem.reason],
            ["Decision", "Choose an outcome below."],
          ]}
          actions={
            <>
              <button
                className="btn-secondary"
                onClick={() => persistResolveDispute("Rejected")}
              >
                Reject
              </button>
              <button
                className="btn-primary"
                onClick={() => persistResolveDispute("Refunded")}
              >
                Refund
              </button>
            </>
          }
        />
      )}
    </>
  );
}

function PayoutsPage({ onToast }) {
  const { items: sourceItems } = useMarketplaceList(
    "payouts",
    payouts,
    {},
    (item) => ({ ...item, resourceId: item.id, id: item.id || item.seller, seller: item.seller || item.seller_name, amount: formatCurrency(item.amount), generated: formatDate(item.generated || item.generated_at) }),
  );
  const [items, setItems] = useState(sourceItems);
  useEffect(() => setItems(sourceItems), [sourceItems]);
  const [tab, setTab] = useState("Pending");
  const [query, setQuery] = useState("");
  const [periodFilter, setPeriodFilter] = useState("All Periods");
  const [details, setDetails] = useState(null);
  const queryClient = useQueryClient();
  const filtered = items.filter(
    (item) =>
      (!query || item.seller.toLowerCase().includes(query.toLowerCase())) &&
      item.status === tab &&
      (periodFilter === "All Periods" ||
        item.period === periodFilter ||
        item.period.replaceAll("-", "–") === periodFilter),
  );
  const chart = useMemo(
    () => Object.entries(items.reduce((totals, item) => ({ ...totals, [item.period]: (totals[item.period] || 0) + Number(String(item.amount).replace(/[^\d.]/g, "")) / 1000 }), {}))
      .map(([period, amount]) => ({ period, amount: Math.round(amount) }))
      .reverse(),
    [items],
  );
  const pendingTotal = items
    .filter((item) => item.status === "Pending")
    .reduce((total, item) => total + Number(item.amount.replace(/[^\d.]/g, "")), 0);
  const persistGenerateBatch = async () => {
    try {
      await mutateMarketplace("post", "/payouts/generate");
      await queryClient.invalidateQueries({ queryKey: ["marketplace", "payouts"] });
      setTab("Pending");
      onToast("Payout batch generated");
    } catch (error) { onToast(error.response?.data?.detail || "Could not generate payout batch"); }
  };
  const persistPayoutTransition = async (item, target) => {
    try {
      await mutateMarketplace("post", `/payouts/${item.resourceId || item.id}/${target === "Paid" ? "mark-paid" : "release"}`);
      await queryClient.invalidateQueries({ queryKey: ["marketplace", "payouts"] });
      onToast(`${item.seller} payout updated`);
    } catch (error) { onToast(error.response?.data?.detail || "Could not update payout"); }
  };
  const persistBulkRelease = async () => {
    try {
      const result = await mutateMarketplace("post", "/payouts/release-pending");
      await queryClient.invalidateQueries({ queryKey: ["marketplace", "payouts"] });
      setTab("Processing");
      onToast(`${result.released} payouts moved to processing`);
    } catch (error) { onToast(error.response?.data?.detail || "Could not release payouts"); }
  };
  const generateBatch = () => {
    setItems((current) => [
      {
        id: `batch-${Date.now()}`,
        seller: "ArgoPH Seller Batch",
        period: "Aug 1–15, 2026",
        amount: "₱0.00",
        status: "Pending",
        generated: "Today",
      },
      ...current,
    ]);
    setTab("Pending");
    onToast("Payout batch generated");
  };
  const transition = (item, status) => {
    setItems((current) =>
      current.map((row) => (row.id === item.id ? { ...row, status } : row)),
    );
    onToast(`${item.seller} payout marked ${status.toLowerCase()}`);
  };
  const bulkRelease = () => {
    if (!items.some((item) => item.status === "Pending")) {
      onToast("No pending payouts to release");
      return;
    }
    setItems((current) =>
      current.map((item) =>
        item.status === "Pending" ? { ...item, status: "Processing" } : item,
      ),
    );
    setTab("Processing");
    onToast("Pending payouts moved to processing");
  };
  return (
    <>
      <PageHeader
        title="Payouts"
        subtitle="Seller payout batching and release"
        action={
          <button className="btn-primary" onClick={persistGenerateBatch}>
            <Icon name="bi-plus-lg" />
            Generate Batch
          </button>
        }
      />
      <Tabs
        items={["Pending", "Processing", "Paid"]}
        active={tab}
        onChange={setTab}
      />
      <div className="mt-4 sm:w-64">
        <MetricCard
          value={`₱${pendingTotal.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          label="Total Pending Payout"
          icon="bi-wallet2"
          tone="blue"
        />
      </div>
      <div className="card mt-4 p-4">
        <h2 className="text-sm font-bold text-ink">Payout Volume by Period</h2>
        <div className="mt-3 h-36">
          <ResponsiveContainer width="100%" height="100%">
            <ReBarChart
              data={chart}
              margin={{ top: 20, right: 0, left: -25, bottom: 0 }}
            >
              <XAxis
                dataKey="period"
                tick={{ fontSize: 9, fill: "#94a3b8" }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis hide />
              <Tooltip formatter={(value) => [`₱${value}K`, "Payout volume"]} />
              <Bar
                dataKey="amount"
                fill="#2563eb"
                radius={[5, 5, 0, 0]}
                label={{
                  position: "top",
                  fontSize: 10,
                  fill: "#64748b",
                  formatter: (value) => `₱${value}K`,
                }}
              />
            </ReBarChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="card mt-4 overflow-hidden">
        <Toolbar
          placeholder="Search by seller name..."
          query={query}
          setQuery={setQuery}
        >
          <select
            aria-label="Payout period filter"
            className="input h-10 w-full sm:w-32"
            value={periodFilter}
            onChange={(event) => setPeriodFilter(event.target.value)}
          >
            <option>All Periods</option>
            <option>Jul 1–15, 2026</option>
            <option>Jun 16–30, 2026</option>
            <option>Jul 16–31, 2026</option>
          </select>
          <button className="btn-secondary" onClick={persistBulkRelease}>
            Bulk release
          </button>
        </Toolbar>
        {filtered.length === 0 ? (
          <EmptyState title={`No ${tab.toLowerCase()} payouts`} />
        ) : (
          <div>
            <div className="hidden overflow-x-auto lg:block">
            <div className="grid min-w-[780px] grid-cols-[1.3fr_1.2fr_1fr_0.9fr_1fr_1fr]">
              {[
                "Seller",
                "Period",
                "Amount",
                "Status",
                "Generated",
                "Actions",
              ].map((heading) => (
                <div key={heading} className="table-head">
                  {heading}
                </div>
              ))}
              {filtered.map((item) => (
                <Fragment key={item.id}>
                  <div className="px-4 py-4 text-xs font-semibold text-slate-700">
                    {item.seller}
                  </div>
                  <div className="px-3 py-4 text-xs text-slate-600">
                    {item.period}
                  </div>
                  <div className="px-3 py-4 text-xs text-slate-700">
                    {item.amount}
                  </div>
                  <div className="px-3 py-4">
                    <StatusBadge status={item.status} />
                  </div>
                  <div className="px-3 py-4 text-xs text-slate-600">
                    {item.generated}
                  </div>
                  <div className="flex items-center gap-2 px-3 py-4">
                    <button
                      onClick={() => setDetails(item)}
                      className="btn-secondary h-8 px-3 text-xs"
                    >
                      Breakdown
                    </button>
                    {item.status === "Pending" && (
                      <button
                        onClick={() => persistPayoutTransition(item, "Processing")}
                        className="btn-primary h-8 px-3 text-xs"
                      >
                        Release
                      </button>
                    )}
                    {item.status === "Processing" && (
                      <button
                        onClick={() => persistPayoutTransition(item, "Paid")}
                        className="btn-primary h-8 px-3 text-xs"
                      >
                        Mark paid
                      </button>
                    )}
                  </div>
                </Fragment>
              ))}
            </div>
            </div>
            <div className="divide-y divide-slate-100 lg:hidden">
              {filtered.map((item) => (
                <div key={item.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-slate-800">{item.seller}</div>
                      <div className="mt-1 text-xs text-slate-500">{item.period}</div>
                    </div>
                    <StatusBadge status={item.status} />
                  </div>
                  <div className="mt-3 flex items-end justify-between gap-3">
                    <div>
                      <div className="text-[11px] text-slate-400">Amount</div>
                      <div className="mt-1 text-sm font-semibold text-slate-700">{item.amount}</div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => setDetails(item)} className="btn-secondary h-9 px-3 text-xs">Breakdown</button>
                      {item.status === "Pending" && <button onClick={() => persistPayoutTransition(item, "Processing")} className="btn-primary h-9 px-3 text-xs">Release</button>}
                      {item.status === "Processing" && <button onClick={() => persistPayoutTransition(item, "Paid")} className="btn-primary h-9 px-3 text-xs">Mark paid</button>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {details && (
          <DetailModal
            title={`Payout · ${details.seller}`}
            onClose={() => setDetails(null)}
            rows={[
              ["Period", details.period],
              ["Amount", details.amount],
              ["Status", <StatusBadge key="status" status={details.status} />],
              ["Generated", details.generated],
            ]}
          />
        )}
      </div>
    </>
  );
}

function SettingsPage({ onToast }) {
  const { items: sourceItems } = useMarketplaceList(
    "categories",
    categories,
    {},
    (item) => ({ ...item, parent: item.parent || "—" }),
  );
  const [categoryItems, setCategoryItems] = useState(sourceItems);
  useEffect(() => setCategoryItems(sourceItems), [sourceItems]);
  const [tab, setTab] = useState("Categories");
  const [query, setQuery] = useState("");
  const [modal, setModal] = useState(null);
  const queryClient = useQueryClient();
  const filtered = categoryItems.filter(
    (item) =>
      !query ||
      `${item.name} ${item.slug}`.toLowerCase().includes(query.toLowerCase()),
  );
  const persistCreateCategory = async (name) => {
    const slug = name.toLowerCase().trim().replaceAll(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    try {
      await mutateMarketplace("post", "/categories", { name, slug });
      await queryClient.invalidateQueries({ queryKey: ["marketplace", "categories"] });
      setModal(null);
      onToast(`Category ${name} created`);
    } catch (error) { onToast(error.response?.data?.detail || "Could not create category"); }
  };
  const persistRenameCategory = async (name) => {
    const slug = name.toLowerCase().trim().replaceAll(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    try {
      await mutateMarketplace("patch", `/categories/${modal.item.id}`, { name, slug });
      await queryClient.invalidateQueries({ queryKey: ["marketplace", "categories"] });
      setModal(null);
      onToast(`Category renamed to ${name}`);
    } catch (error) { onToast(error.response?.data?.detail || "Could not update category"); }
  };
  const persistCategoryStatus = async (item) => {
    try {
      await mutateMarketplace("patch", `/categories/${item.id}`, { status: item.status === "Active" ? "Archived" : "Active" });
      await queryClient.invalidateQueries({ queryKey: ["marketplace", "categories"] });
      onToast("Category status updated");
    } catch (error) { onToast(error.response?.data?.detail || "Could not update category"); }
  };
  const createCategory = (name) => {
    const slug = name
      .toLowerCase()
      .trim()
      .replaceAll(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
    setCategoryItems((current) => [
      ...current,
      { name, slug, parent: "—", status: "Active" },
    ]);
    setModal(null);
    onToast(`Category “${name}” created`);
  };
  const renameCategory = (name) => {
    setCategoryItems((current) =>
      current.map((item) =>
        item.slug === modal.item.slug
          ? {
              ...item,
              name,
              slug: name
                .toLowerCase()
                .trim()
                .replaceAll(/[^a-z0-9]+/g, "-")
                .replace(/(^-|-$)/g, ""),
            }
          : item,
      ),
    );
    setModal(null);
    onToast(`Category renamed to “${name}”`);
  };
  const toggleCategory = (item) => {
    setCategoryItems((current) =>
      current.map((row) =>
        row.slug === item.slug
          ? { ...row, status: row.status === "Active" ? "Archived" : "Active" }
          : row,
      ),
    );
    onToast(
      `${item.name} ${item.status === "Active" ? "archived" : "restored"}`,
    );
  };
  return (
    <>
      <PageHeader
        title="Settings"
        subtitle={`Marketplace-wide configuration for ${demoIdentity.marketplaceName}`}
      />
      <Tabs
        items={["Categories", "Commission Policy", "Dispute Policy"]}
        active={tab}
        onChange={setTab}
      />
      {tab === "Categories" && (
        <>
          <div className="card mt-4 overflow-hidden">
            <Toolbar
              placeholder="Search categories..."
              query={query}
              setQuery={setQuery}
            >
              <button
                className="btn-primary"
                onClick={() => setModal({ type: "create" })}
              >
                <Icon name="bi-plus-lg" />
                New Category
              </button>
            </Toolbar>
            <div>
              <div className="hidden overflow-x-auto lg:block">
              <div className="grid min-w-[700px] grid-cols-[1.3fr_1.2fr_1fr_0.9fr_0.6fr]">
                {["Name", "Slug", "Parent", "Status", "Actions"].map(
                  (heading) => (
                    <div key={heading} className="table-head">
                      {heading}
                    </div>
                  ),
                )}
                {filtered.map((item) => (
                  <Fragment key={item.slug}>
                    <div className="px-4 py-4 text-xs font-semibold text-slate-700">
                      {item.name}
                    </div>
                    <div className="px-3 py-4 text-xs text-slate-600">
                      {item.slug}
                    </div>
                    <div className="px-3 py-4 text-xs text-slate-600">
                      {item.parent}
                    </div>
                    <div className="px-3 py-4">
                      <StatusBadge status={item.status} />
                    </div>
                    <div className="flex items-center gap-3 px-3 py-4 text-slate-400">
                      <button
                        aria-label={`Edit category ${item.name}`}
                        onClick={() => setModal({ type: "edit", item })}
                      >
                        <Icon name="bi-pencil" />
                      </button>
                      <button
                        aria-label={`${item.status === "Active" ? "Archive" : "Restore"} category ${item.name}`}
                        onClick={() => persistCategoryStatus(item)}
                      >
                        <Icon
                          name={
                            item.status === "Active"
                              ? "bi-archive"
                              : "bi-arrow-counterclockwise"
                          }
                        />
                      </button>
                    </div>
                  </Fragment>
                ))}
              </div>
              </div>
              <div className="divide-y divide-slate-100 lg:hidden">
                {filtered.map((item) => (
                  <div key={item.slug} className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-slate-800">{item.name}</div>
                        <div className="mt-1 truncate text-xs text-slate-500">{item.slug} · Parent: {item.parent}</div>
                      </div>
                      <StatusBadge status={item.status} />
                    </div>
                    <div className="mt-3 flex justify-end gap-2">
                      <button aria-label={`Edit category ${item.name}`} onClick={() => setModal({ type: "edit", item })} className="btn-secondary h-9 px-3 text-xs">Edit</button>
                      <button aria-label={`${item.status === "Active" ? "Archive" : "Restore"} category ${item.name}`} onClick={() => persistCategoryStatus(item)} className="btn-secondary h-9 px-3 text-xs">{item.status === "Active" ? "Archive" : "Restore"}</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            {filtered.length === 0 && <EmptyState />}
          </div>
          <CommissionCard onToast={onToast} />
        </>
      )}
      {tab === "Commission Policy" && <CommissionCard onToast={onToast} />}
      {tab === "Dispute Policy" && <DisputePolicyCard onToast={onToast} />}
      {modal?.type === "create" && (
        <ActionModal
          title="Create category"
          label="Category name"
          placeholder="e.g. Pet Supplies"
          onClose={() => setModal(null)}
          onSave={persistCreateCategory}
        />
      )}
      {modal?.type === "edit" && (
        <ActionModal
          title="Edit category"
          label="Category name"
          initialValue={modal.item.name}
          onClose={() => setModal(null)}
          onSave={persistRenameCategory}
        />
      )}
    </>
  );
}

function CommissionCard({ onToast }) {
  const [values, setValues] = useState({
    defaultRate: "12.0",
    electronics: "15.0",
    groceries: "10.0",
    graceDays: "7",
  });
  const [saved, setSaved] = useState(false);
  const update = (key, value) => {
    setSaved(false);
    setValues((current) => ({ ...current, [key]: value }));
  };
  const save = async () => {
    const valid = [values.defaultRate, values.electronics, values.groceries].every(
      (value) => Number(value) >= 0 && Number(value) <= 100,
    ) && Number(values.graceDays) >= 1 && Number(values.graceDays) <= 90;
    if (!valid) {
      onToast("Rates must be 0 to 100 and grace period must be 1 to 90 days");
      return;
    }
    try {
      await mutateMarketplace("put", "/policies/commission", {
        default_rate: Number(values.defaultRate),
        overrides: { electronics: Number(values.electronics), groceries: Number(values.groceries) },
        mode: "override",
        grace_period_days: Number(values.graceDays),
      });
      setSaved(true);
      onToast("Commission policy saved");
    } catch (error) { onToast(error.response?.data?.detail || "Could not save commission policy"); }
  };
  return (
    <div className="card mt-4 max-w-2xl p-5">
      <h2 className="text-sm font-bold text-ink">Commission Policy</h2>
      <p className="mt-1 text-xs text-slate-500">
        Category overrides replace the default rate for products in that
        category.
      </p>
      <div className="mt-5 space-y-4">
        <label className="block text-xs font-semibold text-slate-600">
          Default commission rate (%)
          <input
            type="number"
            min="0"
            max="100"
            className="input mt-2"
            value={values.defaultRate}
            onChange={(event) => update("defaultRate", event.target.value)}
          />
        </label>
        <label className="block text-xs font-semibold text-slate-600">
          Category override — Electronics (%)
          <input
            type="number"
            min="0"
            max="100"
            className="input mt-2"
            value={values.electronics}
            onChange={(event) => update("electronics", event.target.value)}
          />
        </label>
        <label className="block text-xs font-semibold text-slate-600">
          Category override — Groceries (%)
          <input
            type="number"
            min="0"
            max="100"
            className="input mt-2"
            value={values.groceries}
            onChange={(event) => update("groceries", event.target.value)}
          />
        </label>
        <label className="block text-xs font-semibold text-slate-600">
          Seller commission grace period (days)
          <input
            type="number"
            min="1"
            max="90"
            className="input mt-2"
            value={values.graceDays}
            onChange={(event) => update("graceDays", event.target.value)}
          />
          <span className="mt-1 block text-[11px] font-normal text-slate-500">After this period, overdue balances can be suspended by an administrator.</span>
        </label>
        <div className="flex items-center gap-3">
          <button className="btn-primary" onClick={save}>
            Save Policy
          </button>
          {saved && (
            <span className="text-xs font-semibold text-emerald-600">
              Saved
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function DisputePolicyCard({ onToast }) {
  const [values, setValues] = useState({ response: "3", escalation: "7" });
  const [saved, setSaved] = useState(false);
  const save = async () => {
    if (Number(values.response) <= 0 || Number(values.escalation) <= 0) {
      onToast("Policy days must be greater than zero");
      return;
    }
    try {
      await mutateMarketplace("put", "/policies/dispute", {
        response_window_days: Number(values.response),
        auto_escalate_after_days: Number(values.escalation),
      });
      setSaved(true);
      onToast("Dispute policy saved");
    } catch (error) { onToast(error.response?.data?.detail || "Could not save dispute policy"); }
  };
  return (
    <div className="card mt-4 max-w-2xl p-5">
      <h2 className="text-sm font-bold text-ink">Dispute Policy</h2>
      <p className="mt-1 text-xs text-slate-500">
        Configure the default review window and escalation behavior for order
        disputes.
      </p>
      <div className="mt-5 space-y-4">
        <label className="block text-xs font-semibold text-slate-600">
          Response window (days)
          <input
            type="number"
            min="1"
            className="input mt-2"
            value={values.response}
            onChange={(event) => {
              setSaved(false);
              setValues((current) => ({
                ...current,
                response: event.target.value,
              }));
            }}
          />
        </label>
        <label className="block text-xs font-semibold text-slate-600">
          Auto-escalate after (days)
          <input
            type="number"
            min="1"
            className="input mt-2"
            value={values.escalation}
            onChange={(event) => {
              setSaved(false);
              setValues((current) => ({
                ...current,
                escalation: event.target.value,
              }));
            }}
          />
        </label>
        <div className="flex items-center gap-3">
          <button className="btn-primary" onClick={save}>
            Save Policy
          </button>
          {saved && (
            <span className="text-xs font-semibold text-emerald-600">
              Saved
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function App() {
  const location = useLocation();
  const [toast, setToast] = useState("");
  const notify = (message) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 3200);
  };
  const isAdminRoute = adminRouteRoots.some((root) => location.pathname === root || location.pathname.startsWith(`${root}/`));
  if (!isAdminRoute) return <PortalRoutes onToast={notify} />;
  const session = getAuthSession();
  if (!session.token || session.role !== "admin") {
    return <Navigate to="/login?role=admin" replace />;
  }
  return (
    <Layout toast={toast} onToast={setToast}>
      <Routes>
        <Route path="/dashboard" element={<Dashboard onToast={notify} />} />
        <Route path="/products" element={<ProductsPage onToast={notify} />} />
        <Route path="/orders" element={<OrdersPage onToast={notify} />} />
        <Route path="/sellers" element={<SellersPage onToast={notify} />} />
        <Route path="/reviews" element={<ReviewsPage onToast={notify} />} />
        <Route path="/disputes" element={<DisputesPage onToast={notify} />} />
        <Route path="/commission" element={<AdminCommissionPage onToast={notify} />} />
        <Route path="/settings" element={<SettingsPage onToast={notify} />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Layout>
  );
}

function NotFound() {
  const location = useLocation();
  return (
    <div className="card p-10 text-center">
      <Icon name="bi-compass" className="text-3xl text-slate-300" />
      <h1 className="mt-4 text-lg font-bold">Page not found</h1>
      <p className="mt-1 text-sm text-slate-500">
        No marketplace module exists at {location.pathname}.
      </p>
    </div>
  );
}

export default App;
