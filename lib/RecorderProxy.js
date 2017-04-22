(typeof define === 'function' && define.amd ? define : /* istanbul ignore next */ function (factory) {
	this.RecorderProxy = factory();
})(function () {
	function getHotkey(event) {
		var hotkey = {};

		[ 'altKey', 'ctrlKey', 'key', 'metaKey', 'shiftKey' ].forEach(function (key) {
			hotkey[key] = event[key];
		});

		return hotkey;
	}

	function RecorderProxy(chrome, panel) {
		this.chrome = chrome;
		this.panel = panel;

		this._initializeUi();
		this._initializePort();
	}

	RecorderProxy.prototype = {
		constructor: RecorderProxy,

		chrome: null,

		contentWindow: null,

		panel: null,

		_port: null,

		recording: false,

		_recordButton: null,

		_script: null,

		_toggleOnShow: null,

		_getHotkeyLabel: function (hotkey) {
			var charMap;
			var metaMap;
			var getKey;

			function getChar(key) {
				return key.slice(0, 2) === 'U+' ?
					String.fromCharCode(Number('0x' + key.slice(2))).toUpperCase() :
					null;
			}

			if (this.contentWindow.navigator.platform === 'MacIntel') {
				metaMap = {
					'Alt': '⌥',
					'Control': '^',
					'Meta': '⌘',
					'Shift': '⇧'
				};
				charMap = {
					'U+0008': 'Backspace',
					'U+0009': '↹',
					'U+0020': 'Space',
					'U+001B': '⎋',
					'U+007F': 'Delete',
					'Down': '↓',
					'Left': '←',
					'Right': '→',
					'Up': '↑'
				};
				getKey = function (hotkey) {
					return hotkey.key;
				};
			}
			else {
				metaMap = {
					'Alt': 'Alt+',
					'Control': 'Ctrl+',
					'Meta': 'Win+',
					'Shift': 'Shift+'
				};
				charMap = {
					'U+0008': 'Backspace',
					'U+0009': 'Tab',
					'U+0020': 'Space',
					'U+001B': 'Esc',
					'U+007F': 'Del'
				};
				// Chrome on Windows has character layout bugs, see
				// https://code.google.com/p/chromium/issues/detail?id=48111
				// To resolve this for now we just add more maps for the incorrect values on standard US keyboard
				getKey = (function () {
					var badKeys = {
						'U+00BA': ';:',
						'U+00BB': '=+',
						'U+00BC': ',<',
						'U+00BD': '-_',
						'U+00BE': '.>',
						'U+00BF': '/?',
						'U+00DB': '[{',
						'U+00DC': '\\|',
						'U+00DD': ']}',
						'U+00C0': '`~',
						'U+00DE': '\'"'
					};

					return function (hotkey) {
						var fixedValues = badKeys[hotkey.key];
						if (fixedValues) {
							return 'U+00' + fixedValues.charCodeAt(hotkey.shiftKey ? 1 : 0).toString(16).toUpperCase();
						}
						return hotkey.key;
					};
				})();
			}

			function getHotkeyLabel(hotkey) {
				function append(key) {
					key = metaMap[key] || key;
					label += key;
				}

				var label = '';
				var key = getKey(hotkey);
				var char = getChar(key);
				var isLetter = Boolean(char) && char !== char.toLowerCase();

				if (hotkey.ctrlKey) {
					append('Control');
				}

				if (hotkey.altKey) {
					append('Alt');
				}

				// shifted non-letter keys are identified by their shifted value already, so don’t display the shift
				// modifier if the key is a shifted non-letter (e.g. 1 -> !, 2 -> @)
				if (hotkey.shiftKey && (!char || char === ' ' || isLetter)) {
					append('Shift');
				}

				if (hotkey.metaKey) {
					append('Meta');
				}

				if (key in charMap) {
					append(charMap[key]);
				}
				else if (char) {
					append(char);
				}
				else if (!(key in metaMap)) {
					append(key);
				}

				return label;
			}

			this._getHotkeyLabel = getHotkeyLabel;
			return getHotkeyLabel(hotkey);
		},

		_hide: function () {
			// To avoid recording spurious interaction when a user has switched to another dev tools panel, pause
			// recording automatically when this panel is hidden and resume it when a user switches back
			if (this.recording) {
				this._toggleOnShow = true;
				this.send('toggleState');
			}
			else {
				this._toggleOnShow = false;
			}
		},

		_initializeHotkeys: function () {
			var document = this.contentWindow.document;
			var self = this;

			[ 'insertCallback', 'insertMouseMove', 'toggleState' ].forEach(function (id) {
				var input = document.getElementById('hotkey-' + id);

				/* istanbul ignore if: the recorder is broken if this ever happens */
				if (!input) {
					throw new Error('Panel is missing input for hotkey "' + id + '"');
				}

				input.onkeydown = function (event) {
					event.preventDefault();
					self.send('setHotkey', [ id, getHotkey(event) ]);
				};
			});
		},

		_initializeOptions: function () {
			var document = this.contentWindow.document;
			var self = this;

			var input = document.getElementById('option-strategy');

			/* istanbul ignore if: the recorder is broken if this ever happens */
			if (!input) {
				throw new Error('Panel is missing input for option "strategy"');
			}

			input.onchange = function (event) {
				self.send('setStrategy', [ event.target.value ]);
			};

			input = document.getElementById('option-findDisplayed');

			/* istanbul ignore if: the recorder is broken if this ever happens */
			if (!input) {
				throw new Error('Panel is missing input for option "findDisplayed"');
			}

			input.onchange = function (event) {
				self.send('setFindDisplayed', [ event.target.checked ]);
			};
		},

		_initializePort: function () {
			var self = this;

			this._port = this.chrome.runtime.connect(this.chrome.runtime.id, { name: 'recorderProxy' });
			this._port.onMessage.addListener(function (message) {
				if (!self[message.method]) {
					throw new Error('Method "' + message.method + '" does not exist on RecorderProxy');
				}

				self[message.method].apply(self, message.args || []);
			});
			this._port.postMessage({ method: 'setTabId', args: [ this.chrome.devtools.inspectedWindow.tabId ]});
		},

		_initializeScript: function () {
			var self = this;
			var script = this.contentWindow.document.getElementById('script');

			/* istanbul ignore if: the recorder is broken if this ever happens */
			if (!script) {
				throw new Error('Panel is missing output for script');
			}

			this._script = script;

			script.oninput = function () {
				self.send('setScript', [ this.value ]);
			};
		},

		_initializeUi: function () {
			var self = this;
			var panel = this.panel;
			var controls = [
				{ action: 'toggleState', button: [ 'resources/statusBarIcons/record_off.png', 'Record', false ] },
				{ action: 'clear', button: [ 'resources/statusBarIcons/clear.png', 'Clear', false ] },
				{ action: 'newTest', button: [ 'resources/statusBarIcons/newTest.png', 'New test', false ] },
				{ action: 'save', button: [ 'resources/statusBarIcons/save.png', 'Save', false ] }
			];

			controls.forEach(function (control) {
				var button = panel.createStatusBarButton.apply(panel, control.button);
				button.onClicked.addListener(function () {
					self.send(control.action);
				});

				if (control.action === 'toggleState') {
					self._recordButton = button;
				}
			});

			panel.onShown.addListener(this._show.bind(this));
			panel.onHidden.addListener(this._hide.bind(this));
		},

		send: function (method, args) {
			this._port.postMessage({ method: method, args: args });
		},

		setFindDisplayed: function (value) {
			if (this.contentWindow) {
				this.contentWindow.document.getElementById('option-findDisplayed').checked = value;
			}
		},

		setHotkey: function (id, hotkey) {
			if (!this.contentWindow) {
				return;
			}

			var input = this.contentWindow.document.getElementById('hotkey-' + id);

			if (!input) {
				throw new Error('Panel is missing input for hotkey "' + id + '"');
			}

			input.value = this._getHotkeyLabel(hotkey);
		},

		setRecording: function (value) {
			this.recording = value;
			this._recordButton.update('resources/statusBarIcons/record_' + (value ? 'on' : 'off') + '.png');
		},

		setScript: function (value) {
			if (this._script && value != null) {
				this._script.value = value;
			}
		},

		setStrategy: function (value) {
			if (this.contentWindow) {
				this.contentWindow.document.getElementById('option-strategy').value = value;
			}
		},

		_show: function (contentWindow) {
			if (this.contentWindow !== contentWindow) {
				this.contentWindow = contentWindow;
				this._getHotkeyLabel = RecorderProxy.prototype._getHotkeyLabel;
				this._initializeScript();
				this._initializeHotkeys();
				this._initializeOptions();
			}

			if (this._toggleOnShow) {
				this.send('toggleState');
			}

			this.send('refreshUi');
		}
	};

	return RecorderProxy;
});
