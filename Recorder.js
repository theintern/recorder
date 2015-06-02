var Recorder = (function () {
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
		STATE_PAUSED: 'paused',
		STATE_RECORDING: 'recording',

		constructor: Recorder,

		hotkeys: null,

		_port: null,

		_script: null,

		state: 'paused',

		storage: null,

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
			this.chrome.runtime.onConnect.addListener(function (port) {
				function receiveMessage(message, sender, sendResponse) {
					if (!self[message.method]) {
						throw new Error('Method "' + '" does not exist on Recorder');
					}

					sendResponse(self[message.method].apply(self, message.args));
				}

				port.onMessage.addListener(receiveMessage);
				port.onDisconnect.addListener(function disconnect() {
					port.onMessage.removeListener(receiveMessage);
					port.onDisconnect.removeListener(disconnect);
					self._port = self._getDefaultPort();
				});

				self._port = {
					send: function (method, args) {
						return port.postMessage({ method: method, args: args });
					}
				};

				for (var hotkeyId in self.hotkeys) {
					self._port.send('setHotkey', [ hotkeyId, self.hotkeys[hotkeyId] ]);
				}

				self._port.send('setScript', self._script);
			});

			this._port = this._getDefaultPort();
		},

		_initializeScript: function () {
			this._script = '';
		},

		insertCallback: function () {
			console.log('TODO: insertCallback');
		},

		newTest: function () {
			console.log('TODO: newTest');
		},

		_recordEvent: function (event) {
			console.log('TODO: _recordEvent');
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

		saveMouseMove: function () {
			console.log('TODO: saveMouseMove');
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

		toggleState: function () {
			console.log('TODO: toggleState');
		}
	};

	return Recorder;
})();
