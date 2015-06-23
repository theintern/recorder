define(function (require) {
	var assert = require('intern/chai!assert');
	var createMockMethod = require('../support/util').createMockMethod;
	var lang = require('dojo/lang');
	var mock = require('../support/util').mock;
	var mockChromeApi = require('../support/mockChromeApi');
	var mockDomApi = require('../support/mockDomApi');
	var registerSuite = require('intern!object');
	var RecorderProxy = require('lib/RecorderProxy');

	var hotkeyIds = [ 'insertCallback', 'insertMouseMove', 'toggleState' ];

	function createEvent(event) {
		if (!event || !event.keyIdentifier) {
			throw new Error('At least "keyIdentifier" is required to generate an event object');
		}

		return lang.mixin({
			altKey: false,
			ctrlKey: false,
			metaKey: false,
			preventDefault: createMockMethod(),
			shiftKey: false
		}, event);
	}

	registerSuite(function () {
		var chrome;
		var devToolsPort;
		var panel;
		var recorderProxy;
		var window;

		return {
			name: 'RecorderProxy',

			beforeEach: function () {
				chrome = mockChromeApi.createChrome();
				window = mockDomApi.createWindow();
				panel = mockChromeApi.createPanel();
				recorderProxy = new RecorderProxy(chrome, panel);
				panel.onShown.emit(window);
				devToolsPort = recorderProxy._port;
			},

			teardown: function () {
				chrome = window = recorderProxy = devToolsPort = null;
			},

			'port communication': function () {
				// TODO: Chai needs a deepInclude
				assert.deepEqual(devToolsPort.postMessage.calls[0],
					[ { method: 'setTabId', args: [ 1692485 ] } ],
					'The proxy should send the currently inspected tab ID to the recorder immediately upon creation');

				assert.throws(function () {
					devToolsPort.onMessage.emit({ method: 'not-a-method' });
				}, 'Method "not-a-method" does not exist');

				mock(recorderProxy, 'setHotkey');
				devToolsPort.onMessage.emit({ method: 'setHotkey', args: [ 'foo' ] });
				devToolsPort.onMessage.emit({ method: 'setHotkey' });
				assert.deepEqual(recorderProxy.setHotkey.calls, [
					[ 'foo' ],
					[]
				], 'Valid calls from communication port should be executed on the proxy');
			},

			'listener setup': function () {
				hotkeyIds.forEach(function (id) {
					var input = window.document.getElementById('hotkey-' + id);
					assert.isFunction(input.onkeydown);
				});

				var script = window.document.getElementById('script');
				assert.isFunction(script.oninput);

				var strategy = window.document.getElementById('option-strategy');
				assert.isFunction(strategy.onchange);
			},

			'button communication': function () {
				mock(recorderProxy, 'send');

				panel.buttons.forEach(function (button) {
					button.onClicked.emit();
				});

				assert.deepEqual(recorderProxy.send.calls, [
					[ 'toggleState' ],
					[ 'clear' ],
					[ 'newTest' ],
					[ 'save' ]
				]);
			},

			'hide and show': function () {
				mock(recorderProxy, 'send');

				panel.onHidden.emit();
				panel.onShown.emit(window);
				assert.deepEqual(recorderProxy.send.calls, [
					[ 'refreshUi' ]
				]);

				recorderProxy.setRecording(true);
				assert.isTrue(recorderProxy.recording);

				recorderProxy.send.clear();
				panel.onHidden.emit();
				assert.deepEqual(recorderProxy.send.calls, [
					[ 'toggleState' ]
				]);

				recorderProxy.send.clear();
				panel.onShown.emit(window);
				assert.deepEqual(recorderProxy.send.calls, [
					[ 'toggleState' ],
					[ 'refreshUi' ]
				]);
			},

			'hotkey set': function () {
				mock(recorderProxy, 'send');

				hotkeyIds.forEach(function (id) {
					recorderProxy.send.clear();

					var input = window.document.getElementById('hotkey-' + id);
					assert.isFunction(input.onkeydown);

					var key = {
						altKey: false,
						ctrlKey: false,
						keyIdentifier: 'U+0045',
						metaKey: false,
						shiftKey: true
					};

					var event = createEvent(key);
					input.onkeydown(event);

					assert.lengthOf(event.preventDefault.calls, 1);

					assert.deepEqual(recorderProxy.send.calls, [
						[ 'setHotkey', [ id, key ] ]
					]);
				});
			},

			'script set': function () {
				mock(recorderProxy, 'send');

				recorderProxy.setScript('test');

				var event = createEvent({ keyIdentifier: 'U+0020' });
				window.document.getElementById('script').oninput(event);
				assert.deepEqual(recorderProxy.send.calls, [
					[ 'setScript', [ 'test' ] ]
				]);
			},

			'strategy set': function () {
				mock(recorderProxy, 'send');

				recorderProxy.setScript('test');

				window.document.getElementById('option-strategy').onchange({ target: { value: 'test' } });
				assert.deepEqual(recorderProxy.send.calls, [
					[ 'setStrategy', [ 'test' ] ]
				]);
			},

			'hidden panel': function () {
				var inactiveRecorderProxy = new RecorderProxy(chrome, panel);
				assert.doesNotThrow(function () {
					inactiveRecorderProxy.setScript('test');
					inactiveRecorderProxy.setStrategy('test');
					inactiveRecorderProxy.setHotkey('insertCallback', { keyIdentifier: 'U+0045' });
				}, 'Setting properties for the UI without an active panel should be a no-op');
			},

			'#send': function () {
				devToolsPort.postMessage.clear();
				recorderProxy.send('test', [ 'arg1', 'argN' ]);
				assert.deepEqual(devToolsPort.postMessage.calls, [
					[ { method: 'test', args: [ 'arg1', 'argN' ] } ]
				]);
			},

			'#setHotkey': {
				'basic tests': function () {
					var testKeys = [
						{
							id: 'insertCallback',
							key: { altKey: true, metaKey: true, ctrlKey: true, shiftKey: true, keyIdentifier: 'U+0045' },
							others: 'Ctrl+Alt+Shift+Win+E',
							mac: '^⌥⇧⌘E'
						},
						{
							id: 'insertMouseMove',
							key: { shiftKey: true, keyIdentifier: 'U+0021' },
							others: '!',
							mac: '!'
						},
						{
							id: 'toggleState',
							key: { ctrlKey: true, keyIdentifier: 'U+0009' },
							others: 'Ctrl+Tab',
							mac: '^↹'
						},
						{
							id: 'insertCallback',
							key: { shiftKey: true, keyIdentifier: 'Home' },
							others: 'Shift+Home',
							mac: '⇧Home'
						},
						{
							id: 'insertCallback',
							key: { shiftKey: true, keyIdentifier: 'Shift' },
							others: 'Shift+',
							mac: '⇧'
						}
					];

					var macPanel = mockChromeApi.createPanel();
					var macWindow = mockDomApi.createWindow('MacIntel');
					var macRecorderProxy = new RecorderProxy(mockChromeApi.createChrome(), macPanel);
					macPanel.onShown.emit(macWindow);

					testKeys.forEach(function (key) {
						recorderProxy.setHotkey(key.id, key.key);
						macRecorderProxy.setHotkey(key.id, key.key);
						assert.strictEqual(window.document.getElementById('hotkey-' + key.id).value, key.others);
						assert.strictEqual(macWindow.document.getElementById('hotkey-' + key.id).value, key.mac);
					});

					assert.throws(function () {
						recorderProxy.setHotkey('invalid', {});
					}, 'missing input for hotkey "invalid"');
				},

				'crbug 48111': function () {
					recorderProxy.setHotkey('insertCallback', { keyIdentifier: 'U+00C0' });
					assert.strictEqual(window.document.getElementById('hotkey-insertCallback').value, '`');
					recorderProxy.setHotkey('insertCallback', { shiftKey: true, keyIdentifier: 'U+00C0' });
					assert.strictEqual(window.document.getElementById('hotkey-insertCallback').value, '~');
				}
			},

			'#setRecording': function () {
				var recordButton = recorderProxy._recordButton;

				assert.isFalse(recorderProxy.recording);
				recorderProxy.setRecording(true);
				assert.isTrue(recorderProxy.recording);
				assert.deepEqual(recordButton.update.calls, [
					[ 'resources/statusBarIcons/record_on.png' ]
				]);
				recordButton.update.clear();
				recorderProxy.setRecording(false);
				assert.isFalse(recorderProxy.recording);
				assert.deepEqual(recordButton.update.calls, [
					[ 'resources/statusBarIcons/record_off.png' ]
				]);
			},

			'#setScript': function () {
				recorderProxy.setScript('test');
				recorderProxy.setScript(null);
				assert.strictEqual(window.document.getElementById('script').value, 'test');
			},

			'#setStrategy': function () {
				recorderProxy.setStrategy('xpath');
				assert.strictEqual(window.document.getElementById('option-strategy').value, 'xpath');
			}
		};
	});
});
