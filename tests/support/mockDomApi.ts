import { createMockMethod, pullFromArray, Method } from './util';

export interface Event {
	type: string;
	data?: object | null;
	source?: Window;
	buttons?: number;
	clientX?: number;
	clientY?: number;
	currentTarget?: Listener;
	target?: Element;
}

class Listener {
	listenerMap: { [name: string]: Function[] } = {};

	addEventListener(eventName: string, listener: Function) {
		let listeners = this.listenerMap[eventName];
		if (!listeners) {
			listeners = this.listenerMap[eventName] = [];
		}
		listeners.push(listener);
	}

	dispatchEvent(event: Event) {
		const listeners = this.listenerMap[event.type];
		if (!listeners) {
			return;
		}

		listeners.forEach(listener => {
			event.currentTarget = this;
			listener.call(this, event);
		});
	}

	removeEventListener(eventName: string, callback: Function) {
		const listeners = this.listenerMap[eventName];
		if (listeners) {
			pullFromArray(listeners, callback);
		}
	}
}

export interface ElementProperties {
	nodeName: string;
	tagName: string;
	parentNode?: Element | Document;
	id?: string;
	getBoundingClientRect: () => { top: number; left: number };
	previousElementSibling?: Element;
	stringValue?: string;
	value?: string;
}

export interface MockEvent {}

export class Element implements ElementProperties {
	nodeName: string;
	tagName: string;
	id?: string;
	parentNode?: Element | Document;
	getBoundingClientRect: () => { top: number; left: number };
	previousElementSibling?: Element;
	stringValue?: string;
	value?: string;

	checked?: boolean;
	onkeydown?: (event: Partial<Event>) => void;
	oninput?: (event: Partial<Event>) => void;
	onchange?: (event: Partial<Event>) => void;

	constructor(properties: Partial<ElementProperties>) {
		Object.assign(
			this,
			{
				nodeName: '',
				tagName: '',
				getBoundingClientRect: () => ({ top: 0, left: 0 })
			},
			properties
		);
	}
}

export interface XpathResult {
	(text: string, element: Element): {
		iterateNext(): null | {};
		stringValue?: string;
	};
}

export class Document extends Listener {
	elements: { [id: string]: Element } = {};
	documentElement: Element;
	body: Element;

	constructor() {
		super();
		this.documentElement = new Element({
			nodeName: 'HTML',
			parentNode: this,
			tagName: 'HTML'
		});
		this.body = new Element({
			nodeName: 'BODY',
			parentNode: this.documentElement,
			previousElementSibling: new Element({
				nodeName: 'HEAD',
				parentNode: this.documentElement,
				tagName: 'HEAD'
			}),
			tagName: 'BODY'
		});
	}

	elementsFromPoint() {
		return [this.body, this.documentElement];
	}

	evaluate = createMockMethod<XpathResult>(
		(text: string, element: Element) => {
			let i = 0;
			return {
				iterateNext() {
					if (text.indexOf('SINGLE') > -1 && i > 0) {
						return null;
					}

					++i;
					return {};
				},
				stringValue: element.stringValue
			};
		}
	);

	getElementById(id: string) {
		if (id.indexOf('invalid') > -1) {
			return null;
		}

		if (!this.elements[id]) {
			this.elements[id] = new Element({ value: '' });
		}

		return this.elements[id];
	}
}

export default class Window extends Listener {
	document: Document;
	frames: Window[];
	navigator: { platform: string | null };
	postMessage: Method<(message: Object) => void>;
	XPathResult = {
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
	parent: Window;
	top: Window;

	constructor(platform: string | null, isChildWindow = false) {
		super();

		this.document = new Document();
		this.navigator = { platform };
		this.postMessage = createMockMethod();
		this.frames = [];

		if (isChildWindow) {
			this.parent = this.top = new Window(platform);
		} else {
			this.parent = this.top = this;
		}
	}
}
