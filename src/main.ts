import { Editor, Notice, Plugin, WorkspaceLeaf } from "obsidian";
import { keymap } from "@codemirror/view";
import { EditorSelection } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

interface ActiveMark {
  anchor: number;
  view: EditorView;
}

type EditorWithCM = Editor & {
  cm?: EditorView;
};

type EditorContext = {
  editor?: Editor;
};

interface VisibleRootLeaf {
  leaf: WorkspaceLeaf;
  rect: DOMRect;
}

export default class EmacsLikeKillAndYankPlugin extends Plugin {
  private activeMark: ActiveMark | null = null;

  async onload(): Promise<void> {
    this.registerEditorExtension([
      keymap.of([
        {
          key: "Ctrl-k",
          run: (view) => {
            if (view.composing) {
              return false;
            }

            this.clearMarkForEditorView(view);
            this.killLineInEditorView(view);
            return true;
          },
        },
        {
          key: "Ctrl-y",
          run: (view) => {
            if (view.composing) {
              return false;
            }

            this.clearMarkForEditorView(view);
            void this.yankToEditorView(view);
            return true;
          },
        },
        {
          key: "Ctrl-t",
          run: (view) => {
            if (view.composing) {
              return false;
            }

            return this.focusNextVisibleRootLeaf();
          },
        },
        {
          key: "Ctrl-w",
          run: (view) => {
            if (view.composing) {
              return false;
            }

            void this.killRegionInEditorView(view);
            return true;
          },
        },
        {
          key: "Alt-w",
          run: (view) => {
            if (view.composing) {
              return false;
            }

            void this.copyRegionInEditorView(view);
            return true;
          },
        },
        {
          key: "Ctrl-a",
          run: () => false,
        },
        {
          key: "Ctrl-e",
          run: () => false,
        },
        {
          key: "Ctrl-b",
          run: () => false,
        },
        {
          key: "Ctrl-f",
          run: () => false,
        },
        {
          key: "Ctrl-p",
          run: () => false,
        },
        {
          key: "Ctrl-n",
          run: () => false,
        },
        {
          key: "Ctrl-Space",
          run: (view) => {
            if (view.composing) {
              return false;
            }

            this.toggleMarkFromEditorView(view);
            return true;
          },
        },
        {
          key: "Escape",
          run: (view) => this.cancelMarkFromEditorView(view),
        },
        {
          key: "Ctrl-g",
          run: (view) => this.cancelMarkFromEditorView(view),
        },
        {
          key: "ArrowLeft",
          run: () => false,
        },
        {
          key: "ArrowRight",
          run: () => false,
        },
        {
          key: "ArrowUp",
          run: () => false,
        },
        {
          key: "ArrowDown",
          run: () => false,
        },
        {
          key: "Home",
          run: () => false,
        },
        {
          key: "End",
          run: () => false,
        },
        {
          key: "PageUp",
          run: () => false,
        },
        {
          key: "PageDown",
          run: () => false,
        },
      ]),
    ]);

    this.registerDomEvent(document, "keydown", (event) => {
      this.handleMarkMotion(event);
    });

    this.addCommand({
      id: "kill-line",
      name: "Kill line",
      hotkeys: [{ modifiers: ["Ctrl"], key: "k" }],
      editorCallback: (editor, view) => {
        if (!this.hasEditor(view) || this.isComposing(view)) {
          return;
        }

        this.clearMarkForView(view);
        this.killLine(editor);
      },
    });

    this.addCommand({
      id: "yank",
      name: "Yank",
      hotkeys: [{ modifiers: ["Ctrl"], key: "y" }],
      editorCallback: (editor, view) => {
        if (!this.hasEditor(view) || this.isComposing(view)) {
          return;
        }

        this.clearMarkForView(view);
        void this.yankClipboard(editor);
      },
    });

    this.addCommand({
      id: "kill-region",
      name: "Kill region",
      hotkeys: [{ modifiers: ["Ctrl"], key: "w" }],
      editorCallback: (editor, view) => {
        if (!this.hasEditor(view) || this.isComposing(view)) {
          return;
        }

        void this.killRegion(editor, view);
      },
    });

    this.addCommand({
      id: "copy-region-as-kill",
      name: "Copy region as kill",
      hotkeys: [{ modifiers: ["Alt"], key: "w" }],
      editorCallback: (editor, view) => {
        if (!this.hasEditor(view) || this.isComposing(view)) {
          return;
        }

        void this.copyRegion(editor, view);
      },
    });

    this.addCommand({
      id: "set-mark",
      name: "Set mark",
      hotkeys: [{ modifiers: ["Ctrl"], key: "Space" }],
      editorCallback: (_editor, view) => {
        if (!this.hasEditor(view) || this.isComposing(view)) {
          return;
        }

        this.toggleMark(view);
      },
    });

    this.addCommand({
      id: "keyboard-quit",
      name: "Keyboard quit",
      hotkeys: [{ modifiers: ["Ctrl"], key: "g" }],
      editorCallback: (_editor, view) => {
        if (!this.hasEditor(view)) {
          return;
        }

        this.cancelMark(view);
      },
    });

    this.addCommand({
      id: "focus-next-split",
      name: "Focus next split",
      hotkeys: [{ modifiers: ["Ctrl"], key: "t" }],
      checkCallback: (checking) => {
        if (this.getOrderedVisibleRootLeaves().length <= 1) {
          return false;
        }

        if (!checking) {
          this.focusNextVisibleRootLeaf();
        }

        return true;
      },
    });
  }

