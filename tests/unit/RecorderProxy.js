define(function (require) {
	var assert = require('intern/chai!assert');
	var createMockMethod = require('../support/util').createMockMethod;
	var lang = require('dojo/lang');
	var mock = require('../support/util').mock;
	var mockChromeApi = require('../support/mockChromeApi');
	var mockDomApi = require('../support/mockDomApi');
	var registerSuite = require('intern!object');
	var RecorderProxy = require('RecorderProxy');

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
		var recorderProxy;
		var window;

		return {
			name: 'RecorderProxy',

			beforeEach: function () {
				chrome = mockChromeApi.createChrome();
				window = mockDomApi.createWindow();
				recorderProxy = new RecorderProxy(chrome, window);
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

			'hotkey listener setup': function () {
				[ 'insertCallback', 'insertMouseMove', 'toggleState' ].forEach(function (id) {
					var input = window.document.getElementById('hotkey-' + id);
					assert.isFunction(input.onkeydown);
				});
			},

			'hotkey set': function () {
				mock(recorderProxy, 'send');

				[ 'insertCallback', 'insertMouseMove', 'toggleState' ].forEach(function (id) {
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


		};
	});
});
