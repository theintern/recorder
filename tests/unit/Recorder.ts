import { mock } from '../support/util';
import MockChrome, { Port } from '../support/mockChromeApi';
import MockStorage from '../support/mockStorageApi';
import Recorder, {
	HotKeys,
	RecorderEvent,
	RecorderMouseEvent,
	RecorderKeyboardEvent
} from '../../src/Recorder';
import * as BlankText from '../data/output/blank.txt';
import * as CallbackText from '../data/output/callback.txt';
import * as ClickText from '../data/output/click.txt';
import * as DoubleClickText from '../data/output/doubleClick.txt';
import * as DragText from '../data/output/drag.txt';
import * as FindDisplayedText from '../data/output/findDisplayed.txt';
import * as FrameText from '../data/output/frame.txt';
import * as HotkeyText from '../data/output/hotkey.txt';
import * as MouseMoveText from '../data/output/mouseMove.txt';
import * as NavigationText from '../data/output/navigation.txt';
import * as NewTestText from '../data/output/newTest.txt';
import * as TypeText from '../data/output/type.txt';

const { assert } = intern.getPlugin('chai');
const { registerSuite } = intern.getPlugin('interface.object');

const testData = {
	blank: BlankText,
	callback: CallbackText,
	click: ClickText,
	doubleClick: DoubleClickText,
	drag: DragText,
	findDisplayed: FindDisplayedText,
	frame: FrameText,
	hotkey: HotkeyText,
	mouseMove: MouseMoveText,
	navigation: NavigationText,
	newTest: NewTestText,
	type: TypeText
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
				assertScriptValue(devToolsPort, testData.callback);
			},

			'#insertMouseMove'() {
				recorder.setTabId(1);
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
				recorder.recordEvent(createEvent({ type: 'mousemove' }));
				recorder.insertMouseMove();
				assertScriptValue(devToolsPort, testData.mouseMove);
			},

			navigation() {
				recorder.setTabId(1);
				recorder.toggleState();
				// to test target reset on navigation
				recorder.recordEvent(
					createEvent({ type: 'mousedown', buttons: 1 })
				);
				recorder.recordEvent(createEvent({ type: 'mouseup' }));
				recorder.recordEvent(createEvent({ type: 'click' }));
				// should be ignored due to tab mismatch
				chrome.webNavigation.onCommitted.emit({
					tabId: 2,
					frameId: 0,
					transitionType: 'reload',
					transitionQualifiers: ['from_address_bar'],
					url: 'http://example.com'
				});
				// should be ignored due to frameId mismatch
				chrome.webNavigation.onCommitted.emit({
					tabId: 1,
					frameId: 1,
					transitionType: 'reload',
					transitionQualifiers: ['from_address_bar'],
					url: 'http://example.com'
				});
				chrome.webNavigation.onCommitted.emit({
					tabId: 1,
					frameId: 0,
					transitionType: 'reload',
					transitionQualifiers: ['from_address_bar'],
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
					transitionQualifiers: ['forward_back', 'from_address_bar'],
					url: 'http://example.com'
				});
				chrome.webNavigation.onReferenceFragmentUpdated.emit({
					tabId: 1,
					frameId: 0,
					transitionType: 'link',
					transitionQualifiers: ['forward_back'],
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
					transitionQualifiers: ['from_address_bar'],
					url: 'http://2.example'
				});
				assertScriptValue(devToolsPort, testData.navigation);
			},

			'#newTest': {
				'missing tabId': function() {
					assert.throws(function() {
						recorder.newTest();
					}, 'missing tabId');
				},
				'multiple tests': function() {
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
							buttons: 1
						})
					);
					recorder.recordEvent(
						createEvent({ type: 'mouseup', targetFrame: [0] })
					);
					recorder.recordEvent(
						createEvent({ type: 'click', targetFrame: [0] })
					);
					recorder.newTest();
					recorder.insertCallback();
					assertScriptValue(devToolsPort, testData.newTest);
				}
			},

			'#recordEvent': {
				beforeEach: function() {
					recorder.setTabId(1);
					recorder.toggleState();
				},
				tests: {
					'not recording': function() {
						recorder.toggleState();
						assert.isFalse(recorder.recording);
						recorder.recordEvent(
							createEvent({ type: 'mousemove' })
						);
						assertScriptValue(devToolsPort, testData.blank);
					},
					click: function() {
						recorder.recordEvent(
							createEvent({ type: 'mousemove' })
						);
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
						assertScriptValue(devToolsPort, testData.click);
					},
					'double click': function() {
						recorder.recordEvent(
							createEvent({ type: 'mousemove' })
						);
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
						assertScriptValue(devToolsPort, testData.doubleClick);
					},
					drag: function() {
						recorder.recordEvent(
							createEvent({
								type: 'mousemove',
								elementX: 0,
								elementY: 0
							})
						);
						recorder.recordEvent(
							createEvent({
								type: 'mousedown',
								elementX: 0,
								elementY: 0,
								buttons: 1
							})
						);
						recorder.recordEvent(
							createEvent({
								type: 'mousemove',
								elementX: 20,
								elementY: 20,
								buttons: 1
							})
						);
						recorder.recordEvent(
							createEvent({
								type: 'mouseup',
								target: '/HTML/BODY[1]',
								elementX: 40,
								elementY: 40
							})
						);
						assertScriptValue(devToolsPort, testData.drag);
					},
					frame: function() {
						recorder.recordEvent(
							createEvent({
								type: 'mousemove',
								targetFrame: [1, 2]
							})
						);
						recorder.recordEvent(
							createEvent({
								type: 'mousedown',
								targetFrame: [1, 2],
								buttons: 1
							})
						);
						recorder.recordEvent(
							createEvent({
								type: 'mouseup',
								targetFrame: [1, 2],
								target: '/HTML/BODY[1]'
							})
						);
						recorder.recordEvent(
							createEvent({ type: 'click', targetFrame: [1, 2] })
						);
						recorder.recordEvent(
							createEvent({
								type: 'mousemove',
								targetFrame: [1, 3]
							})
						);
						recorder.recordEvent(
							createEvent({
								type: 'mousedown',
								targetFrame: [1, 3],
								buttons: 1
							})
						);
						recorder.recordEvent(
							createEvent({
								type: 'mouseup',
								targetFrame: [1, 3],
								target: '/HTML/BODY[1]'
							})
						);
						recorder.recordEvent(
							createEvent({ type: 'click', targetFrame: [1, 3] })
						);
						assertScriptValue(devToolsPort, testData.frame);
					},
					type: function() {
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
						assertScriptValue(devToolsPort, testData.type);
					},
					hotkey: {
						'with other keypresses': function() {
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
							assertScriptValue(devToolsPort, testData.hotkey);
						},
						'with no other keypresses': function() {
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
						'modifier-free hotkeys': function() {
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
								createEvent({ type: 'keydown', key: 'Home' })
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
							toggleState: function() {
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
							others: function() {
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
				recorder.setTabId(1);
				recorder.toggleState();
				recorder.setFindDisplayed(true);
				assert.lengthOf(devToolsPort.postMessage.calls, 3);
				recorder.recordEvent(createEvent({ type: 'mousemove' }));
				recorder.insertMouseMove();
				assertScriptValue(
					devToolsPort,
					testData.findDisplayed,
					'Script should use "findDisplayedByXpath"'
				);
				recorder.clear();
				recorder.setFindDisplayed(false);
				recorder.recordEvent(createEvent({ type: 'mousemove' }));
				recorder.insertMouseMove();
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
