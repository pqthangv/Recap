// This install's anonymous id (a random UUID, made once). Used only for the AI quota.
import { newId } from '@/lib/id';
import { DEVICE_ID_KEY } from '@/lib/settings';

import { getRawSetting, setRawSetting } from './settings';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function getDeviceId(now = Date.now()): string {
  const saved = getRawSetting(DEVICE_ID_KEY);
  if (typeof saved === 'string' && UUID.test(saved)) return saved;
  const id = newId();
  setRawSetting(DEVICE_ID_KEY, id, now);
  return id;
}
