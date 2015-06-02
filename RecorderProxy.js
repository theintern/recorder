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

		return function (hotkey) {
			function append(key) {
				key = META_MAP[key] || key;
				label += key;
			}

			var label = '';
			var key = hotkey.keyIdentifier;

			if (hotkey.ctrlKey) {
				append('Control');
			}

			if (hotkey.altKey) {
				append('Alt');
			}

			if (
				hotkey.shiftKey &&
				// shifted keys are identified by their shifted value already, so don’t write the shift modifier if the
				// key is a value key
				(key.slice(0, 2) !== 'U+' || key === 'U+0020')
			) {
				append('Shift');
			}

			if (hotkey.metaKey) {
				append('Meta');
			}

			if (key === 'U+0020') {
				append('Space');
			}
			else if (key.slice(0, 2) === 'U+') {
				append(String.fromCharCode(Number('0x' + key.slice(2))));
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

		this._initializePort();
		this._initializeHotkeys();
		this._initializeScript();
	}

	RecorderProxy.prototype = {
		constructor: RecorderProxy,

		chrome: null,

		contentWindow: null,

		_port: null,

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

			this._port = this.chrome.runtime.connect();
			this._port.onMessage.addListener(function (message, sender, sendResponse) {
				if (!self[message.method]) {
					throw new Error('Method "' + message.method + '" does not exist on RecorderProxy');
				}

				sendResponse(self[message.method].apply(self, message.args));
			});
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
			this._script.value = value;
		}
	};

	return RecorderProxy;
})();
