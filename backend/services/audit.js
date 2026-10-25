import { AuditLog } from '../models/index.js';
export async function audit(actor, action, entity, entityId, detail = '', session) {
  await AuditLog.create(
    [{ actor: actor?._id || actor, action, entity, entityId: String(entityId || ''), detail }],
    session ? { session } : {},
  );
}
