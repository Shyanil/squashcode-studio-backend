export const userRoles = ['Admin', 'Designer', 'Marketing', 'Viewer'] as const;

export type UserRole = (typeof userRoles)[number];

