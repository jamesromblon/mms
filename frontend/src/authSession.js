export const AUTH_TOKEN_KEY = "argo_access_token";
export const AUTH_ROLE_KEY = "argo_portal_role";

export function clearAuthSession() {
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_ROLE_KEY);
}
