import { Editor, Notice, Plugin } from "obsidian";
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

  async onload(): Promise<void> {
    this.registerEditorExtension(this.createMarkTrackingExtension());

    this.addCommand({
      id: "kill-line",
      name: "Kill line",
      hotkeys: [{ modifiers: ["Ctrl"], key: "k" }],
      editorCallback: (editor, view) => {
        if (!this.hasEditor(view) || this.isComposing(view)) {
          return;
        }

        this.clearMarkForView(view);

        const position = editor.getCursor();
        const line = editor.getLine(position.line);
        const retainedText = line.slice(0, position.ch);
        const killedText = line.slice(position.ch);

        void this.writeClipboard(killedText);
        editor.setLine(position.line, retainedText);
        editor.setCursor(position.line, position.ch);
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

  private async yankClipboard(editor: Editor): Promise<void> {
    try {
      const text = await navigator.clipboard.readText();
      editor.replaceSelection(text);
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

  private getEditorView(context: EditorContext): EditorView | null {
    if (!context.editor) {
      return null;
    }

    return (context.editor as EditorWithCM).cm ?? null;
  }
}
