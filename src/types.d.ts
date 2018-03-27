export type Chrome = typeof window.chrome;

export type Strategy = 'xpath' | 'text';

export interface HotKeyDef {
	altKey?: boolean;
	ctrlKey?: boolean;
	metaKey?: boolean;
	shiftKey?: boolean;
	key: string;
}

export interface RecorderPort {
	send(method: string, args: any[]): void;
}

export interface Message {
	method: string;
	args: any[];
}

export interface Command extends Message {
	start: number;
	end: number;
	text: string;
}

export interface Test {
	name: string;
	start: number;
	end: number;
	commands: Command[];
}

// Minimal interfaces for some chrome types

export interface ChromeLike {
	runtime: {
		connect: (id: string, options: chrome.runtime.ConnectInfo) => PortLike;
		id: string;
		onConnect: EventLike<(port: PortLike) => void>;
	};

	devtools: {
		inspectedWindow: {
			tabId: number;
		};
	};

	webNavigation: {
		onCommitted: EventLike<
			(
				details: chrome.webNavigation.WebNavigationTransitionCallbackDetails
			) => void
		>;
		onReferenceFragmentUpdated: EventLike<
			(
				details: chrome.webNavigation.WebNavigationTransitionCallbackDetails
			) => void
		>;
		onHistoryStateUpdated: EventLike<
			(
				details: chrome.webNavigation.WebNavigationTransitionCallbackDetails
			) => void
		>;
	};

	tabs: Pick<typeof chrome.tabs, 'executeScript' | 'get'>;

	downloads: Pick<typeof chrome.downloads, 'download'>;
}

export interface PortLike {
	disconnect: () => void;
	name: string;
	onDisconnect: EventLike<(port: PortLike) => void>;
	onMessage: EventLike<(message: Object, port: PortLike) => void>;
	postMessage: (message: Object) => void;
}

export interface EventLike<T extends Function> {
	addListener(callback: T): void;
	removeListener(callback: T): void;
}

export interface PanelLike {
	createStatusBarButton(
		iconPath: string,
		tooltipText: string,
		disabled: boolean
	): ButtonLike;
	onShown: EventLike<(window: chrome.windows.Window) => void>;
	onHidden: EventLike<() => void>;
}

export interface ButtonLike {
	onClicked: EventLike<() => void>;
	update(
		iconPath?: string | null,
		tooltipText?: string | null,
		disabled?: boolean | null
	): void;
}
