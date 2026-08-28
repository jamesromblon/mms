export const AUTH_TOKEN_KEY = "argo_access_token";
export const AUTH_ROLE_KEY = "argo_portal_role";
const supportedRoles = new Set(["admin", "seller", "customer"]);

export function getAuthSession() {
  const token = localStorage.getItem(AUTH_TOKEN_KEY);
  const storedRole = localStorage.getItem(AUTH_ROLE_KEY);
  return {
    token,
    role: supportedRoles.has(storedRole) ? storedRole : null,
  };
}

export function getWorkspaceForRole(role) {
  if (role === "admin") return { label: "Admin dashboard", to: "/dashboard" };
  if (role === "seller") return { label: "Seller workspace", to: "/seller" };
  if (role === "customer") return { label: "My orders", to: "/marketplace/orders" };
  return null;
}

export function getHomeForRole(role) {
  if (role === "admin") return "/dashboard";
  if (role === "seller") return "/seller";
  if (role === "customer") return "/marketplace";
  return null;
}

export function clearAuthSession() {
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_ROLE_KEY);
}