  onunload(): void {
    this.activeMark = null;
  }

  private toggleMark(context: EditorContext): void {
    const editorView = this.getEditorView(context);
    if (!editorView) {
      new Notice("Could not access the active editor view.");
      return;
    }

    if (this.activeMark?.view === editorView) {
      this.activeMark = null;
      return;
    }

    const cursorOffset = editorView.state.selection.main.head;
    this.activeMark = {
      anchor: cursorOffset,
      view: editorView,
    };

    if (!editorView.state.selection.main.empty) {
      editorView.dispatch({
        selection: EditorSelection.single(cursorOffset, cursorOffset),
      });
    }
  }

  private clearMarkForView(context: EditorContext): void {
    const editorView = this.getEditorView(context);
    if (editorView && this.activeMark?.view === editorView) {
      this.activeMark = null;
    }
  }

  private cancelMark(context: EditorContext): void {
    const editorView = this.getEditorView(context);
    if (editorView) {
      this.cancelMarkFromEditorView(editorView);
    }
  }

  private clearMarkForEditorView(editorView: EditorView): void {
    if (this.activeMark?.view === editorView) {
      this.activeMark = null;
    }
  }

  private cancelMarkFromEditorView(editorView: EditorView): boolean {
    if (this.activeMark?.view !== editorView) {
      return false;
    }

    const head = editorView.state.selection.main.head;
    this.activeMark = null;
    editorView.dispatch({
      selection: EditorSelection.cursor(head),
      scrollIntoView: true,
    });
    return true;
  }

  private handleMarkMotion(event: KeyboardEvent): void {
    const activeMark = this.activeMark;
    if (!activeMark) {
      return;
    }

    if (!(event.target instanceof Node) || !activeMark.view.dom.contains(event.target)) {
      return;
    }

    const next = this.getNextSelectionHead(activeMark.view, event);
    if (next === null) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    activeMark.view.dispatch({
      selection: EditorSelection.single(activeMark.anchor, next),
      scrollIntoView: true,
    });
  }

