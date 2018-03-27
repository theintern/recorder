import { mock } from '../support/util';
import MockChrome, { Port } from '../support/mockChromeApi';
import MockWindow, { Document, Event, Element } from '../support/mockDomApi';
import EventProxy from '../../src/EventProxy';

const { assert } = intern.getPlugin('chai');
const { registerSuite } = intern.getPlugin('interface.object');

function createEvent(event?: Event) {
	return Object.assign(
		{
			altKey: false,
			button: 0,
			buttons: 0,
			ctrlKey: false,
			clientX: 3,
			clientY: 4,
			elementX: 1,
			elementY: 2,
			key: null,
			location: null,
			metaKey: false,
			shiftKey: false,
			target: {
				getBoundingClientRect: function() {
					return { left: 1, top: 2 };
				},
				nodeName: 'SINGLE',
				parentNode: null,
				tagName: 'SINGLE'
			},
			type: 'mousemove'
		},
		event
	);
}

registerSuite('EventProxy', () => {
	let chrome: MockChrome;
	let document: Document;
	let eventProxyPort: Port;
	let eventProxy: EventProxy;
	let window: MockWindow;

	return {
		beforeEach() {
			chrome = new MockChrome();
			window = new MockWindow('');
			document = window.document;
			eventProxy = new EventProxy(
				<any>window,
				<any>document,
				<any>chrome
			);
			eventProxy.connect();
			eventProxy.setStrategy('xpath');
			// eventProxy.port will have come from the mock Chrome, so it will be a Port
			eventProxyPort = <any>eventProxy.port!;
		},

		after() {
			(<any>chrome) = (<any>window) = (<any>eventProxy) = (<any>eventProxyPort) = null;
		},

		tests: {
			'port communication'() {
				assert.throws(function() {
					eventProxyPort.onMessage.emit({ method: 'not-a-method' });
				}, 'Method "not-a-method" does not exist');

				const { method: setStrategy } = mock(eventProxy, 'setStrategy');
				eventProxyPort.onMessage.emit({
					method: 'setStrategy',
					args: ['foo']
				});
				eventProxyPort.onMessage.emit({ method: 'setStrategy' });
				assert.deepEqual(
					setStrategy.calls,
					[['foo'], []],
					'Valid calls from communication port should be executed on the proxy'
				);
			},

			'port disconnect/reconnect': function() {
				assert.ok(eventProxy.port);
				assert.lengthOf(eventProxyPort.disconnect.calls, 0);
				eventProxy.connect();
				assert.lengthOf(eventProxyPort.disconnect.calls, 1);
				assert.notStrictEqual(
					eventProxyPort,
					<any>eventProxy.port,
					'Reconnection should replace an existing port'
				);

				const newProxyPort: Port = <any>eventProxy.port!;
				eventProxyPort.postMessage.clear();
				newProxyPort.postMessage.clear();
				document.dispatchEvent(createEvent());

				assert.lengthOf(
					eventProxyPort.postMessage.calls,
					0,
					'Old port should not receive events'
				);
				assert.lengthOf(
					newProxyPort.postMessage.calls,
					1,
					'New port should receive events'
				);
			},

			'send event': {
				'top window': function() {
					const detail = { test: true };

					eventProxyPort.postMessage.clear();
					eventProxy.send(detail);
					assert.deepEqual(eventProxyPort.postMessage.calls, [
						[{ method: 'recordEvent', args: [detail] }]
					]);
				},

				'inline frame sender': function() {
					const detail = { test: true };
					const childWindow = new MockWindow(null, true);
					const childEventProxy = new EventProxy(
						<any>childWindow,
						<any>childWindow.document,
						<any>chrome
					);
					childEventProxy.connect();
					childEventProxy.setStrategy('xpath');

					const childEventProxyPort: Port = <any>childEventProxy.port!;
					childEventProxy.send(detail);
					assert.lengthOf(
						childEventProxyPort.postMessage.calls,
						0,
						'Messages from child frames should not go to the chrome runtime port'
					);
					assert.deepEqual(
						childWindow.parent.postMessage.calls,
						[[{ method: 'recordEvent', detail: detail }, '*']],
						'Messages from child frames should be sent to parent window'
					);
				},

				'inline frame recipient': function() {
					const { method: send } = mock(eventProxy, 'send');

					const sourceWindow = new MockWindow(null);

					window.frames = [new MockWindow(null), sourceWindow];
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

					assert.lengthOf(
						send.calls,
						0,
						'Unrelated or malformed messages should not be processed'
					);

					window.dispatchEvent({
						data: {
							method: 'recordEvent',
							detail: { target: '/HTML/BODY[1]', targetFrame: [] }
						},
						type: 'message',
						source: sourceWindow
					});

					assert.deepEqual(send.calls, [
						[{ target: '/HTML/BODY[1]', targetFrame: [1] }]
					]);
				}
			},

			'#getElementTextPath': function() {
				const element1 = new Element({
					nodeName: 'BODY',
					parentNode: document.documentElement,
					previousElementSibling: new Element({
						nodeName: 'HEAD',
						parentNode: document.documentElement
					}),
					stringValue: 'Hello, world'
				});

				assert.strictEqual(
					eventProxy.getElementTextPath(<any>element1),
					'/HTML/BODY[1][normalize-space(string())="Hello, world"]'
				);

				const element2 = new Element({
					nodeName: 'SINGLE',
					parentNode: document.documentElement,
					previousElementSibling: new Element({
						nodeName: 'HEAD',
						parentNode: document.documentElement
					}),
					stringValue: 'Hello, world'
				});

				assert.strictEqual(
					eventProxy.getElementTextPath(<any>element2),
					'//SINGLE[normalize-space(string())="Hello, world"]'
				);
			},

			'#getElementXPath': function() {
				const body = new Element({
					nodeName: 'BODY',
					parentNode: document.documentElement,
					previousElementSibling: new Element({
						nodeName: 'HEAD',
						parentNode: document.documentElement
					})
				});

				const element1 = new Element({
					nodeName: 'DIV',
					parentNode: body,
					previousElementSibling: new Element({
						nodeName: 'DIV',
						parentNode: body
					})
				});

				assert.strictEqual(
					eventProxy.getElementXPath(<any>element1),
					'/HTML/BODY[1]/DIV[2]'
				);

				const element2 = new Element({
					id: 'test',
					nodeName: 'DIV',
					parentNode: body
				});

				assert.strictEqual(
					eventProxy.getElementXPath(<any>element2),
					'id("test")'
				);
				assert.strictEqual(
					eventProxy.getElementXPath(<any>element2, true),
					'/HTML/BODY[1]/DIV'
				);
			},

			'click event': function() {
				const { method: send } = mock(eventProxy, 'send');

				document.dispatchEvent(
					createEvent({ type: 'mousedown', buttons: 1 })
				);
				document.dispatchEvent(
					createEvent({ type: 'mouseup', clientX: 55, clientY: 55 })
				);
				document.dispatchEvent(
					createEvent({ type: 'click', clientX: 55, clientY: 55 })
				);

				assert.lengthOf(
					send.calls,
					2,
					'Click event should not be transmitted when it does not match heuristics for a click'
				);
				assert.propertyVal(send.calls[0][0], 'type', 'mousedown');
				assert.propertyVal(send.calls[1][0], 'type', 'mouseup');

				send.clear();
				document.dispatchEvent(
					createEvent({ type: 'mousedown', buttons: 1 })
				);
				document.dispatchEvent(createEvent({ type: 'mouseup' }));
				document.dispatchEvent(createEvent({ type: 'click' }));

				assert.lengthOf(
					send.calls,
					3,
					'Click event should be transmitted when it matches heuristics for a click'
				);
				assert.propertyVal(send.calls[0][0], 'type', 'mousedown');
				assert.propertyVal(send.calls[1][0], 'type', 'mouseup');
				assert.propertyVal(send.calls[2][0], 'type', 'click');

				assert.strictEqual(
					send.calls[1][0].target,
					'/HTML/BODY[1]',
					'Mouseup should not use the target the element under the mouse since ' +
						'it may have been dragged and dropped and this action would be recorded incorrectly otherwise'
				);
			},

			'#setStrategy': function() {
				assert.throws(function() {
					eventProxy.setStrategy('invalid');
				}, 'Invalid strategy');

				eventProxy.setStrategy('xpath');
				assert.strictEqual(
					eventProxy.getTarget,
					eventProxy.getElementXPath
				);

				eventProxy.setStrategy('text');
				assert.strictEqual(
					eventProxy.getTarget,
					eventProxy.getElementTextPath
				);
			}
		}
	};
});
