const { CompositeDisposable } = require('atom');

class History {
    constructor() {
        this.history = [];
        this.index = null;
    }

    last() {
        if (this.index === null) {
            return null;
        }
        return this.history[this.index];
    }

    prev() {
        if (this.index === null || this.index <= 0) {
            return null;
        }
        this.index -= 1;
        return this.history[this.index];
    }

    next() {
        if (this.index === null || this.index >= this.history.length-1) {
            return null;
        }
        this.index += 1;
        return this.history[this.index];
    }

    push(position) {
        if (this.index !== null) {
            this.history.splice(this.index+1);
        }
        this.history.push(position);
        this.index = this.history.length - 1;
    }

    clear() {
        this.history = [];
        this.index = null;
    }
}

module.exports = {
    disposables: null,
    histories: {},
    activating: false,

    activate() {
        this.disposables = new CompositeDisposable;

        // ask to be called for every existing text editor, as well as for any future one
        this.disposables.add(atom.workspace.observeTextEditors(activeEd => {
            // console.log("adding observed editor " + activeEd.id)
            // ask to be called for every cursor change in that editor
            return activeEd.onDidChangeCursorPosition(event => this.onCursorMove(event));
        }));

        // clean history when pane is removed
        this.disposables.add(atom.workspace.onDidDestroyPane(event => {
            delete this.histories[event.pane.id];
        }));

        // clean history when paneItem (tab) is removed
        this.disposables.add(atom.workspace.onDidDestroyPaneItem(event => {
            if (this.histories[event.pane.id] !== undefined) {
                delete this.histories[event.pane.id][event.item.id];
            }
        }));

        // bind events to callbacks
        this.disposables.add(atom.commands.add('atom-workspace', {
            'last-cursor-position:previous': () => this.previous(),
            'last-cursor-position:next': () => this.next(),
            'last-cursor-position:push': () => this.push(),
            'last-cursor-position:clear': () => this.clear(),
        }));
    },

    getHistory() {
        const editor = atom.workspace.getActiveTextEditor();
        const pane = atom.workspace.getActivePane();

        if (this.histories[pane.id] === undefined) {
            this.histories[pane.id] = {};
        }
        if (this.histories[pane.id][editor.id] === undefined) {
            this.histories[pane.id][editor.id] = new History();
        }
        return [editor, this.histories[pane.id][editor.id]];
    },

    onCursorMove(event) {
        // console.log("cursor moved")

        // don't record cursor pos while rewinding/forwarding
        if (this.activating) {
            this.activating = false;
            return;
        }

        const [editor, history] = this.getHistory();

        const pos = history.last();
        // ignore cursor pos changes < 3 lines
        if (pos !== null && (Math.abs(pos.getStartBufferPosition().serialize()[0] - event.newBufferPosition.serialize()[0]) < 3)) {
            return;
        }
        // console.log("ActivePane id " + activePane.id)
        // position is a Marker that reamins logically stationary even as the buffer changes
        const position = editor.markBufferPosition(event.newBufferPosition);
        history.push(position);
    },

    push() {
        const [editor, history] = this.getHistory();
        const position = editor.markBufferPosition(editor.getCursorBufferPosition());
        history.push(position);
    },

    previous() {
        const [editor, history] = this.getHistory();

        // get last position in the list
        const pos = history.prev();

        // console.log("Previous called")
        if (pos === null) {
            return;
        }

        // move cursor to last position and scroll to it
        // console.log("--Moving cursor to new position")
        editor.setCursorBufferPosition(pos.getStartBufferPosition());
    },

    next() {
        const [editor, history] = this.getHistory();

        // get last position in the list
        const pos = history.next();

        // console.log("Next called")
        if (pos === null) {
            return;
        }

        // move cursor to last position and scroll to it
        // console.log("--Moving cursor to new position")
        editor.setCursorBufferPosition(pos.getStartBufferPosition());
    },

    deactivate() {
        this.clear();
        this.disposables.dispose();
    },

    clear() {
        const [editor, history] = this.getHistory();
        history.clear();
    },
};
