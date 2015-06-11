define(function (require) {
	var assert = require('intern/chai!assert');
	var createMockMethod = require('../support/util').createMockMethod;
	var lang = require('dojo/lang');
	var mock = require('../support/util').mock;
	var mockChromeApi = require('../support/mockChromeApi');
	var mockDomApi = require('../support/mockDomApi');
	var registerSuite = require('intern!object');
	var RecorderProxy = require('RecorderProxy');

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
		var recordButton;
		var recorderProxy;
		var window;

		return {
			name: 'RecorderProxy',

			beforeEach: function () {
				chrome = mockChromeApi.createChrome();
				window = mockDomApi.createWindow();
				recordButton = mockChromeApi.createButton();
				recorderProxy = new RecorderProxy(chrome, window, recordButton);
				devToolsPort = recorderProxy._port;
			},

			teardown: function () {
				chrome = window = recorderProxy = devToolsPort = null;
			},

			'port communication': function () {
				assert.deepEqual(devToolsPort.postMessage.calls, [
					[ { method: 'setTabId', args: [ 1692485 ] } ]
				], 'The proxy should send the currently inspected tab ID to the recorder immediately upon creation');

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

			'#send': function () {
				devToolsPort.postMessage.clear();
				recorderProxy.send('test', [ 'arg1', 'argN' ]);
				assert.deepEqual(devToolsPort.postMessage.calls, [
					[ { method: 'test', args: [ 'arg1', 'argN' ] } ]
				]);
			},

			'#setHotkey': function () {
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

				var macWindow = mockDomApi.createWindow('MacIntel');
				var macRecorderProxy = new RecorderProxy(mockChromeApi.createChrome(), macWindow);

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

			'#setRecording': function () {
				assert.isFalse(recorderProxy.recording);
				recorderProxy.setRecording(true);
				assert.isTrue(recorderProxy.recording);
				assert.deepEqual(recordButton.update.calls, [
					[ 'statusBarIcons/record_on.png' ]
				]);
				recordButton.update.clear();
				recorderProxy.setRecording(false);
				assert.isFalse(recorderProxy.recording);
				assert.deepEqual(recordButton.update.calls, [
					[ 'statusBarIcons/record_off.png' ]
				]);
			},

			'#setScript': function () {
				recorderProxy.setScript('test');
				recorderProxy.setScript(null);
				assert.strictEqual(window.document.getElementById('script').value, 'test');
			}
		};
	});
});
