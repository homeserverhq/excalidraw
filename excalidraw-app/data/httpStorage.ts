import { MIME_TYPES } from "@excalidraw/common";
import { decompressData } from "@excalidraw/excalidraw/data/encode";
import { IV_LENGTH_BYTES } from "@excalidraw/excalidraw/data/encryption";
import { getSceneVersion } from "@excalidraw/element";

import type {
  FileId,
  OrderedExcalidrawElement,
} from "@excalidraw/element/types";
import type {
  BinaryFileData,
  BinaryFileMetadata,
  DataURL,
} from "@excalidraw/excalidraw/types";

import { encryptElements, decryptElementsFromBuffer } from "./firebase";

import { getHttpStorageBackendUrl } from "./StorageBackend";

import type Portal from "../collab/Portal";
import type { Socket } from "socket.io-client";

import type { SyncableExcalidrawElement } from "./index";

const httpStorageSceneVersionCache = new WeakMap<Socket, number>();

let hasWarnedMissingConfig = false;

const getStorageUrl = (): string => {
  const url = getHttpStorageBackendUrl();
  if (!url && !hasWarnedMissingConfig) {
    console.warn("HTTP_STORAGE_BACKEND_URL not configured");
    hasWarnedMissingConfig = true;
  }
  return url;
};

export const isSavedToHttpStorage = (
  portal: Portal,
  elements: readonly OrderedExcalidrawElement[],
): boolean => {
  if (portal.socket && portal.roomId && portal.roomKey) {
    const sceneVersion = getSceneVersion(elements);

    return httpStorageSceneVersionCache.get(portal.socket) === sceneVersion;
  }
  return true;
};

export const saveToHttpStorage = async (
  portal: Portal,
  elements: readonly SyncableExcalidrawElement[],
) => {
  const { roomId, roomKey, socket } = portal;
  if (
    !roomId ||
    !roomKey ||
    !socket ||
    isSavedToHttpStorage(portal, elements)
  ) {
    return null;
  }

  const sceneVersion = getSceneVersion(elements);
  const HTTP_STORAGE_BACKEND_URL = getStorageUrl();

  if (!HTTP_STORAGE_BACKEND_URL) {
    return null;
  }

  const getResponse = await fetch(
    `${HTTP_STORAGE_BACKEND_URL}/rooms/${roomId}`,
  );
  if (!getResponse.ok && getResponse.status !== 404) {
    return null;
  }

  if (getResponse.ok) {
    const buffer = await getResponse.arrayBuffer();
    const existingElements = await getElementsFromBuffer(buffer, roomKey);

    if (getSceneVersion(existingElements) >= sceneVersion) {
      return null;
    }
  }

  const { ciphertext, iv } = await encryptElements(roomKey, elements);

  const payloadBlob = new Blob([iv.buffer as ArrayBuffer, ciphertext]);
  const payload = await new Response(payloadBlob).arrayBuffer();
  const putResponse = await fetch(
    `${HTTP_STORAGE_BACKEND_URL}/rooms/${roomId}`,
    {
      method: "PUT",
      body: payload,
    },
  );

  if (putResponse.ok) {
    httpStorageSceneVersionCache.set(socket, sceneVersion);
    return elements;
  }

  return null;
};

export const loadFromHttpStorage = async (
  roomId: string,
  roomKey: string,
  socket: Socket | null,
): Promise<readonly OrderedExcalidrawElement[] | null> => {
  const HTTP_STORAGE_BACKEND_URL = getStorageUrl();

  if (!HTTP_STORAGE_BACKEND_URL) {
    return null;
  }

  const getResponse = await fetch(
    `${HTTP_STORAGE_BACKEND_URL}/rooms/${roomId}`,
  );

  if (!getResponse.ok) {
    if (getResponse.status === 404) {
      return null;
    }
    return null;
  }

  const buffer = await getResponse.arrayBuffer();
  const elements = await getElementsFromBuffer(buffer, roomKey);

  if (socket) {
    httpStorageSceneVersionCache.set(socket, getSceneVersion(elements));
  }

  return elements;
};

const getElementsFromBuffer = async (
  buffer: ArrayBuffer,
  key: string,
): Promise<readonly OrderedExcalidrawElement[]> => {
  const iv = buffer.slice(0, IV_LENGTH_BYTES);
  const encrypted = buffer.slice(IV_LENGTH_BYTES, buffer.byteLength);

  return await decryptElementsFromBuffer(
    new Uint8Array(iv) as Uint8Array<ArrayBuffer>,
    new Uint8Array(encrypted) as Uint8Array<ArrayBuffer>,
    key,
  );
};

export const saveFilesToHttpStorage = async ({
  files,
}: {
  files: { id: FileId; buffer: Uint8Array }[];
}) => {
  const HTTP_STORAGE_BACKEND_URL = getStorageUrl();

  const erroredFiles = new Map<FileId, true>();
  const savedFiles = new Map<FileId, true>();

  if (!HTTP_STORAGE_BACKEND_URL) {
    for (const { id } of files) {
      erroredFiles.set(id, true);
    }
    return { savedFiles, erroredFiles };
  }

  await Promise.all(
    files.map(async ({ id, buffer }) => {
      try {
        // Send exactly the bytes of the view (not the whole backing buffer).
        const payload = buffer.buffer.slice(
          buffer.byteOffset,
          buffer.byteOffset + buffer.byteLength,
        ) as ArrayBuffer;
        const response = await fetch(
          `${HTTP_STORAGE_BACKEND_URL}/files/${id}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/octet-stream" },
            body: payload,
          },
        );
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        savedFiles.set(id, true);
      } catch (error: any) {
        console.error(`Failed to save file ${id}`, error);
        erroredFiles.set(id, true);
      }
    }),
  );

  return { savedFiles, erroredFiles };
};

export const loadFilesFromHttpStorage = async (
  decryptionKey: string,
  filesIds: readonly FileId[],
) => {
  const HTTP_STORAGE_BACKEND_URL = getStorageUrl();

  if (!HTTP_STORAGE_BACKEND_URL) {
    return {
      loadedFiles: [] as BinaryFileData[],
      erroredFiles: new Map<FileId, true>(),
    };
  }

  const loadedFiles: BinaryFileData[] = [];
  const erroredFiles = new Map<FileId, true>();

  await Promise.all(
    [...new Set(filesIds)].map(async (id) => {
      try {
        const response = await fetch(`${HTTP_STORAGE_BACKEND_URL}/files/${id}`);
        if (response.status < 400) {
          const arrayBuffer = await response.arrayBuffer();

          const { data, metadata } = await decompressData<BinaryFileMetadata>(
            new Uint8Array(arrayBuffer),
            {
              decryptionKey,
            },
          );

          const dataURL = new TextDecoder().decode(data) as DataURL;

          loadedFiles.push({
            mimeType: metadata.mimeType || MIME_TYPES.binary,
            id,
            dataURL,
            created: metadata?.created || Date.now(),
            lastRetrieved: metadata?.created || Date.now(),
          });
        } else {
          erroredFiles.set(id, true);
        }
      } catch (error: any) {
        erroredFiles.set(id, true);
        console.error(error);
      }
    }),
  );

  return { loadedFiles, erroredFiles };
};
