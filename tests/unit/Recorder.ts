import { mock } from '../support/util';
import MockChrome, { testPage, testHost, Port } from '../support/mockChromeApi';
import MockStorage from '../support/mockStorageApi';
import Recorder, {
	HotKeys,
	RecorderEvent,
	RecorderMouseEvent,
	RecorderKeyboardEvent
} from '../../src/Recorder';
import * as BlankText from '../integration/blank.ts';
import * as CallbackText from '../integration/callback.ts';
import * as ClickText from '../integration/click.ts';
import * as DoubleClickText from '../integration/doubleClick.ts';
import * as DragText from '../integration/drag.ts';
import * as FindDisplayedText from '../integration/findDisplayed.ts';
import * as FrameText from '../integration/frame.ts';
import * as HotkeyText from '../integration/hotkey.ts';
import * as MouseMoveText from '../integration/mouseMove.ts';
import * as NavigationText from '../integration/navigation.ts';
import * as NewTestText from '../integration/newTest.ts';
import * as TypeText from '../integration/type.ts';

const { assert } = intern.getPlugin('chai');
const { registerSuite } = intern.getPlugin('interface.object');

const testData: { [key: string]: string } = {
	blank: <any>BlankText,
	callback: <any>CallbackText,
	click: <any>ClickText,
	doubleClick: <any>DoubleClickText,
	drag: <any>DragText,
	findDisplayed: <any>FindDisplayedText,
	frame: <any>FrameText,
	hotkey: <any>HotkeyText,
	mouseMove: <any>MouseMoveText,
	navigation: <any>NavigationText,
	newTest: <any>NewTestText,
	type: <any>TypeText
};

function assertScriptValue(port: Port, value: string, assertMessage?: string) {
	assert.strictEqual(getLastScriptValue(port), value, assertMessage);
}

function getLastScriptValue(port: Port) {
	for (let i = port.postMessage.calls.length - 1; i >= 0; --i) {
		const message = port.postMessage.calls[i][0];
		if (message.method === 'setScript') {
			return message.args[0];
		}
	}

	return null;
}

function createEvent(event: Partial<RecorderMouseEvent>): RecorderMouseEvent;
function createEvent(
	event: Partial<RecorderKeyboardEvent>
): RecorderKeyboardEvent;
function createEvent(event: Partial<RecorderEvent>): RecorderEvent {
	if (!event || !event.type) {
		throw new Error(
			'At least "type" is required to generate an event object'
		);
	}

	return <RecorderEvent>Object.assign(
		{
			altKey: false,
			button: 0,
			buttons: 0,
			clientX: 59,
			clientY: 12,
			ctrlKey: false,
			elementX: 59,
			elementY: 12,
			location: 0,
			metaKey: false,
			shiftKey: false,
			target: 'target',
			targetFrame: []
		},
		event
	);
}

function mockBlobAndUrl() {
	const win: any = typeof global === 'undefined' ? window : global;

	let originalBlob: Blob;
	if (win.Blob !== 'undefined') {
		originalBlob = win.Blob;
	}

	win.Blob = function(this: any, data: object, options: { type: string }) {
		this.data = [...[data]].join('');
		this.type = options.type;
	};

	let originalUrl: URL;
	if (win.URL !== 'undefined') {
		originalUrl = win.URL;
	}

	win.URL = {
		blob: null,
		createObjectURL(blob: Blob) {
			this.blob = blob;
			return 'blob://test';
		},
		revokeObjectURL(url: string) {
			if (url === 'blob://test') {
				this.blob = null;
			}
		}
	};

	const mock = {
		URL: win.URL,
		remove() {
			if (originalBlob) {
				win.Blob = originalBlob;
			}
			if (originalUrl) {
				win.URL = URL;
			}

			mock.remove = () => {};
		}
	};

	return mock;
}

