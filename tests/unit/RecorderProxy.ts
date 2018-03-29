import { mock } from '../support/util';
import MockChrome, { Button, Panel, Port } from '../support/mockChromeApi';
import MockWindow, { Event } from '../support/mockDomApi';
import { createMockMethod, Method } from '../support/util';
import RecorderProxy from '../../src/RecorderProxy';

const { assert } = intern.getPlugin('chai');
const { registerSuite } = intern.getPlugin('interface.object');

const hotkeyIds = ['insertCallback', 'insertMouseMove', 'toggleState'];

interface TestEvent extends Event {
	preventDefault: Method<() => void>;
}

function createEvent(event: { key: string; [key: string]: any }): TestEvent {
	if (!event || !event.key) {
		throw new Error(
			'At least "key" is required to generate an event object'
		);
	}

	return Object.assign(
		{
			type: 'keyboard',
			altKey: false,
			ctrlKey: false,
			metaKey: false,
			preventDefault: createMockMethod(),
			shiftKey: false
		},
		event
	);
}

registerSuite('RecorderProxy', () => {
	let chrome: MockChrome;
	let devToolsPort: Port;
	let recorderProxy: RecorderProxy;
	let panel: Panel;
	let window: MockWindow;

	return {
		beforeEach() {
			chrome = new MockChrome();
			window = new MockWindow('');
			panel = chrome.createPanel();
			recorderProxy = new RecorderProxy(chrome, panel);
			panel.onShown.emit(window);

			// The recorderProxy's port will be a Port because it's coming from
			// the mock chrome
			devToolsPort = <Port>recorderProxy._port!;
		},

		after() {
			chrome = window = recorderProxy = devToolsPort = <any>null;
		},

		tests: {
			'port communication'() {
				// TODO: Chai needs a deepInclude
				assert.deepEqual(
					devToolsPort.postMessage.calls[0],
					[{ method: 'setTabId', args: [1692485] }],
					'The proxy should send the currently inspected tab ID ' +
						'to the recorder immediately upon creation'
				);

				assert.throws(function() {
					devToolsPort.onMessage.emit({ method: 'not-a-method' });
				}, 'Method "not-a-method" does not exist');

				const { method: setHotkey } = mock(recorderProxy, 'setHotkey');
				devToolsPort.onMessage.emit({
					method: 'setHotkey',
					args: ['foo']
				});
				devToolsPort.onMessage.emit({ method: 'setHotkey' });
				assert.deepEqual(
					setHotkey.calls,
					[['foo'], []],
					'Valid calls from communication port should be executed on the proxy'
				);
			},

			'listener setup': function() {
				hotkeyIds.forEach(function(id) {
					const input = window.document.getElementById(
						'hotkey-' + id
					)!;
					assert.isFunction(input.onkeydown);
				});

				const strategy = window.document.getElementById(
					'option-strategy'
				)!;
				assert.isFunction(strategy.onchange);

				const findDisplayed = window.document.getElementById(
					'option-findDisplayed'
				)!;
				assert.isFunction(findDisplayed.onchange);
			},

			'button communication': function() {
				const { method: send } = mock(recorderProxy, 'send');

				panel.buttons.forEach(function(button) {
					button.onClicked.emit();
				});

				assert.deepEqual(send.calls, [
					['toggleState'],
					['clear'],
					['newTest'],
					['save']
				]);
			},

			'hide and show': function() {
				const { method: send } = mock(recorderProxy, 'send');

				panel.onHidden.emit();
				panel.onShown.emit(window);
				assert.deepEqual(send.calls, [['refreshUi']]);

				recorderProxy.setRecording(true);
				assert.isTrue(recorderProxy.recording);

				send.clear();
				panel.onHidden.emit();
				assert.deepEqual(send.calls, [['toggleState']]);

				send.clear();
				panel.onShown.emit(window);
				assert.deepEqual(send.calls, [['toggleState'], ['refreshUi']]);
			},

			'hotkey set': function() {
				const { method: send } = mock(recorderProxy, 'send');

				hotkeyIds.forEach(function(id) {
					send.clear();

					const input = window.document.getElementById(
						'hotkey-' + id
					)!;
					assert.isFunction(input.onkeydown);

					const key = {
						altKey: false,
						ctrlKey: false,
						key: 'U+0045',
						metaKey: false,
						shiftKey: true
					};

					const event = createEvent(key);
					input.onkeydown!(event);

					assert.lengthOf(event.preventDefault.calls, 1);

					assert.deepEqual(send.calls, [['setHotkey', [id, key]]]);
				});
			},

			'script set': function() {
				recorderProxy.setScript('test');
				const script = window.document.getElementById('script');
				assert.deepEqual(script!.innerHTML, 'test');
			},

			'strategy set': function() {
				const { method: send } = mock(recorderProxy, 'send');

				recorderProxy.setScript('test');

				window.document.getElementById('option-strategy')!.onchange!(
					<any>{ target: { value: 'test' } }
				);
				assert.deepEqual(send.calls, [['setStrategy', ['test']]]);
			},

			'findDisplayed set': function() {
				const { method: send } = mock(recorderProxy, 'send');

				recorderProxy.setScript('test');

				window.document.getElementById('option-findDisplayed')!
					.onchange!(<any>{ target: { checked: true } });
				assert.deepEqual(send.calls, [['setFindDisplayed', [true]]]);
			},

			'hidden panel': function() {
				const inactiveRecorderProxy = new RecorderProxy(
					<any>chrome,
					<any>panel
				);
				assert.doesNotThrow(function() {
					inactiveRecorderProxy.setScript('test');
					inactiveRecorderProxy.setStrategy(<any>'test');
					inactiveRecorderProxy.setFindDisplayed(true);
					inactiveRecorderProxy.setHotkey('insertCallback', {
						key: 'U+0045'
					});
				}, 'Setting properties for the UI without an active panel should be a no-op');
			},

			'#send': function() {
				devToolsPort.postMessage.clear();
				recorderProxy.send('test', ['arg1', 'argN']);
				assert.deepEqual(devToolsPort.postMessage.calls, [
					[{ method: 'test', args: ['arg1', 'argN'] }]
				]);
			},

			'#setFindDisplayed': function() {
				recorderProxy.setFindDisplayed(true);
				assert.strictEqual(
					window.document.getElementById('option-findDisplayed')!
						.checked,
					true
				);
			},

			'#setHotkey': {
				'basic tests': function() {
					const testKeys = [
						{
							id: 'insertCallback',
							key: {
								altKey: true,
								metaKey: true,
								ctrlKey: true,
								shiftKey: true,
								key: 'U+0045'
							},
							others: 'Ctrl+Alt+Shift+Win+E',
							mac: '^⌥⇧⌘E'
						},
						{
							id: 'insertMouseMove',
							key: { shiftKey: true, key: 'U+0021' },
							others: '!',
							mac: '!'
						},
						{
							id: 'toggleState',
							key: { ctrlKey: true, key: 'U+0009' },
							others: 'Ctrl+Tab',
							mac: '^↹'
						},
						{
							id: 'insertCallback',
							key: { shiftKey: true, key: 'Home' },
							others: 'Shift+Home',
							mac: '⇧Home'
						},
						{
							id: 'insertCallback',
							key: { shiftKey: true, key: 'Shift' },
							others: 'Shift+',
							mac: '⇧'
						}
					];

					const macPanel = chrome.createPanel();
					const macWindow = new MockWindow('MacIntel');
					const macChrome = new MockChrome();
					const macRecorderProxy = new RecorderProxy(
						<any>macChrome,
						<any>macPanel
					);
					macPanel.onShown.emit(macWindow);

					testKeys.forEach(function(key) {
						recorderProxy.setHotkey(key.id, key.key);
						macRecorderProxy.setHotkey(key.id, key.key);
						assert.strictEqual(
							window.document.getElementById('hotkey-' + key.id)!
								.value,
							key.others
						);
						assert.strictEqual(
							macWindow.document.getElementById(
								'hotkey-' + key.id
							)!.value,
							key.mac
						);
					});

					assert.throws(function() {
						recorderProxy.setHotkey('invalid', <any>{});
					}, 'missing input for hotkey "invalid"');
				},

				'crbug 48111': function() {
					recorderProxy.setHotkey('insertCallback', {
						key: 'U+00C0'
					});
					assert.strictEqual(
						window.document.getElementById('hotkey-insertCallback')!
							.value,
						'`'
					);
					recorderProxy.setHotkey('insertCallback', {
						shiftKey: true,
						key: 'U+00C0'
					});
					assert.strictEqual(
						window.document.getElementById('hotkey-insertCallback')!
							.value,
						'~'
					);
				}
			},

			'#setRecording': function() {
				const recordButton: Button = <any>recorderProxy._recordButton!;

				assert.isFalse(recorderProxy.recording);
				recorderProxy.setRecording(true);
				assert.isTrue(recorderProxy.recording);
				assert.deepEqual(recordButton.update.calls, [
					['resources/statusBarIcons/record_on.png']
				]);
				recordButton.update.clear();
				recorderProxy.setRecording(false);
				assert.isFalse(recorderProxy.recording);
				assert.deepEqual(recordButton.update.calls, [
					['resources/statusBarIcons/record_off.png']
				]);
			},

			'#setScript': function() {
				recorderProxy.setScript('test');
				// Setting script to null should have no effect
				recorderProxy.setScript(<any>null);
				assert.strictEqual(
					window.document.getElementById('script')!.innerHTML,
					'test'
				);
			},

			'#setStrategy': function() {
				recorderProxy.setStrategy('xpath');
				assert.strictEqual(
					window.document.getElementById('option-strategy')!.value,
					'xpath'
				);
			},

			'#setCustomAttribute': function() {
				recorderProxy.setCustomAttribute('foo');
				assert.strictEqual(
					window.document.getElementById('option-custom-attribute')!
						.value,
					'foo'
				);
			}
		}
	};
});