  private getNextSelectionHead(editorView: EditorView, event: KeyboardEvent): number | null {
    const selection = editorView.state.selection.main;
    const key = event.key;

    switch (key) {
      case "ArrowLeft":
        return editorView.moveByChar(selection, false).head;
      case "ArrowRight":
        return editorView.moveByChar(selection, true).head;
      case "ArrowUp":
        return editorView.moveVertically(selection, false).head;
      case "ArrowDown":
        return editorView.moveVertically(selection, true).head;
      case "Home":
        return editorView.moveToLineBoundary(selection, false).head;
      case "End":
        return editorView.moveToLineBoundary(selection, true).head;
      case "PageUp":
        return editorView.moveVertically(selection, false, editorView.dom.clientHeight).head;
      case "PageDown":
        return editorView.moveVertically(selection, true, editorView.dom.clientHeight).head;
      case "a":
      case "A":
        if (event.ctrlKey) {
          return editorView.moveToLineBoundary(selection, false).head;
        }
        return null;
      case "e":
      case "E":
        if (event.ctrlKey) {
          return editorView.moveToLineBoundary(selection, true).head;
        }
        return null;
      case "b":
      case "B":
        if (event.ctrlKey) {
          return editorView.moveByChar(selection, false).head;
        }
        return null;
      case "f":
      case "F":
        if (event.ctrlKey) {
          return editorView.moveByChar(selection, true).head;
        }
        return null;
      case "p":
      case "P":
        if (event.ctrlKey) {
          return editorView.moveVertically(selection, false).head;
        }
        return null;
      case "n":
      case "N":
        if (event.ctrlKey) {
          return editorView.moveVertically(selection, true).head;
        }
        return null;
      default:
        return null;
    }
  }

  private killLine(editor: Editor): void {
    const position = editor.getCursor();
    const line = editor.getLine(position.line);
    const retainedText = line.slice(0, position.ch);
    const killedText = line.slice(position.ch);

    void this.writeClipboard(killedText);
    editor.setLine(position.line, retainedText);
    editor.setCursor(position.line, position.ch);
  }

  private killLineInEditorView(editorView: EditorView): void {
    const selection = editorView.state.selection.main;
    const line = editorView.state.doc.lineAt(selection.head);
    const killedText = editorView.state.doc.sliceString(selection.head, line.to);

    void this.writeClipboard(killedText);
    editorView.dispatch({
      changes: {
        from: selection.head,
        to: line.to,
        insert: "",
      },
      selection: EditorSelection.cursor(selection.head),
    });
  }

  private async killRegion(editor: Editor, context: EditorContext): Promise<void> {
    const editorView = this.getEditorView(context);
    if (!editorView) {
      return;
    }

    await this.killRegionInEditorView(editorView, editor);
  }

  private async killRegionInEditorView(editorView: EditorView, editor?: Editor): Promise<void> {
    const selection = this.getEffectiveSelection(editorView);
    if (!selection || selection.empty) {
      return;
    }

    const text = editorView.state.doc.sliceString(selection.from, selection.to);
    await this.writeClipboard(text);

    if (editor) {
      const from = editor.offsetToPos(selection.from);
      const to = editor.offsetToPos(selection.to);
      editor.setSelection(from, to);
      editor.replaceSelection("");
    } else {
      editorView.dispatch({
        changes: {
          from: selection.from,
          to: selection.to,
          insert: "",
        },
        selection: EditorSelection.cursor(selection.from),
        scrollIntoView: true,
      });
    }

    this.clearMarkForEditorView(editorView);
  }

  private async copyRegion(editor: Editor, context: EditorContext): Promise<void> {
    const editorView = this.getEditorView(context);
    if (!editorView) {
      return;
    }

    await this.copyRegionInEditorView(editorView, editor);
  }

  private async copyRegionInEditorView(editorView: EditorView, _editor?: Editor): Promise<void> {
    const selection = this.getEffectiveSelection(editorView);
    if (!selection || selection.empty) {
      return;
    }

    const text = editorView.state.doc.sliceString(selection.from, selection.to);
    await this.writeClipboard(text);
  }

  private async yankClipboard(editor: Editor): Promise<void> {
    try {
      const text = await navigator.clipboard.readText();
      editor.replaceSelection(text);
    } catch (error) {
      this.showClipboardError("read", error);
    }
  }

  private async yankToEditorView(editorView: EditorView): Promise<void> {
    try {
      const text = await navigator.clipboard.readText();
      const selection = editorView.state.selection.main;
      editorView.dispatch({
        changes: {
          from: selection.from,
          to: selection.to,
          insert: text,
        },
        selection: EditorSelection.cursor(selection.from + text.length),
      });
    } catch (error) {
      this.showClipboardError("read", error);
    }
  }