registerSuite('Recorder', () => {
	let chrome: MockChrome;
	let devToolsPort: Port;
	let recorder: Recorder;
	let storage: MockStorage;

	return {
		beforeEach() {
			chrome = new MockChrome();
			devToolsPort = chrome.createPort('recorderProxy');
			storage = new MockStorage();
			recorder = new Recorder(chrome, storage);
			chrome.runtime.onConnect.emit(devToolsPort);
		},

		after() {
			(<any>chrome) = (<any>devToolsPort) = (<any>storage) = (<any>recorder) = null;
		},

		tests: {
			'error handling': {
				construction() {
					/* jshint nonew:false */
					assert.throws(function() {
						new Recorder();
					}, 'Chrome API must be provided');
					assert.throws(function() {
						new Recorder(<any>chrome);
					}, 'Storage API must be provided');
				}
			},

			'port messaging': {
				'invalid RPC': function() {
					assert.throws(function() {
						devToolsPort.onMessage.emit({
							method: 'invalidMethod'
						});
					}, 'Method "invalidMethod" does not exist');
				},

				'valid RPC': function() {
					const { method: setScript } = mock(recorder, 'setScript');
					devToolsPort.onMessage.emit({
						method: 'setScript',
						args: ['test']
					});
					assert.deepEqual(setScript.calls, [['test']]);
					setScript.clear();
					devToolsPort.onMessage.emit({ method: 'setScript' });
					assert.deepEqual(
						setScript.calls,
						[[]],
						'Calls missing args should not fail'
					);
				},

				'disconnect/reconnect': function() {
					recorder.setScript('test');
					assertScriptValue(
						devToolsPort,
						'test',
						'Verify that the setScript function does send to the ' +
							'devtools port when it is connected'
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
					assert.isFalse(
						recorder.recording,
						'Recorder should stop recording if devtools disconnects'
					);

					chrome.runtime.onConnect.emit(devToolsPort);
					const actual = devToolsPort.postMessage.calls;
					const expected: {
						method: string;
						args: any[];
					}[][] = Object.keys(recorder.hotkeys).map(hotkeyId => [
						{
							method: 'setHotkey',
							args: [
								hotkeyId,
								recorder.hotkeys[<keyof HotKeys>hotkeyId]
							]
						}
					]);
					expected.push([{ method: 'setScript', args: ['test2'] }]);
					expected.push([{ method: 'setRecording', args: [false] }]);
					expected.push([{ method: 'setStrategy', args: ['xpath'] }]);
					expected.push([
						{ method: 'setFindDisplayed', args: [false] }
					]);
					assert.sameDeepMembers(
						actual,
						expected,
						'Information about the current recorder state should be ' +
							'sent to the UI when it connects to the Recorder'
					);
				},

				'event proxy port': function() {
					const { method: recordEvent } = mock(
						recorder,
						'recordEvent'
					);
					const eventProxyPort = chrome.createPort('eventProxy');
					chrome.runtime.onConnect.emit(eventProxyPort);
					eventProxyPort.postMessage.clear();
					recorder.setScript('test');
					assertScriptValue(
						devToolsPort,
						'test',
						'Verifier that the setScript function does send to the ' +
							'devtools port when it is connected'
					);
					assert.lengthOf(
						eventProxyPort.postMessage.calls,
						0,
						'Event proxy port should not be sent messages intended ' +
							'for dev tools port'
					);
					eventProxyPort.onMessage.emit({
						method: 'recordEvent',
						args: [{ type: 'test' }]
					});
					assert.deepEqual(
						recordEvent.calls,
						[[{ type: 'test' }]],
						'RPC from the event proxy should be applied to the recorder'
					);
					eventProxyPort.onDisconnect.emit();
					recorder.setScript('test2');
					assertScriptValue(
						devToolsPort,
						'test2',
						'The devtools port should not be disconnected when the event proxy port disconnects'
					);
				}
			},

			'#clear'() {
				// TODO: Record some stuff first to verify everything is
				// actually being cleared and not just OK from a pristine
				// recorder state
				recorder.setTabId(1);
				recorder.clear();
				assertScriptValue(devToolsPort, testData.blank);
			},

			'#hotkeys'() {
				assert.deepEqual(
					recorder.hotkeys,
					recorder._getDefaultHotkeys(),
					'When no hotkey data is in storage, use predefined defaults'
				);
				const prepopulatedStorage = new MockStorage({
					'intern.hotkeys': '{"foo":"foo"}'
				});
				const prepopulatedRecorder = new Recorder(
					<any>chrome,
					<any>prepopulatedStorage
				);
				assert.deepEqual(
					prepopulatedRecorder.hotkeys,
					<any>{ foo: 'foo' },
					'When hotkey data is in storage, use data from storage'
				);
			},

			'#insertCallback'() {
				recorder.setTabId(1);

				const expected = getLastScriptValue(devToolsPort);
				recorder.insertCallback();
				assert.strictEqual(
					getLastScriptValue(devToolsPort),
					expected,
					'insertCallback should be a no-op if not recording'
				);
				recorder.toggleState();
				recorder.insertCallback();

				recorder.setSuiteName('callback');
				assertScriptValue(devToolsPort, testData.callback);
			},

			'#insertMouseMove'() {
				recorder.setTabId(2);

				const expected1 = getLastScriptValue(devToolsPort);
				recorder.insertMouseMove();
				assert.strictEqual(
					getLastScriptValue(devToolsPort),
					expected1,
					'insertMouseMove should be a no-op if not recording'
				);
				recorder.toggleState();
				const expected2 = getLastScriptValue(devToolsPort);
				recorder.insertMouseMove();
				assert.strictEqual(
					getLastScriptValue(devToolsPort),
					expected2,
					'insertMouseMove should be a no-op if there was no previous mouse move'
				);
				recorder.recordEvent(
					createEvent({ type: 'mousemove', target: 'id("b2")' })
				);
				recorder.insertMouseMove();

				recorder.setSuiteName('mouseMove');
				assertScriptValue(devToolsPort, testData.mouseMove);
			},

			navigation() {
				recorder.setTabId(2);
				recorder.toggleState();

				// to test target reset on navigation
				recorder.recordEvent(
					createEvent({
						type: 'mousedown',
						buttons: 1,
						target: 'id("b2")'
					})
				);
				recorder.recordEvent(createEvent({ type: 'mouseup' }));
				recorder.recordEvent(
					createEvent({
						type: 'click',
						target: 'id("b2")',
						elementX: 5,
						elementY: 11
					})
				);
				// should be ignored due to tab mismatch
				chrome.webNavigation.onCommitted.emit({
					tabId: 1,
					frameId: 0,
					transitionType: 'reload',
					transitionQualifiers: ['from_address_bar'],
					url: testPage
				});
				chrome.webNavigation.onCommitted.emit({
					tabId: 2,
					frameId: 0,
					transitionType: 'reload',
					transitionQualifiers: ['from_address_bar'],
					url: testPage
				});
				// should be ignored due to frameId mismatch
				chrome.webNavigation.onCommitted.emit({
					tabId: 1,
					frameId: 1,
					transitionType: 'reload',
					transitionQualifiers: ['from_address_bar'],
					url: testPage
				});
				// should be ignored due to transitionType/transitionQualifiers mismatch
				chrome.webNavigation.onReferenceFragmentUpdated.emit({
					tabId: 1,
					frameId: 0,
					transitionType: 'link',
					transitionQualifiers: [],
					url: `${testPage}#test`
				});
				chrome.webNavigation.onCommitted.emit({
					tabId: 2,
					frameId: 0,
					transitionType: 'link',
					transitionQualifiers: ['from_address_bar'],
					url: `${testPage}`
				});
				chrome.webNavigation.onCommitted.emit({
					tabId: 2,
					frameId: 0,
					transitionType: 'link',
					transitionQualifiers: ['from_address_bar'],
					url: `${testPage}#test`
				});
				chrome.webNavigation.onCommitted.emit({
					tabId: 2,
					frameId: 0,
					transitionType: 'link',
					transitionQualifiers: ['from_address_bar'],
					url: `${testHost}/elements.html`
				});
				chrome.webNavigation.onCommitted.emit({
					tabId: 1,
					frameId: 0,
					transitionType: 'typed',
					transitionQualifiers: ['forward_back', 'from_address_bar'],
					url: testPage
				});
				chrome.webNavigation.onReferenceFragmentUpdated.emit({
					tabId: 1,
					frameId: 0,
					transitionType: 'link',
					transitionQualifiers: ['forward_back'],
					url: `${testPage}#test`
				});
				chrome.webNavigation.onHistoryStateUpdated.emit({
					tabId: 1,
					frameId: 0,
					transitionType: 'auto_subframe',
					transitionQualifiers: [],
					url: testPage
				});
				chrome.webNavigation.onCommitted.emit({
					tabId: 1,
					frameId: 0,
					transitionType: 'typed',
					transitionQualifiers: ['from_address_bar'],
					url: 'http://localhost:9000/elements.html'
				});

				recorder.setSuiteName('navigation');
				assertScriptValue(devToolsPort, testData.navigation);
			},

			'#newTest': {
				'missing tabId'() {
					assert.throws(function() {
						recorder.newTest();
					}, 'missing tabId');
				},

				'multiple tests'() {
					recorder.setTabId(1);

					recorder.toggleState();
					recorder.insertCallback();
					recorder.newTest();
					recorder.recordEvent(
						createEvent({ type: 'mousemove', targetFrame: [0] })
					);
					recorder.recordEvent(
						createEvent({
							type: 'mousedown',
							targetFrame: [0],
							buttons: 1,
							target: 'id("b2")'
						})
					);
					recorder.recordEvent(
						createEvent({ type: 'mouseup', targetFrame: [0] })
					);
					recorder.recordEvent(
						createEvent({
							type: 'click',
							targetFrame: [0],
							elementX: 12,
							elementY: 23
						})
					);
					recorder.newTest();
					recorder.insertCallback();

					recorder.setSuiteName('newTest');
					assertScriptValue(devToolsPort, testData.newTest);
				}
			},

			'#recordEvent': {
				'not recording'() {
					recorder.setTabId(1);
					assert.isFalse(recorder.recording);
					recorder.recordEvent(createEvent({ type: 'mousemove' }));
					assertScriptValue(devToolsPort, testData.blank);
				},

				click() {
					recorder.setTabId(2);
					recorder.toggleState();

					recorder.recordEvent(createEvent({ type: 'mousemove' }));
					recorder.recordEvent(
						createEvent({
							type: 'mousedown',
							buttons: 1,
							target: 'id("b2")'
						})
					);
					recorder.recordEvent(
						createEvent({
							type: 'mouseup',
							target: '/HTML/BODY[1]'
						})
					);
					recorder.recordEvent(createEvent({ type: 'click' }));
					recorder.setSuiteName('click');
					assertScriptValue(devToolsPort, testData.click);
				},

				'double click'() {
					recorder.setTabId(2);
					recorder.toggleState();

					recorder.recordEvent(createEvent({ type: 'mousemove' }));
					recorder.recordEvent(
						createEvent({
							type: 'mousedown',
							buttons: 1,
							target: 'id("b2")'
						})
					);
					recorder.recordEvent(
						createEvent({
							type: 'mouseup',
							target: '/HTML/BODY[1]'
						})
					);
					recorder.recordEvent(createEvent({ type: 'click' }));
					recorder.recordEvent(
						createEvent({ type: 'mousedown', buttons: 1 })
					);
					recorder.recordEvent(
						createEvent({
							type: 'mouseup',
							target: '/HTML/BODY[1]'
						})
					);
					recorder.recordEvent(createEvent({ type: 'click' }));
					recorder.recordEvent(createEvent({ type: 'dblclick' }));
					recorder.setSuiteName('doubleClick');
					assertScriptValue(devToolsPort, testData.doubleClick);
				},

				drag() {
					recorder.setTabId(2);
					recorder.toggleState();

					recorder.recordEvent(
						createEvent({
							type: 'mousedown',
							elementX: 9,
							elementY: 9,
							buttons: 1,
							target: 'id("b2")'
						})
					);
					recorder.recordEvent(
						createEvent({
							type: 'mousemove',
							elementX: 10,
							elementY: 9,
							buttons: 1,
							target: 'id("b2")'
						})
					);
					recorder.recordEvent(
						createEvent({
							type: 'mouseup',
							target: '/HTML/BODY[1]',
							elementX: 32,
							elementY: 43
						})
					);
					recorder.setSuiteName('drag');
					assertScriptValue(devToolsPort, testData.drag);
				},

				frame() {
					recorder.setTabId(3);
					recorder.toggleState();

					recorder.recordEvent(
						createEvent({
							type: 'mousemove',
							targetFrame: [1, 0]
						})
					);
					recorder.recordEvent(
						createEvent({
							type: 'mousedown',
							targetFrame: [1, 0],
							buttons: 1,
							target: 'id("b2")'
						})
					);
					recorder.recordEvent(
						createEvent({
							type: 'mouseup',
							targetFrame: [1, 0],
							target: '/HTML/BODY[1]'
						})
					);
					recorder.recordEvent(
						createEvent({
							type: 'click',
							targetFrame: [1, 0],
							elementX: 8,
							elementY: 11
						})
					);
					recorder.recordEvent(
						createEvent({
							type: 'mousemove',
							targetFrame: [1, 1]
						})
					);
					recorder.recordEvent(
						createEvent({
							type: 'mousedown',
							targetFrame: [1, 1],
							buttons: 1,
							target: '/HTML/BODY[1]/P'
						})
					);
					recorder.recordEvent(
						createEvent({
							type: 'mouseup',
							targetFrame: [1, 1],
							target: '/HTML/BODY[1]/P'
						})
					);
					recorder.recordEvent(
						createEvent({
							type: 'click',
							targetFrame: [1, 1],
							elementX: 22,
							elementY: 27
						})
					);
					recorder.setSuiteName('frame');
					assertScriptValue(devToolsPort, testData.frame);
				},

				type() {
					recorder.setTabId(1);
					recorder.toggleState();

					// H
					recorder.recordEvent(
						createEvent({
							type: 'keydown',
							key: 'Shift',
							shiftKey: true
						})
					);
					recorder.recordEvent(
						createEvent({
							type: 'keydown',
							key: 'U+0048',
							shiftKey: true
						})
					);
					recorder.recordEvent(
						createEvent({
							type: 'keyup',
							key: 'U+0048',
							shiftKey: true
						})
					);
					recorder.recordEvent(
						createEvent({ type: 'keyup', key: 'Shift' })
					);
					// e
					recorder.recordEvent(
						createEvent({ type: 'keydown', key: 'U+0045' })
					);
					recorder.recordEvent(
						createEvent({ type: 'keyup', key: 'U+0045' })
					);
					// l
					recorder.recordEvent(
						createEvent({ type: 'keydown', key: 'U+004C' })
					);
					recorder.recordEvent(
						createEvent({ type: 'keyup', key: 'U+004C' })
					);
					// l
					recorder.recordEvent(
						createEvent({ type: 'keydown', key: 'U+004C' })
					);
					recorder.recordEvent(
						createEvent({ type: 'keyup', key: 'U+004C' })
					);
					// o
					recorder.recordEvent(
						createEvent({ type: 'keydown', key: 'U+004F' })
					);
					recorder.recordEvent(
						createEvent({ type: 'keyup', key: 'U+004F' })
					);
					// ,
					recorder.recordEvent(
						createEvent({ type: 'keydown', key: 'U+002C' })
					);
					recorder.recordEvent(
						createEvent({ type: 'keyup', key: 'U+002C' })
					);
					// <space>
					recorder.recordEvent(
						createEvent({ type: 'keydown', key: 'U+0020' })
					);
					recorder.recordEvent(
						createEvent({ type: 'keyup', key: 'U+0020' })
					);
					// w
					recorder.recordEvent(
						createEvent({ type: 'keydown', key: 'U+0057' })
					);
					recorder.recordEvent(
						createEvent({ type: 'keyup', key: 'U+0057' })
					);
					// o
					recorder.recordEvent(
						createEvent({ type: 'keydown', key: 'U+004F' })
					);
					recorder.recordEvent(
						createEvent({ type: 'keyup', key: 'U+004F' })
					);
					// r
					recorder.recordEvent(
						createEvent({ type: 'keydown', key: 'U+0052' })
					);
					recorder.recordEvent(
						createEvent({ type: 'keyup', key: 'U+0052' })
					);
					// l
					recorder.recordEvent(
						createEvent({ type: 'keydown', key: 'U+004C' })
					);
					recorder.recordEvent(
						createEvent({ type: 'keyup', key: 'U+004C' })
					);
					// d
					recorder.recordEvent(
						createEvent({ type: 'keydown', key: 'U+0044' })
					);
					recorder.recordEvent(
						createEvent({ type: 'keyup', key: 'U+0044' })
					);
					// !
					recorder.recordEvent(
						createEvent({
							type: 'keydown',
							key: 'Shift',
							shiftKey: true
						})
					);
					recorder.recordEvent(
						createEvent({
							type: 'keydown',
							key: 'U+0021',
							shiftKey: true
						})
					);
					recorder.recordEvent(
						createEvent({
							type: 'keyup',
							key: 'U+0021',
							shiftKey: true
						})
					);
					recorder.recordEvent(
						createEvent({ type: 'keyup', key: 'Shift' })
					);
					// Shift/unshift test
					recorder.recordEvent(
						createEvent({
							type: 'keydown',
							key: 'Shift',
							shiftKey: true
						})
					);
					recorder.recordEvent(
						createEvent({ type: 'keyup', key: 'Shift' })
					);
					// keypad 0 test
					recorder.recordEvent(
						createEvent({
							type: 'keydown',
							key: 'U+0030',
							location: 3
						})
					);
					recorder.recordEvent(
						createEvent({
							type: 'keyup',
							key: 'U+0030',
							location: 3
						})
					);
					// non-printable character test
					recorder.recordEvent(
						createEvent({ type: 'keydown', key: 'Enter' })
					);
					recorder.recordEvent(
						createEvent({ type: 'keyup', key: 'Enter' })
					);
					recorder.setSuiteName('type');
					assertScriptValue(devToolsPort, testData.type);
				},

				hotkey: {
					beforeEach() {
						recorder.setTabId(1);
						recorder.toggleState();
					},

					tests: {
						'with other keypresses'() {
							const { method: insertCallback } = mock(
								recorder,
								'insertCallback'
							);
							recorder.setHotkey('insertCallback', {
								key: 'U+002B',
								ctrlKey: true
							});
							recorder.recordEvent(
								createEvent({
									type: 'keydown',
									key: 'Control',
									ctrlKey: true
								})
							);
							recorder.recordEvent(
								createEvent({
									type: 'keyup',
									key: 'Control',
									ctrlKey: false
								})
							);
							assert.lengthOf(
								insertCallback.calls,
								0,
								'Pressing only one part of a hotkey combination should not cause the hotkey to activate'
							);
							recorder.recordEvent(
								createEvent({
									type: 'keydown',
									key: 'Control',
									ctrlKey: true
								})
							);
							recorder.recordEvent(
								createEvent({
									type: 'keydown',
									key: 'U+002B',
									ctrlKey: true
								})
							);
							recorder.recordEvent(
								createEvent({
									type: 'keyup',
									key: 'U+002B',
									ctrlKey: true
								})
							);
							recorder.recordEvent(
								createEvent({
									type: 'keyup',
									key: 'Control',
									ctrlKey: false
								})
							);
							assert.lengthOf(
								insertCallback.calls,
								1,
								'Pressing a hotkey should cause the corresponding hotkey to activate'
							);
							recorder.setSuiteName('hotkey');
							assertScriptValue(devToolsPort, testData.hotkey);
						},

						'with no other keypresses'() {
							const { method: insertCallback } = mock(
								recorder,
								'insertCallback'
							);
							recorder.setHotkey('insertCallback', {
								key: 'U+002B',
								ctrlKey: true
							});
							recorder.recordEvent(
								createEvent({
									type: 'keydown',
									key: 'Control',
									ctrlKey: true
								})
							);
							recorder.recordEvent(
								createEvent({
									type: 'keydown',
									key: 'U+002B',
									ctrlKey: true
								})
							);
							recorder.recordEvent(
								createEvent({
									type: 'keyup',
									key: 'U+002B',
									ctrlKey: true
								})
							);
							recorder.recordEvent(
								createEvent({
									type: 'keyup',
									key: 'Control',
									ctrlKey: false
								})
							);
							assert.lengthOf(
								insertCallback.calls,
								1,
								'Pressing a hotkey should cause the corresponding hotkey to activate'
							);
							assertScriptValue(devToolsPort, testData.blank);
						},

						'modifier-free hotkeys'() {
							const { method: insertCallback } = mock(
								recorder,
								'insertCallback'
							);
							recorder.setHotkey('insertCallback', {
								key: 'Home'
							});
							recorder.recordEvent(
								createEvent({
									type: 'keydown',
									key: 'Control',
									ctrlKey: true
								})
							);
							recorder.recordEvent(
								createEvent({
									type: 'keydown',
									key: 'Home',
									ctrlKey: true
								})
							);
							recorder.recordEvent(
								createEvent({
									type: 'keyup',
									key: 'Home',
									ctrlKey: true
								})
							);
							recorder.recordEvent(
								createEvent({
									type: 'keyup',
									key: 'Control',
									ctrlKey: false
								})
							);
							assert.lengthOf(
								insertCallback.calls,
								0,
								'Pressing a hotkey with other modifiers active should not cause the hotkey to activate'
							);
							recorder.recordEvent(
								createEvent({
									type: 'keydown',
									key: 'Home'
								})
							);
							recorder.recordEvent(
								createEvent({ type: 'keyup', key: 'Home' })
							);
							assert.lengthOf(
								insertCallback.calls,
								1,
								'Pressing a hotkey with other modifiers active should not cause the hotkey to activate'
							);
						},

						'when recording is off': {
							toggleState() {
								recorder.toggleState();
								assert.isFalse(recorder.recording);
								recorder.setHotkey('toggleState', {
									key: 'U+002B',
									ctrlKey: true
								});
								recorder.recordEvent(
									createEvent({
										type: 'keydown',
										key: 'Control',
										ctrlKey: true
									})
								);
								recorder.recordEvent(
									createEvent({
										type: 'keydown',
										key: 'U+002B',
										ctrlKey: true
									})
								);
								recorder.recordEvent(
									createEvent({
										type: 'keyup',
										key: 'U+002B',
										ctrlKey: true
									})
								);
								recorder.recordEvent(
									createEvent({
										type: 'keyup',
										key: 'Control',
										ctrlKey: false
									})
								);
								assert.isTrue(
									recorder.recording,
									'toggleState hotkey should work even if recording is off'
								);
							},

							others() {
								recorder.toggleState();
								assert.isFalse(recorder.recording);
								const { method: insertCallback } = mock(
									recorder,
									'insertCallback'
								);
								recorder.setHotkey('insertCallback', {
									key: 'U+002B',
									ctrlKey: true
								});
								recorder.recordEvent(
									createEvent({
										type: 'keydown',
										key: 'Control',
										ctrlKey: true
									})
								);
								recorder.recordEvent(
									createEvent({
										type: 'keydown',
										key: 'U+002B',
										ctrlKey: true
									})
								);
								recorder.recordEvent(
									createEvent({
										type: 'keyup',
										key: 'U+002B',
										ctrlKey: true
									})
								);
								recorder.recordEvent(
									createEvent({
										type: 'keyup',
										key: 'Control',
										ctrlKey: false
									})
								);
								assert.lengthOf(
									insertCallback.calls,
									0,
									'other hotkeys should not do anything when recording is off'
								);
							}
						}
					}
				}
			},

			'#save'() {
				const { URL, remove } = mockBlobAndUrl();
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
					assert.isNull(
						URL.blob,
						'The download callback should revoke the object URL'
					);
				} finally {
					remove();
				}
			},

			'#setFindDisplayed'() {
				devToolsPort.postMessage.clear();
				const eventProxyPort = chrome.createPort('eventProxy');
				chrome.runtime.onConnect.emit(eventProxyPort);
				eventProxyPort.postMessage.clear();

				recorder.setTabId(2);
				recorder.toggleState();

				recorder.setFindDisplayed(true);

				// Expect 4 calls:
				//   setScript for initial suite creation
				//   setScript for initial get
				//   setScript for setSuiteName (from URL in initial get)
				//   setRecording to enable recording
				assert.lengthOf(devToolsPort.postMessage.calls, 4);
				recorder.recordEvent(
					createEvent({
						type: 'mousemove',
						elementX: 12,
						elementY: 23,
						target: 'id("b2")'
					})
				);
				recorder.insertMouseMove();
				recorder.setSuiteName('findDisplayed');
				assertScriptValue(
					devToolsPort,
					testData.findDisplayed,
					'Script should use "findDisplayedByXpath"'
				);

				recorder.clear();
				recorder.setFindDisplayed(false);
				recorder.recordEvent(
					createEvent({ type: 'mousemove', target: 'id("b2")' })
				);
				recorder.insertMouseMove();
				recorder.setSuiteName('mouseMove');
				assertScriptValue(
					devToolsPort,
					testData.mouseMove,
					'Script should use "findByXpath"'
				);
			},

			'#setHotkey'() {
				const expected = { key: 'Foo' };
				devToolsPort.postMessage.clear();
				recorder.setHotkey('insertCallback', expected);
				assert.deepEqual(recorder.hotkeys.insertCallback, expected);
				assert.deepEqual(devToolsPort.postMessage.calls, [
					[
						{
							method: 'setHotkey',
							args: ['insertCallback', expected]
						}
					]
				]);
				const data = storage.getItem('intern.hotkeys')!;
				assert.isString(data);
				const hotkeys = JSON.parse(data);
				assert.deepEqual(hotkeys.insertCallback, expected);
			},

			'#setScript'() {
				devToolsPort.postMessage.clear();
				recorder.setScript('test');
				assert.deepEqual(devToolsPort.postMessage.calls, [
					[{ method: 'setScript', args: ['test'] }]
				]);
			},

			'#setStrategy'() {
				devToolsPort.postMessage.clear();
				const eventProxyPort = chrome.createPort('eventProxy');
				chrome.runtime.onConnect.emit(eventProxyPort);
				eventProxyPort.postMessage.clear();
				recorder.setStrategy('text');
				assert.lengthOf(devToolsPort.postMessage.calls, 0);
				assert.deepEqual(eventProxyPort.postMessage.calls, [
					[{ method: 'setStrategy', args: ['text'] }]
				]);
				assert.throws(function() {
					// Use 'any' here to get TS to let us pass an invalid
					// strategy
					recorder.setStrategy(<any>'invalid');
				}, 'Invalid search strategy');
			},

			'#setTabId'() {
				assert.isNull(recorder.tabId);
				recorder.setTabId(1);
				assert.strictEqual(recorder.tabId, 1);
				// Use 'any' here to get TS to let us pass an invalid
				// tab ID
				recorder.setTabId(<any>null);
				assert.strictEqual(
					recorder.tabId,
					1,
					'null tab IDs should be ignored'
				);
			},

			'#toggleState': {
				'missing tabId': function() {
					assert.throws(function() {
						recorder.toggleState();
					}, 'missing tabId');
				},

				toggle: function() {
					const { method: newTest } = mock(recorder, 'newTest', true);

					recorder.setTabId(1);
					assert.isFalse(recorder.recording);

					recorder.toggleState();
					assert.isTrue(recorder.recording);
					assert.deepEqual(
						chrome.tabs.executeScript.calls,
						[
							[1, { file: 'lib/EventProxy.js', allFrames: true }],
							[1, { file: 'lib/content.js', allFrames: true }]
						],
						'Content scripts should be injected when turning ' +
							'on recording'
					);
					assert.deepEqual(
						newTest.calls,
						[[]],
						'New test should automatically be created when ' +
							'toggling recording for the first time'
					);

					chrome.tabs.executeScript.clear();
					recorder.toggleState();
					assert.isFalse(recorder.recording);
					assert.lengthOf(
						chrome.tabs.executeScript.calls,
						0,
						'Content scripts should not be injected when ' +
							'turning off recording'
					);
					recorder.toggleState();
					assert.isTrue(recorder.recording);
					assert.deepEqual(
						newTest.calls,
						[[]],
						'New test should not automatically be created when toggling recording a second time'
					);
				}
			}
		}
	};
});
