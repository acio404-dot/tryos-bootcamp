/* Типы для lib/tryos-whiteboard.js — черновик (лист для записей) рядом с задачей. */

export interface SheetData {
  v: 1;
  items: unknown[];
  view: { x: number; y: number; s: number };
}

export interface WhiteboardOptions {
  /** Элемент, который станет листом. */
  container: HTMLElement;
  /** Префикс для сохранения в localStorage; свой для каждого варианта. */
  storageKey?: string;
  /** Лист, который открыть сразу. */
  sheet?: string;
  /** Шрифт инструмента «Текст». */
  textFont?: string;
  /** Вызывается через ~0,4 с после изменений листа. */
  onChange?: (sheetId: string, data: SheetData) => void;
  storage?: false | {
    load(key: string): unknown;
    save(key: string, value: unknown): boolean | void;
    remove(key: string): void;
  };
  shortcuts?: boolean;
}

export type Tool =
  | 'hand' | 'select' | 'pen' | 'hl' | 'eraser' | 'text'
  | 'line' | 'arrow' | 'rect' | 'ellipse' | 'tri' | 'rtri' | 'axes';

export interface Whiteboard {
  readonly sheetId: string;
  setSheet(id: string): Whiteboard;
  setTool(tool: Tool): Whiteboard;
  undo(): Whiteboard;
  redo(): Whiteboard;
  clearSheet(id?: string): Whiteboard;
  clearAll(): Whiteboard;
  hasContent(id?: string): boolean;
  exportData(id?: string): SheetData;
  importData(id: string, data: SheetData): Whiteboard;
  exportPNG(id?: string, opts?: { scale?: number; padding?: number }): string | null;
  resetView(): Whiteboard;
  fitView(): Whiteboard;
  zoomBy(k: number): Whiteboard;
  deleteSelection(): Whiteboard;
  duplicateSelection(): Whiteboard;
  destroy(): void;
}

declare const TryosWhiteboard: {
  version: string;
  create(opts: WhiteboardOptions): Whiteboard;
};
export default TryosWhiteboard;
