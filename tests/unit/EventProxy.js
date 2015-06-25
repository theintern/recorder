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
				eventProxyPort = eventProxy.port;
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
				assert.ok(eventProxy.port);
				assert.lengthOf(eventProxyPort.disconnect.calls, 0);
				eventProxy.connect();
				assert.lengthOf(eventProxyPort.disconnect.calls, 1);
				assert.notStrictEqual(eventProxyPort, eventProxy.port, 'Reconnection should replace an existing port');

				var newProxyPort = eventProxy.port;
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

					var childEventProxyPort = childEventProxy.port;
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
						data: { method: 'recordEvent', detail: { target: '/HTML/BODY[1]', targetFrame: [] } },
						type: 'message',
						source: sourceWindow
					});

					assert.deepEqual(eventProxy.send.calls, [ [ { target: '/HTML/BODY[1]', targetFrame: [ 1 ] } ] ]);
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

				document.dispatchEvent(createEvent({ type: 'mousedown', buttons: 1 }));
				document.dispatchEvent(createEvent({ type: 'mouseup', clientX: 55, clientY: 55 }));
				document.dispatchEvent(createEvent({ type: 'click', clientX: 55, clientY: 55 }));

				assert.lengthOf(eventProxy.send.calls, 2,
					'Click event should not be transmitted when it does not match heuristics for a click');
				assert.propertyVal(eventProxy.send.calls[0][0], 'type', 'mousedown');
				assert.propertyVal(eventProxy.send.calls[1][0], 'type', 'mouseup');

				eventProxy.send.clear();
				document.dispatchEvent(createEvent({ type: 'mousedown', buttons: 1 }));
				document.dispatchEvent(createEvent({ type: 'mouseup' }));
				document.dispatchEvent(createEvent({ type: 'click' }));

				assert.lengthOf(eventProxy.send.calls, 3,
					'Click event should be transmitted when it matches heuristics for a click');
				assert.propertyVal(eventProxy.send.calls[0][0], 'type', 'mousedown');
				assert.propertyVal(eventProxy.send.calls[1][0], 'type', 'mouseup');
				assert.propertyVal(eventProxy.send.calls[2][0], 'type', 'click');

				assert.strictEqual(eventProxy.send.calls[1][0].target, '/HTML/BODY[1]',
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
			}
		};
	});
});
