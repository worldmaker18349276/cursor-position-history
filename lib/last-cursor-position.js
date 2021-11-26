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
        // DEBUG: this.editor.decorateMarker(marker, {type: 'cursor', class: "last-cursor-position-debug"});
        this.history.push(marker);
        this.index = this.history.length - 1;

        // trim history size
        const size = atom.config.get("last-cursor-position.maxHistorySize")
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
            description: "Number of history to remember"
        },
    },

    disposables: null,
    histories: {},
    activating: false,

    activate() {
        this.disposables = new CompositeDisposable();

        // ask to be called for every existing text editor, as well as for any future one
        this.disposables.add(atom.workspace.observeTextEditors(activeEd => {
            // console.log("adding observed editor " + activeEd.id)
            // ask to be called for every cursor change in that editor
            activeEd.onDidChangeCursorPosition(event => this.onCursorMove(event));
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

    deactivate() {
        this.histories = {};
        this.disposables.dispose();
    },

    getHistory() {
        const editor = atom.workspace.getActiveTextEditor();
        const pane = atom.workspace.getActivePane();

        if (this.histories[pane.id] === undefined) {
            this.histories[pane.id] = {};
        }
        if (this.histories[pane.id][editor.id] === undefined) {
            this.histories[pane.id][editor.id] = new History(editor);
        }
        return this.histories[pane.id][editor.id];
    },

    onCursorMove(event) {
        // don't record cursor pos while rewinding/forwarding
        if (this.activating) {
            this.activating = false;
            return;
        }

        const history = this.getHistory();
        history.update(event);
    },

    push() {
        const history = this.getHistory();
        history.push(history.editor.getCursorBufferPosition());
        history.untouch();
    },

    previous() {
        // get last position in the list
        const history = this.getHistory();
        const pos = history.prev();
        if (pos === null) {
            return;
        }

        // move cursor to last position and scroll to it
        this.activating = true;
        history.untouch();
        history.editor.setCursorBufferPosition(pos);
    },

    next() {
        // get last position in the list
        const history = this.getHistory();
        const pos = history.next();
        if (pos === null) {
            return;
        }

        // move cursor to last position and scroll to it
        this.activating = true;
        history.untouch();
        history.editor.setCursorBufferPosition(pos);
    },

    clear() {
        const history = this.getHistory();
        history.clear();
    },
};
