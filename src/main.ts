import { Editor, Notice, Plugin } from "obsidian";
import { keymap } from "@codemirror/view";
import { EditorSelection } from "@codemirror/state";
import { EditorView, ViewPlugin, ViewUpdate } from "@codemirror/view";

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

export default class EmacsLikeKillAndYankPlugin extends Plugin {
  private activeMark: ActiveMark | null = null;
  private syncingSelection = false;
  private readonly markMotionKeys = new Set([
    "ArrowLeft",
    "ArrowRight",
    "ArrowUp",
    "ArrowDown",
    "Home",
    "End",
    "PageUp",
    "PageDown",
  ]);

  async onload(): Promise<void> {
    this.registerEditorExtension([
      this.createMarkTrackingExtension(),
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
          key: "Ctrl-Space",
          run: (view) => {
            if (view.composing) {
              return false;
            }

            this.toggleMarkFromEditorView(view);
            return true;
          },
        },
      ]),
    ]);

    this.registerDomEvent(document, "keydown", (event) => {
      this.handleMarkMotionKeydown(event);
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
  }

  onunload(): void {
    this.activeMark = null;
  }

  private createMarkTrackingExtension() {
    const plugin = this;

    return ViewPlugin.fromClass(
      class {
        constructor(private readonly view: EditorView) {}

        update(update: ViewUpdate): void {
          plugin.handleViewUpdate(this.view, update);
        }

        destroy(): void {
          plugin.handleViewDestroy(this.view);
        }
      },
    );
  }

  private handleViewUpdate(view: EditorView, update: ViewUpdate): void {
    if (!this.activeMark || this.activeMark.view !== view) {
      return;
    }

    if (update.docChanged) {
      this.activeMark.anchor = update.changes.mapPos(this.activeMark.anchor);
    }

    if (this.syncingSelection || (!update.selectionSet && !update.docChanged)) {
      return;
    }

    const selection = view.state.selection.main;
    const desiredAnchor = this.activeMark.anchor;
    const desiredHead = selection.head;

    if (selection.anchor === desiredAnchor) {
      return;
    }

    this.syncingSelection = true;
    view.dispatch({
      selection: EditorSelection.single(desiredAnchor, desiredHead),
    });
    this.syncingSelection = false;
  }

  private handleViewDestroy(view: EditorView): void {
    if (this.activeMark?.view === view) {
      this.activeMark = null;
    }
  }

  private handleMarkMotionKeydown(event: KeyboardEvent): void {
    const activeMark = this.activeMark;
    if (!activeMark) {
      return;
    }

    if (!this.markMotionKeys.has(event.key)) {
      return;
    }

    if (!(event.target instanceof Node) || !activeMark.view.dom.contains(event.target)) {
      return;
    }

    window.setTimeout(() => {
      this.syncMarkSelection(activeMark.view);
    }, 0);
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

  private clearMarkForEditorView(editorView: EditorView): void {
    if (this.activeMark?.view === editorView) {
      this.activeMark = null;
    }
  }

  private syncMarkSelection(editorView: EditorView): void {
    if (!this.activeMark || this.activeMark.view !== editorView) {
      return;
    }

    const selection = editorView.state.selection.main;
    const desiredAnchor = this.activeMark.anchor;

    if (selection.anchor === desiredAnchor) {
      return;
    }

    this.syncingSelection = true;
    editorView.dispatch({
      selection: EditorSelection.single(desiredAnchor, selection.head),
    });
    this.syncingSelection = false;
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

  private getEditorView(context: EditorContext): EditorView | null {
    if (!context.editor) {
      return null;
    }

    return (context.editor as EditorWithCM).cm ?? null;
  }
}
