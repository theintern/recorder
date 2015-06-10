define(function (require) {
	var assert = require('intern/chai!assert');
	var lang = require('dojo/lang');
	var mockChromeApi = require('../support/mockChromeApi');
	var mockStorageApi = require('../support/mockStorageApi');
	var registerSuite = require('intern!object');
	var Recorder = require('Recorder');

	var testData = {
		blank: require('dojo/text!../data/output/blank.txt'),
		click: require('dojo/text!../data/output/click.txt'),
		dblclick: require('dojo/text!../data/output/dblclick.txt')
	};

	function assertScriptValue(port, value, assertMessage) {
		assert.strictEqual(getLastScriptValue(port), value, assertMessage);
	}

	function getLastScriptValue(port) {
		for (var i = port.postMessage.calls.length - 1; i >= 0; --i) {
			var message = port.postMessage.calls[i][0];
			if (message.method === 'setScript') {
				return message.args[0];
			}
		}

		return null;
	}

	function createEvent(event) {
		if (!event || !event.type) {
			throw new Error('At least "type" is required to generate an event object');
		}

		return lang.mixin({
			altKey: false,
			button: 0,
			buttons: 0,
			clientX: 12,
			clientY: 23,
			ctrlKey: false,
			elementX: 12,
			elementY: 23,
			location: 0,
			metaKey: false,
			shiftKey: false,
			target: 'target',
			targetFrame: []
		}, event);
	}

	function mock(object, methodName, applyOriginal) {
		var originalMethod = object[methodName];
		var method = object[methodName] = function () {
			method.calls.push(Array.prototype.slice.call(arguments, 0));
			if (applyOriginal) {
				return originalMethod.apply(this, arguments);
			}
		};
		method.calls = [];
		method.clear = function () {
			method.calls.splice(0, Infinity);
		};
		return {
			remove: function () {
				object[methodName] = originalMethod;
				this.remove = function () {};
			}
		};
	}

	function mockBlobAndUrl() {
		var global = (function () { return this; })();

		var originalBlob;
		if (typeof Blob !== 'undefined') {
			originalBlob = Blob;
		}

		global.Blob = function (data, options) {
			this.data = [].concat(data).join('');
			this.type = options.type;
		};

		var originalUrl;
		if (typeof URL !== 'undefined') {
			originalUrl = URL;
		}

		global.URL = {
			blob: null,
			createObjectURL: function (blob) {
				this.blob = blob;
				return 'blob://test';
			},
			revokeObjectURL: function (url) {
				if (url === 'blob://test') {
					this.blob = null;
				}
			}
		};

		return {
			remove: function () {
				if (originalBlob) {
					global.Blob = originalBlob;
				}
				if (originalUrl) {
					global.URL = URL;
				}

				this.remove = function () {};
			}
		};
	}

	registerSuite(function () {
		var chrome;
		var devToolsPort;
		var recorder;
		var storage;

		return {
			name: 'Recorder',

			beforeEach: function () {
				chrome = mockChromeApi.createChrome();
				devToolsPort = mockChromeApi.createPort('recorderProxy');
				storage = mockStorageApi();
				recorder = new Recorder(chrome, storage);
				chrome.runtime.onConnect.emit(devToolsPort);
			},

			teardown: function () {
				chrome = storage = recorder = null;
			},

			'error handling': {
				construction: function () {
					/* jshint nonew:false */
					assert.throws(function () {
						new Recorder();
					}, 'Chrome API must be provided');

					assert.throws(function () {
						new Recorder(chrome);
					}, 'Storage API must be provided');
				}
			},

			'port messaging': {
				'invalid RPC': function () {
					assert.throws(function () {
						devToolsPort.onMessage.emit({ method: 'invalidMethod' });
					}, 'Method "invalidMethod" does not exist');
				},

				'valid RPC': function () {
					mock(recorder, 'setScript');
					devToolsPort.onMessage.emit({ method: 'setScript', args: [ 'test' ] });
					assert.deepEqual(recorder.setScript.calls, [ [ 'test' ] ]);

					recorder.setScript.clear();
					devToolsPort.onMessage.emit({ method: 'setScript' });
					assert.deepEqual(recorder.setScript.calls, [ [] ], 'Calls missing args should not fail');
				},

				'disconnect/reconnect': function () {
					recorder.setScript('test');
					assertScriptValue(
						devToolsPort,
						'test',
						'Verifier that the setScript function does send to the devtools port when it is connected'
					);

					devToolsPort.postMessage.clear();
					devToolsPort.onDisconnect.emit();
					recorder.setScript('test2');
					assert.lengthOf(
						devToolsPort.postMessage.calls,
						0,
						'Messages should not be sent to port once it disconnects'
					);

					chrome.runtime.onConnect.emit(devToolsPort);

					var actual = devToolsPort.postMessage.calls;
					var expected = [];

					Object.keys(recorder.hotkeys).forEach(function (hotkeyId) {
						expected.push([ { method: 'setHotkey', args: [ hotkeyId, recorder.hotkeys[hotkeyId] ] } ]);
					});

					expected.push([ { method: 'setScript', args: [ 'test2' ] } ]);
					expected.push([ { method: 'setRecording', args: [ false ] } ]);

					assert.sameDeepMembers(
						actual,
						expected,
						'Information about the current recorder state should be sent to the UI when it connects'
						+ ' to the Recorder'
					);
				},

				'event proxy port': function () {
					mock(recorder, 'recordEvent');

					var eventProxyPort = mockChromeApi.createPort('eventProxy');
					chrome.runtime.onConnect.emit(eventProxyPort);

					recorder.setScript('test');
					assertScriptValue(
						devToolsPort,
						'test',
						'Verifier that the setScript function does send to the devtools port when it is connected'
					);
					assert.lengthOf(
						eventProxyPort.postMessage.calls,
						0,
						'Event proxy port should not be sent messages intended for dev tools port'
					);

					eventProxyPort.onMessage.emit({ method: 'recordEvent', args: [ { type: 'test' } ] });
					assert.deepEqual(recorder.recordEvent.calls, [
						[ { type: 'test' } ]
					], 'RPC from the event proxy should be applied to the recorder');

					eventProxyPort.onDisconnect.emit();

					recorder.setScript('test2');
					assertScriptValue(
						devToolsPort,
						'test2',
						'The devtools port should not be disconnected when the event proxy port disconnects'
					);
				}
			},

			'#clear': function () {
				// TODO: Record some stuff first to verify everything is actually being cleared and not just OK from
				// a pristine recorder state
				recorder.setTabId(1);
				recorder.clear();
				assertScriptValue(devToolsPort, testData.blank);
			},

			'#hotkeys': {
				'defaults': function () {
					assert.deepEqual(
						recorder.hotkeys,
						recorder._getDefaultHotkeys(),
						'When no hotkey data is in storage, use predefined defaults'
					);

					var prepopulatedStorage = mockStorageApi({
						'intern.hotkeys': '{"foo":"foo"}'
					});

					var prepopulatedRecorder = new Recorder(chrome, prepopulatedStorage);
					assert.deepEqual(
						prepopulatedRecorder.hotkeys,
						{ foo: 'foo' },
						'When hotkey data is in storage, use data from storage'
					);
				}
			},

			'#insertCallback': function () {
				this.skip('TODO');
			},

			'#insertMouseMove': function () {
				this.skip('TODO');
			},

			'#newTest': {
				'missing tabId': function () {
					assert.throws(function () {
						recorder.newTest();
					}, 'missing tabId');
				}
			},

			'#recordEvent': {
				beforeEach: function () {
					recorder.setTabId(1);
					recorder.toggleState();
				},

				'click': function () {
					recorder.recordEvent(createEvent({ type: 'mousemove' }));
					recorder.recordEvent(createEvent({ type: 'mousedown', buttons: 1 }));
					recorder.recordEvent(createEvent({ type: 'mouseup' }));
					recorder.recordEvent(createEvent({ type: 'click' }));
					assertScriptValue(devToolsPort, testData.click);
				},

				'dblclick': function () {
					recorder.recordEvent(createEvent({ type: 'mousemove' }));
					recorder.recordEvent(createEvent({ type: 'mousedown', buttons: 1 }));
					recorder.recordEvent(createEvent({ type: 'mouseup' }));
					recorder.recordEvent(createEvent({ type: 'click' }));
					recorder.recordEvent(createEvent({ type: 'mousedown', buttons: 1 }));
					recorder.recordEvent(createEvent({ type: 'mouseup' }));
					recorder.recordEvent(createEvent({ type: 'click' }));
					recorder.recordEvent(createEvent({ type: 'dblclick' }));
					assertScriptValue(devToolsPort, testData.dblclick);
				}
			},

			'#save': function () {
				var handle = mockBlobAndUrl();

				recorder.setTabId(1);
				recorder.setScript(testData.blank);

				try {
					recorder.save();
					assert.lengthOf(chrome.downloads.download.calls, 1);
					assert.deepEqual(chrome.downloads.download.calls[0][0], {
						filename: 'test.js',
						saveAs: true,
						url: 'blob://test'
					});
					assert.deepEqual(URL.blob, {
						data: testData.blank,
						type: 'application/ecmascript'
					});

					chrome.downloads.download.calls[0][1]();
					assert.isNull(URL.blob, 'The download callback should revoke the object URL');
				}
				finally {
					handle.remove();
				}
			},

			'#setHotkey': function () {
				var expected = { keyIdentifier: 'Foo' };

				devToolsPort.postMessage.clear();
				recorder.setHotkey('insertCallback', expected);
				assert.deepEqual(recorder.hotkeys.insertCallback, expected);
				assert.deepEqual(devToolsPort.postMessage.calls, [
					[ { method: 'setHotkey', args: [ 'insertCallback', expected ] } ]
				]);

				var data = storage.getItem('intern.hotkeys');
				assert.isString(data);

				var hotkeys = JSON.parse(data);
				assert.deepEqual(hotkeys.insertCallback, expected);
			},

			'#setScript': function () {
				devToolsPort.postMessage.clear();
				recorder.setScript('test');
				assert.deepEqual(devToolsPort.postMessage.calls, [ [ { method: 'setScript', args: [ 'test' ] } ] ]);
			},

			'#setTabId': function () {
				assert.isNull(recorder.tabId);
				recorder.setTabId(1);
				assert.strictEqual(recorder.tabId, 1);
			},

			'#toggleState': {
				'missing tabId': function () {
					assert.throws(function () {
						recorder.toggleState();
					}, 'missing tabId');
				},

				'toggle': function () {
					mock(recorder, 'newTest', true);

					recorder.setTabId(1);
					assert.isFalse(recorder.recording);

					recorder.toggleState();
					assert.isTrue(recorder.recording);
					assert.deepEqual(chrome.tabs.executeScript.calls, [
						[ 1, { file: 'eventProxy.js', allFrames: true } ]
					], 'Content scripts should be injected when turning on recording');
					assert.deepEqual(recorder.newTest.calls, [ [] ],
						'New test should automatically be created when toggling recording for the first time');

					recorder.toggleState();
					assert.isFalse(recorder.recording);
					assert.deepEqual(chrome.tabs.executeScript.calls, [
						[ 1, { file: 'eventProxy.js', allFrames: true } ]
					], 'Content scripts should not be injected when turning off recording');

					recorder.toggleState();
					assert.isTrue(recorder.recording);
					assert.deepEqual(recorder.newTest.calls, [ [] ],
						'New test should not automatically be created when toggling recording a second time');
				}
			}
		};
	});
});
