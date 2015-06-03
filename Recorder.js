var Recorder = (function () {
	var getSeleniumKey = (function () {
		var KEY_MAP = {
			// Backspace
			'U+0008': '\ue003',
			// Tab
			'U+0009': '\ue004',
			// Space
			'U+0020': ' ',
			// Escape
			'U+001B': '\ue00c',
			// Delete
			'U+007F': '\ue017',
			'Cancel': '\uE001',
			'Help': '\uE002',
			'Backspace': '\uE003',
			'Tab': '\uE004',
			'Clear': '\uE005',
			'Return': '\uE006',
			'Enter': '\uE007',
			'Shift': '\uE008',
			'Control': '\uE009',
			'Alt': '\uE00A',
			'Pause': '\uE00B',
			'Escape': '\uE00C',
			'Space': ' ',
			'PageUp': '\uE00E',
			'PageDown': '\uE00F',
			'End': '\uE010',
			'Home': '\uE011',
			'ArrowLeft': '\uE012',
			'ArrowUp': '\uE013',
			'ArrowRight': '\uE014',
			'ArrowDown': '\uE015',
			'Insert': '\uE016',
			'Delete': '\uE017',
			'F1': '\uE031',
			'F2': '\uE032',
			'F3': '\uE033',
			'F4': '\uE034',
			'F5': '\uE035',
			'F6': '\uE036',
			'F7': '\uE037',
			'F8': '\uE038',
			'F9': '\uE039',
			'F10': '\uE03A',
			'F11': '\uE03B',
			'F12': '\uE03C',
			'Meta': '\uE03D',
			'Command': '\uE03D',
			'ZenkakuHankaku': '\uE040'
		};

		var NUMPAD_KEY_MAP = {
			// ;
			'U+003B': '\uE018',
			// =
			'U+003D': '\uE019',
			// 0
			'U+0030': '\uE01A',
			// 1
			'U+0031': '\uE01B',
			// 2
			'U+0032': '\uE01C',
			// 3
			'U+0033': '\uE01D',
			// 4
			'U+0034': '\uE01E',
			// 5
			'U+0035': '\uE01F',
			// 6
			'U+0036': '\uE020',
			// 7
			'U+0037': '\uE021',
			// 8
			'U+0038': '\uE022',
			// 9
			'U+0039': '\uE023',
			// *
			'U+002A': '\uE024',
			// +
			'U+002B': '\uE025',
			// ,
			'U+002C': '\uE026',
			// -
			'U+002D': '\uE027',
			// .
			'U+002E': '\uE028',
			// /
			'U+002F': '\uE029'
		};

		return function (keyIdentifier, keyLocation) {
			if (keyLocation === /* numpad */ 3 && NUMPAD_KEY_MAP[keyIdentifier]) {
				return NUMPAD_KEY_MAP[keyIdentifier];
			}

			if (KEY_MAP[keyIdentifier]) {
				return KEY_MAP[keyIdentifier];
			}

			var char = keyIdentifier.slice(0, 2) === 'U+' ?
				String.fromCharCode(Number('0x' + keyIdentifier.slice(2))) :
				null;

			if (char) {
				return char;
			}

			throw new Error('Cannot identify key "' + keyIdentifier + '"');
		};
	})();

	var isModifierKey = (function () {
		var MODIFIERS = {
			Shift: true,
			Control: true,
			Alt: true,
			Meta: true
		};

		return function (keyIdentifier) {
			return Boolean(MODIFIERS[keyIdentifier]);
		};
	})();

	function Recorder(chrome, storage) {
		if (storage == null) {
			storage = localStorage;
		}

		this.chrome = chrome;
		this.storage = storage;
		this.hotkeys = JSON.parse(storage.getItem('intern.hotkeys')) || this._getDefaultHotkeys();

		this._initializeScript();
		this._initializePort();
	}

	Recorder.prototype = {
		constructor: Recorder,

		hotkeys: null,

		_lastMouseMove: null,

		_port: null,

		recording: false,

		_script: null,

		storage: null,

		tabId: null,

		clear: function () {
			console.log('TODO: clear');
		},

		_getDefaultHotkeys: function () {
			return {
				'insertCallback': { ctrlKey: true, shiftKey: true, keyIdentifier: /* c */ 'U+0063' },
				'insertMouseMove': { ctrlKey: true, shiftKey: true, keyIdentifier: /* m */ 'U+004D' },
				'toggleState': { ctrlKey: true, shiftKey: true, keyIdentifier: /* p */ 'U+0070' }
			};
		},

		_getDefaultPort: function () {
			return {
				send: function () {}
			};
		},

		_initializePort: function () {
			var self = this;
			// two ports are received, one from the event proxy (injected page script) and one from the recorder proxy
			// (devtools panel script)
			this.chrome.runtime.onConnect.addListener(function (port) {
				function receiveMessage(message) {
					if (!self[message.method]) {
						throw new Error('Method "' + message.method + '" does not exist on Recorder');
					}

					self[message.method].apply(self, message.args || []);
				}

				port.onMessage.addListener(receiveMessage);
				port.onDisconnect.addListener(function disconnect() {
					port.onMessage.removeListener(receiveMessage);
					port.onDisconnect.removeListener(disconnect);

					if (port.name === 'recorderProxy') {
						self._port = self._getDefaultPort();
					}
				});

				if (port.name === 'recorderProxy') {
					self._port = {
						send: function (method, args) {
							return port.postMessage({ method: method, args: args });
						}
					};

					for (var hotkeyId in self.hotkeys) {
						self._port.send('setHotkey', [ hotkeyId, self.hotkeys[hotkeyId] ]);
					}

					self._port.send('setScript', self._script);
				}
			});

			this._port = this._getDefaultPort();
		},

		_initializeScript: function () {
			this._script = '';
		},

		insertCallback: function () {
			console.log('TODO: insertCallback');
		},

		insertMouseMove: function () {
			console.log('TODO: insertMouseMove');
		},

		newTest: function () {
			console.log('TODO: newTest');
		},

		recordEvent: function (event) {
			switch (event.type) {
				case 'click':
					// mousedown (2, leaving find and move), mouseup (4)
					this._eraseLast(6);
					this._record('click');
					this._record('end');
					break;
				case 'dblclick':
					// mousedown (2, leaving find and move), mouseup (4), click (2), mousedown (4), mouseup (4)
					this._eraseLast(16);
					this._record('doubleClick');
					this._record('end');
					break;
				case 'keydown':
					this._record('pressKeys', [ getSeleniumKey(event.keyIdentifier, event.location) ]);
					break;
				case 'keyup':
					if (isModifierKey(event.keyIdentifier)) {
						this._record('pressKeys', [ getSeleniumKey(event.keyIdentifier, event.location) ]);
					}
					break;
				case 'mousedown':
					this._record('findByXpath', [ event.target ]);
					this._record('moveMouseTo', [ event.elementX, event.elementY ]);
					this._record('pressMouseButton', [ event.button ]);
					this._record('end');
					break;
				case 'mousemove':
					this._lastMouseMove = event;
					break;
				case 'mouseup':
					this._record('findByXpath', [ event.target ]);
					this._record('moveMouseTo', [ event.elementX, event.elementY ]);
					this._record('releaseMouseButton', [ event.button ]);
					this._record('end');
					break;
			}
		},

		_record: function (method, args) {
			console.log('recording', method, args);
		},

		_eraseLast: function (numCommands) {
			console.log('erasing', numCommands);
		},

		save: function () {
			var file = new Blob([ this._script ], { type: 'application/ecmascript' });
			var url = URL.createObjectURL(file);

			this.chrome.downloads.download({
				filename: url.slice(url.lastIndexOf('/') + 1) + '.js',
				url: url,
				saveAs: true
			}, function () {
				URL.revokeObjectURL(url);
			});
		},

		setHotkey: function (hotkeyId, hotkey) {
			this.hotkeys[hotkeyId] = hotkey;
			this._port.send('setHotkey', [ hotkeyId, hotkey ]);
			this.storage.setItem('intern.hotkeys', JSON.stringify(this.hotkeys));
		},

		setScript: function (value) {
			this._script = value;
			this._port.send('setScript', [ value ]);
		},

		setTabId: function (tabId) {
			this.tabId = tabId;
		},

		toggleState: function () {
			if (!this.tabId) {
				throw new Error('Cannot update state due to missing tabId');
			}

			if (!this.recording) {
				this.chrome.tabs.executeScript(this.tabId, { file: 'eventProxy.js' });
			}

			this.recording = !this.recording;
			this._port.send('setRecording', [ this.recording ]);
		}
	};

	return Recorder;
})();
