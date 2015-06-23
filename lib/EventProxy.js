(typeof define === 'function' && define.amd ? define : /* istanbul ignore next */ function (factory) {
	this.EventProxy = factory();
})(function () {
	var EVENT_TYPES = 'click dblclick mousedown mouseup mousemove keydown keyup'.split(' ');

	function EventProxy(window, document, chrome) {
		this.window = window;
		this.document = document;
		this.chrome = chrome;
		this.lastMouseDown = {};
	}

	EventProxy.prototype = {
		constructor: EventProxy,

		getTarget: null,

		port: null,

		connect: function () {
			var self = this;
			var sendEvent = function () {
				return self.sendEvent.apply(self, arguments);
			};
			var passEvent = function () {
				return self.passEvent.apply(self, arguments);
			};

			this.window.addEventListener('message', passEvent, false);
			EVENT_TYPES.forEach(function (eventType) {
				self.document.addEventListener(eventType, sendEvent, true);
			});

			if (this.port) {
				this.port.disconnect();
			}

			this.port = this.chrome.runtime.connect(this.chrome.runtime.id, { name: 'eventProxy' });
			this.port.onDisconnect.addListener(function disconnect() {
				self.port.onDisconnect.removeListener(disconnect);
				EVENT_TYPES.forEach(function (eventType) {
					self.document.removeEventListener(eventType, sendEvent, true);
				});
				self.window.removeEventListener('message', passEvent, false);
				self.port = null;
			});
			this.port.onMessage.addListener(function (message) {
				if (!self[message.method]) {
					throw new Error('Method "' + message.method + '" does not exist on RecorderProxy');
				}

				self[message.method].apply(self, message.args || []);
			});
		},

		getElementTextPath: function (element) {
			var tagPrefix = '//' + element.nodeName;

			var textValue = this.document.evaluate(
				'normalize-space(string())',
				element,
				null,
				this.window.XPathResult.STRING_TYPE,
				null
			).stringValue;

			var path = '[normalize-space(string())="' + textValue.replace(/"/g, '&quot;') + '"]';

			var matchingElements = this.document.evaluate(
				tagPrefix + path,
				this.document,
				null,
				this.window.XPathResult.UNORDERED_NODE_ITERATOR_TYPE,
				null
			);

			matchingElements.iterateNext();
			var matchesMultipleElements = Boolean(matchingElements.iterateNext());

			if (matchesMultipleElements) {
				// ignoring IDs because when the text strategy is being used it typically means that IDs are not
				// deterministic
				path = this.getElementXPath(element, true) + path;
			}
			else {
				path = tagPrefix + path;
			}

			return path;
		},

		getElementXPath: function (element, ignoreId) {
			var path = [];

			do {
				if (element.id && !ignoreId) {
					path.unshift('id("' + element.id + '")');

					// No need to continue to ascend since we found a unique root
					break;
				}
				else if (element.parentNode) {
					var nodeName = element.nodeName;
					var hasNamedSiblings = Boolean(element.previousElementSibling || element.nextElementSibling);
					// XPath is 1-indexed
					var index = 1;
					var sibling = element;

					if (hasNamedSiblings) {
						while ((sibling = sibling.previousElementSibling)) {
							if (sibling.nodeName === nodeName) {
								++index;
							}
						}

						path.unshift(nodeName + '[' + index + ']');
					}
					else {
						path.unshift(nodeName);
					}
				}
				// The root node
				else {
					path.unshift('');
				}
			} while ((element = element.parentNode));

			return path.join('/');
		},

		passEvent: function (event) {
			if (!event.data || event.data.method !== 'recordEvent' || !event.data.detail) {
				return;
			}

			var detail = event.data.detail;

			for (var i = 0; i < this.window.frames.length; ++i) {
				if (event.source === this.window.frames[i]) {
					detail.targetFrame.unshift(i);
					break;
				}
			}

			this.send(detail);
		},

		send: function (detail) {
			if (this.window !== this.window.top) {
				this.window.parent.postMessage({
					method: 'recordEvent',
					detail: detail
				}, '*');
			}
			else {
				this.port.postMessage({
					method: 'recordEvent',
					args: [ detail ]
				});
			}
		},

		sendEvent: function (event) {
			var lastMouseDown = this.lastMouseDown;

			if (event.type === 'mousedown') {
				lastMouseDown[event.button] = event;
			}

			if (
				event.type === 'click' && (
					Math.abs(event.clientX - lastMouseDown[event.button].clientX) > 5 ||
					Math.abs(event.clientY - lastMouseDown[event.button].clientY > 5)
				)
			) {
				return;
			}

			// When a user drags an element that moves with the mouse, the element will not be dragged in the recorded
			// output unless the final position of the mouse is recorded relative to an element that did not move
			var target;

			if (event.type === 'mouseup') {
				target = this.document.documentElement;
			}
			else {
				target = event.target;
			}

			var rect = target.getBoundingClientRect();

			this.send({
				altKey: event.altKey,
				button: event.button,
				buttons: event.buttons,
				ctrlKey: event.ctrlKey,
				clientX: event.clientX,
				clientY: event.clientY,
				elementX: event.clientX - rect.left,
				elementY: event.clientY - rect.top,
				keyIdentifier: event.keyIdentifier,
				location: event.location,
				metaKey: event.metaKey,
				shiftKey: event.shiftKey,
				target: this.getTarget(target),
				targetFrame: [],
				type: event.type
			});
		},

		setStrategy: function (value) {
			switch (value) {
				case 'xpath':
					this.getTarget = this.getElementXPath;
					break;
				case 'text':
					this.getTarget = this.getElementTextPath;
					break;
				default:
					throw new Error('Invalid strategy "' + value + '"');
			}
		}
	};

	return EventProxy;
});
