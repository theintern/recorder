define(function (require) {
	var assert = require('intern/chai!assert');
	var createMockMethod = require('../support/util').createMockMethod;
	var lang = require('dojo/lang');
	var mock = require('../support/util').mock;
	var mockChromeApi = require('../support/mockChromeApi');
	var mockDomApi = require('../support/mockDomApi');
	var registerSuite = require('intern!object');
	var EventProxy = require('lib/EventProxy');

	function createEvent(event) {
		return lang.mixin({
			altKey: false,
			button: 0,
			buttons: 0,
			ctrlKey: false,
			clientX: 3,
			clientY: 4,
			elementX: 1,
			elementY: 2,
			keyIdentifier: null,
			location: null,
			metaKey: false,
			shiftKey: false,
			target: {
				getBoundingClientRect: function () {
					return { left: 1, top: 2 };
				},
				nodeName: 'SINGLE',
				parentNode: null,
				tagName: 'SINGLE'
			},
			type: 'mousemove'
		}, event);
	}

	registerSuite(function () {
		var chrome;
		var document;
		var eventProxyPort;
		var eventProxy;
		var window;

		return {
			name: 'EventProxy',

			beforeEach: function () {
				chrome = mockChromeApi.createChrome();
				window = mockDomApi.createWindow();
				document = window.document;
				eventProxy = new EventProxy(window, document, chrome);
				eventProxy.connect();
				eventProxy.setStrategy('xpath');
				eventProxyPort = eventProxy._port;
			},

			teardown: function () {
				chrome = window = eventProxy = eventProxyPort = null;
			},

			'port communication': function () {
				assert.throws(function () {
					eventProxyPort.onMessage.emit({ method: 'not-a-method' });
				}, 'Method "not-a-method" does not exist');

				mock(eventProxy, 'setStrategy');
				eventProxyPort.onMessage.emit({ method: 'setStrategy', args: [ 'foo' ] });
				eventProxyPort.onMessage.emit({ method: 'setStrategy' });
				assert.deepEqual(eventProxy.setStrategy.calls, [
					[ 'foo' ],
					[]
				], 'Valid calls from communication port should be executed on the proxy');
			},

			'port disconnect/reconnect': function () {
				assert.ok(eventProxy._port);
				assert.lengthOf(eventProxyPort.disconnect.calls, 0);
				eventProxy.connect();
				assert.lengthOf(eventProxyPort.disconnect.calls, 1);
				assert.notStrictEqual(eventProxyPort, eventProxy._port, 'Reconnection should replace an existing port');

				var newProxyPort = eventProxy._port;
				eventProxyPort.postMessage.clear();
				newProxyPort.postMessage.clear();
				document.dispatchEvent(createEvent());

				assert.lengthOf(eventProxyPort.postMessage.calls, 0, 'Old port should not receive events');
				assert.lengthOf(newProxyPort.postMessage.calls, 1, 'New port should receive events');
			},

			'send event': {
				'top window': function () {
					var detail = { test: true };

					eventProxyPort.postMessage.clear();
					eventProxy.send(detail);
					assert.deepEqual(eventProxyPort.postMessage.calls, [
						[ { method: 'recordEvent', args: [ detail ] } ]
					]);
				},
				'inline frame sender': function () {
					var detail = { test: true };
					var childWindow = mockDomApi.createWindow(null, true);
					var childEventProxy = new EventProxy(childWindow, childWindow.document, chrome);
					childEventProxy.connect();
					childEventProxy.setStrategy('xpath');

					var childEventProxyPort = childEventProxy._port;
					childEventProxy.send(detail);
					assert.lengthOf(childEventProxyPort.postMessage.calls, 0,
						'Messages from child frames should not go to the chrome runtime port');
					assert.deepEqual(childWindow.parent.postMessage.calls, [
						[ { method: 'recordEvent', detail: detail }, '*' ]
					], 'Messages from child frames should be sent to parent window');
				},
				'inline frame recipient': function () {
					mock(eventProxy, 'send');

					var sourceWindow = {};

					window.frames = [ {}, sourceWindow ];
					window.dispatchEvent({
						data: null,
						type: 'message',
						source: sourceWindow
					});
					window.dispatchEvent({
						data: { method: 'wrong-method' },
						type: 'message',
						source: sourceWindow
					});
					window.dispatchEvent({
						data: { method: 'recordEvent', detail: null },
						type: 'message',
						source: sourceWindow
					});

					assert.lengthOf(eventProxy.send.calls, 0,
						'Unrelated or malformed messages should not be processed');

					window.dispatchEvent({
						data: { method: 'recordEvent', detail: { target: '/HTML', targetFrame: [] } },
						type: 'message',
						source: sourceWindow
					});

					assert.deepEqual(eventProxy.send.calls, [ [ { target: '/HTML', targetFrame: [ 1 ] } ] ]);
				}
			},

			'#getElementTextPath': function () {
				var element = {
					nodeName: 'BODY',
					parentNode: document.documentElement,
					previousElementSibling: {
						nodeName: 'HEAD',
						parentNode: document.documentElement
					},
					stringValue: 'Hello, world'
				};

				assert.strictEqual(
					eventProxy.getElementTextPath(element),
					'/HTML/BODY[1][normalize-space(string())="Hello, world"]'
				);

				element = {
					nodeName: 'SINGLE',
					parentNode: document.documentElement,
					previousElementSibling: {
						nodeName: 'HEAD',
						parentNode: document.documentElement
					},
					stringValue: 'Hello, world'
				};

				assert.strictEqual(
					eventProxy.getElementTextPath(element),
					'//SINGLE[normalize-space(string())="Hello, world"]'
				);
			},

			'#getElementXPath': function () {
				var body = {
					nodeName: 'BODY',
					parentNode: document.documentElement,
					previousElementSibling: {
						nodeName: 'HEAD',
						parentNode: document.documentElement
					}
				};

				var element = {
					nodeName: 'DIV',
					parentNode: body,
					previousElementSibling: {
						nodeName: 'DIV',
						parentNode: body
					}
				};

				assert.strictEqual(eventProxy.getElementXPath(element), '/HTML/BODY[1]/DIV[2]');

				element = {
					id: 'test',
					nodeName: 'DIV',
					parentNode: body
				};

				assert.strictEqual(eventProxy.getElementXPath(element), 'id("test")');
				assert.strictEqual(eventProxy.getElementXPath(element, true), '/HTML/BODY[1]/DIV');
			},

			'click event': function () {
				mock(eventProxy, 'send');

				document.dispatchEvent(createEvent({ type: 'mousedown', button: 1 }));
				document.dispatchEvent(createEvent({ type: 'mouseup', button: 1, clientX: 55, clientY: 55 }));
				document.dispatchEvent(createEvent({ type: 'click', button: 1, buttons: 1, clientX: 55, clientY: 55 }));

				assert.lengthOf(eventProxy.send.calls, 2,
					'Click event should not be transmitted when it does not match heuristics for a click');
				assert.propertyVal(eventProxy.send.calls[0][0], 'type', 'mousedown');
				assert.propertyVal(eventProxy.send.calls[1][0], 'type', 'mouseup');

				eventProxy.send.clear();
				document.dispatchEvent(createEvent({ type: 'mousedown', button: 1 }));
				document.dispatchEvent(createEvent({ type: 'mouseup', button: 1 }));
				document.dispatchEvent(createEvent({ type: 'click', button: 1, buttons: 1 }));

				assert.lengthOf(eventProxy.send.calls, 3,
					'Click event should be transmitted when it matches heuristics for a click');
				assert.propertyVal(eventProxy.send.calls[0][0], 'type', 'mousedown');
				assert.propertyVal(eventProxy.send.calls[1][0], 'type', 'mouseup');
				assert.propertyVal(eventProxy.send.calls[2][0], 'type', 'click');

				assert.strictEqual(eventProxy.send.calls[1][0].target, '/HTML',
					'Mouseup should not use the target the element under the mouse since ' +
					'it may have been dragged and dropped and this action would be recorded incorrectly otherwise');
			},

			'#setStrategy': function () {
				assert.throws(function () {
					eventProxy.setStrategy('invalid');
				}, 'Invalid strategy');

				eventProxy.setStrategy('xpath');
				assert.strictEqual(eventProxy.getTarget, eventProxy.getElementXPath);

				eventProxy.setStrategy('text');
				assert.strictEqual(eventProxy.getTarget, eventProxy.getElementTextPath);
			},

			//
			// 'listener setup': function () {
			// 	hotkeyIds.forEach(function (id) {
			// 		var input = window.document.getElementById('hotkey-' + id);
			// 		assert.isFunction(input.onkeydown);
			// 	});
			//
			// 	var script = window.document.getElementById('script');
			// 	assert.isFunction(script.oninput);
			// },
			//
			// 'button communication': function () {
			// 	mock(recorderProxy, 'send');
			//
			// 	panel.buttons.forEach(function (button) {
			// 		button.onClicked.emit();
			// 	});
			//
			// 	assert.deepEqual(recorderProxy.send.calls, [
			// 		[ 'toggleState' ],
			// 		[ 'clear' ],
			// 		[ 'newTest' ],
			// 		[ 'save' ]
			// 	]);
			// },
			//
			// 'hide and show': function () {
			// 	mock(recorderProxy, 'send');
			//
			// 	panel.onHidden.emit();
			// 	panel.onShown.emit(window);
			// 	assert.deepEqual(recorderProxy.send.calls, [
			// 		[ 'refreshUi' ]
			// 	]);
			//
			// 	recorderProxy.setRecording(true);
			// 	assert.isTrue(recorderProxy.recording);
			//
			// 	recorderProxy.send.clear();
			// 	panel.onHidden.emit();
			// 	assert.deepEqual(recorderProxy.send.calls, [
			// 		[ 'toggleState' ]
			// 	]);
			//
			// 	recorderProxy.send.clear();
			// 	panel.onShown.emit(window);
			// 	assert.deepEqual(recorderProxy.send.calls, [
			// 		[ 'toggleState' ],
			// 		[ 'refreshUi' ]
			// 	]);
			// },
			//
			// 'hotkey set': function () {
			// 	mock(recorderProxy, 'send');
			//
			// 	hotkeyIds.forEach(function (id) {
			// 		recorderProxy.send.clear();
			//
			// 		var input = window.document.getElementById('hotkey-' + id);
			// 		assert.isFunction(input.onkeydown);
			//
			// 		var key = {
			// 			altKey: false,
			// 			ctrlKey: false,
			// 			keyIdentifier: 'U+0045',
			// 			metaKey: false,
			// 			shiftKey: true
			// 		};
			//
			// 		var event = createEvent(key);
			// 		input.onkeydown(event);
			//
			// 		assert.lengthOf(event.preventDefault.calls, 1);
			//
			// 		assert.deepEqual(recorderProxy.send.calls, [
			// 			[ 'setHotkey', [ id, key ] ]
			// 		]);
			// 	});
			// },
			//
			// 'script set': function () {
			// 	mock(recorderProxy, 'send');
			//
			// 	recorderProxy.setScript('test');
			//
			// 	var event = createEvent({ keyIdentifier: 'U+0020' });
			// 	window.document.getElementById('script').oninput(event);
			// 	assert.deepEqual(recorderProxy.send.calls, [
			// 		[ 'setScript', [ 'test' ] ]
			// 	]);
			// },
			//
			// '#send': function () {
			// 	devToolsPort.postMessage.clear();
			// 	recorderProxy.send('test', [ 'arg1', 'argN' ]);
			// 	assert.deepEqual(devToolsPort.postMessage.calls, [
			// 		[ { method: 'test', args: [ 'arg1', 'argN' ] } ]
			// 	]);
			// },
			//
			// '#setHotkey': {
			// 	'basic tests': function () {
			// 		var testKeys = [
			// 			{
			// 				id: 'insertCallback',
			// 				key: { altKey: true, metaKey: true, ctrlKey: true, shiftKey: true, keyIdentifier: 'U+0045' },
			// 				others: 'Ctrl+Alt+Shift+Win+E',
			// 				mac: '^⌥⇧⌘E'
			// 			},
			// 			{
			// 				id: 'insertMouseMove',
			// 				key: { shiftKey: true, keyIdentifier: 'U+0021' },
			// 				others: '!',
			// 				mac: '!'
			// 			},
			// 			{
			// 				id: 'toggleState',
			// 				key: { ctrlKey: true, keyIdentifier: 'U+0009' },
			// 				others: 'Ctrl+Tab',
			// 				mac: '^↹'
			// 			},
			// 			{
			// 				id: 'insertCallback',
			// 				key: { shiftKey: true, keyIdentifier: 'Home' },
			// 				others: 'Shift+Home',
			// 				mac: '⇧Home'
			// 			},
			// 			{
			// 				id: 'insertCallback',
			// 				key: { shiftKey: true, keyIdentifier: 'Shift' },
			// 				others: 'Shift+',
			// 				mac: '⇧'
			// 			}
			// 		];
			//
			// 		var macPanel = mockChromeApi.createPanel();
			// 		var macWindow = mockDomApi.createWindow('MacIntel');
			// 		var macRecorderProxy = new RecorderProxy(mockChromeApi.createChrome(), macPanel);
			// 		macPanel.onShown.emit(macWindow);
			//
			// 		testKeys.forEach(function (key) {
			// 			recorderProxy.setHotkey(key.id, key.key);
			// 			macRecorderProxy.setHotkey(key.id, key.key);
			// 			assert.strictEqual(window.document.getElementById('hotkey-' + key.id).value, key.others);
			// 			assert.strictEqual(macWindow.document.getElementById('hotkey-' + key.id).value, key.mac);
			// 		});
			//
			// 		assert.throws(function () {
			// 			recorderProxy.setHotkey('invalid', {});
			// 		}, 'missing input for hotkey "invalid"');
			// 	},
			//
			// 	'crbug 48111': function () {
			// 		recorderProxy.setHotkey('insertCallback', { keyIdentifier: 'U+00C0' });
			// 		assert.strictEqual(window.document.getElementById('hotkey-insertCallback').value, '`');
			// 		recorderProxy.setHotkey('insertCallback', { shiftKey: true, keyIdentifier: 'U+00C0' });
			// 		assert.strictEqual(window.document.getElementById('hotkey-insertCallback').value, '~');
			// 	}
			// },
			//
			// '#setRecording': function () {
			// 	var recordButton = recorderProxy._recordButton;
			//
			// 	assert.isFalse(recorderProxy.recording);
			// 	recorderProxy.setRecording(true);
			// 	assert.isTrue(recorderProxy.recording);
			// 	assert.deepEqual(recordButton.update.calls, [
			// 		[ 'resources/statusBarIcons/record_on.png' ]
			// 	]);
			// 	recordButton.update.clear();
			// 	recorderProxy.setRecording(false);
			// 	assert.isFalse(recorderProxy.recording);
			// 	assert.deepEqual(recordButton.update.calls, [
			// 		[ 'resources/statusBarIcons/record_off.png' ]
			// 	]);
			// },
			//
			// '#setScript': function () {
			// 	recorderProxy.setScript('test');
			// 	recorderProxy.setScript(null);
			// 	assert.strictEqual(window.document.getElementById('script').value, 'test');
			// }
		};
	});
});
