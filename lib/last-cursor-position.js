const { CompositeDisposable } = require('atom');

const STATE = {
    REWINDING: -1,
    EDITING: 0,
    FORWARDING: +1,
};

module.exports = {
    disposables: null,
    positionHistory: [],
    positionFuture: [],
    state: STATE.EDITING,
    prevState: STATE.EDITING,

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
            this.positionHistory = this.positionHistory.filter(pos => pos.pane !== event.pane);
            this.positionFuture = this.positionFuture.filter(pos => pos.pane !== event.pane);
        }));

        // clean history when paneItem (tab) is removed
        this.disposables.add(atom.workspace.onDidDestroyPaneItem(event => {
            this.positionHistory = this.positionHistory.filter(pos => pos.editor !== event.item);
            this.positionFuture = this.positionFuture.filter(pos => pos.editor !== event.item);
        }));

        // record starting position
        const activeEd = atom.workspace.getActiveTextEditor();
        const activePane = atom.workspace.getActivePane();
        if ((activePane != null) && (activeEd != null)) {
            const pos = activeEd.getCursorBufferPosition();
            this.positionHistory.push({
                pane: activePane,
                editor: activeEd,
                position: activeEd.markBufferPosition(pos)
            });
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

        if (this.state === STATE.EDITING) {
            if (this.positionHistory.length) {
                const {
                    pane: lastPane,
                    editor: lastEd,
                    position: lastPos
                } = this.positionHistory[this.positionHistory.length-1];
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
            this.positionHistory.push({
                pane: activePane,
                editor: activeEd,
                position: activeEd.markBufferPosition(event.newBufferPosition)
            });

            // future positions get invalidated when cursor moves to a new position
            this.positionFuture = [];
            this.prevState = STATE.EDITING;
        }
        this.state = STATE.EDITING;
    },

    push() {
        const activeEd = atom.workspace.getActiveTextEditor();
        const activePane = atom.workspace.getActivePane();
        this.positionHistory.push({
            pane: activePane,
            editor: activeEd,
            position: activeEd.markBufferPosition(activeEd.getCursorBufferPosition())
        });
    },

    previous() {
        // console.log("Previous called")
        // when changing direction, we need to store last position, but not move to it
        if (this.prevState !== STATE.REWINDING) {
            // console.log("--Changing direction")
            const temp = this.positionHistory.pop();
            if (temp != null) {
                this.positionFuture.push(temp);
            }
        }

        // get last position in the list
        const pos = this.positionHistory.pop();
        if (pos != null) {
            // keep the position for opposite direction
            this.positionFuture.push(pos);
            this.state = STATE.REWINDING;
            this.prevState = STATE.REWINDING;
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
        }
    },

    next() {
        // console.log("Next called")
        // when changing direction, we need to store last position, but not move to it
        if (this.prevState !== STATE.FORWARDING) {
            // console.log("--Changing direction")
            const temp = this.positionFuture.pop();
            if (temp != null) {
                this.positionHistory.push(temp);
            }
        }
        // get last position in the list
        const pos = this.positionFuture.pop();
        if (pos != null) {
            // keep the position for opposite direction
            this.positionHistory.push(pos);
            this.state = STATE.FORWARDING;
            this.prevState = STATE.FORWARDING;
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
        }
    },

    deactivate() {
        this.clear();
        this.disposables.dispose();
    },

    clear() {
        this.positionHistory = [];
        this.positionFuture = [];
    },
};
