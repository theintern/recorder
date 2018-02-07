import { Chrome } from './types';

const EVENT_TYPES = [
	'click',
	'dblclick',
	'mousedown',
	'mouseup',
	'mousemove',
	'keydown',
	'keyup'
];

export default class EventProxy {
	window: Window;
	document: Document;
	chrome: Chrome;
	lastMouseDown: {
		[button: number]: { event: MouseEvent; elements: Element[] };
	};
	getTarget: (element: Element) => string;
	port: chrome.runtime.Port | null;

	constructor(window: Window, document: Document, chrome: Chrome) {
		this.window = window;
		this.document = document;
		this.chrome = chrome;
		this.lastMouseDown = {};
	}

	connect() {
		const sendEvent = this.sendEvent.bind(this);
		const passEvent = this.passEvent.bind(this);

		this.window.addEventListener('message', passEvent, false);

		EVENT_TYPES.forEach(eventType => {
			this.document.addEventListener(eventType, sendEvent, true);
		});

		if (this.port) {
			this.port.disconnect();
		}

		this.port = this.chrome.runtime.connect(this.chrome.runtime.id, {
			name: 'eventProxy'
		});
		const disconnect = () => {
			this.port!.onDisconnect.removeListener(disconnect);
			EVENT_TYPES.forEach(eventType => {
				this.document.removeEventListener(eventType, sendEvent, true);
			});
			this.window.removeEventListener('message', passEvent, false);
			this.port = null;
		};

		this.port.onDisconnect.addListener(disconnect);
		this.port.onMessage.addListener(message => {
			const { method, args } = <{
				method: keyof EventProxy;
				args: any[];
			}>message;
			if (!this[method]) {
				throw new Error(
					`Method "${method}" does not exist on RecorderProxy`
				);
			}

			(<Function>this[method]!)(...(args || []));
		});
	}

	getElementTextPath(element: Element) {
		const tagPrefix = `//${element.nodeName}`;

		const textValue = this.document.evaluate(
			'normalize-space(string())',
			element,
			null,
			(<any>this.window).XPathResult.STRING_TYPE,
			null
		).stringValue;

		let path = `[normalize-space(string())="${textValue.replace(
			/"/g,
			'&quot;'
		)}"]`;

		const matchingElements = this.document.evaluate(
			tagPrefix + path,
			this.document,
			null,
			(<any>this.window).XPathResult.UNORDERED_NODE_ITERATOR_TYPE,
			null
		);

		matchingElements.iterateNext();
		const matchesMultipleElements = Boolean(matchingElements.iterateNext());

		if (matchesMultipleElements) {
			// ignoring IDs because when the text strategy is being used it typically means that IDs are not
			// deterministic
			path = this.getElementXPath(element, true) + path;
		} else {
			path = tagPrefix + path;
		}

		return path;
	}

	getElementXPath(element: Element, ignoreId?: boolean) {
		const path = [];

		do {
			if (element.id && !ignoreId) {
				path.unshift('id("' + element.id + '")');

				// No need to continue to ascend since we found a unique root
				break;
			} else if (element.parentNode) {
				const nodeName = element.nodeName;
				const hasNamedSiblings = Boolean(
					element.previousElementSibling || element.nextElementSibling
				);
				// XPath is 1-indexed
				let index = 1;
				let sibling: Element | null = element;

				if (hasNamedSiblings) {
					while ((sibling = sibling.previousElementSibling)) {
						if (sibling.nodeName === nodeName) {
							++index;
						}
					}

					path.unshift(nodeName + '[' + index + ']');
				} else {
					path.unshift(nodeName);
				}
			} else {
				// The root node
				path.unshift('');
			}
		} while ((element = element.parentElement!));

		return path.join('/');
	}

	passEvent(event: MessageEvent) {
		if (
			!event.data ||
			event.data.method !== 'recordEvent' ||
			!event.data.detail
		) {
			return;
		}

		const detail = event.data.detail;
		const frames: Window[] = <any>this.window.frames;

		for (let i = 0; i < frames.length; ++i) {
			if (event.source === frames[i]) {
				detail.targetFrame.unshift(i);
				break;
			}
		}

		this.send(detail);
	}

	send(detail: any) {
		if (this.window !== this.window.top) {
			this.window.parent.postMessage(
				{
					method: 'recordEvent',
					detail: detail
				},
				'*'
			);
		} else {
			this.port!.postMessage({
				method: 'recordEvent',
				args: [detail]
			});
		}
	}

	sendEvent(event: MouseEvent & KeyboardEvent) {
		const lastMouseDown = this.lastMouseDown;
		let target;

		function isDragEvent() {
			return (
				Math.abs(
					event.clientX - lastMouseDown[event.button].event.clientX
				) > 5 ||
				Math.abs(
					event.clientY - lastMouseDown[event.button].event.clientY
				) > 5
			);
		}

		if (event.type === 'click' && isDragEvent()) {
			return;
		}

		if (event.type === 'mousedown') {
			lastMouseDown[event.button] = {
				event,
				elements: this.document.elementsFromPoint(
					event.clientX,
					event.clientY
				)
			};
		}

		// When a user drags an element that moves with the mouse, the element will not be dragged in the recorded
		// output unless the final position of the mouse is recorded relative to an element that did not move
		if (event.type === 'mouseup') {
			target = (() => {
				// The nearest element to the target that was not also the nearest element to the source is
				// very likely to be an element that did not move along with the drag
				const sourceElements = lastMouseDown[event.button].elements;
				const targetElements = this.document.elementsFromPoint(
					event.clientX,
					event.clientY
				);
				for (let i = 0; i < sourceElements.length; ++i) {
					if (sourceElements[i] !== targetElements[i]) {
						return targetElements[i];
					}
				}

				// TODO: Using document.body instead of document.documentElement because of
				// https://code.google.com/p/chromedriver/issues/detail?id=1049
				return this.document.body;
			})();
		} else {
			target = <Element>event.target;
		}

		const rect = target.getBoundingClientRect();

		this.send({
			altKey: event.altKey,
			button: event.button,
			buttons: event.buttons,
			ctrlKey: event.ctrlKey,
			clientX: event.clientX,
			clientY: event.clientY,
			elementX: event.clientX - rect.left,
			elementY: event.clientY - rect.top,
			//key has not yet been implemented in Safari, which requires the deprecated keyIdentifier
			//https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/key#Browser_compatibility
			key: event.key || (<any>event).keyIdentifier,
			location: event.location,
			metaKey: event.metaKey,
			shiftKey: event.shiftKey,
			target: this.getTarget(target),
			targetFrame: [],
			type: event.type
		});
	}

	setStrategy(value: string) {
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
}
