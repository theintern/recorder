import EventProxy from './EventProxy';

let eventProxy: EventProxy | undefined;

if (!eventProxy) {
	eventProxy = new EventProxy(window, document, chrome);
}

if (!eventProxy.port) {
	eventProxy.connect();
}
