import { Editor, Notice, Plugin } from "obsidian";
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
          key: "ArrowLeft",
          run: (view) => this.runMarkMotion(view, () =>
            view.moveByChar(view.state.selection.main, false),
          ),
        },
        {
          key: "ArrowRight",
          run: (view) => this.runMarkMotion(view, () =>
            view.moveByChar(view.state.selection.main, true),
          ),
        },
        {
          key: "ArrowUp",
          run: (view) => this.runMarkMotion(view, () =>
            view.moveVertically(view.state.selection.main, false),
          ),
        },
        {
          key: "ArrowDown",
          run: (view) => this.runMarkMotion(view, () =>
            view.moveVertically(view.state.selection.main, true),
          ),
        },
        {
          key: "Home",
          run: (view) => this.runMarkMotion(view, () =>
            view.moveToLineBoundary(view.state.selection.main, false),
          ),
        },
        {
          key: "End",
          run: (view) => this.runMarkMotion(view, () =>
            view.moveToLineBoundary(view.state.selection.main, true),
          ),
        },
        {
          key: "PageUp",
          run: (view) => this.runMarkMotion(view, () =>
            view.moveVertically(view.state.selection.main, false, view.dom.clientHeight),
          ),
        },
        {
          key: "PageDown",
          run: (view) => this.runMarkMotion(view, () =>
            view.moveVertically(view.state.selection.main, true, view.dom.clientHeight),
          ),
        },
      ]),
    ]);

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

  private runMarkMotion(
    editorView: EditorView,
    move: () => { head: number },
  ): boolean {
    if (!this.activeMark || this.activeMark.view !== editorView) {
      return false;
    }

    const next = move();
    editorView.dispatch({
      selection: EditorSelection.single(this.activeMark.anchor, next.head),
      scrollIntoView: true,
    });
    return true;
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
