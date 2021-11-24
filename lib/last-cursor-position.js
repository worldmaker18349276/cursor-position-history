const { CompositeDisposable } = require('atom');

const MAX_HISTORY_SIZE = 1000;
const DEBOUNCE = 500.0;
const DEBUG = true;

class History {
    constructor(editor) {
        this.editor = editor;
        this.history = [];
        this.index = null;
        this.time = 0.0;
    }

    last() {
        if (this.index === null) {
            return null;
        }
        return this.history[this.index].getStartBufferPosition();
    }

    prev() {
        if (this.index === null || this.index <= 0) {
            return null;
        }
        this.index -= 1;
        return this.history[this.index].getStartBufferPosition();
    }

    next() {
        if (this.index === null || this.index >= this.history.length-1) {
            return null;
        }
        this.index += 1;
        return this.history[this.index].getStartBufferPosition();
    }

    push(position, force=false) {
        // update touch time
        const time = new Date().getTime();
        const delta = time - this.time;
        this.time = time;

        if (!force) {
            // replace previous record when changing continuously
            if (delta < DEBOUNCE && this.index !== null) {
                this.index -= 1;
            }
        }

        if (this.index !== null) {
            for (let marker of this.history.splice(this.index+1)) {
                marker.destroy();
            }
        }
        // position is a Marker that reamins logically stationary even as the buffer changes
        const marker = this.editor.markBufferPosition(position);
        if (DEBUG) {
            this.editor.decorateMarker(marker, {type: 'cursor', style: {
                'border-color': 'rgba(255,255,255,0.1)',
                'border-width': '3px'
            }});
        }
        this.history.push(marker);
        this.index = this.history.length - 1;

        // trim history size
        if (this.history.length > MAX_HISTORY_SIZE) {
            const trim = this.history.length - MAX_HISTORY_SIZE;
            for (let marker of this.history.splice(0, trim)) {
                marker.destroy();
            }
            this.index = Math.max(this.index - trim, 0);
        }
    }

    clear() {
        for (let marker of this.history) {
            marker.destroy();
        }
        this.history = [];
        this.index = null;
        this.time = 0.0;
    }
}

module.exports = {
    disposables: null,
    histories: {},
    activating: false,

    activate() {
        this.disposables = new CompositeDisposable();

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
        history.push(event.newBufferPosition);
    },

    push() {
        const history = this.getHistory();
        history.push(history.editor.getCursorBufferPosition(), true);
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
        history.editor.setCursorBufferPosition(pos);
    },

    clear() {
        const history = this.getHistory();
        history.clear();
    },
};