  private async writeClipboard(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
    } catch (error) {
      this.showClipboardError("write", error);
    }
  }

  private showClipboardError(action: "read" | "write", error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    new Notice(`Clipboard ${action} failed: ${message}`);
  }

  private focusNextVisibleRootLeaf(): boolean {
    const leaves = this.getOrderedVisibleRootLeaves();
    if (leaves.length <= 1) {
      return false;
    }

    const activeLeaf = this.getActiveVisibleRootLeaf(leaves);
    const activeIndex = activeLeaf ? leaves.indexOf(activeLeaf) : -1;
    const nextLeaf = leaves[(activeIndex + 1) % leaves.length];
    if (!nextLeaf) {
      return false;
    }

    this.activeMark = null;
    this.app.workspace.setActiveLeaf(nextLeaf, { focus: true });
    void this.app.workspace.revealLeaf(nextLeaf);
    return true;
  }

  private getOrderedVisibleRootLeaves(): WorkspaceLeaf[] {
    const visibleLeaves: VisibleRootLeaf[] = [];
    this.app.workspace.iterateRootLeaves((leaf) => {
      const rect = this.getVisibleLeafRect(leaf);
      if (rect) {
        visibleLeaves.push({ leaf, rect });
      }
    });

    return visibleLeaves
      .sort((a, b) => {
        const leftDiff = a.rect.left - b.rect.left;
        if (Math.abs(leftDiff) > 1) {
          return leftDiff;
        }

        return a.rect.top - b.rect.top;
      })
      .map(({ leaf }) => leaf);
  }

  private getActiveVisibleRootLeaf(leaves: WorkspaceLeaf[]): WorkspaceLeaf | null {
    const activeElement = document.activeElement;
    if (activeElement) {
      const focusedLeaf = leaves.find((leaf) => {
        const leafEl = leaf.view.containerEl.closest(".workspace-leaf");
        return leafEl?.contains(activeElement) ?? false;
      });

      if (focusedLeaf) {
        return focusedLeaf;
      }
    }

    return this.app.workspace.getMostRecentLeaf(this.app.workspace.rootSplit);
  }

  private getVisibleLeafRect(leaf: WorkspaceLeaf): DOMRect | null {
    const leafEl = leaf.view.containerEl.closest(".workspace-leaf");
    if (!(leafEl instanceof HTMLElement)) {
      return null;
    }

    if (!this.app.workspace.containerEl.contains(leafEl)) {
      return null;
    }

    const style = leafEl.ownerDocument.defaultView?.getComputedStyle(leafEl);
    if (style?.display === "none" || style?.visibility === "hidden") {
      return null;
    }

    const rect = leafEl.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return null;
    }

    return rect;
  }

  private isComposing(context: EditorContext): boolean {
    const editorView = this.getEditorView(context);
    return editorView?.composing ?? false;
  }

  private hasEditor(context: EditorContext): context is EditorContext & { editor: Editor } {
    return context.editor !== undefined;
  }

  private toggleMarkFromEditorView(editorView: EditorView): void {
    if (this.activeMark?.view === editorView) {
      this.activeMark = null;
      return;
    }

    const cursorOffset = editorView.state.selection.main.head;
    this.activeMark = {
      anchor: cursorOffset,
      view: editorView,
    };

    if (!editorView.state.selection.main.empty) {
      editorView.dispatch({
        selection: EditorSelection.single(cursorOffset, cursorOffset),
      });
    }
  }

  private getEffectiveSelection(editorView: EditorView): { from: number; to: number; empty: boolean } | null {
    const selection = editorView.state.selection.main;
    if (!selection.empty) {
      return {
        from: selection.from,
        to: selection.to,
        empty: false,
      };
    }

    if (!this.activeMark || this.activeMark.view !== editorView || this.activeMark.anchor === selection.head) {
      return null;
    }

    return {
      from: Math.min(this.activeMark.anchor, selection.head),
      to: Math.max(this.activeMark.anchor, selection.head),
      empty: false,
    };
  }

  private getEditorView(context: EditorContext): EditorView | null {
    if (!context.editor) {
      return null;
    }

    return (context.editor as EditorWithCM).cm ?? null;
  }
}
