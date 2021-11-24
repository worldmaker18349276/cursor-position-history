const { CompositeDisposable } = require('atom');

const STATE = {
    REWINDING: -1,
    EDITING: 0,
    FORWARDING: +1,
};

module.exports = {
    disposables: null,
    history: [],
    index: 0,
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
            this.index = this.history.slice(0, this.index).filter(pos => pos.pane !== event.pane).length;
            this.history = this.history.filter(pos => pos.pane !== event.pane);
        }));

        // clean history when paneItem (tab) is removed
        this.disposables.add(atom.workspace.onDidDestroyPaneItem(event => {
            this.index = this.history.slice(0, this.index).filter(pos => pos.editor !== event.item).length;
            this.history = this.history.filter(pos => pos.editor !== event.item);
        }));

        // record starting position
        const activeEd = atom.workspace.getActiveTextEditor();
        const activePane = atom.workspace.getActivePane();
        if ((activePane != null) && (activeEd != null)) {
            const pos = activeEd.getCursorBufferPosition();
            this.history.push({
                pane: activePane,
                editor: activeEd,
                position: activeEd.markBufferPosition(pos)
            });
            this.index = this.history.length - 1;
        }

        // bind events to callbacks
        this.disposables.add(atom.commands.add('atom-workspace', {
            'last-cursor-position:previous': () => this.previous(),
            'last-cursor-position:next': () => this.next(),
            'last-cursor-position:push': () => this.push(),
            'last-cursor-position:clear': () => this.clear(),
        }));
    },

    onCursorMove(event) {
        // console.log("cursor moved")
        const activeEd = atom.workspace.getActiveTextEditor();
        const activePane = atom.workspace.getActivePane();

        // don't record cursor pos while rewinding/forwarding
        if (this.activating) {
            this.activating = false;
            return;
        }

        if (this.history.length > 0 && this.index > 0) {
            const {
                pane: lastPane,
                editor: lastEd,
                position: lastPos
            } = this.history[this.index];
            if (
                (activePane === lastPane) && (activeEd === lastEd) &&
                // ignore cursor pos changes < 3 lines
                (Math.abs(lastPos.getStartBufferPosition().serialize()[0] - event.newBufferPosition.serialize()[0]) < 3)
            ) {
                return;
            }
        }
        // console.log("ActivePane id " + activePane.id)
        // position is a Marker that reamins logically stationary even as the buffer changes
        this.history.splice(this.index+1);
        this.history.push({
            pane: activePane,
            editor: activeEd,
            position: activeEd.markBufferPosition(event.newBufferPosition)
        });
        this.index = this.history.length - 1;
    },

    push() {
        const activeEd = atom.workspace.getActiveTextEditor();
        const activePane = atom.workspace.getActivePane();
        this.history.splice(this.index+1, 0, {
            pane: activePane,
            editor: activeEd,
            position: activeEd.markBufferPosition(activeEd.getCursorBufferPosition())
        });
        this.index += 1;
    },

    previous() {
        // console.log("Previous called")
        if (this.index == 0) {
            return;
        }

        // get last position in the list
        this.index -= 1;
        const pos = this.history[this.index];
        this.activating = true;
        // move to right editor
        if (pos.pane !== atom.workspace.getActivePane()) {
            // console.log("--Activating pane " + pos.pane.id)
            pos.pane.activate();
        }
        if (pos.editor !== atom.workspace.getActiveTextEditor()) {
            // console.log("--Activating editor " + pos.editor.id)
            const activePane = atom.workspace.getActivePane();
            const editorIdx = activePane.getItems().indexOf(pos.editor);
            activePane.activateItemAtIndex(editorIdx);
        }
        // move cursor to last position and scroll to it
        // console.log("--Moving cursor to new position")
        if (pos.position) {
            atom.workspace.getActiveTextEditor().setCursorBufferPosition(pos.position.getStartBufferPosition(), {autoscroll: false});
            atom.workspace.getActiveTextEditor().scrollToCursorPosition({center: true});
        }
    },

    next() {
        // console.log("Next called")
        if (this.index == this.history.length - 1) {
            return;
        }

        // get last position in the list
        this.index += 1;
        const pos = this.history[this.index];
        this.activating = true;
        // move to right editor
        if (pos.pane !== atom.workspace.getActivePane) {
            // console.log("--Activating pane " + pos.pane.id)
            pos.pane.activate();
        }
        if (pos.editor !== atom.workspace.getActiveTextEditor()) {
            // console.log("--Activating editor " + pos.editor.id)
            const activePane = atom.workspace.getActivePane();
            const editorIdx = activePane.getItems().indexOf(pos.editor);
            activePane.activateItemAtIndex(editorIdx);
        }
        // move cursor to last position and scroll to it
        // console.log("--Moving cursor to new position")
        if (pos.position) {
            atom.workspace.getActiveTextEditor().setCursorBufferPosition(pos.position.getStartBufferPosition(), {autoscroll: false});
            atom.workspace.getActiveTextEditor().scrollToCursorPosition({center: true});
        }
    },

    deactivate() {
        this.clear();
        this.disposables.dispose();
    },

    clear() {
        this.history = [];
        this.index = this.history.length;
    },
};
