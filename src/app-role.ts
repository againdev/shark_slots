export const APP_ROLES = ['auth', 'slots', 'payments', 'all'] as const;

export type AppRole = (typeof APP_ROLES)[number];

export function resolveAppRole(raw?: string): AppRole {
  const value = raw?.trim().toLowerCase();
  if (value && APP_ROLES.includes(value as AppRole)) {
    return value as AppRole;
  }
  return 'all';
}

export const APP_ROLE_PORTS: Record<Exclude<AppRole, 'all'>, number> = {
  auth: 4001,
  slots: 4002,
  payments: 4003,
};
