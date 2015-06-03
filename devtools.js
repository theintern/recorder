/*global chrome:false, RecorderProxy:false */
chrome.devtools.panels.create('Intern', 'recorder-on.png', 'panel.html', function (panel) {
	var recorderProxy;

	var controls = [
		{ action: 'toggleState', button: [ 'statusBarIcons/record_off.png', 'Record', false ] },
		{ action: 'clear', button: [ 'statusBarIcons/clear.png', 'Clear', false ] },
		{ action: 'newTest', button: [ 'statusBarIcons/newTest.png', 'New test', false ] },
		{ action: 'save', button: [ 'statusBarIcons/save.png', 'Save', false ] }
	];

	var recordButton;

	controls.forEach(function (control) {
		var button = panel.createStatusBarButton.apply(panel, control.button);
		button.onClicked.addListener(function () {
			if (!recorderProxy) {
				throw new Error('Missing recorder to apply action "' + control.action + '"');
			}

			recorderProxy.send(control.action);
		});

		if (control.action === 'toggleState') {
			recordButton = button;
		}
	});

	panel.onShown.addListener(function (window) {
		if (recorderProxy && window === recorderProxy.contentWindow) {
			return;
		}

		recorderProxy = new RecorderProxy(chrome, window);
		(function () {
			var oldSetRecording = recorderProxy.setRecording;
			recorderProxy.setRecording = function (value) {
				if (recordButton) {
					recordButton.update('statusBarIcons/record_' + (value ? 'on' : 'off') + '.png');
				}

				return oldSetRecording.apply(this, arguments);
			};
		})();
	});

	// To avoid recording spurious interaction when a user has switched to another dev tools panel, pause recording
	// automatically when this panel is hidden and resume it when a user switches back
	var toggleOnShown = false;
	panel.onShown.addListener(function () {
		if (recorderProxy && toggleOnShown) {
			recorderProxy.send('toggleState');
		}
	});

	panel.onHidden.addListener(function () {
		if (recorderProxy) {
			toggleOnShown = recorderProxy.recording;
			recorderProxy.send('toggleState');
		}
		else {
			toggleOnShown = false;
		}
	});
});
