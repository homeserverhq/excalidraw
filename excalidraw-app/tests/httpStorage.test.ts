import { afterEach, describe, expect, it, vi } from "vitest";

import type { FileId } from "@excalidraw/element/types";

import { saveFilesToHttpStorage } from "../data/httpStorage";

const { mockUrl } = vi.hoisted(() => ({
  mockUrl: { value: "https://storage.example.com/api/v2" },
}));

vi.mock("../data/StorageBackend", () => ({
  getHttpStorageBackendUrl: () => mockUrl.value,
}));

vi.mock("../data/firebase", () => ({
  encryptElements: vi.fn(),
  decryptElementsFromBuffer: vi.fn(),
}));

describe("saveFilesToHttpStorage", () => {
  const fileId = "file-1" as FileId;
  const buffer = new Uint8Array([1, 2, 3]);

  afterEach(() => {
    mockUrl.value = "https://storage.example.com/api/v2";
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("PUTs the exact bytes with an octet-stream content type", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);

    const result = await saveFilesToHttpStorage({
      files: [{ id: fileId, buffer }],
    });

    expect(result.savedFiles.has(fileId)).toBe(true);
    expect(result.erroredFiles.size).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`https://storage.example.com/api/v2/files/${fileId}`);
    expect(init.method).toBe("PUT");
    expect(init.headers).toEqual({
      "Content-Type": "application/octet-stream",
    });
    expect([...new Uint8Array(init.body as ArrayBuffer)]).toEqual([...buffer]);
  });

  it("marks files as errored on a non-2xx response", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 500 }),
    );

    const result = await saveFilesToHttpStorage({
      files: [{ id: fileId, buffer }],
    });

    expect(result.savedFiles.size).toBe(0);
    expect(result.erroredFiles.has(fileId)).toBe(true);
  });

  it("marks files as errored when the backend URL is missing", async () => {
    mockUrl.value = "";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await saveFilesToHttpStorage({
      files: [{ id: fileId, buffer }],
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.erroredFiles.has(fileId)).toBe(true);
  });
});
