define(function (require) {
	var createMockMethod = require('./util').createMockMethod;
	var lang = require('dojo/lang');

	function createMockDocument() {
		function getBoundingClientRect() {
			return { top: 0, left: 0 };
		}

		var elements = {};

		var document = createListener();
		document.documentElement = {
			getBoundingClientRect: getBoundingClientRect,
			nodeName: 'HTML',
			parentNode: document,
			tagName: 'HTML'
		};
		document.body = {
			getBoundingClientRect: getBoundingClientRect,
			nodeName: 'BODY',
			parentNode: document.documentElement,
			previousElementSibling: {
				getBoundingClientRect: getBoundingClientRect,
				nodeName: 'HEAD',
				parentNode: document.documentElement,
				tagName: 'HEAD'
			},
			tagName: 'BODY'
		};
		document.elementsFromPoint = function () {
			return [ document.body, document.documentElement ];
		};
		document.evaluate = createMockMethod(function (text, element) {
			var i = 0;
			return {
				iterateNext: function () {
					if (text.indexOf('SINGLE') > -1 && i > 0) {
						return null;
					}

					++i;
					return {};
				},
				stringValue: element.stringValue
			};
		});
		document.getElementById = function (id) {
			if (id.indexOf('invalid') > -1) {
				return null;
			}

			if (!elements[id]) {
				elements[id] = { value: '' };
			}

			return elements[id];
		};
		return document;
	}

	function createListener() {
		var listenerMap = {};

		return {
			addEventListener: function (eventName, listener) {
				var listeners = listenerMap[eventName];
				if (!listeners) {
					listeners = listenerMap[eventName] = [];
				}
				listeners.push(listener);
			},
			dispatchEvent: function (event) {
				var self = this;
				var listeners = listenerMap[event.type];

				if (!listeners) {
					return;
				}

				listeners.forEach(function (listener) {
					event.currentTarget = self;
					listener.call(self, event);
				});
			},
			removeEventListener: function (eventName, callback) {
				var listeners = listenerMap[eventName];
				if (listeners) {
					lang.pullFromArray(listeners, callback);
				}
			}
		};
	}

	return {
		createWindow: function createWindow(platform, isChildWindow) {
			var window = createListener();
			window.document = createMockDocument();
			window.navigator = {
				platform: platform
			};
			window.postMessage = createMockMethod();
			window.XPathResult = {
				ANY_TYPE: 0,
				NUMBER_TYPE: 1,
				STRING_TYPE: 2,
				BOOLEAN_TYPE: 3,
				UNORDERED_NODE_ITERATOR_TYPE: 4,
				ORDERED_NODE_ITERATOR_TYPE: 5,
				UNORDERED_NODE_SNAPSHOT_TYPE: 6,
				ORDERED_NODE_SNAPSHOT_TYPE: 7,
				ANY_UNORDERED_NODE_TYPE: 8,
				FIRST_ORDERED_NODE_TYPE: 9
			};

			if (isChildWindow) {
				window.parent = window.top = createWindow();
			}
			else {
				window.parent = window.top = window;
			}

			return window;
		}
	};
});
