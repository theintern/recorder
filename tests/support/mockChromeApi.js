define(function (require) {
	var createMockMethod = require('./util').createMockMethod;
	var lang = require('dojo/lang');

	function createListener() {
		var listeners = [];

		return {
			addListener: function (callback) {
				listeners.push(callback);
			},
			emit: function () {
				var self = this;
				var args = arguments;
				listeners.forEach(function (listener) {
					listener.apply(self, args);
				});
			},
			removeListener: function (callback) {
				lang.pullFromArray(listeners, callback);
			}
		};
	}

	var chrome = {
		createChrome: function () {
			return {
				devtools: {
					inspectedWindow: {
						tabId: 1692485
					}
				},

				downloads: {
					download: createMockMethod()
				},

				runtime: {
					id: 'mock',
					onConnect: createListener(),
					connect: function (id, options) {
						return chrome.createPort(options.name);
					}
				},

				webNavigation: {
					onCommitted: createListener(),
					onReferenceFragmentUpdated: createListener(),
					onHistoryStateUpdated: createListener()
				},

				tabs: {
					executeScript: createMockMethod(),
					get: createMockMethod(function (tabId, callback) {
						var tabs = {
							1: { url: 'http://example.com' }
						};
						callback(tabs[tabId]);
					})
				}
			};
		},

		createButton: function () {
			return {
				onClicked: createListener(),
				update: createMockMethod()
			};
		},

		createPort: function (name) {
			return {
				name: name,
				disconnect: createMockMethod(),
				onDisconnect: createListener(),
				onMessage: createListener(),
				postMessage: createMockMethod()
			};
		}
	};

	return chrome;
});
