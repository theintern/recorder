var RecorderProxy = (function () {
	function getHotkey(event) {
		var hotkey = {};

		[ 'altKey', 'ctrlKey', 'keyIdentifier', 'metaKey', 'shiftKey' ].forEach(function (key) {
			hotkey[key] = event[key];
		});

		return hotkey;
	}

	var getHotkeyLabel = (function () {
		var META_MAP;
		if (navigator.platform === 'MacIntel') {
			META_MAP = {
				'Alt': '⌥',
				'Control': '^',
				'Meta': '⌘',
				'Shift': '⇧'
			};
		}
		else {
			META_MAP = {
				'Alt': 'Alt+',
				'Control': 'Ctrl+',
				'Meta': 'Win+',
				'Shift': 'Shift+'
			};
		}

		var CHAR_MAP;
		if (navigator.platform === 'MacIntel') {
			CHAR_MAP = {
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
		}
		else {
			CHAR_MAP = {
				'U+0008': 'Backspace',
				'U+0009': 'Tab',
				'U+0020': 'Space',
				'U+001B': 'Esc',
				'U+007F': 'Del'
			};
		}

		return function (hotkey) {
			function append(key) {
				key = META_MAP[key] || key;
				label += key;
			}

			var label = '';
			var key = hotkey.keyIdentifier;
			var char = key.slice(0, 2) === 'U+' ? String.fromCharCode(Number('0x' + key.slice(2))).toUpperCase() : null;
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

			if (key in CHAR_MAP) {
				append(CHAR_MAP[key]);
			}
			else if (char) {
				append(char);
			}
			else if (!(key in META_MAP)) {
				append(key);
			}

			return label;
		};
	})();

	function RecorderProxy(chrome, contentWindow) {
		this.chrome = chrome;
		this.contentWindow = contentWindow;

		this._initializeScript();
		this._initializePort();
		this._initializeHotkeys();
	}

	RecorderProxy.prototype = {
		constructor: RecorderProxy,

		chrome: null,

		contentWindow: null,

		_port: null,

		recording: false,

		_script: null,

		_initializeHotkeys: function () {
			var document = this.contentWindow.document;
			var self = this;

			[ 'insertCallback', 'insertMouseMove', 'toggleState' ].forEach(function (id) {
				var input = document.getElementById('hotkey-' + id);

				if (!input) {
					throw new Error('Panel is missing input for hotkey "' + id + '"');
				}

				input.onkeydown = function (event) {
					event.preventDefault();
					self.send('setHotkey', [ id, getHotkey(event) ]);
				};
			});
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

			if (!script) {
				throw new Error('Panel is missing output for script');
			}

			this._script = script;

			script.oninput = function () {
				self.send('setScript', [ this.value ]);
			};
		},

		send: function (method, args) {
			return this._port.postMessage({ method: method, args: args });
		},

		setHotkey: function (id, hotkey) {
			var input = this.contentWindow.document.getElementById('hotkey-' + id);

			if (!input) {
				throw new Error('Panel is missing input for hotkey "' + id + '"');
			}

			input.value = getHotkeyLabel(hotkey);
		},

		setScript: function (value) {
			if (value != null) {
				this._script.value = value;
			}
		},

		setRecording: function (value) {
			this.recording = value;
		}
	};

	return RecorderProxy;
})();
