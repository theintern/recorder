/*global chrome:false, RecorderProxy:false */
chrome.devtools.panels.create('Intern', 'recorder-on.png', 'panel.html', function (panel) {
	var recorder;

	var controls = [
		{ action: 'toggleState', button: [ null, 'Record', false ] },
		{ action: 'clear', button: [ null, 'Clear', false ] },
		{ action: 'newTest', button: [ null, 'New test', false ] },
		{ action: 'save', button: [ null, 'Save', false ] }
	];

	controls.forEach(function (control) {
		var button = panel.createStatusBarButton.apply(panel, control.button);
		button.onClicked.addListener(function () {
			if (!recorder) {
				throw new Error('Missing recorder to apply action "' + control.action + '"');
			}

			recorder.send(control.action);
		});
	});

	panel.onShown.addListener(function (window) {
		if (recorder && window === recorder.contentWindow) {
			return;
		}

		recorder = new RecorderProxy(chrome, window);
	});

	// To avoid recording spurious interaction when a user has switched to another dev tools panel, pause recording
	// automatically when this panel is hidden and resume it when a user switches back
	var toggleOnShown = false;
	panel.onShown.addListener(function () {
		if (recorder && toggleOnShown) {
			recorder.send('toggleState');
		}
	});

	panel.onHidden.addListener(function () {
		if (recorder && recorder.state === recorder.STATE_RECORDING) {
			toggleOnShown = true;
			recorder.send('toggleState');
		}
		else {
			toggleOnShown = false;
		}
	});
});
