import { RoleWorkspace } from './RoleWorkspace';
import type { UserRole } from '../lib/types';
export function RoleDashboard({ role }: { role: Exclude<UserRole, 'CUSTOMER'> }) { return <RoleWorkspace role={role} />; }
