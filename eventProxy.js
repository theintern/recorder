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
			var nodeName = element.nodeName,
				hasNamedSiblings = Boolean(element.previousElementSibling || element.nextElementSibling),
				// XPath is 1-indexed
				index = 1,
				sibling = element;

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

	var debounce = (function () {
		var waiting = [];

		function debouncer(callback, timeout) {
			var timer,
				executor;

			function clean() {
				var index = waiting.indexOf(executor);
				index > -1 && waiting.splice(index, 1);
				executor = timer = null;
			}

			return function () {
				clearTimeout(timer);
				clean();

				var self = this;
				var args = arguments;

				executor = function () {
					clean();
					callback.apply(self, args);
				};

				waiting.push(executor);
				timer = setTimeout(executor, timeout);
			};
		}

		debouncer.flush = function () {
			var executor;
			while ((executor = waiting.pop())) {
				executor();
			}
		};

		return debouncer;
	})();

	function sendEvent(event) {
		debounce.flush();

		var detail = {
			button: event.button,
			buttons: event.buttons,
			keyCode: event.keyCode,
			clientX: event.clientX,
			clientY: event.clientY,
			target: getElementXPath(event.target),
			type: event.type
		};

		chrome.runtime.sendMessage(null, {
			type: 'event',
			detail: detail
		});
	}

	'click dblclick mousedown mouseup keydown keyup'.split(' ').forEach(function (eventType) {
		document.addEventListener(eventType, sendEvent);
	});

	document.addEventListener('mousemove', debounce(sendEvent, 500));

	loaded = true;
})();
