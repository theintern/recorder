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

	var port = chrome.runtime.connect(chrome.runtime.id, { name: 'eventProxy' });

	function sendEvent(event) {
		var rect = event.target.getBoundingClientRect();

		var detail = {
			button: event.button,
			buttons: event.buttons,
			location: event.location,
			keyIdentifier: event.keyIdentifier,
			clientX: event.clientX,
			clientY: event.clientY,
			elementX: event.clientX - rect.left,
			elementY: event.clientY - rect.top,
			target: getElementXPath(event.target),
			type: event.type
		};

		port.postMessage({
			method: 'recordEvent',
			args: [ detail ]
		});
	}

	'click dblclick mousedown mouseup mousemove keydown keyup'.split(' ').forEach(function (eventType) {
		document.addEventListener(eventType, sendEvent, true);
	});

	loaded = true;
})();
