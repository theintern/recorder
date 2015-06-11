/* global chrome:false */
var loaded;

function getElementXPath(element) {
	var path = [];

	do {
		if (element.id) {
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
}

(function () {
	if (loaded) {
		return;
	}

	var EVENT_TYPES = 'click dblclick mousedown mouseup mousemove keydown keyup'.split(' ');
	var lastMouseDown = {};

	var port = chrome.runtime.connect(chrome.runtime.id, { name: 'eventProxy' });
	port.onDisconnect.addListener(function disconnect() {
		port.onDisconnect.removeListener(disconnect);
		EVENT_TYPES.forEach(function (eventType) {
			document.removeEventListener(eventType, sendEvent, true);
			loaded = false;
			port = null;
		});
		window.removeEventListener('message', passEvent, false);
	});

	function send(detail) {
		if (window !== window.top) {
			window.parent.postMessage({
				method: 'recordEvent',
				detail: detail
			}, '*');
		}
		else {
			port.postMessage({
				method: 'recordEvent',
				args: [ detail ]
			});
		}
	}

	function sendEvent(event) {
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

		var rect = event.target.getBoundingClientRect();

		send({
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
			target: getElementXPath(event.target),
			targetFrame: [],
			type: event.type
		});
	}

	function passEvent(event) {
		if (!event.data || event.data.method !== 'recordEvent' || !event.data.detail) {
			return;
		}

		var detail = event.data.detail;

		for (var i = 0; i < window.frames.length; ++i) {
			if (event.source === window.frames[i]) {
				detail.targetFrame.unshift(i);
				break;
			}
		}

		send(detail);
	}
	window.addEventListener('message', passEvent, false);

	EVENT_TYPES.forEach(function (eventType) {
		document.addEventListener(eventType, sendEvent, true);
	});

	loaded = true;
})();
