// Copyright 2015-present 650 Industries. All rights reserved. (MIT, from expo-sqlite 57.0.4:
// node_modules/expo-sqlite/web/WorkerChannel.ts)
//
// RECAP PATCH. metro.config.js loads this copy instead of expo-sqlite's own file, for the web
// version only. Two fixes in synchronous calls, marked "RECAP PATCH" below:
// 1. The worker wrote the result's length with `Uint8Array.set(new Uint32Array([length]))`,
//    which keeps only the lowest byte, so any result over 255 bytes came back cut off ("Expected
//    ',' or ']' after array element in JSON").
// 2. Results had to fit in a fixed 1 MB buffer (a big backup export doesn't). The buffer can now
//    grow, up to 512 MB.
// Imports resolve to expo-sqlite's web folder (see metro.config.js). Remove this file, and the
// redirect, once expo-sqlite fixes both.
/* eslint-disable */
// @ts-nocheck

import { Deferred } from './Deferred';
import { serialize, deserialize } from './SyncSerializer';
import {
  type SQLiteWorkerMessageType,
  type MessageTypeMap,
  type ResultType,
  type ResultTypeMap,
} from './web.types';

let messageId = 0;
const deferredMap = new Map<number, Deferred>();
const PENDING = 1;
const RESOLVED = 2;

let hasWarnedSync = false;

/**
 * For worker to send result to the main thread.
 */
export function sendWorkerResult({
  id,
  result,
  error,
  syncTrait,
}: {
  id: number;
  result: ResultType | null;
  error: Error | null;
  syncTrait?: {
    lockBuffer: SharedArrayBuffer;
    resultBuffer: SharedArrayBuffer;
  };
}) {
  if (syncTrait) {
    const { lockBuffer, resultBuffer } = syncTrait;
    const lock = new Int32Array(lockBuffer);
    const resultJson = error != null ? serialize({ error }) : serialize({ result });
    let resultBytes = new TextEncoder().encode(resultJson);
    // RECAP PATCH (2): make room for a big result.
    if (resultBytes.length + 4 > resultBuffer.byteLength) {
      try {
        resultBuffer.grow(resultBytes.length + 4);
      } catch {
        resultBytes = new TextEncoder().encode(
          serialize({ error: `The result is too big (${resultBytes.length} bytes)` })
        );
      }
    }
    // RECAP PATCH (1): write the length as a 32-bit number, not just its lowest byte.
    new Uint32Array(resultBuffer, 0, 1)[0] = resultBytes.length;
    new Uint8Array(resultBuffer).set(resultBytes, 4);
    Atomics.store(lock, 0, RESOLVED);
  } else {
    if (result) {
      self.postMessage({ id, result });
    } else {
      self.postMessage({ id, error });
    }
  }
}

/**
 * For main thread to handle worker messages.
 */
export function workerMessageHandler(event: MessageEvent) {
  const { id, result, error, isSync } = event.data;
  if (!isSync) {
    const deferred = deferredMap.get(id);
    if (deferred) {
      if (error) {
        deferred.reject(new Error(error));
      } else {
        deferred.resolve(result);
      }
      deferredMap.delete(id);
    }
  }
}

/**
 * For main thread to invoke worker function asynchronously.
 */
export async function invokeWorkerAsync<T extends SQLiteWorkerMessageType & keyof ResultTypeMap>(
  worker: Worker,
  type: T,
  data: MessageTypeMap[T]['data']
): Promise<ResultTypeMap[T]> {
  const id = messageId++;
  const deferred = new Deferred<ResultTypeMap[T]>();
  deferredMap.set(id, deferred);
  worker.postMessage({ type, id, data, isSync: false });
  return deferred.getPromise();
}

/**
 * For main thread to invoke worker function synchronously.
 */
export function invokeWorkerSync<T extends SQLiteWorkerMessageType & keyof ResultTypeMap>(
  worker: Worker,
  type: T,
  data: MessageTypeMap[T]['data']
): ResultTypeMap[T] {
  if (__DEV__ && !hasWarnedSync) {
    console.warn(
      'Using synchronous SQLite operations can cause significant performance impact. Consider using async operations instead.'
    );
    hasWarnedSync = true;
  }

  const id = messageId++;
  const lockBuffer = new SharedArrayBuffer(4);
  const lock = new Int32Array(lockBuffer);
  // RECAP PATCH (2): growable, so the worker can make room for a big result.
  const resultBuffer = new SharedArrayBuffer(1024 * 1024, { maxByteLength: 512 * 1024 * 1024 });
  const resultArray = new Uint8Array(resultBuffer);

  Atomics.store(lock, 0, PENDING);
  worker.postMessage({
    type,
    id,
    data,
    isSync: true,
    lockBuffer,
    resultBuffer,
  });

  let i = 0;
  // @ts-expect-error: Remove this when TypeScript supports Atomics.pause
  const useAtomicsPause = typeof Atomics.pause === 'function';
  while (Atomics.load(lock, 0) === PENDING) {
    ++i;

    if (useAtomicsPause) {
      if (i > 1_000_000) {
        throw new Error('Sync operation timeout');
      }
      // @ts-expect-error: Remove this when TypeScript supports Atomics.pause
      Atomics.pause();
    } else {
      // NOTE(kudo): Unfortunate for the busy loop,
      // because we don't have a way for main thread to yield its execution to other callbacks.
      if (i > 1000_000_000) {
        throw new Error('Sync operation timeout');
      }
    }
  }

  const length = new Uint32Array(resultArray.buffer, 0, 1)[0];
  const resultCopy = new Uint8Array(length);
  resultCopy.set(new Uint8Array(resultArray.buffer, 4, length));
  const resultJson = new TextDecoder().decode(resultCopy);
  const { result, error } = deserialize<{ result: ResultTypeMap[T]; error?: string }>(resultJson);
  if (error) throw new Error(error);
  return result;
}
