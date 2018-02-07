import RecorderProxy from './RecorderProxy';

chrome.devtools.panels.create(
	'Intern',
	'recorder-on.png',
	'lib/panel.html',
	panel => {
		new RecorderProxy(chrome, panel);
	}
);
