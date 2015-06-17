(typeof define === 'function' && define.amd ? define : /* istanbul ignore next */ function (factory) {
	this.Recorder = factory();
})(function () {
	var FUNCTION_OBJECT = {
		toString: function () {
			return 'function () {}';
		}
	};

	function createCommandText(method, args, indent) {
		var text = '\n\t\t\t\t' + extraIndent(indent) + '.' + method + '(';

		if (args && args.length) {
			args.forEach(function (arg, index) {
				if (index > 0) {
					text += ', ';
				}

				if (typeof arg === 'string') {
					text += '\'' + arg.replace(/'/g, '\\\'') + '\'';
				}
				else {
					text += String(arg);
				}
			});
		}

		text += ')';
		return text;
	}

	function extraIndent(num) {
		var indent = '';
		while (num-- > 0) {
			indent += '\t';
		}
		return indent;
	}

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

		// Chrome on Windows has character layout bugs, see
		// https://code.google.com/p/chromium/issues/detail?id=48111
		// To resolve this for now there are some extra key maps below in the range of U+0041 to U+0090 that only
		// apply to Windows users
		var NUMPAD_KEY_MAP = {
			// ;
			'U+003B': '\uE018',
			// =
			'U+003D': '\uE019',
			// 0
			'U+0030': '\uE01A',
			'U+0060': '\uE01A',
			// 1
			'U+0031': '\uE01B',
			'U+0041': '\uE01B',
			// 2
			'U+0032': '\uE01C',
			'U+0042': '\uE01C',
			// 3
			'U+0033': '\uE01D',
			'U+0043': '\uE01D',
			// 4
			'U+0034': '\uE01E',
			'U+0044': '\uE01E',
			// 5
			'U+0035': '\uE01F',
			'U+0045': '\uE01F',
			// 6
			'U+0036': '\uE020',
			'U+0046': '\uE020',
			// 7
			'U+0037': '\uE021',
			'U+0047': '\uE021',
			// 8
			'U+0038': '\uE022',
			'U+0048': '\uE022',
			// 9
			'U+0039': '\uE023',
			'U+0049': '\uE023',
			// *
			'U+002A': '\uE024',
			'U+004A': '\uE024',
			// +
			'U+002B': '\uE025',
			'U+004B': '\uE025',
			// ,
			'U+002C': '\uE026',
			'U+004C': '\uE026',
			// -
			'U+002D': '\uE027',
			'U+004D': '\uE027',
			// .
			'U+002E': '\uE028',
			'U+004E': '\uE028',
			// /
			'U+002F': '\uE029',
			'U+004F': '\uE029'
		};

		return function (keyIdentifier, keyLocation, isUpperCase) {
			if (keyLocation === /* numpad */ 3 && NUMPAD_KEY_MAP[keyIdentifier]) {
				return NUMPAD_KEY_MAP[keyIdentifier];
			}

			if (KEY_MAP[keyIdentifier]) {
				return KEY_MAP[keyIdentifier];
			}

			/* istanbul ignore else: should be impossible */
			if (keyIdentifier.slice(0, 2) === 'U+') {
				var char = String.fromCharCode(Number('0x' + keyIdentifier.slice(2)));
				return isUpperCase ? char.toUpperCase() : char.toLowerCase();
			}
			else {
				throw new Error('Cannot identify key "' + keyIdentifier + '"');
			}
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

	var TEMPLATES = {
		suiteOpen: [
			'define(function (require) {',
			'	var tdd = require(\'intern!tdd\');',
			'	tdd.suite(\'recorder-generated suite\', function () {',
			''
		].join('\n'),
		suiteClose: [
			'	});',
			'});',
			''
		].join('\n'),
		testOpen: [
			'		tdd.test(\'$NAME\', function () {',
			'			return this.remote'
		].join('\n'),
		testClose: [
			';',
			'		});',
			''
		].join('\n')
	};

	function Recorder(chrome, storage) {
		if (chrome == null) {
			throw new Error('Chrome API must be provided to recorder');
		}

		if (storage == null) {
			throw new Error('Storage API must be provided to recorder');
		}

		this.chrome = chrome;
		this.storage = storage;
		this.hotkeys = JSON.parse(storage.getItem('intern.hotkeys')) || this._getDefaultHotkeys();

		this._initializeScript();
		this._initializePort();
		this._initializeNavigation();
		this.clear();
	}

	Recorder.prototype = {
		constructor: Recorder,

		_currentModifiers: null,
		_currentTest: null,

		hotkeys: null,

		_ignoreKeyups: null,

		_lastMouseMove: null,
		_lastTarget: null,
		_lastTargetFrame: null,
		_lastTestId: 0,

		_port: null,

		recording: false,

		_script: null,
		_scriptTree: null,

		storage: null,

		tabId: null,

		clear: function () {
			this._currentModifiers = {};
			this._currentTest = null;
			this._lastMouseMove = null;
			this._lastTarget = null;
			this._lastTargetFrame = [];
			this._lastTestId = 0;
			this._ignoreKeyups = {};
			this._script = '';
			this._scriptTree = [];

			if (this.tabId) {
				this.newTest();
			}
		},

		_eraseKeys: function (numKeys) {
			var lastCommand = this._currentTest.commands[this._currentTest.commands.length - 1];

			if (numKeys === lastCommand.args[0].length) {
				this._eraseLast(1);
				return;
			}

			lastCommand.args[0] = lastCommand.args[0].slice(0, -numKeys);
			lastCommand.text = createCommandText(lastCommand.method, lastCommand.args);
			lastCommand.end = lastCommand.start + lastCommand.text.length;
			this._renderScriptTree();
		},

		_eraseLast: function (numCommands) {
			var commands = this._currentTest.commands;
			commands.splice(commands.length - numCommands, numCommands);
			this._renderScriptTree();
		},

		_getDefaultHotkeys: function () {
			return {
				'insertCallback': { altKey: true, shiftKey: true, keyIdentifier: /* c */ 'U+0043' },
				'insertMouseMove': { altKey: true, shiftKey: true, keyIdentifier: /* m */ 'U+004D' },
				'toggleState': { altKey: true, shiftKey: true, keyIdentifier: /* p */ 'U+0050' }
			};
		},

		_getDefaultPort: function () {
			return {
				send: function () {}
			};
		},

		_handleHotkeyEvent: function (event) {
			if (event.type !== 'keydown') {
				return;
			}

			var ignoreKeyupMap = this._ignoreKeyups;
			function ignore(keyIdentifier) {
				ignoreKeyupMap[keyIdentifier] = true;
			}

			nextKey:
			for (var hotkeyId in this.hotkeys) {
				var hotkey = this.hotkeys[hotkeyId];

				// All hotkey modifiers must be checked even if they are not in the incoming data to avoid false
				// activation, e.g. Ctrl+Home should not activate a hotkey Home
				for (var key in { altKey: true, ctrlKey: true, metaKey: true, shiftKey: true }) {
					if (Boolean(event[key]) !== Boolean(hotkey[key])) {
						continue nextKey;
					}
				}

				if (event.keyIdentifier !== hotkey.keyIdentifier) {
					continue nextKey;
				}

				if (!this.recording && hotkeyId !== 'toggleState') {
					return;
				}

				ignore(hotkey.keyIdentifier);

				var numKeysToErase = 0;

				[
					[ 'altKey', 'Alt' ],
					[ 'ctrlKey', 'Control' ],
					[ 'metaKey', 'Meta' ],
					[ 'shiftKey', 'Shift' ]
				].forEach(function (key) {
					if (hotkey[key[0]] && this._currentModifiers[key[1]]) {
						ignore(key[1]);
						delete this._currentModifiers[key[1]];
						++numKeysToErase;
					}
				}, this);

				this._eraseKeys(numKeysToErase);

				var method = hotkeyId;
				this[method]();

				return true;
			}

			return false;
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

					self.refreshUi();
				}
			});

			this._port = this._getDefaultPort();
		},

		_initializeNavigation: function () {
			var self = this;

			function handleNavigation(detail) {
				// frameId !== 0 is a subframe; we could try navigating these if we could figure out what the entry
				// for the subframe was for a `switchToFrame` call
				if (!self.recording || detail.tabId !== self.tabId || detail.frameId !== 0) {
					return;
				}

				if (detail.transitionType === 'reload') {
					self._recordTarget(null);
					self._record('refresh');
				}
				else if (detail.transitionQualifiers.indexOf('forward_back') !== -1) {
					// Chrome does not specify whether it was forward button or back button so for now we simply
					// re-enter the url; this will not correctly test bfcache but will at least ensure we end up back
					// on the correct page. We could try to guess which way it went by recording tab history but this
					// would only work if the two surrounding pages are not the same
					self._recordTarget(null);
					self._record('get', [ detail.url ]);
				}
				else if(detail.transitionQualifiers.indexOf('from_address_bar') !== -1) {
					self._recordTarget(null);
					self._record('get', [ detail.url ]);
				}

				self._injectContentScript();
				self._renderScriptTree();
			}

			this.chrome.webNavigation.onCommitted.addListener(handleNavigation);
			this.chrome.webNavigation.onReferenceFragmentUpdated.addListener(handleNavigation);
			this.chrome.webNavigation.onHistoryStateUpdated.addListener(handleNavigation);
		},

		_initializeScript: function () {
			this._script = '';
			this._scriptTree = [];
		},

		_injectContentScript: function () {
			this.chrome.tabs.executeScript(this.tabId, { file: 'lib/eventProxy.js', allFrames: true });
		},

		insertCallback: function () {
			if (!this.recording) {
				return;
			}

			this._record('then', [ FUNCTION_OBJECT ]);
			this._renderScriptTree();
		},

		insertMouseMove: function () {
			if (!this.recording || !this._lastMouseMove) {
				return;
			}

			var event = this._lastMouseMove;

			this._recordTarget(event);
			this._record('moveMouseTo', [ event.elementX, event.elementY ], 1);
			this._renderScriptTree();
		},

		newTest: function () {
			if (!this.tabId) {
				throw new Error('Cannot add new test due to missing tabId');
			}

			if (this._currentTest) {
				if (this._lastTarget) {
					this._record('end', null, 1);
				}
				if (this._lastTargetFrame.length) {
					this._record('switchToFrame', [ null ]);
				}
				this._lastTarget = null;
				this._lastTargetFrame = [];
			}

			var test = {
				name: 'Test ' + (++this._lastTestId),
				commands: [],
				start: 0,
				end: 0
			};

			this._currentTest = test;
			this._scriptTree.push(test);

			var self = this;
			this.chrome.tabs.get(this.tabId, function (tab) {
				self._record('get', [ tab.url ]);
				self._renderScriptTree();
			});
		},

		recordEvent: function (event) {
			if (this._handleHotkeyEvent(event)) {
				return;
			}

			if (!this.recording) {
				return;
			}

			switch (event.type) {
				case 'click':
					// mousedown (2), mouseup (2)
					this._eraseLast(4);
					// moveMouseTo is recorded on click and dblclick instead of using the already-recorded moveMouseTo
					// from the previous mousedown/mouseup because there may be a slight difference in position due to
					// hysteresis
					this._record('moveMouseTo', [ event.elementX, event.elementY ], 1);
					this._record('clickMouseButton', [ event.button ], 1);
					break;
				case 'dblclick':
					// click (2), click (2)
					this._eraseLast(4);
					this._record('moveMouseTo', [ event.elementX, event.elementY ], 1);
					this._record('doubleClick', null, 1);
					break;
				case 'keydown':
					if (isModifierKey(event.keyIdentifier)) {
						this._currentModifiers[event.keyIdentifier] = true;
					}

					this._recordKey(event);
					break;
				case 'keyup':
					if (this._ignoreKeyups[event.keyIdentifier]) {
						delete this._ignoreKeyups[event.keyIdentifier];
						delete this._currentModifiers[event.keyIdentifier];
						return;
					}

					if (isModifierKey(event.keyIdentifier)) {
						delete this._currentModifiers[event.keyIdentifier];
						this._recordKey(event);
					}
					break;
				case 'mousedown':
					this._recordTarget(event);
					this._record('moveMouseTo', [ event.elementX, event.elementY ], 1);
					this._record('pressMouseButton', [ event.button ], 1);
					break;
				case 'mousemove':
					this._lastMouseMove = event;
					break;
				case 'mouseup':
					this._recordTarget(event);
					this._record('moveMouseTo', [ event.elementX, event.elementY ], 1);
					this._record('releaseMouseButton', [ event.button ], 1);
					break;
			}

			this._renderScriptTree();
		},

		_record: function (method, args, indent) {
			var commands = this._currentTest.commands;

			var text = createCommandText(method, args, indent);
			var start = commands.length ? commands[commands.length - 1].end : this._currentTest.start;

			commands.push({
				text: text,
				method: method,
				args: args,
				start: start,
				end: start + text.length
			});

			this._renderScriptTree();
		},

		_recordKey: function (event) {
			function suppressesShift(key) {
				var code = key.charCodeAt(0);
				if (code >= 0xE000 && code <= 0xF8FF) {
					return false;
				}

				return key.toUpperCase() === key;
			}

			var key = getSeleniumKey(event.keyIdentifier, event.location, event.shiftKey);

			var commands = this._currentTest.commands;
			var lastCommand = commands[commands.length - 1];

			if (lastCommand && lastCommand.method === 'pressKeys') {
				var shiftKey = getSeleniumKey('Shift', 0, true);
				var args = lastCommand.args;
				var lastKey = args[0].charAt(args[0].length - 1);

				// if the previous character was a Shift to start typing this uppercase letter, remove the Shift
				// from the output since it is encoded in our use of an uppercase letter
				if (suppressesShift(key) && lastKey === shiftKey) {
					args[0] = args[0].slice(0, -1);
				}
				// if the previous character was an uppercase letter and this key is a Shift release, do not add
				// the Shift release; it will be encoded in the next letter
				else if (event.type === 'keyup' && key === shiftKey && suppressesShift(lastKey)) {
					return;
				}

				args[0] += key;

				lastCommand.text = createCommandText(lastCommand.method, args);
				lastCommand.end = lastCommand.start + lastCommand.text.length;
			}
			else {
				this._record('pressKeys', [ key ]);
			}
		},

		_recordTarget: function (event) {
			function checkTargetFrameChanged() {
				if (event.targetFrame.length !== lastTargetFrame.length) {
					return true;
				}

				for (var i = 0, j = lastTargetFrame.length; i < j; ++i) {
					if (event.targetFrame[i] !== lastTargetFrame[i]) {
						return true;
					}
				}

				return false;
			}

			if (event == null) {
				event = { target: null, targetFrame: [] };
			}

			var lastTargetFrame = this._lastTargetFrame;
			var targetFrameChanged = checkTargetFrameChanged();
			var targetChanged = event.target !== this._lastTarget;

			if (targetFrameChanged || targetChanged) {
				if (this._lastTarget) {
					this._record('end', null, 1);
				}

				if (targetFrameChanged) {
					if (lastTargetFrame.length) {
						this._record('switchToFrame', [ null ]);
					}
					event.targetFrame.forEach(function (frameId) {
						this._record('switchToFrame', [ frameId ]);
					}, this);
					this._lastTargetFrame = event.targetFrame;
				}

				if (event.target) {
					this._record('findByXpath', [ event.target ]);
				}

				this._lastTarget = event.target;
			}
		},

		refreshUi: function () {
			this._port.send('setScript', [ this._script ]);
			this._port.send('setRecording', [ this.recording ]);

			for (var hotkeyId in this.hotkeys) {
				this._port.send('setHotkey', [ hotkeyId, this.hotkeys[hotkeyId] ]);
			}
		},

		_renderScriptTree: function () {
			var script = TEMPLATES.suiteOpen;

			this._scriptTree.forEach(function (test) {
				script += TEMPLATES.testOpen.replace('$NAME', test.name);
				test.commands.forEach(function (command) {
					script += command.text;
				});
				script += TEMPLATES.testClose;
			});

			script += TEMPLATES.suiteClose;
			this.setScript(script);
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
				this._injectContentScript();
			}

			if (!this._currentTest) {
				this.newTest();
			}

			this.recording = !this.recording;
			this._port.send('setRecording', [ this.recording ]);
		}
	};

	return Recorder;
});
