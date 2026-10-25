import { describe, expect, it } from "vitest";

import type { FileId } from "@excalidraw/element/types";

import { FileManager } from "../data/FileManager";

describe("FileManager image status", () => {
  it("flips errored image elements to saved once the file is saved", async () => {
    const fileId = "file-1" as FileId;
    const file = {
      id: fileId,
      dataURL: "data:image/png;base64,AA==",
      mimeType: "image/png",
      created: 1,
      lastRetrieved: 1,
      version: 1,
    };
    const manager = new FileManager({
      getFiles: async () => ({ loadedFiles: [], erroredFiles: new Map() }),
      saveFiles: async ({ addedFiles }) => ({
        savedFiles: new Map(addedFiles),
        erroredFiles: new Map(),
      }),
    });
    const element = { type: "image", fileId, status: "error" };

    await manager.saveFiles({
      elements: [element] as any,
      files: { [fileId]: file } as any,
    });

    expect(manager.shouldUpdateImageElementStatus(element as any)).toBe(true);
  });
});
