import { getRuntimeEnv } from "./env";

let envLoaded = false;
const envCache: { storageBackend?: string; httpStorageBackendUrl?: string } =
  {};

/**
 * Hydrate the (synchronous) storage config cache from the runtime `/env.json`.
 * Must be awaited before any save/load happens (see `Collab.startCollaboration`).
 */
export const ensureRuntimeEnv = async (): Promise<void> => {
  if (envLoaded) {
    return;
  }
  const env = await getRuntimeEnv();
  envCache.storageBackend = env.VITE_APP_STORAGE_BACKEND;
  envCache.httpStorageBackendUrl = env.VITE_APP_HTTP_STORAGE_BACKEND_URL;
  envLoaded = true;
};

export enum StorageBackendType {
  FIREBASE = "firebase",
  HTTP = "http",
}

export const getStorageBackendType = (): StorageBackendType => {
  const backend =
    envCache.storageBackend || import.meta.env.VITE_APP_STORAGE_BACKEND;
  if (backend === "http") {
    return StorageBackendType.HTTP;
  }
  return StorageBackendType.FIREBASE;
};

export const getHttpStorageBackendUrl = (): string => {
  return (
    envCache.httpStorageBackendUrl ||
    import.meta.env.VITE_APP_HTTP_STORAGE_BACKEND_URL ||
    ""
  );
};

export const getSaveInterval = (): number => {
  if (
    getStorageBackendType() === StorageBackendType.HTTP &&
    getHttpStorageBackendUrl()
  ) {
    return 1000;
  }
  return 20000;
};
