/* global EventProxy:false, chrome:false */
var eventProxy;

if (!eventProxy) {
	eventProxy = new EventProxy(window, document, chrome);
}

if (!eventProxy.port) {
	eventProxy.connect();
}
