define(function (require) {
	var assert = require('intern/chai!assert');
	var lang = require('dojo/lang');
	var mock = require('../support/util').mock;
	var mockChromeApi = require('../support/mockChromeApi');
	var mockStorageApi = require('../support/mockStorageApi');
	var registerSuite = require('intern!object');
	var Recorder = require('lib/Recorder');

	var testData = {
		blank: require('dojo/text!../data/output/blank.txt'),
		callback: require('dojo/text!../data/output/callback.txt'),
		click: require('dojo/text!../data/output/click.txt'),
		doubleClick: require('dojo/text!../data/output/doubleClick.txt'),
		drag: require('dojo/text!../data/output/drag.txt'),
		findDisplayed: require('dojo/text!../data/output/findDisplayed.txt'),
		frame: require('dojo/text!../data/output/frame.txt'),
		hotkey: require('dojo/text!../data/output/hotkey.txt'),
		mouseMove: require('dojo/text!../data/output/mouseMove.txt'),
		navigation: require('dojo/text!../data/output/navigation.txt'),
		newTest: require('dojo/text!../data/output/newTest.txt'),
		type: require('dojo/text!../data/output/type.txt')
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
				chrome = devToolsPort = storage = recorder = null;
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

					recorder.setTabId(1);
					recorder.toggleState();
					assert.isTrue(recorder.recording);

					devToolsPort.postMessage.clear();
					devToolsPort.onDisconnect.emit();
					recorder.setScript('test2');
					assert.lengthOf(
						devToolsPort.postMessage.calls,
						0,
						'Messages should not be sent to port once it disconnects'
					);

					assert.isFalse(recorder.recording, 'Recorder should stop recording if devtools disconnects');

					chrome.runtime.onConnect.emit(devToolsPort);

					var actual = devToolsPort.postMessage.calls;
					var expected = [];

					Object.keys(recorder.hotkeys).forEach(function (hotkeyId) {
						expected.push([ { method: 'setHotkey', args: [ hotkeyId, recorder.hotkeys[hotkeyId] ] } ]);
					});

					expected.push([ { method: 'setScript', args: [ 'test2' ] } ]);
					expected.push([ { method: 'setRecording', args: [ false ] } ]);
					expected.push([ { method: 'setStrategy', args: [ 'xpath' ] } ]);
					expected.push([ { method: 'setFindDisplayed', args: [ false ] } ]);

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
					eventProxyPort.postMessage.clear();

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

			'#hotkeys': function () {
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
			},

			'#insertCallback': function () {
				recorder.setTabId(1);

				var expected = getLastScriptValue(devToolsPort);
				recorder.insertCallback();
				assert.strictEqual(
					getLastScriptValue(devToolsPort),
					expected,
					'insertCallback should be a no-op if not recording'
				);

				recorder.toggleState();
				recorder.insertCallback();
				assertScriptValue(devToolsPort, testData.callback);
			},

			'#insertMouseMove': function () {
				recorder.setTabId(1);

				var expected = getLastScriptValue(devToolsPort);
				recorder.insertMouseMove();
				assert.strictEqual(
					getLastScriptValue(devToolsPort),
					expected,
					'insertMouseMove should be a no-op if not recording'
				);

				recorder.toggleState();

				expected = getLastScriptValue(devToolsPort);
				recorder.insertMouseMove();
				assert.strictEqual(
					getLastScriptValue(devToolsPort),
					expected,
					'insertMouseMove should be a no-op if there was no previous mouse move'
				);

				recorder.recordEvent(createEvent({ type: 'mousemove' }));
				recorder.insertMouseMove();
				assertScriptValue(devToolsPort, testData.mouseMove);
			},

			'navigation': function () {
				recorder.setTabId(1);
				recorder.toggleState();

				// to test target reset on navigation
				recorder.recordEvent(createEvent({ type: 'mousedown', buttons: 1 }));
				recorder.recordEvent(createEvent({ type: 'mouseup' }));
				recorder.recordEvent(createEvent({ type: 'click' }));

				// should be ignored due to tab mismatch
				chrome.webNavigation.onCommitted.emit({
					tabId: 2,
					frameId: 0,
					transitionType: 'reload',
					transitionQualifiers: [ 'from_address_bar' ],
					url: 'http://example.com'
				});

				// should be ignored due to frameId mismatch
				chrome.webNavigation.onCommitted.emit({
					tabId: 1,
					frameId: 1,
					transitionType: 'reload',
					transitionQualifiers: [ 'from_address_bar' ],
					url: 'http://example.com'
				});

				chrome.webNavigation.onCommitted.emit({
					tabId: 1,
					frameId: 0,
					transitionType: 'reload',
					transitionQualifiers: [ 'from_address_bar' ],
					url: 'http://example.com'
				});

				// should be ignored due to transitionType/transitionQualifiers mismatch
				chrome.webNavigation.onReferenceFragmentUpdated.emit({
					tabId: 1,
					frameId: 0,
					transitionType: 'link',
					transitionQualifiers: [],
					url: 'http://example.com/#test'
				});

				chrome.webNavigation.onCommitted.emit({
					tabId: 1,
					frameId: 0,
					transitionType: 'typed',
					transitionQualifiers: [ 'forward_back', 'from_address_bar' ],
					url: 'http://example.com'
				});

				chrome.webNavigation.onReferenceFragmentUpdated.emit({
					tabId: 1,
					frameId: 0,
					transitionType: 'link',
					transitionQualifiers: [ 'forward_back' ],
					url: 'http://example.com/#test'
				});

				chrome.webNavigation.onHistoryStateUpdated.emit({
					tabId: 1,
					frameId: 0,
					transitionType: 'auto_subframe',
					transitionQualifiers: [],
					url: 'http://example.com'
				});
				chrome.webNavigation.onCommitted.emit({
					tabId: 1,
					frameId: 0,
					transitionType: 'typed',
					transitionQualifiers: [ 'from_address_bar' ],
					url: 'http://2.example'
				});

				assertScriptValue(devToolsPort, testData.navigation);
			},

			'#newTest': {
				'missing tabId': function () {
					assert.throws(function () {
						recorder.newTest();
					}, 'missing tabId');
				},

				'multiple tests': function () {
					recorder.setTabId(1);
					recorder.toggleState();
					recorder.insertCallback();
					recorder.newTest();
					recorder.recordEvent(createEvent({ type: 'mousemove', targetFrame: [ 0 ] }));
					recorder.recordEvent(createEvent({ type: 'mousedown', targetFrame: [ 0 ], buttons: 1 }));
					recorder.recordEvent(createEvent({ type: 'mouseup', targetFrame: [ 0 ] }));
					recorder.recordEvent(createEvent({ type: 'click', targetFrame: [ 0 ] }));
					recorder.newTest();
					recorder.insertCallback();
					assertScriptValue(devToolsPort, testData.newTest);
				}
			},

			'#recordEvent': {
				beforeEach: function () {
					recorder.setTabId(1);
					recorder.toggleState();
				},

				'not recording': function () {
					recorder.toggleState();
					assert.isFalse(recorder.recording);

					recorder.recordEvent(createEvent({ type: 'mousemove' }));
					assertScriptValue(devToolsPort, testData.blank);
				},

				'click': function () {
					recorder.recordEvent(createEvent({ type: 'mousemove' }));
					recorder.recordEvent(createEvent({ type: 'mousedown', buttons: 1 }));
					recorder.recordEvent(createEvent({ type: 'mouseup', target: '/HTML/BODY[1]' }));
					recorder.recordEvent(createEvent({ type: 'click' }));
					assertScriptValue(devToolsPort, testData.click);
				},

				'double click': function () {
					recorder.recordEvent(createEvent({ type: 'mousemove' }));
					recorder.recordEvent(createEvent({ type: 'mousedown', buttons: 1 }));
					recorder.recordEvent(createEvent({ type: 'mouseup', target: '/HTML/BODY[1]' }));
					recorder.recordEvent(createEvent({ type: 'click' }));
					recorder.recordEvent(createEvent({ type: 'mousedown', buttons: 1 }));
					recorder.recordEvent(createEvent({ type: 'mouseup', target: '/HTML/BODY[1]' }));
					recorder.recordEvent(createEvent({ type: 'click' }));
					recorder.recordEvent(createEvent({ type: 'dblclick' }));
					assertScriptValue(devToolsPort, testData.doubleClick);
				},

				'drag': function () {
					recorder.recordEvent(createEvent({ type: 'mousemove', elementX: 0, elementY: 0 }));
					recorder.recordEvent(createEvent({ type: 'mousedown', elementX: 0, elementY: 0, buttons: 1 }));
					recorder.recordEvent(createEvent({ type: 'mousemove', elementX: 20, elementY: 20, buttons: 1 }));
					recorder.recordEvent(createEvent({ type: 'mouseup', target: '/HTML/BODY[1]', elementX: 40, elementY: 40 }));
					assertScriptValue(devToolsPort, testData.drag);
				},

				'frame': function () {
					recorder.recordEvent(createEvent({ type: 'mousemove', targetFrame: [ 1, 2 ] }));
					recorder.recordEvent(createEvent({ type: 'mousedown', targetFrame: [ 1, 2 ], buttons: 1 }));
					recorder.recordEvent(createEvent({ type: 'mouseup', targetFrame: [ 1, 2 ], target: '/HTML/BODY[1]' }));
					recorder.recordEvent(createEvent({ type: 'click', targetFrame: [ 1, 2 ] }));
					recorder.recordEvent(createEvent({ type: 'mousemove', targetFrame: [ 1, 3 ] }));
					recorder.recordEvent(createEvent({ type: 'mousedown', targetFrame: [ 1, 3 ], buttons: 1 }));
					recorder.recordEvent(createEvent({ type: 'mouseup', targetFrame: [ 1, 3 ], target: '/HTML/BODY[1]' }));
					recorder.recordEvent(createEvent({ type: 'click', targetFrame: [ 1, 3 ] }));
					assertScriptValue(devToolsPort, testData.frame);
				},

				'type': function () {
					// H
					recorder.recordEvent(createEvent({ type: 'keydown', keyIdentifier: 'Shift', shiftKey: true }));
					recorder.recordEvent(createEvent({ type: 'keydown', keyIdentifier: 'U+0048', shiftKey: true }));
					recorder.recordEvent(createEvent({ type: 'keyup', keyIdentifier: 'U+0048', shiftKey: true }));
					recorder.recordEvent(createEvent({ type: 'keyup', keyIdentifier: 'Shift' }));

					// e
					recorder.recordEvent(createEvent({ type: 'keydown', keyIdentifier: 'U+0045' }));
					recorder.recordEvent(createEvent({ type: 'keyup', keyIdentifier: 'U+0045' }));

					// l
					recorder.recordEvent(createEvent({ type: 'keydown', keyIdentifier: 'U+004C' }));
					recorder.recordEvent(createEvent({ type: 'keyup', keyIdentifier: 'U+004C' }));

					// l
					recorder.recordEvent(createEvent({ type: 'keydown', keyIdentifier: 'U+004C' }));
					recorder.recordEvent(createEvent({ type: 'keyup', keyIdentifier: 'U+004C' }));

					// o
					recorder.recordEvent(createEvent({ type: 'keydown', keyIdentifier: 'U+004F' }));
					recorder.recordEvent(createEvent({ type: 'keyup', keyIdentifier: 'U+004F' }));

					// ,
					recorder.recordEvent(createEvent({ type: 'keydown', keyIdentifier: 'U+002C' }));
					recorder.recordEvent(createEvent({ type: 'keyup', keyIdentifier: 'U+002C' }));

					// <space>
					recorder.recordEvent(createEvent({ type: 'keydown', keyIdentifier: 'U+0020' }));
					recorder.recordEvent(createEvent({ type: 'keyup', keyIdentifier: 'U+0020' }));

					// w
					recorder.recordEvent(createEvent({ type: 'keydown', keyIdentifier: 'U+0057' }));
					recorder.recordEvent(createEvent({ type: 'keyup', keyIdentifier: 'U+0057' }));

					// o
					recorder.recordEvent(createEvent({ type: 'keydown', keyIdentifier: 'U+004F' }));
					recorder.recordEvent(createEvent({ type: 'keyup', keyIdentifier: 'U+004F' }));

					// r
					recorder.recordEvent(createEvent({ type: 'keydown', keyIdentifier: 'U+0052' }));
					recorder.recordEvent(createEvent({ type: 'keyup', keyIdentifier: 'U+0052' }));

					// l
					recorder.recordEvent(createEvent({ type: 'keydown', keyIdentifier: 'U+004C' }));
					recorder.recordEvent(createEvent({ type: 'keyup', keyIdentifier: 'U+004C' }));

					// d
					recorder.recordEvent(createEvent({ type: 'keydown', keyIdentifier: 'U+0044' }));
					recorder.recordEvent(createEvent({ type: 'keyup', keyIdentifier: 'U+0044' }));

					// !
					recorder.recordEvent(createEvent({ type: 'keydown', keyIdentifier: 'Shift', shiftKey: true }));
					recorder.recordEvent(createEvent({ type: 'keydown', keyIdentifier: 'U+0021', shiftKey: true }));
					recorder.recordEvent(createEvent({ type: 'keyup', keyIdentifier: 'U+0021', shiftKey: true }));
					recorder.recordEvent(createEvent({ type: 'keyup', keyIdentifier: 'Shift' }));

					// Shift/unshift test
					recorder.recordEvent(createEvent({ type: 'keydown', keyIdentifier: 'Shift', shiftKey: true }));
					recorder.recordEvent(createEvent({ type: 'keyup', keyIdentifier: 'Shift' }));

					// keypad 0 test
					recorder.recordEvent(createEvent({ type: 'keydown', keyIdentifier: 'U+0030', location: 3 }));
					recorder.recordEvent(createEvent({ type: 'keyup', keyIdentifier: 'U+0030', location: 3 }));

					// non-printable character test
					recorder.recordEvent(createEvent({ type: 'keydown', keyIdentifier: 'Enter' }));
					recorder.recordEvent(createEvent({ type: 'keyup', keyIdentifier: 'Enter' }));

					assertScriptValue(devToolsPort, testData.type);
				},

				'hotkey': {
					'with other keypresses': function () {
						mock(recorder, 'insertCallback');
						recorder.setHotkey('insertCallback', { keyIdentifier: 'U+002B', ctrlKey: true });

						recorder.recordEvent(createEvent({ type: 'keydown', keyIdentifier: 'Control', ctrlKey: true }));
						recorder.recordEvent(createEvent({ type: 'keyup', keyIdentifier: 'Control', ctrlKey: false }));
						assert.lengthOf(recorder.insertCallback.calls, 0,
							'Pressing only one part of a hotkey combination should not cause the hotkey to activate');

						recorder.recordEvent(createEvent({ type: 'keydown', keyIdentifier: 'Control', ctrlKey: true }));
						recorder.recordEvent(createEvent({ type: 'keydown', keyIdentifier: 'U+002B', ctrlKey: true }));
						recorder.recordEvent(createEvent({ type: 'keyup', keyIdentifier: 'U+002B', ctrlKey: true }));
						recorder.recordEvent(createEvent({ type: 'keyup', keyIdentifier: 'Control', ctrlKey: false }));
						assert.lengthOf(recorder.insertCallback.calls, 1,
							'Pressing a hotkey should cause the corresponding hotkey to activate');

						assertScriptValue(devToolsPort, testData.hotkey);
					},

					'with no other keypresses': function () {
						mock(recorder, 'insertCallback');
						recorder.setHotkey('insertCallback', { keyIdentifier: 'U+002B', ctrlKey: true });

						recorder.recordEvent(createEvent({ type: 'keydown', keyIdentifier: 'Control', ctrlKey: true }));
						recorder.recordEvent(createEvent({ type: 'keydown', keyIdentifier: 'U+002B', ctrlKey: true }));
						recorder.recordEvent(createEvent({ type: 'keyup', keyIdentifier: 'U+002B', ctrlKey: true }));
						recorder.recordEvent(createEvent({ type: 'keyup', keyIdentifier: 'Control', ctrlKey: false }));
						assert.lengthOf(recorder.insertCallback.calls, 1,
							'Pressing a hotkey should cause the corresponding hotkey to activate');

						assertScriptValue(devToolsPort, testData.blank);
					},

					'modifier-free hotkeys': function () {
						mock(recorder, 'insertCallback');
						recorder.setHotkey('insertCallback', { keyIdentifier: 'Home' });

						recorder.recordEvent(createEvent({ type: 'keydown', keyIdentifier: 'Control', ctrlKey: true }));
						recorder.recordEvent(createEvent({ type: 'keydown', keyIdentifier: 'Home', ctrlKey: true }));
						recorder.recordEvent(createEvent({ type: 'keyup', keyIdentifier: 'Home', ctrlKey: true }));
						recorder.recordEvent(createEvent({ type: 'keyup', keyIdentifier: 'Control', ctrlKey: false }));
						assert.lengthOf(recorder.insertCallback.calls, 0,
							'Pressing a hotkey with other modifiers active should not cause the hotkey to activate');

						recorder.recordEvent(createEvent({ type: 'keydown', keyIdentifier: 'Home' }));
						recorder.recordEvent(createEvent({ type: 'keyup', keyIdentifier: 'Home' }));
						assert.lengthOf(recorder.insertCallback.calls, 1,
							'Pressing a hotkey with other modifiers active should not cause the hotkey to activate');
					},

					'when recording is off': {
						'toggleState': function () {
							recorder.toggleState();
							assert.isFalse(recorder.recording);

							recorder.setHotkey('toggleState', { keyIdentifier: 'U+002B', ctrlKey: true });
							recorder.recordEvent(createEvent({ type: 'keydown', keyIdentifier: 'Control', ctrlKey: true }));
							recorder.recordEvent(createEvent({ type: 'keydown', keyIdentifier: 'U+002B', ctrlKey: true }));
							recorder.recordEvent(createEvent({ type: 'keyup', keyIdentifier: 'U+002B', ctrlKey: true }));
							recorder.recordEvent(createEvent({ type: 'keyup', keyIdentifier: 'Control', ctrlKey: false }));
							assert.isTrue(recorder.recording,
								'toggleState hotkey should work even if recording is off');
						},

						others: function () {
							recorder.toggleState();
							assert.isFalse(recorder.recording);

							mock(recorder, 'insertCallback');
							recorder.setHotkey('insertCallback', { keyIdentifier: 'U+002B', ctrlKey: true });
							recorder.recordEvent(createEvent({ type: 'keydown', keyIdentifier: 'Control', ctrlKey: true }));
							recorder.recordEvent(createEvent({ type: 'keydown', keyIdentifier: 'U+002B', ctrlKey: true }));
							recorder.recordEvent(createEvent({ type: 'keyup', keyIdentifier: 'U+002B', ctrlKey: true }));
							recorder.recordEvent(createEvent({ type: 'keyup', keyIdentifier: 'Control', ctrlKey: false }));
							assert.lengthOf(recorder.insertCallback.calls, 0,
								'other hotkeys should not do anything when recording is off');
						}
					}
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

			'#setFindDisplayed': function () {
				devToolsPort.postMessage.clear();

				var eventProxyPort = mockChromeApi.createPort('eventProxy');
				chrome.runtime.onConnect.emit(eventProxyPort);
				eventProxyPort.postMessage.clear();

				recorder.setTabId(1);
				recorder.toggleState();
				recorder.setFindDisplayed(true);
				assert.lengthOf(devToolsPort.postMessage.calls, 3);
				assert.deepEqual(eventProxyPort.postMessage.calls, [ [ { method: 'setFindDisplayed', args: [ true ] } ] ]);

				recorder.recordEvent(createEvent({ type: 'mousemove' }));
				recorder.insertMouseMove();
				assertScriptValue(devToolsPort, testData.findDisplayed, 'Script should use "findDisplayedByXpath"');

				recorder.clear();
				recorder.setFindDisplayed(false);
				recorder.recordEvent(createEvent({ type: 'mousemove' }));
				recorder.insertMouseMove();
				assertScriptValue(devToolsPort, testData.mouseMove, 'Script should use "findByXpath"');
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

			'#setStrategy': function () {
				devToolsPort.postMessage.clear();

				var eventProxyPort = mockChromeApi.createPort('eventProxy');
				chrome.runtime.onConnect.emit(eventProxyPort);
				eventProxyPort.postMessage.clear();

				recorder.setStrategy('text');
				assert.lengthOf(devToolsPort.postMessage.calls, 0);
				assert.deepEqual(eventProxyPort.postMessage.calls, [ [ { method: 'setStrategy', args: [ 'text' ] } ] ]);

				assert.throws(function () {
					recorder.setStrategy('invalid');
				}, 'Invalid search strategy');
			},

			'#setTabId': function () {
				assert.isNull(recorder.tabId);
				recorder.setTabId(1);
				assert.strictEqual(recorder.tabId, 1);
				recorder.setTabId(null);
				assert.strictEqual(recorder.tabId, 1, 'null tab IDs should be ignored');
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
						[ 1, { file: 'lib/EventProxy.js', allFrames: true } ],
						[ 1, { file: 'lib/content.js', allFrames: true } ]
					], 'Content scripts should be injected when turning on recording');
					assert.deepEqual(recorder.newTest.calls, [ [] ],
						'New test should automatically be created when toggling recording for the first time');

					chrome.tabs.executeScript.clear();
					recorder.toggleState();
					assert.isFalse(recorder.recording);
					assert.lengthOf(chrome.tabs.executeScript.calls, 0,
						'Content scripts should not be injected when turning off recording');

					recorder.toggleState();
					assert.isTrue(recorder.recording);
					assert.deepEqual(recorder.newTest.calls, [ [] ],
						'New test should not automatically be created when toggling recording a second time');
				}
			}
		};
	});
});
