define(function (require) {
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

	function createMockMethod(impl) {
		var method = function () {
			method.calls.push(Array.prototype.slice.call(arguments, 0));
			if (impl) {
				return impl.apply(this, arguments);
			}
		};
		method.calls = [];
		method.clear = function () {
			method.calls.splice(0, Infinity);
		};
		return method;
	}

	return {
		createChrome: function () {
			return {
				downloads: {
					download: createMockMethod()
				},

				runtime: {
					onConnect: createListener()
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
});
