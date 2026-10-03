/**
 * Role-based permissions for accounts.
 *
 * Every privileged action is checked against a named permission, never against a role name, so
 * roles can be reshaped later without touching call sites. The server is the only enforcer; the
 * admin UI uses the same table purely to hide controls the user cannot use.
 */
export const Roles = ['player', 'support', 'game_master', 'admin'] as const;
export type Role = (typeof Roles)[number];

export const Permissions = [
  'admin.access', // can open the admin app at all
  'admin.accounts.read',
  'admin.characters.read',
  'admin.inventory.read',
  'admin.items.history.read',
  'admin.marketplace.read',
  'admin.currency.read',
  'admin.items.grant',
  'admin.items.revoke',
  'admin.bans.read',
  'admin.bans.write',
  'admin.server.read',
] as const;
export type Permission = (typeof Permissions)[number];

const READ_ONLY_SUPPORT: readonly Permission[] = [
  'admin.access',
  'admin.accounts.read',
  'admin.characters.read',
  'admin.inventory.read',
  'admin.items.history.read',
  'admin.marketplace.read',
  'admin.currency.read',
  'admin.bans.read',
];

export const RolePermissions: Readonly<Record<Role, readonly Permission[]>> = {
  player: [],
  support: READ_ONLY_SUPPORT,
  game_master: [
    ...READ_ONLY_SUPPORT,
    'admin.items.grant',
    'admin.items.revoke',
    'admin.server.read',
  ],
  admin: Permissions,
};

export function roleHasPermission(role: Role, permission: Permission): boolean {
  return RolePermissions[role].includes(permission);
}
