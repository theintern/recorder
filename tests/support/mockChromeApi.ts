import { createMockMethod, pullFromArray, Method } from './util';

export const testHost = 'http://localhost:9000/tests/data';
export const testPage = 'http://localhost:9000/tests/data/frame.html';

export default class Chrome {
	devtools = {
		inspectedWindow: {
			tabId: 1692485
		}
	};

	downloads = {
		download: createMockMethod()
	};

	runtime = {
		id: 'mock',
		onConnect: createListener(),
		connect: (_id: string, options: MockConnectInfo) =>
			this.createPort(options.name!)
	};

	webNavigation = {
		onCommitted: createListener(),
		onReferenceFragmentUpdated: createListener(),
		onHistoryStateUpdated: createListener()
	};

	tabs = {
		executeScript: createMockMethod(),
		get: createMockMethod((tabId: number, callback: Function) => {
			const tabs: { [key: number]: object } = {
				1: { url: testPage },
				2: { url: `${testHost}/elements.html` },
				3: { url: `${testHost}/superframe.html` }
			};
			callback(tabs[tabId]);
		})
	};

	createButton(): Button {
		return {
			onClicked: createListener(),
			update: createMockMethod()
		};
	}

	createPort(name: string) {
		const port: Port = {
			name,
			disconnect: createMockMethod(() => {
				port.onDisconnect.emit();
			}),
			onDisconnect: createListener(),
			onMessage: createListener(),
			postMessage: createMockMethod()
		};
		return port;
	}

	createPanel(): Panel {
		const buttons: Button[] = [];

		return {
			buttons,
			createStatusBarButton: createMockMethod(
				(
					_iconPath: string,
					_tooltipText: string,
					_disabled: boolean
				) => {
					const button = this.createButton();
					buttons.push(button);
					return button;
				}
			),
			onShown: createListener(),
			onHidden: createListener()
		};
	}
}

interface MockConnectInfo {
	name?: string;
}

interface MockEvent {
	addListener(callback: Function): void;
	emit(data?: any): void;
	removeListener(callback: Function): void;
}

export interface Port {
	name: string;
	disconnect: Method<() => void>;
	onDisconnect: MockEvent;
	onMessage: MockEvent;
	postMessage: Method<(message: Object) => void>;
}

export interface Button {
	onClicked: MockEvent;
	update: Method<
		(
			iconPath?: string | null,
			tooltipText?: string | null,
			disabled?: boolean | null
		) => void
	>;
}

export interface Panel {
	buttons: Button[];
	createStatusBarButton(
		iconPath: string,
		tooltipText: string,
		disabled: boolean
	): Button;
	onShown: MockEvent;
	onHidden: MockEvent;
}

function createListener(): MockEvent {
	const listeners: Function[] = [];

	return {
		addListener(callback: Function) {
			listeners.push(callback);
		},
		emit() {
			const self = this;
			const args = arguments;
			listeners.forEach(function(listener) {
				listener.apply(self, args);
			});
		},
		removeListener(callback: Function) {
			pullFromArray(listeners, callback);
		}
	};
}
