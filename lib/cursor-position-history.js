const { CompositeDisposable } = require('atom');

const DEBOUNCE_TIME = 300.0;
const DEBOUNCE_DIS = 3;

class History {
    constructor(editor) {
        this.editor = editor;
        this.history = [];
        this.index = null;
        this.touch_time = 0.0;
    }

    last() {
        if (this.index === null) {
            return null;
        }
        return this.history[this.index].getStartBufferPosition();
    }

    prev() {
        if (this.index === null) {
            return null;
        }
        this.index = Math.max(this.index - 1, 0);
        return this.history[this.index].getStartBufferPosition();
    }

    next() {
        if (this.index === null) {
            return null;
        }
        this.index = Math.min(this.index + 1, this.history.length - 1);
        return this.history[this.index].getStartBufferPosition();
    }

    update(event) {
        const delta = new Date().getTime() - this.touch_time;
        if (delta < DEBOUNCE_TIME) {
            // replace previous record when moving continuously
            if (this.index !== null) {
                this.index -= 1;
            }
        } else {
            // ignore too small changes when start moving
            const pos = this.index !== null ? this.history[this.index].getStartScreenPosition() : null;
            if (pos !== null && Math.abs(event.newScreenPosition.row - pos.row) <= DEBOUNCE_DIS) {
                return;
            }
        }

        // record initial position when history is empty
        if (this.index === null) {
            this.push(event.oldBufferPosition);
            this.touch_time = 0.0;
        } else {
            this.push(event.newBufferPosition);
        }
    }

    push(position) {
        if (this.index !== null) {
            for (let marker of this.history.splice(this.index+1)) {
                marker.destroy();
            }
        }
        // position is a Marker that reamins logically stationary even as the buffer changes
        const marker = this.editor.markBufferPosition(position);
        // DEBUG: this.editor.decorateMarker(marker, {type: 'cursor', class: "cursor-position-history-debug"});
        this.history.push(marker);
        this.index = this.history.length - 1;

        // trim history size
        const size = atom.config.get("cursor-position-history.maxHistorySize");
        if (this.history.length > size) {
            const trim = this.history.length - size;
            for (let marker of this.history.splice(0, trim)) {
                marker.destroy();
            }
            this.index = Math.max(this.index - trim, 0);
        }

        // update touch time
        this.touch_time = new Date().getTime();
    }

    untouch() {
        this.touch_time = 0.0;
    }

    clear() {
        for (let marker of this.history) {
            marker.destroy();
        }
        this.history = [];
        this.index = null;
        this.touch_time = 0.0;
    }
}

module.exports = {
    config: {
        maxHistorySize: {
            order: 0,
            type: "integer",
            default: 1000,
            minimum: 1,
            description: "Number of history to remember",
        },
    },

    disposables: null,
    histories: {},
    activating: false,

    activate() {
        this.disposables = new CompositeDisposable();

        // ask to be called for every existing text editor, as well as for any future one
        this.disposables.add(atom.workspace.observeTextEditors(editor => {
            this.disposables.add(editor.onDidChangeCursorPosition(event => this.onCursorMove(event)));
        }));

        // clean history when tab is removed
        this.disposables.add(atom.workspace.onDidDestroyPaneItem(event => {
            if (this.histories[event.item.id]) {
                this.histories[event.item.id].clear();
            }
            delete this.histories[event.item.id];
        }));

        // bind events to callbacks
        this.disposables.add(atom.commands.add('atom-workspace', {
            'cursor-position-history:previous': () => this.previous(),
            'cursor-position-history:next': () => this.next(),
            'cursor-position-history:push': () => this.push(),
            'cursor-position-history:clear': () => this.clear(),
        }));
    },

    deactivate() {
        for (const history of Object.values(this.histories)) {
            history.clear();
        }
        this.histories = {};
        this.disposables.dispose();
    },

    getHistory(editor) {
        if (this.histories[editor.id] === undefined) {
            this.histories[editor.id] = new History(editor);
        }
        return this.histories[editor.id];
    },

    onCursorMove(event) {
        // don't record cursor pos while rewinding/forwarding
        if (this.activating) {
            return;
        }

        const history = this.getHistory(event.cursor.editor);
        history.update(event);
    },

    push() {
        const editor = atom.workspace.getActiveTextEditor();
        if (!editor) {
            return;
        }
        const history = this.getHistory(editor);
        history.push(history.editor.getCursorBufferPosition());
        history.untouch();
    },

    previous() {
        // get last position in the list
        const editor = atom.workspace.getActiveTextEditor();
        if (!editor) {
            return;
        }
        const history = this.getHistory(editor);
        const pos = history.prev();
        if (pos === null) {
            return;
        }

        // move cursor to last position and scroll to it
        this.activating = true;
        history.untouch();
        history.editor.setCursorBufferPosition(pos);
        this.activating = false;
    },

    next() {
        // get last position in the list
        const editor = atom.workspace.getActiveTextEditor();
        if (!editor) {
            return;
        }
        const history = this.getHistory(editor);
        const pos = history.next();
        if (pos === null) {
            return;
        }

        // move cursor to last position and scroll to it
        this.activating = true;
        history.untouch();
        history.editor.setCursorBufferPosition(pos);
        this.activating = false;
    },

    clear() {
        const editor = atom.workspace.getActiveTextEditor();
        if (!editor) {
            return;
        }
        const history = this.getHistory(editor);
        history.clear();
    },
};
