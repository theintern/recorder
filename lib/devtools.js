/*global chrome:false, RecorderProxy:false */
chrome.devtools.panels.create('Intern', 'recorder-on.png', 'lib/panel.html', function (panel) {
	new RecorderProxy(chrome, panel);
});
