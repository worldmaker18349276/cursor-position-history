const { CompositeDisposable } = require('atom');

const DEBOUNCE_TIME = 300;
const DEBOUNCE_DIS = 3;

class HistoryManager {
    constructor(editor, size) {
        this.editor = editor;
        this.size = size;
        this.markers = [];
        this.index = null;
    }

    isEmpty() {
        return this.markers.length == 0;
    }

    current() {
        if (this.isEmpty()) {
            return null;
        }
        return this.markers[this.index].getStartBufferPosition();
    }

    rewind() {
        if (this.isEmpty()) {
            return null;
        }
        this.index = Math.max(this.index - 1, 0);
        return this.markers[this.index].getStartBufferPosition();
    }

    forward() {
        if (this.isEmpty()) {
            return null;
        }
        this.index = Math.min(this.index + 1, this.markers.length - 1);
        return this.markers[this.index].getStartBufferPosition();
    }

    record(position, override=false) {
        // override the current position
        if (override && !this.isEmpty()) {
            this.index -= 1;
        }

        // remove future markers
        if (!this.isEmpty()) {
            for (const marker of this.markers.splice(this.index+1)) {
                marker.destroy();
            }
        }

        // record position as a marker that remains logically stationary even as the buffer changes
        const marker = this.editor.markBufferPosition(position);
        // /* DEBUG */ this.editor.decorateMarker(marker, {type: 'cursor', class: "cursor-position-history-debug"});
        this.markers.push(marker);
        this.index = this.markers.length - 1;

        // trim excess markers
        this.trim();
    }

    trim() {
        if (this.markers.length > this.size) {
            const ex = this.markers.length - this.size;
            for (const marker of this.markers.splice(0, ex)) {
                marker.destroy();
            }
            this.index = Math.max(this.index - ex, 0);
        }
    }

    clear() {
        for (const marker of this.markers) {
            marker.destroy();
        }
        this.markers = [];
        this.index = null;
    }
}

// stop moving after `push` is not called within `decay_time`
class DecayState {
    constructor(decay_time) {
        this.decay_time = decay_time;
        this.touch_time = null;
    }

    stop() {
        this.touch_time = null;
    }

    push() {
        this.touch_time = new Date().getTime();
    }

    isMoving() {
        if (this.touch_time === null) {
            return false;
        }

        const delta = new Date().getTime() - this.touch_time;
        return delta < this.decay_time;
    }
}

class CursorTraveler {
    constructor(editor) {
        this.editor = editor;
        const size = atom.config.get("cursor-position-history.maxHistorySize");
        this.history = new HistoryManager(editor, size);
        this.activating = false;
        this.momentum = new DecayState(DEBOUNCE_TIME);
    }

    onCursorMove(event) {
        // don't record the cursor position while rewinding/forwarding
        if (this.activating) {
            return;
        }

        // record the initial position when the history is empty
        if (this.history.isEmpty()) {
            this.history.record(event.oldBufferPosition);
            this.momentum.stop();
        }

        const isMoving = this.momentum.isMoving();

        if (!isMoving) {
            // ignore too small changes when start moving
            const currentPosition = this.editor.screenPositionForBufferPosition(this.history.current());
            if (currentPosition !== null && Math.abs(event.newScreenPosition.row - currentPosition.row) <= DEBOUNCE_DIS) {
                return;
            }
        }

        // replace the previous position while moving continuously
        this.history.record(event.newBufferPosition, isMoving);
        this.momentum.push();
    }

    onSizeChange() {
        const size = atom.config.get("cursor-position-history.maxHistorySize");
        this.history.size = size;
    }

    moveToPastPosition() {
        // stop moving to ensure that the last position will not be replaced
        this.momentum.stop();

        // rewind history
        const position = this.history.rewind();
        if (!position) {
            return;
        }

        // move to the past position
        this.activating = true;
        this.editor.setCursorBufferPosition(position);
        this.activating = false;
    }

    moveToFuturePosition() {
        // stop moving to ensure that the last position will not be replaced
        this.momentum.stop();

        // forward history
        const position = this.history.forward();
        if (!position) {
            return;
        }

        // move to the future position
        this.activating = true;
        this.editor.setCursorBufferPosition(position);
        this.activating = false;
    }

    recordCurrentPosition() {
        const position = this.editor.getCursorBufferPosition();
        this.history.record(position);

        // stop moving to ensure that this position will not be replaced
        this.momentum.stop();
    }

    clearHistory() {
        this.history.clear();
        this.momentum.stop();
    }

    dispose() {
        this.clearHistory();
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

    subscriptions: null,
    travelers: {},

    activate() {
        this.subscriptions = new CompositeDisposable();

        // initialize cursor traveler for every existing text editor, as well as for any future one
        this.subscriptions.add(atom.workspace.observeTextEditors(editor => this.initializeCursorTraveler(editor)));

        // bind events to callbacks
        this.subscriptions.add(atom.commands.add('atom-workspace', {
            'cursor-position-history:previous': () => this.previous(),
            'cursor-position-history:next': () => this.next(),
            'cursor-position-history:push': () => this.push(),
            'cursor-position-history:clear': () => this.clear(),
        }));
    },

    deactivate() {
        this.subscriptions.dispose();
        this.travelers = {};
    },

    initializeCursorTraveler(editor) {
        const editor_subscriptions = new CompositeDisposable();

        // add cursor traveler for this editor
        const traveler = new CursorTraveler(editor);
        this.travelers[editor.id] = traveler;
        editor_subscriptions.add(traveler);

        // observe the cursor movement
        editor_subscriptions.add(editor.onDidChangeCursorPosition(event => traveler.onCursorMove(event)));

        // observe the config changes
        editor_subscriptions.add(atom.config.onDidChange("cursor-position-history.maxHistorySize", () => traveler.onSizeChange()));

        // clean traveler when tab is removed
        editor_subscriptions.add(editor.onDidDestroy(() => {
            delete this.travelers[editor.id];
            editor_subscriptions.dispose();
            this.subscriptions.remove(editor_subscriptions);
        }));

        this.subscriptions.add(editor_subscriptions);
    },

    getActiveCursorTraveler() {
        const editor = atom.workspace.getActiveTextEditor();
        if (!editor) {
            return null;
        }
        return this.travelers[editor.id];
    },

    previous() {
        const traveler = this.getActiveCursorTraveler();
        if (!traveler) {
            return;
        }
        traveler.moveToPastPosition();
    },

    next() {
        const traveler = this.getActiveCursorTraveler();
        if (!traveler) {
            return;
        }
        traveler.moveToFuturePosition();
    },

    push() {
        const traveler = this.getActiveCursorTraveler();
        if (!traveler) {
            return;
        }
        traveler.recordCurrentPosition();
    },

    clear() {
        const traveler = this.getActiveCursorTraveler();
        if (!traveler) {
            return;
        }
        traveler.clearHistory();
    },
};
